// Hedgerow: battle sounds. Real recordings (free to use, see assets/audio/CREDITS.md) for rifles, the two machine guns,
// tank guns and explosions, with a deep thump added under the big ones; made on the spot with the Web Audio API for the
// rest: bazookas, mortars and shells whistling in, armour struck, men running, tanks driving. A battle goes on in the
// distance all the while. Future City Battle's pick-up for choosing a piece. Off until the first click (browsers
// insist), and can be muted

const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, distant = null;
  let bus = null;                 // where the next noise or tone goes: the master, or the far-off battle
  let on = true;
  try { on = localStorage.getItem('hedgerow.sound') !== 'off'; } catch (e) { /* no storage: sound stays on */ }

  // The audio context starts on the first click on the page
  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // Everything goes through a compressor, so a big gun can be loud without cracking up
    const squeeze = ctx.createDynamicsCompressor();
    squeeze.threshold.value = -18; squeeze.knee.value = 12; squeeze.ratio.value = 6; squeeze.attack.value = 0.003; squeeze.release.value = 0.25;
    squeeze.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(squeeze);
    // A little room: a short feedback delay so shots don't sound dry
    const delay = ctx.createDelay(), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.11; fb.gain.value = 0.3; wet.gain.value = 0.22;
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(squeeze);
    // The far-off battle: muffled by distance and quiet
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass'; muffle.frequency.value = 900;
    distant = ctx.createGain();
    distant.gain.value = 0.22;
    muffle.connect(distant); distant.connect(squeeze);
    distant.input = muffle;
    bus = master;
    // One second of white noise, the raw stuff of every bang
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // The recordings: each sound has one or more takes, loaded in the background
    for (const [name, files] of Object.entries(FILES)) {
      recorded[name] = [];
      for (const file of files) {
        fetch('assets/audio/' + file).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { recorded[name].push(buf); }).catch(() => { /* no file: the made-up sound plays */ });
      }
    }
    startBattle();
  }
  const FILES = {
    select: ['pieceUp.mp3'],
    rifle: ['rifle1.mp3', 'rifle2.mp3', 'rifle3.mp3', 'rifle4.mp3', 'rifle5.mp3', 'rifle6.mp3', 'rifle7.mp3', 'rifle8.mp3'],
    mg30: ['mg30a.mp3', 'mg30b.mp3'],
    mg42: ['mg42a.mp3', 'mg42b.mp3'],
    cannon: ['cannon1.mp3', 'cannon2.mp3'],
    boom: ['boom1.mp3', 'boom3.mp3'],
    bigBoom: ['boom2.mp3'],
  };
  const recorded = {};
  const have = name => recorded[name] && recorded[name].length > 0;

  // One take of a recording (picked at random), at a volume and speed (slower is deeper), into the master or `out`
  function playFile(name, when, volume, rate = 1, out = null) {
    if (!have(name)) return false;
    const takes = recorded[name];
    const src = ctx.createBufferSource();
    src.buffer = takes[Math.floor(Math.random() * takes.length)];
    src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = volume;
    src.connect(g); g.connect(out || bus);
    src.start(when);
    return true;
  }
  document.addEventListener('pointerdown', wake, { once: false, capture: true });

  // A burst of filtered noise: the body of a gunshot or explosion
  function noise(when, dur, freq, q, peak, type = 'lowpass') {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(when, Math.random() * 0.5); src.stop(when + dur + 0.05);
  }

  // A falling tone: the thump of a big gun, or a shell's whistle
  function tone(when, dur, from, to, peak, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(from, when);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(bus);
    o.start(when); o.stop(when + dur + 0.05);
  }

  // One gunshot: the supersonic crack, the bark of the muzzle, a thump in the chest and the echo off the hedges
  function shot(w, size = 1) {
    noise(w, 0.018, 4500, 0.5, 0.9 * size, 'highpass');
    noise(w, 0.09, 1100 + Math.random() * 300, 0.9, 0.7 * size, 'bandpass');
    tone(w, 0.12, 170, 60, 0.5 * size);
    noise(w + 0.02, 0.5, 700, 0.4, 0.12 * size);
  }

  // A machine gun's burst: `rounds` shots `gap` seconds apart, then the echo rolling away
  function burst(t, rounds, gap, size) {
    for (let k = 0; k < rounds; k++) {
      const w = t + k * gap + Math.random() * gap * 0.12;
      noise(w, 0.014, 4200, 0.5, 0.6 * size, 'highpass');
      noise(w, 0.05, 950, 1, 0.55 * size, 'bandpass');
      tone(w, 0.06, 150, 70, 0.3 * size);
    }
    noise(t + rounds * gap, 0.9, 600, 0.4, 0.2 * size);
  }

  // A shell or bomb going off: the flash-bang, the deep blast, earth falling back
  function blast(t, size) {
    noise(t, 0.04, 3000, 0.4, 1 * size, 'highpass');
    tone(t, 1.4 * size, 75, 22, 1 * size);
    noise(t, 1.6 * size, 260, 0.3, 1 * size);
    noise(t + 0.01, 0.5, 1200, 0.5, 0.5 * size, 'bandpass');
    for (let k = 0; k < 8; k++) noise(t + 0.25 + Math.random() * 0.9, 0.08, 1800 + Math.random() * 2000, 1, 0.05 * size, 'bandpass');
  }

  // Bombers going over (Steve): a flight of heavy four-engined aircraft droning past high up, from one side of the sky
  // to the other. Each engine a low buzzing note, all beating against each other, with a rumble of air under them;
  // swelling as they come over and fading away, the pitch dropping a little as they pass
  // close: the one on the table flying right over (Steve), loud and clear, its pitch falling hard as it goes past, for
  // `length` seconds
  function bombers(t, close = false, length = 0) {
    const dur = close ? length : 16 + Math.random() * 6;
    // Everything goes through one filter (far off: only the low drone carries) and one swell
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + dur * 0.45);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // (high enough that the engines' growl carries on small speakers, not just the deep hum)
    const far = ctx.createBiquadFilter(); far.type = 'lowpass'; far.frequency.value = close ? 2200 : 750;
    far.connect(out);
    // Across the sky, left to right or right to left
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      const way = Math.random() < 0.5 ? -1 : 1;
      pan.pan.setValueAtTime(-0.9 * way, t);
      pan.pan.linearRampToValueAtTime(0.9 * way, t + dur);
      out.connect(pan); pan.connect(bus);
    } else out.connect(bus);
    // The engines: four planes, four engines each, every one a little off the others' note
    for (let e = 0; e < 16; e++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const note = 56 + Math.random() * 16;
      o.frequency.setValueAtTime(note * (close ? 1.14 : 1.03), t);
      o.frequency.linearRampToValueAtTime(note * (close ? 0.88 : 0.97), t + dur);
      const g = ctx.createGain(); g.gain.value = (close ? BOMBER_CLOSE : BOMBER_LOUDNESS) / 16;
      o.connect(g); g.connect(far);
      o.start(t); o.stop(t + dur + 0.1);
    }
    // The rumble of the air under them
    const air = ctx.createBufferSource(); air.buffer = noiseBuf; air.loop = true;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 160;
    const ag = ctx.createGain(); ag.gain.value = BOMBER_LOUDNESS * 0.8;
    air.connect(low); low.connect(ag); ag.connect(far);
    air.start(t); air.stop(t + dur + 0.1);
    // The engines' growl: a band of rough noise in the middle of the drone
    const growl = ctx.createBufferSource(); growl.buffer = noiseBuf; growl.loop = true;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = 240; band.Q.value = 1.2;
    const gg = ctx.createGain(); gg.gain.value = BOMBER_LOUDNESS * 0.6;
    growl.connect(band); band.connect(gg); gg.connect(far);
    growl.start(t); growl.stop(t + dur + 0.1);
  }
  const BOMBER_LOUDNESS = 0.35;
  const BOMBER_CLOSE = 1.1;

  // Each sound, starting at time t
  const SOUNDS = {
    bombers,
    // The bomber on the table going over: `seconds` long
    bomberPass: (t, big, seconds) => bombers(t, true, seconds),
    // Riflemen: single shots, a few men firing at their own pace
    // A shot from each base that fires (Steve)
    rifle(t, big, rounds = 3) {
      for (let k = 0; k < rounds; k++) {
        const w = t + k * 0.16 + Math.random() * 0.15;
        if (!playFile('rifle', w, 0.5 + Math.random() * 0.3, 0.92 + Math.random() * 0.16)) shot(w, 0.8 + Math.random() * 0.2);
      }
    },
    // The American .50 cal (Steve): a steady chug, about ten rounds a second
    // (Steve: five rounds, as the table shows five tracers)
    mg(t, big, rounds = 5) { burst(t, rounds, 0.115, 0.9); },
    // The German MG 42: a ripping tear, twenty rounds a second
    mg42(t, big, rounds = 5) { burst(t, rounds, 0.05, 0.85); },
    // A bazooka or Panzerschreck, and a tank (Steve): the bang of the launch and the rocket's roar away
    // (Steve: a roar as it flies) a longer, louder rush under the launch
    rocket(t) { noise(t, 0.05, 2500, 0.5, 0.8, 'highpass'); noise(t, 0.9, 700, 0.6, 0.9, 'bandpass'); noise(t + 0.05, 0.6, 250, 0.4, 0.8, 'lowpass'); tone(t, 0.6, 300, 900, 0.12, 'sawtooth'); },
    // The PaK (tanks fire with the bazooka's sound, Steve): a sharp crack, a huge ka-boom, and its echo rolling back off the hedges
    gun(t) {
      if (playFile('cannon', t, 1, 0.75 + Math.random() * 0.1)) {
        // The recording, slowed to make it heavier, with a deep thump under it
        tone(t, 1.3, 70, 24, 0.9);
        noise(t, 1.2, 200, 0.3, 0.6);
        return;
      }
      noise(t, 0.03, 3500, 0.4, 1, 'highpass');
      tone(t, 1.5, 70, 24, 1);
      tone(t, 0.3, 180, 55, 0.9, 'triangle');
      noise(t, 1.8, 240, 0.3, 1);
      noise(t + 0.02, 0.7, 900, 0.5, 0.55);
      tone(t + 0.38, 1, 60, 25, 0.4);
      noise(t + 0.38, 1.3, 260, 0.3, 0.35);
    },
    // A mortar firing somewhere behind the lines: a hollow pop, and the bomb's rising whistle on the way up
    mortar(t) { tone(t, 0.2, 240, 120, 0.4, 'triangle'); noise(t, 0.15, 500, 0.6, 0.3); },
    // A round coming in: a falling whistle, getting louder, for as long as it takes to land
    incoming(t, dur) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(420, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
      // The air it tears through
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(ng); ng.connect(bus); src.start(t); src.stop(t + dur + 0.05);
    },
    // The guns far behind the lines: a low thud
    distantGun(t) { tone(t, 0.6, 60, 30, 0.35); noise(t, 0.5, 300, 0.4, 0.25); },
    // Impacts: bullets kicking up dirt, a shell striking armour, high explosive going off
    bullets(t) { for (let k = 0; k < 6; k++) noise(t + k * 0.06 + Math.random() * 0.04, 0.06, 1400, 0.8, 0.2, 'bandpass'); },
    clang(t) { tone(t, 0.7, 950, 720, 0.25, 'square'); tone(t, 0.9, 1430, 1300, 0.12, 'triangle'); noise(t, 0.2, 4000, 2, 0.45, 'bandpass'); },
    he(t, big) {
      if (playFile(big ? 'bigBoom' : 'boom', t, 1, 0.8 + Math.random() * 0.2)) { tone(t, 1.2, 65, 22, big ? 0.9 : 0.6); return; }
      blast(t, big ? 1 : 0.75);
    },
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
    // A tank driving: a loud engine roaring up and dying away, chugging with each cylinder, the exhaust, and the
    // tracks clanking and squealing
    tank(t) {
      const dur = 2.4;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(1, t + 0.3); out.gain.setValueAtTime(1, t + dur - 0.7); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      out.connect(bus);
      // The engine: two growling notes, high enough to hear on small speakers
      const tone1 = ctx.createOscillator(), tone2 = ctx.createOscillator();
      tone1.type = 'sawtooth'; tone2.type = 'square';
      for (const [o, base] of [[tone1, 48], [tone2, 97]]) {
        o.frequency.setValueAtTime(base * 0.8, t); o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.8); o.frequency.linearRampToValueAtTime(base, t + dur);
      }
      const roar = ctx.createBiquadFilter(); roar.type = 'lowpass'; roar.frequency.value = 650; roar.Q.value = 2;
      const chug = ctx.createGain(); chug.gain.value = 0.5;
      const pulse = ctx.createOscillator(), depth = ctx.createGain();
      pulse.frequency.setValueAtTime(14, t); pulse.frequency.linearRampToValueAtTime(22, t + 0.8);
      depth.gain.value = 0.3;
      pulse.connect(depth); depth.connect(chug.gain);
      const mix = ctx.createGain(); mix.gain.value = 0.5;
      tone1.connect(roar); tone2.connect(mix); mix.connect(roar); roar.connect(chug); chug.connect(out);
      // The exhaust: a rumble of noise
      const ex = ctx.createBufferSource(); ex.buffer = noiseBuf; ex.loop = true;
      const exf = ctx.createBiquadFilter(); exf.type = 'lowpass'; exf.frequency.value = 350;
      const exg = ctx.createGain(); exg.gain.value = 0.7;
      ex.connect(exf); exf.connect(exg); exg.connect(chug);
      for (const n of [tone1, tone2, pulse, ex]) { n.start(t); n.stop(t + dur + 0.05); }
      // The tracks: links clanking round, and now and then a squeal
      for (let k = 0; k < 26; k++) noise(t + 0.15 + k * 0.08 + Math.random() * 0.02, 0.03, 2200 + Math.random() * 800, 3, 0.09, 'bandpass');
      tone(t + 0.5, 0.5, 2100, 1900, 0.025, 'triangle');
    },
  };

  // The far-off battle: now and then guns rumbling, a machine gun, a few rifle shots, far away and muffled
  let battleTimer = null, bomberTimer = null;
  function startBattle() {
    if (battleTimer) return;
    const next = () => {
      battleTimer = setTimeout(next, 1500 + Math.random() * 4000);
      if (!on || !ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.05, pick = Math.random();
      bus = distant.input;
      if (pick < 0.35) { SOUNDS.distantGun(t); if (Math.random() < 0.5 && !playFile('bigBoom', t + 1.5 + Math.random(), 0.8, 0.7)) blast(t + 1.5, 0.6); }
      else if (pick < 0.6) { if (!playFile(Math.random() < 0.5 ? 'mg42' : 'mg30', t, 0.7, 0.9)) burst(t, 10, 0.08, 0.7); }
      else if (pick < 0.85) { for (let k = 0; k < 3; k++) { const w = t + Math.random() * 1.5; if (!playFile('rifle', w, 0.6, 0.9)) shot(w, 0.7); } }
      else if (!playFile('boom', t, 0.8, 0.75)) blast(t, 0.8);
      bus = master;
    };
    next();
    // Now and then a flight of bombers goes over (Steve): the first soon after the start, then every half a minute to a
    // minute. They are overhead, not far off, so they go straight to the speakers rather than through the muffled battle
    const flights = () => {
      bomberTimer = setTimeout(flights, 35000 + Math.random() * 35000);
      if (!on || !ctx || ctx.state !== 'running') return;
      bus = master;
      bombers(ctx.currentTime + 0.05);
    };
    bomberTimer = setTimeout(flights, 6000 + Math.random() * 6000);
  }

  // rounds: how many rounds a rifle or MG shot sends (one a base, five from an MG), so the sound matches the tracers
  function play(name, delay = 0, big = false, rounds) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const when = ctx.currentTime + Math.max(0, delay);
    if (name === 'select') return playFile('select', when, 0.8, 1, ctx.destination);
    if (SOUNDS[name]) SOUNDS[name](when, big, rounds);
  }

  function toggle() {
    on = !on;
    try { localStorage.setItem('hedgerow.sound', on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
    return on;
  }

  return { play, toggle, isOn: () => on, wake };
})();
