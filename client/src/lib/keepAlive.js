// Best-effort help for keeping location sharing alive when the person switches apps.
//
// Browsers freeze background tabs, and GPS callbacks stop with them. A tab that is *playing audio*
// is treated as "in use" by Chrome/Android (and, partly, iOS Safari), so we loop a silent sound while
// sharing. This also shows a lock-screen / notification control ("Convoy is sharing your location")
// with a Stop button, so sharing is never invisible.
// It is a mitigation, not a guarantee: some phones still pause web pages to save battery.

let audio = null;
let url = null;

function silentWav() {
  if (url) return url;
  const rate = 8000;
  const n = rate; // 1 second
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128 + (i % 2)); // inaudible: 1/128 of full scale
  url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return url;
}

/** Call from a tap handler (browsers only allow audio to start from a user gesture). */
export function startKeepAlive({ title = 'Convoy', onStop } = {}) {
  try {
    if (!audio) {
      audio = new Audio(silentWav());
      audio.loop = true;
      audio.volume = 0.05;
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
