import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../api.js';
import { loadSession } from '../session.js';
import { setClockOffset } from './useNow.js';

/**
 * Live connection to the journey room.
 * conn: 'connecting' | 'online' | 'offline'.  fatal: null | 'unauthorized' | 'ended' | 'removed'
 */
export function useJourneySocket(journeyId, { onAlert } = {}) {
  const [conn, setConn] = useState('connecting');
  const [fatal, setFatal] = useState(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(null);
  const [route, setRoute] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const socketRef = useRef(null);
  const routeVersion = useRef(0);
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  useEffect(() => {
    const session = loadSession(journeyId);
    if (!session?.token) { setFatal('unauthorized'); return undefined; }
    const socket = io(API_BASE || undefined, {
      auth: { token: session.token, journeyId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConn('online'));
    socket.on('disconnect', (reason) => { setConn('offline'); if (reason === 'io server disconnect') socket.connect(); });
    socket.on('connect_error', (err) => {
      setConn('offline');
      if (err.message === 'unauthorized') setFatal('unauthorized');
      if (err.message === 'ended') setFatal('ended');
    });
    socket.on('init', (p) => {
      setClockOffset(p.serverNow);
      setRoute(p.route);
      routeVersion.current = p.routeVersion;
      setAlerts(p.alerts);
      setState(p.state);
      setReady(true);
    });
    socket.on('state', (s) => {
      setClockOffset(s.now);
      setState(s);
      if (s.journey.routeVersion !== routeVersion.current) {
        routeVersion.current = s.journey.routeVersion;
        socket.emit('route:request'); // route changed (new destination)
      }
    });
    socket.on('route', (r) => setRoute(r));
    socket.on('alert', (a) => {
      setAlerts((prev) => [...prev.filter((x) => x.id !== a.id), a].slice(-40));
      onAlertRef.current?.(a); // live alerts only (the initial history arrives via 'init')
    });
    socket.on('journey:ended', () => setFatal('ended'));
    socket.on('removed', () => setFatal('removed'));

    return () => { socket.removeAllListeners(); socket.close(); socketRef.current = null; };
  }, [journeyId]);

  const emit = useCallback((event, payload, ack) => {
    const s = socketRef.current;
    if (!s) return false;
    s.emit(event, payload, ack);
    return s.connected;
  }, []);

  return { conn, fatal, ready, state, route, alerts, emit, socketRef };
}
