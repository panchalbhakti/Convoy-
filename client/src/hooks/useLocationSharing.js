import { useCallback, useEffect, useRef, useState } from 'react';
import { startKeepAlive, stopKeepAlive, resumeKeepAlive } from '../lib/keepAlive.js';
import { GpsFilter } from '../lib/gpsFilter.js';

const FLAG = (id) => `convoy:sharing:${id}`;

/**
 * Consent-based browser GPS sharing that recovers from app switching.
 * status: 'off' | 'starting' | 'sharing' | 'denied' | 'unsupported' | 'insecure'
 *
 * Nothing is read or sent until the person taps Share. Because phones freeze web pages in the
 * background, we (1) keep a silent-audio + media-session keep-alive and a screen wake lock,
 * (2) restart GPS and send a fresh fix the moment the page is visible / online again,
 * (3) restart a GPS watch that has gone quiet, and (4) resume after the browser reloaded the tab,
 * if the person had sharing on and the browser permission is still granted.
 */
export function useLocationSharing({ emit, journeyId, online }) {
  const [status, setStatus] = useState(() => {
    if (!('geolocation' in navigator)) return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    return 'off';
  });
  const [lastFix, setLastFix] = useState(null); // { at, accuracy }
  const [lastSentAt, setLastSentAt] = useState(null);
  const [gpsIssue, setGpsIssue] = useState(null);
  const [resumed, setResumed] = useState(false);

  const emitRef = useRef(emit);
  emitRef.current = emit;
  const watchId = useRef(null);
  const wakeLock = useRef(null);
  const wanted = useRef(false); // the person wants sharing on
  const lastSend = useRef(0);
  const lastFixAt = useRef(0);
  const filter = useRef(new GpsFilter());

  const requestWake = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && wanted.current && document.visibilityState === 'visible' && !wakeLock.current) {
        wakeLock.current = await navigator.wakeLock.request('screen');
        wakeLock.current.addEventListener?.('release', () => { wakeLock.current = null; });
      }
    } catch { /* not supported or refused */ }
  }, []);

  const onFix = useCallback((pos, force = false) => {
    const now = Date.now();
    lastFixAt.current = now;
    const c = pos.coords;
    // Smooth the fix and drop wild jumps; `fix.accuracy` is the filtered estimate
    const fix = filter.current.process({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, speed: c.speed, ts: now });
    setStatus('sharing');
    setGpsIssue(null);
    if (!fix) return; // an outlier: keep the last good position instead
    setLastFix({ at: now, accuracy: fix.accuracy, raw: c.accuracy });
    if (!force && now - lastSend.current < 1500) return;
    lastSend.current = now;
    const delivered = emitRef.current('location:update', {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      speed: c.speed,
      heading: c.heading,
    });
    if (delivered) setLastSentAt(now);
  }, []);

  const clearWatch = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const onError = useCallback((err) => {
    if (err.code === 1) {
      clearWatch();
      wanted.current = false;
      stopKeepAlive();
      try { localStorage.removeItem(FLAG(journeyId)); } catch { /* ignore */ }
      emitRef.current('sharing:denied');
      setStatus('denied');
    } else {
      setGpsIssue(err.code === 3 ? 'Waiting for a GPS signal…' : 'Your device can’t find a GPS position right now.');
    }
  }, [clearWatch, journeyId]);

  const beginWatch = useCallback(() => {
    clearWatch();
    watchId.current = navigator.geolocation.watchPosition((p) => onFix(p), onError, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 20_000,
    });
  }, [clearWatch, onFix, onError]);

  /** Ask for a brand-new fix right now and restart the watch (used after the app was in the background). */
  const refreshNow = useCallback(() => {
    if (!wanted.current || !('geolocation' in navigator)) return;
    resumeKeepAlive();
    navigator.geolocation.getCurrentPosition((p) => onFix(p, true), () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    beginWatch();
    requestWake();
  }, [beginWatch, onFix, requestWake]);

  const stop = useCallback(() => {
    wanted.current = false;
    clearWatch();
    stopKeepAlive();
    filter.current.reset();
    wakeLock.current?.release?.().catch(() => {});
    wakeLock.current = null;
    try { localStorage.removeItem(FLAG(journeyId)); } catch { /* ignore */ }
    emitRef.current('sharing:stop');
    setStatus('off');
    setGpsIssue(null);
  }, [clearWatch, journeyId]);

  const start = useCallback(() => {
    if (!('geolocation' in navigator) || !window.isSecureContext) return;
    wanted.current = true;
    try { localStorage.setItem(FLAG(journeyId), '1'); } catch { /* ignore */ }
    filter.current.reset();
    startKeepAlive({ title: 'Convoy', onStop: stop }); // must run inside the tap
    setStatus('starting');
    setGpsIssue(null);
    lastFixAt.current = Date.now();
    beginWatch();
    requestWake();
  }, [beginWatch, journeyId, requestWake, stop]);

  // Tell the group when this page goes to the background (so it shows "In background", not "no signal"),
  // keep the audio loop going, and recover fully when the person comes back.
  const reportVisibility = useCallback(() => {
    emitRef.current('app:visibility', { hidden: document.visibilityState === 'hidden' });
  }, []);

  useEffect(() => {
    const onChange = () => {
      reportVisibility();
      if (document.visibilityState === 'visible') refreshNow();
      else if (wanted.current) resumeKeepAlive();
    };
    const onBack = () => { if (document.visibilityState === 'visible') refreshNow(); };
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pageshow', onBack);
    window.addEventListener('online', refreshNow);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      window.removeEventListener('pageshow', onBack);
      window.removeEventListener('online', refreshNow);
      window.removeEventListener('focus', onBack);
    };
  }, [refreshNow, reportVisibility]);

  // Server connection came back: push a fresh position right away
  useEffect(() => { if (online) { reportVisibility(); refreshNow(); } }, [online, refreshNow, reportVisibility]);

  // A GPS watch that has gone quiet while the app is on screen gets restarted
  useEffect(() => {
    const t = setInterval(() => {
      if (wanted.current && document.visibilityState === 'visible' && Date.now() - lastFixAt.current > 20_000) {
        lastFixAt.current = Date.now();
        beginWatch();
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [beginWatch]);

  // The browser may have discarded the tab while the person was in another app: resume if they had sharing on
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!('geolocation' in navigator) || !window.isSecureContext || localStorage.getItem(FLAG(journeyId)) !== '1') return;
        const perm = await navigator.permissions?.query({ name: 'geolocation' });
        if (live && perm?.state === 'granted') { start(); setResumed(true); } else localStorage.removeItem(FLAG(journeyId));
      } catch { /* Permissions API unavailable: the person taps Share again */ }
    })();
    return () => { live = false; };
  }, [journeyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearWatch(); stopKeepAlive(); }, [clearWatch]);

  const acc = lastFix?.accuracy;
  const quality = acc == null ? null : acc <= 30 ? 'good' : acc <= 100 ? 'ok' : 'poor';
  return { status, start, stop, lastFix, lastSentAt, gpsIssue, resumed, quality };
}
