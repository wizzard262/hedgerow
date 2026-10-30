// Hedgerow: battle sounds, made on the spot with the Web Audio API (no sound files): rifles, machine guns, bazookas,
// tank guns, mortars and artillery, and what they hit. Off until the first click (browsers insist), and can be muted

const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let on = true;
  try { on = localStorage.getItem('hedgerow.sound') !== 'off'; } catch (e) { /* no storage: sound stays on */ }

  // The audio context starts on the first click on the page
  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // A little room: a short feedback delay so shots don't sound dry
    const delay = ctx.createDelay(), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.09; fb.gain.value = 0.25; wet.gain.value = 0.18;
    master.connect(ctx.destination);
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(ctx.destination);
    // One second of white noise, the raw stuff of every bang
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  document.addEventListener('pointerdown', wake, { once: false, capture: true });

  // A burst of filtered noise: the body of a gunshot or explosion
  function noise(when, dur, freq, q, peak, type = 'lowpass') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(when, Math.random() * 0.5); src.stop(when + dur + 0.05);
  }

  // A falling tone: the thump of a big gun, or a shell's whistle when it rises
  function tone(when, dur, from, to, peak, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(from, when);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(master);
    o.start(when); o.stop(when + dur + 0.05);
  }

  // Each sound, starting `delay` seconds from now
  const SOUNDS = {
    // A rifle: a sharp crack and a short tail; a few men firing
    rifle(t) { for (let k = 0; k < 4; k++) { const w = t + k * 0.09 + Math.random() * 0.05; noise(w, 0.12, 2400, 0.7, 0.55, 'bandpass'); noise(w, 0.25, 700, 0.5, 0.25); } },
    // A machine gun: a fast rattle
    mg(t) { for (let k = 0; k < 14; k++) { const w = t + k * 0.055; noise(w, 0.06, 1800, 1, 0.5, 'bandpass'); noise(w, 0.09, 500, 0.6, 0.2); } },
    // A bazooka or Panzerschreck: a whoosh as the rocket leaves
    rocket(t) { noise(t, 0.6, 900, 0.4, 0.5, 'bandpass'); tone(t, 0.5, 300, 900, 0.08, 'sawtooth'); },
    // A tank or anti-tank gun: a deep boom with a crack on top
    gun(t) { tone(t, 0.5, 120, 40, 0.9); noise(t, 0.35, 3000, 0.6, 0.6, 'bandpass'); noise(t, 0.9, 400, 0.4, 0.6); },
    // A mortar: a hollow thunk from far off, then the round lands
    mortar(t) { tone(t, 0.18, 260, 140, 0.25, 'triangle'); },
    // Artillery: a whistle coming in
    whistle(t) { tone(t, 0.9, 1400, 500, 0.06, 'sine'); },
    // Impacts: bullets kicking up dirt, a shell striking armour, high explosive going off
    bullets(t) { for (let k = 0; k < 5; k++) noise(t + k * 0.06 + Math.random() * 0.04, 0.07, 1200, 0.8, 0.18, 'bandpass'); },
    clang(t) { tone(t, 0.6, 900, 700, 0.18, 'square'); noise(t, 0.2, 4000, 2, 0.35, 'bandpass'); },
    he(t, big) { tone(t, big ? 1.2 : 0.8, 90, 30, big ? 1 : 0.8); noise(t, big ? 1.6 : 1.1, 300, 0.4, big ? 0.9 : 0.7); noise(t, 0.3, 2500, 0.5, 0.4, 'bandpass'); },
  };

  function play(name, delay = 0, big = false) {
    if (!on || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
    SOUNDS[name](ctx.currentTime + delay, big);
  }

  function toggle() {
    on = !on;
    try { localStorage.setItem('hedgerow.sound', on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
    return on;
  }

  return { play, toggle, isOn: () => on, wake };
})();
