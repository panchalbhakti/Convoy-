// SOS alarm: a 3-second two-tone siren, played on every device in the journey when an SOS is sent.
//
// Browsers only let a page make sound after the person has tapped something on it, so
// installAudioUnlock() arms a listener that wakes the audio engine on the first tap.
// (Sharing, joining and opening a journey all involve taps, so this is normally ready in time.)

let ctx = null;
let playing = false;

export function unlockAudio() {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // a one-sample silent buffer "warms up" iOS Safari
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
  } catch { /* no Web Audio: visual alerts still work */ }
}

export function installAudioUnlock() {
  const h = () => unlockAudio();
  const events = ['pointerdown', 'touchend', 'click', 'keydown'];
  events.forEach((e) => window.addEventListener(e, h, { passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, h));
}

/** Plays the siren for `ms` (default 3000). Returns false if the browser blocked sound. */
export function playSosAlarm(ms = 3000) {
  if (playing) return true;
  try {
    if (!ctx) unlockAudio();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.02;
    const end = t0 + ms / 1000;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.9, t0 + 0.04);
    master.gain.setValueAtTime(0.9, end - 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    master.connect(ctx.destination);

    const tone = ctx.createGain();
    tone.gain.value = 0.45;
    tone.connect(master);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    for (let i = 0, t = t0; t < end; i++, t += 0.28) osc.frequency.setValueAtTime(i % 2 ? 700 : 1050, t);
    osc.connect(tone);

    playing = true;
    osc.onended = () => { playing = false; master.disconnect(); };
    osc.start(t0);
    osc.stop(end + 0.05);

    if (navigator.vibrate) navigator.vibrate([350, 150, 350, 150, 350, 150, 350, 150, 350, 150]);
    return ctx.state === 'running';
  } catch {
    playing = false;
    return false;
  }
}
