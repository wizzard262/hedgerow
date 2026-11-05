// Hedgerow: a knocked-out tank on the table (Steve): soft painted flames and black smoke, the same idea as Future City
// Battle's burning wreck (three teardrop flames on the hull) but smooth, not built of cubes; a scorched black hull; a
// burnt patch on the ground. Only how it looks: the rules of wrecks are in js/sim.js

const Fire = (() => {
  const T = THREE;

  // ---------- Pictures, each painted once ----------

  // A clamp to 0..1
  const unit = v => Math.max(0, Math.min(1, v));

  // One tongue of flame, a pixel at a time: hot and pale in its heart, through orange to dark red at the edge, wider low
  // down and tapering to a point that leans over by `lean`
  function flameTexture(lean) {
    const w = 64, h = 128;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      // up: 0 at the bottom of the picture, 1 at the top
      const up = 1 - py / (h - 1);
      // How wide the tongue is at this height, and where its middle has wandered to
      const halfWidth = 0.46 * Math.pow(Math.sin(Math.PI * Math.pow(up, 0.55)), 0.9) + 0.001;
      const middle = lean * up * up + Math.sin(up * 7 + lean * 9) * 0.04 * up;
      for (let px = 0; px < w; px++) {
        const across = (px / (w - 1) - 0.5 - middle) / halfWidth;
        const inside = 1 - Math.abs(across);
        if (inside <= 0) continue;
        // Hottest low down in the middle
        const heat = inside * (1 - up * 0.62);
        const at = (py * w + px) * 4;
        // White-yellow, yellow, orange, then dark red
        const r = 170 + 85 * unit(heat * 4);
        const gr = 22 + 215 * unit((heat - 0.12) * 2.1);
        const b = 8 + 150 * unit((heat - 0.5) * 3);
        img.data[at] = r; img.data[at + 1] = gr; img.data[at + 2] = b;
        // Soft edge, and it thins out towards the tip
        img.data[at + 3] = 255 * unit(inside * 3.2) * unit((1 - up) * 3.5);
      }
    }
    g.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }
  let flames = null;
  const flameTextures = () => flames || (flames = [-0.12, 0.1, -0.04, 0.15].map(flameTexture));

  // A soft round puff, for the smoke (dark) and the glow (warm)
  function puffTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    r.addColorStop(0, inner); r.addColorStop(0.5, inner.replace(/[\d.]+\)$/, '0.55)')); r.addColorStop(1, outer);
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }
  let smoke = null, glow = null;
  const smokeTexture = () => smoke || (smoke = puffTexture('rgba(26,23,21,1)', 'rgba(26,23,21,0)'));
  const glowTexture = () => glow || (glow = puffTexture('rgba(255,150,50,1)', 'rgba(255,90,20,0)'));

  // The burnt patch on the ground: black in the middle, ragged at the edge, flecked with ash
  let burnt = null;
  function burntTexture() {
    if (burnt) return burnt;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    // Overlapping dark blobs make the ragged edge (a fixed pattern, not the game's dice)
    for (let k = 0; k < 90; k++) {
      const a = k * 2.399, far = 112 * Math.sqrt(k / 90);
      const x = 128 + Math.cos(a) * far, y = 128 + Math.sin(a) * far, r = 16 + (k * 7) % 26;
      const blob = g.createRadialGradient(x, y, 0, x, y, r);
      blob.addColorStop(0, 'rgba(10,8,7,0.62)');
      blob.addColorStop(1, 'rgba(10,8,7,0)');
      g.fillStyle = blob;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Flecks of pale ash
    g.fillStyle = 'rgba(120,112,102,0.5)';
    for (let k = 0; k < 70; k++) {
      const a = k * 1.7, far = 92 * Math.sqrt(k / 70);
      g.fillRect(128 + Math.cos(a) * far, 128 + Math.sin(a) * far, 1 + k % 3, 1 + k % 2);
    }
    burnt = new T.CanvasTexture(c);
    burnt.encoding = T.sRGBEncoding;
    return burnt;
  }

  // ---------- The hull ----------

  // Burnt black, not evenly: mostly soot, with patches of rust and pale ash where the paint has gone
  const hullBlack = () => new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0 });
  function scorch(model) {
    const black = hullBlack();
    model.traverse(c => {
      if (!c.isMesh) return;
      c.material = black;
      const pos = c.geometry.attributes.position;
      const colours = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        // Two slow waves across the model, so the patches are blotches rather than speckles
        const rust = Math.sin(x * 19 + z * 5) * Math.sin(z * 27 - y * 11);
        const ash = Math.sin(x * 31 - y * 17) * Math.sin(z * 13 + x * 7);
        // Linear colours: soot, then a little rust or ash on top of it
        const r = 0.009 + (rust > 0.5 ? 0.03 : 0) + (ash > 0.65 ? 0.05 : 0);
        const g = 0.009 + (rust > 0.5 ? 0.011 : 0) + (ash > 0.65 ? 0.047 : 0);
        const b = 0.009 + (rust > 0.5 ? 0.004 : 0) + (ash > 0.65 ? 0.044 : 0);
        colours.set([r, g, b], i * 3);
      }
      c.geometry.setAttribute('color', new T.BufferAttribute(colours, 3));
    });
  }

  // ---------- The fire ----------

  // One soft sprite (the flames and glow ignore the room's lighting, as fire would)
  function sprite(map, additive) {
    const s = new T.Sprite(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
    return s;
  }

  // Three fires on the hull, as on Future City Battle's wreck: the biggest over the engine at the back, one at the
  // turret, a small one on the side. along: towards the front of the tank (field widths); out: across it
  const SEATS = [
    { along: -0.17, out: 0, tongues: 8, size: 0.56, top: 0.12 },
    { along: 0.02, out: 0.02, tongues: 5, size: 0.4, top: 0.18 },
    { along: 0.17, out: -0.07, tongues: 3, size: 0.26, top: 0.1 },
  ];
  const SMOKE_PUFFS = 9;

  // A fire on a hull facing `facing`, centred on the group's origin. Its parts are worked out again every frame from the
  // time alone (see burn), so nothing piles up however long it goes on
  function make(facing) {
    const group = new T.Group();
    const toFront = { x: Math.cos(facing), z: -Math.sin(facing) };
    const textures = flameTextures();
    const tongues = [], puffs = [];
    SEATS.forEach((seat, n) => {
      for (let k = 0; k < seat.tongues; k++) {
        const s = sprite(textures[(n + k) % textures.length], false);
        // Standing on its base
        s.center.set(0.5, 0.04);
        group.add(s);
        // A spread over the seat, each with its own beat (fixed numbers, so all the fires differ only by `phase`)
        const a = k * 2.399 + n;
        tongues.push({
          s, seat,
          x: seat.along * toFront.x + seat.out * -toFront.z + Math.cos(a) * 0.05,
          z: seat.along * toFront.z + seat.out * toFront.x + Math.sin(a) * 0.04,
          period: 0.62 + ((k * 37) % 10) * 0.05,
          phase: (k * 0.37 + n * 0.21) % 1,
          sway: a,
          // The first of each seat go on burning when the fire has died down
          small: k === 0,
        });
      }
    });
    for (let k = 0; k < SMOKE_PUFFS; k++) {
      const s = sprite(smokeTexture(), false);
      s.material.toneMapped = true;
      group.add(s);
      puffs.push({ s, phase: k / SMOKE_PUFFS, period: 4.6 + (k % 3) * 0.8, sway: k * 1.9 });
    }
    const light = sprite(glowTexture(), true);
    light.position.y = 0.16;
    group.add(light);
    // Where the burnt patch goes: under the fire
    const patch = new T.Mesh(new T.PlaneGeometry(0.78, 0.56), new T.MeshBasicMaterial({ map: burntTexture(), transparent: true, depthWrite: false }));
    patch.rotation.set(-Math.PI / 2, 0, facing);
    patch.position.y = 0.005;
    group.add(patch);
    group.userData.fire = { tongues, puffs, light, strength: 1, seed: (facing * 13.7) % 1 };
    return group;
  }

  // One frame of a fire. want: 1 burning hard, or a little once it has died down; dt in seconds
  function burn(group, now, dt, want) {
    const f = group.userData.fire;
    // Dies down slowly rather than all at once
    f.strength += (want - f.strength) * Math.min(1, dt * 0.5);
    const seconds = now / 1000 + f.seed * 40;
    for (const t of f.tongues) {
      // Once died down only a few small tongues are left
      t.s.visible = f.strength > 0.55 || t.small;
      if (!t.s.visible) continue;
      const life = (seconds / t.period + t.phase) % 1;
      // Each tongue licks up quickly, then sinks as it thins out
      const size = t.seat.size * f.strength * Math.sin(Math.PI * Math.pow(life, 0.55)) * (0.8 + 0.2 * Math.sin(seconds * 9 + t.sway));
      t.s.scale.set(size * 0.62, size, 1);
      // (the small flames left when it has died down lick over the top of the hull, not inside it)
      t.s.position.set(t.x + Math.sin(seconds * 3 + t.sway) * 0.012, t.seat.top + (1 - f.strength) * 0.16 + life * size * 0.35, t.z);
      t.s.material.rotation = Math.sin(seconds * 2.3 + t.sway) * 0.16;
      t.s.material.opacity = unit(life * 7) * unit((1 - life) * 3);
    }
    for (const p of f.puffs) {
      const life = (seconds / p.period + p.phase) % 1;
      // Rising and spreading, leaning away on the wind, and thinning to nothing
      p.s.position.set(life * life * 0.28 + Math.sin(life * 5 + p.sway) * 0.025, 0.22 + life * 0.85 * (0.5 + f.strength * 0.5), -life * 0.14 + Math.cos(life * 4 + p.sway) * 0.025);
      p.s.scale.setScalar(0.09 + life * 0.42 * (0.45 + f.strength * 0.55));
      p.s.material.opacity = 0.62 * unit(life * 6) * (1 - life) * (0.4 + f.strength * 0.6);
    }
    // The firelight flickers on the hull and the ground
    f.light.scale.setScalar(0.62 * (0.45 + f.strength * 0.55));
    f.light.material.opacity = f.strength * (0.3 + 0.1 * Math.sin(seconds * 11) + 0.06 * Math.sin(seconds * 23));
  }

  // Free what a fire made for itself; the pictures are kept for the next one
  function free(group) {
    group.traverse(c => {
      if (c.isMesh) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }

  return { make, burn, free, scorch };
})();
