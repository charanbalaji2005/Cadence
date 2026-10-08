let actx = null;

export function sfx(kind, sound) {
  if (sound === 'off') return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime, g = actx.createGain();
    g.connect(actx.destination);
    if (kind === 'error') {
      const o = actx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
      g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g); o.start(t); o.stop(t + 0.15); return;
    }
    if (sound === 'typewriter') {
      const len = Math.floor(actx.sampleRate * 0.035), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = actx.createBufferSource(), f = actx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2200 + Math.random() * 600; f.Q.value = 0.9;
      src.buffer = buf; src.connect(f); f.connect(g); g.gain.value = 0.5; src.start(t); return;
    }
    const click = sound === 'click';
    const o = actx.createOscillator(); o.type = click ? 'square' : 'sine';
    o.frequency.setValueAtTime(click ? 1500 + Math.random() * 250 : 520 + Math.random() * 70, t);
    g.gain.setValueAtTime(click ? 0.025 : 0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (click ? 0.03 : 0.09));
    o.connect(g); o.start(t); o.stop(t + 0.1);
  } catch { /* audio unavailable */ }
}
