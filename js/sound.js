// Hedgerow: battle sounds, made on the spot with the Web Audio API (no sound files): rifles, machine guns, bazookas,
// tank guns, mortars and artillery, and what they hit; men running and tanks moving; plus Future City Battle's recorded
// pick-up for choosing a piece. Off until the first click (browsers insist), and can be muted

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
    // The board-game sounds from Future City Battle: picking a piece up, sliding it across the table
    for (const [name, file] of Object.entries(FILES)) {
      fetch(file).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { recorded[name] = buf; }).catch(() => { /* no file: no sound */ });
    }
  }
  const FILES = { select: 'assets/audio/pieceUp.mp3' };
  const recorded = {};
  function playFile(name, when, volume) {
    if (!recorded[name]) return;
    const src = ctx.createBufferSource(); src.buffer = recorded[name];
    const g = ctx.createGain(); g.gain.value = volume;
    src.connect(g); g.connect(ctx.destination);
    src.start(when);
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
    gun(t) {
      // The crack of the round leaving, then the deep boom and its blast
      noise(t, 0.12, 3500, 0.7, 0.8, 'bandpass');
      tone(t, 1.3, 85, 26, 1);
      tone(t, 0.25, 160, 60, 0.7, 'triangle');
      noise(t, 1.6, 220, 0.3, 0.9);
      noise(t + 0.02, 0.6, 900, 0.5, 0.45);
      // Its echo rolling back off the hedges
      tone(t + 0.32, 0.9, 70, 30, 0.35);
      noise(t + 0.32, 1.1, 260, 0.3, 0.3);
    },
    // A mortar: a hollow thunk from far off, then the round lands
    mortar(t) { tone(t, 0.18, 260, 140, 0.25, 'triangle'); },
    // Artillery: a whistle coming in
    whistle(t) { tone(t, 0.9, 1400, 500, 0.06, 'sine'); },
    // Impacts: bullets kicking up dirt, a shell striking armour, high explosive going off
    bullets(t) { for (let k = 0; k < 5; k++) noise(t + k * 0.06 + Math.random() * 0.04, 0.07, 1200, 0.8, 0.18, 'bandpass'); },
    clang(t) { tone(t, 0.6, 900, 700, 0.18, 'square'); noise(t, 0.2, 4000, 2, 0.35, 'bandpass'); },
    // Men running: four sets of boots, each step a heel thud and a crunch of grit, kit rattling, fading as they go
    run(t) {
      for (let m = 0; m < 4; m++) {
        const start = t + Math.random() * 0.12, pace = 0.15 + Math.random() * 0.03;
        for (let s = 0; s < 8; s++) {
          const w = start + s * pace + Math.random() * 0.015, loud = 1 - s / 9;
          noise(w, 0.06, 150 + Math.random() * 60, 0.7, 0.26 * loud);
          for (let g = 0; g < 3; g++) noise(w + 0.012 + g * 0.014, 0.025, 1300 + Math.random() * 1400, 1.4, 0.07 * loud, 'bandpass');
          if (s % 2) noise(w + 0.04, 0.03, 5200 + Math.random() * 1500, 5, 0.035 * loud, 'bandpass');
        }
      }
    },
    // A tank moving: the engine's low growl and the clatter of the tracks, rising and dying away
    tank(t) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(52, t + 0.6); o.frequency.linearRampToValueAtTime(40, t + 1.6);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 1.8);
      for (let k = 0; k < 18; k++) noise(t + 0.1 + k * 0.08, 0.04, 1500, 1.5, 0.02 + 0.1 * Math.sin(Math.PI * k / 18), 'bandpass');
    },
    he(t, big) { tone(t, big ? 1.2 : 0.8, 90, 30, big ? 1 : 0.8); noise(t, big ? 1.6 : 1.1, 300, 0.4, big ? 0.9 : 0.7); noise(t, 0.3, 2500, 0.5, 0.4, 'bandpass'); },
  };

  function play(name, delay = 0, big = false) {
    if (!on || !ctx || ctx.state !== 'running') return;
    if (FILES[name]) return playFile(name, ctx.currentTime + delay, big ? 1 : 0.8);
    if (SOUNDS[name]) SOUNDS[name](ctx.currentTime + delay, big);
  }

  function toggle() {
    on = !on;
    try { localStorage.setItem('hedgerow.sound', on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
    return on;
  }

  return { play, toggle, isOn: () => on, wake };
})();
