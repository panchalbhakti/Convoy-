// Best-effort help for keeping location sharing alive when the person switches tabs or apps.
//
// Browsers freeze background tabs, and GPS callbacks stop with them. A tab that is *playing audio*
// is treated as "in use" (Chrome/Android, desktop Chrome and, partly, iOS Safari), so while sharing we
// loop a sound at 18 Hz: a real audio signal that browsers detect, but far below what phone speakers or
// ears can reproduce, so it is inaudible. It also shows a lock-screen / notification control
// ("Convoy is sharing your location") with a Stop button, so sharing is never invisible.
// It is a mitigation, not a guarantee: some phones still pause web pages to save battery.

let audio = null;
let url = null;

function subsonicWav() {
  if (url) return url;
  const rate = 8000;
  const n = rate; // exactly 1 second = 18 whole cycles, so the loop is seamless
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 18 * i) / rate) * 1800), true);
  url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return url;
}

/** Call from a tap handler (browsers only allow audio to start from a user gesture). */
export function startKeepAlive({ title = 'Convoy', onStop } = {}) {
  try {
    if (!audio) {
      audio = new Audio(subsonicWav());
      audio.loop = true;
      audio.volume = 0.6;
      audio.setAttribute('playsinline', '');
    }
    audio.play().catch(() => {});
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Sharing your location', artist: title, album: 'Convoy' });
      navigator.mediaSession.playbackState = 'playing';
      const stop = () => onStop?.();
      navigator.mediaSession.setActionHandler('pause', stop);
      navigator.mediaSession.setActionHandler('stop', stop);
    }
  } catch { /* unsupported: sharing still works while the app is open */ }
}

/** Some browsers pause the loop when the tab is hidden or the phone is locked: nudge it back on. */
export function resumeKeepAlive() {
  try { if (audio && audio.paused) audio.play().catch(() => {}); } catch { /* ignore */ }
}

export function stopKeepAlive() {
  try {
    audio?.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    }
  } catch { /* ignore */ }
}
