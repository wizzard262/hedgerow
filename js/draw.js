// Hedgerow: the board. Flat and top-down like a farm game, but drawn smooth and muted: everything standing up
// (hedge banks, trees, houses, men, tanks) shows a little of its front and throws a soft shadow down and to the right

const Draw = (() => {
  let canvas, ctx, ground = null, groundKey = '', S = 60, W = 0, H = 0, dpr = 1;
  // Look and feel: piece size, what the pieces stand on (nothing, a soft disc in their side's colour, or a counter), and the map's colours
  const STYLE = { size: 1, base: 'none', palette: 'muted' };

  // ---------- Colours: muted, like a faded staff photograph ----------
  const C = {
    grass: [['#7b8c5c', '#6f8052', '#879770'], ['#83915f', '#748555', '#909d72'], ['#76885a', '#68794e', '#83936a']],
    wheat: ['#ad9f6e', '#9e9162', '#bcaf7e'],
    lane: '#a08e6e', laneDark: '#8f7d5f', laneLight: '#b09f80',
    village: '#9a9283', villageDark: '#8a8273',
    bank: '#6e5c45', bankFace: '#5b4b38',
    bush: '#4f6640', bushLight: '#62794f', bushDark: '#3d5233',
    canopy: '#566b43', canopyLight: '#6b8053', trunk: '#5a4632',
    wall: '#cbbfa5', wallShade: '#b3a78d', roof: '#7f5a47', roofLight: '#946b56', slate: '#6c6e70',
    shadow: 'rgba(25,30,15,.28)', outline: 'rgba(30,25,18,.55)',
  };
  // An inked staff-map look: pale paper fields, dark hedges
  const INK = {
    grass: [['#e4dcc4', '#d6cdb2', '#ece5d0'], ['#e0d8bf', '#d2c9ad', '#e9e2cc'], ['#dcd6bd', '#cec7ab', '#e6dfc9']],
    wheat: ['#ddd0a8', '#cbbd93', '#e7dcb8'],
    lane: '#cbb995', laneDark: '#b4a27e', laneLight: '#d8c8a6',
    village: '#cfc6b4', villageDark: '#bdb4a2',
    bank: '#8a7860', bankFace: '#776650',
    bush: '#5f6e4c', bushLight: '#74825e', bushDark: '#4a573b',
    canopy: '#66754f', canopyLight: '#7b8963', trunk: '#5a4632',
    wall: '#e4dccb', wallShade: '#cfc6b2', roof: '#8e6a58', roofLight: '#a07c69', slate: '#7b7d7f',
    shadow: 'rgba(60,50,30,.18)', outline: 'rgba(40,32,22,.6)',
  };
  const MUTED = Object.assign({}, C);
  function setStyle(opts) {
    Object.assign(STYLE, opts);
    Object.assign(C, STYLE.palette === 'ink' ? INK : MUTED);
    groundKey = '';
  }

  const SIDE = {
    us: { uniform: '#6b6f48', uniformLight: '#7f845a', helmet: '#555a38', helmetLight: '#6d7349', skin: '#c9a283', flag: '#3c5f8a',
          hull: '#6c7046', hullLight: '#80855a', hullDark: '#52563a', turret: '#73784c', track: '#3c3a33', mark: '#e6e2d4' },
    de: { uniform: '#6a716b', uniformLight: '#7f877f', helmet: '#555b57', helmetLight: '#6c736e', skin: '#c79f80', flag: '#8a3a32',
          hull: '#b4a271', hullLight: '#c5b483', hullDark: '#958559', turret: '#bba979', track: '#3c3a33', mark: '#1f1f1f',
          camoGreen: 'rgba(92,104,70,.75)', camoBrown: 'rgba(110,80,55,.7)' },
  };

  // Seeded scatter so a field looks the same every time it is drawn
  function seeded(n) {
    let a = (n * 2654435761) >>> 0;
    return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  }

  // ---------- Shapes ----------

  function ellipse(g, x, y, rx, ry, fill) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
  function roundRect(g, x, y, w, h, r, fill, stroke) {
    g.beginPath(); g.roundRect(x, y, w, h, r);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1, S * 0.012); g.stroke(); }
  }
  // A soft shadow under something standing
  function shadow(g, x, y, rx, ry) { ellipse(g, x + rx * 0.25, y + ry * 0.4, rx, ry, C.shadow); }

  // A bush or tree canopy: a dark base, a lighter top-left, a few leaf flecks
  function blob(g, x, y, r, R, base = C.bush, light = C.bushLight, dark = C.bushDark) {
    ellipse(g, x + r * 0.3, y + r * 0.35, r, r * 0.9, C.shadow);
    ellipse(g, x, y, r, r, base);
    ellipse(g, x - r * 0.25, y - r * 0.3, r * 0.6, r * 0.55, light);
    for (let k = 0; k < 4; k++) ellipse(g, x + (R() - 0.5) * r * 1.2, y + (R() - 0.3) * r, r * 0.18, r * 0.15, k % 2 ? dark : light);
  }

  // ---------- The ground: drawn once for each game and board size ----------

  function makeGround(st) {
    ground = document.createElement('canvas');
    ground.width = W; ground.height = H;
    const g = ground.getContext('2d');
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) field(g, st, x, y);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = Sim.tileType(x, y);
      if (t === 'laneEW' || t === 'crossroads') lane(g, x * S, y * S + S * 0.36, S, S * 0.28, true, seeded(x * 31 + y));
      if (t === 'laneNS' || t === 'crossroads') lane(g, x * S + S * 0.36, y * S, S * 0.28, S, false, seeded(x * 37 + y));
    }
    // Hedge banks: north-south first so the east-west banks (which show their front) sit over the ends
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS - 1; x++) if (Sim.hedge(st, x, y, x + 1, y)) hedge(g, (x + 1) * S, y * S, false, seeded(x * 13 + y * 7 + 1));
    for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLS; x++) if (Sim.hedge(st, x, y, x, y + 1)) hedge(g, x * S, (y + 1) * S, true, seeded(x * 17 + y * 11 + 2));
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = Sim.tileType(x, y);
      if (t === 'orchard') orchard(g, x, y);
      if (t === 'village') houses(g, x, y);
    }
  }

  function field(g, st, x, y) {
    const R = seeded(x * 97 + y * 31 + 7), px = x * S, py = y * S, t = Sim.tileType(x, y);
    if (t === 'village') {
      g.fillStyle = C.village; g.fillRect(px, py, S, S);
      for (let k = 0; k < 70; k++) { g.fillStyle = R() < 0.5 ? C.villageDark : '#a69e8f'; g.fillRect(px + R() * S, py + R() * S, S * 0.04, S * 0.025); }
      return;
    }
    // Wheat or grass, chosen per field
    const wheat = R() < 0.3 && t === 'field';
    const pal = wheat ? C.wheat : C.grass[Math.floor(R() * C.grass.length)];
    g.fillStyle = pal[0]; g.fillRect(px, py, S, S);
    if (wheat) {
      // Furrows across the field
      g.strokeStyle = pal[1]; g.lineWidth = Math.max(1, S * 0.012);
      const ew = R() < 0.5;
      for (let k = 0.08; k < 1; k += 0.09) { g.beginPath(); if (ew) { g.moveTo(px, py + k * S); g.lineTo(px + S, py + k * S); } else { g.moveTo(px + k * S, py); g.lineTo(px + k * S, py + S); } g.stroke(); }
    }
    // Soft patches and short strokes of grass
    for (let k = 0; k < 6; k++) ellipse(g, px + R() * S, py + R() * S, S * (0.08 + R() * 0.12), S * (0.05 + R() * 0.08), R() < 0.5 ? pal[1] + '88' : pal[2] + '66');
    g.lineWidth = Math.max(1, S * 0.01);
    for (let k = 0; k < 40; k++) {
      const gx = px + R() * S, gy = py + R() * S;
      g.strokeStyle = R() < 0.5 ? pal[1] : pal[2];
      g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + (R() - 0.5) * S * 0.03, gy - S * 0.03); g.stroke();
    }
  }

  function lane(g, x, y, w, h, ew, R) {
    roundRect(g, x, y, w, h, Math.min(w, h) * 0.2, C.lane);
    // Wheel ruts and a grassy crown
    g.strokeStyle = C.laneDark; g.lineWidth = Math.max(1, S * 0.015);
    for (const f of [0.28, 0.72]) { g.beginPath(); if (ew) { g.moveTo(x, y + h * f); g.lineTo(x + w, y + h * f); } else { g.moveTo(x + w * f, y); g.lineTo(x + w * f, y + h); } g.stroke(); }
    for (let k = 0; k < 18; k++) ellipse(g, x + R() * w, y + R() * h, S * 0.012, S * 0.008, R() < 0.5 ? C.laneLight : C.laneDark);
  }

  // A bocage hedge: an earth bank with bushes and the odd tree growing out of it
  function hedge(g, x, y, ew, R) {
    const len = S, thick = S * 0.13;
    if (ew) {
      roundRect(g, x - thick * 0.3, y - thick * 0.55, len + thick * 0.6, thick * 1.1, thick * 0.4, C.bank);
      roundRect(g, x - thick * 0.3, y + thick * 0.2, len + thick * 0.6, thick * 0.45, thick * 0.2, C.bankFace);
      for (let k = 0; k <= 7; k++) blob(g, x + (k / 7) * len + (R() - 0.5) * S * 0.03, y - thick * 0.25 + (R() - 0.5) * S * 0.02, S * (0.055 + R() * 0.025), R);
      if (R() < 0.35) blob(g, x + R() * len, y - thick * 0.6, S * 0.12, R, C.canopy, C.canopyLight);
    } else {
      roundRect(g, x - thick * 0.55, y - thick * 0.3, thick * 1.1, len + thick * 0.6, thick * 0.4, C.bank);
      for (let k = 0; k <= 7; k++) blob(g, x + (R() - 0.5) * S * 0.02, y + (k / 7) * len + (R() - 0.5) * S * 0.03, S * (0.055 + R() * 0.025), R);
      if (R() < 0.35) blob(g, x, y + R() * len, S * 0.12, R, C.canopy, C.canopyLight);
    }
  }

  // Apple trees in rows
  function orchard(g, x, y) {
    const R = seeded(x * 53 + y * 19);
    for (const [fx, fy] of [[0.2, 0.22], [0.5, 0.18], [0.8, 0.22], [0.22, 0.78], [0.78, 0.8]]) {
      const cx = (x + fx) * S, cy = (y + fy) * S;
      g.fillStyle = C.trunk; g.fillRect(cx - S * 0.012, cy, S * 0.024, S * 0.06);
      blob(g, cx, cy, S * 0.075, R, C.canopy, C.canopyLight);
    }
  }

  // Norman farmhouses: stone walls showing their front, brown tile or slate roofs, a chimney
  function houses(g, x, y) {
    const R = seeded(x * 71 + y * 43);
    const top = Sim.tileType(x, y - 1) !== 'village';
    const spots = top ? [[0.06, 0.06], [0.55, 0.08]] : [[0.08, 0.6], [0.56, 0.62]];
    for (const [fx, fy] of spots) {
      const hx = (x + fx) * S, hy = (y + fy) * S, w = S * 0.36, roofH = S * 0.18, wallH = S * 0.12;
      g.fillStyle = C.shadow; g.fillRect(hx + S * 0.03, hy + roofH + wallH, w, S * 0.04);
      // Wall front with a door and windows
      g.fillStyle = C.wall; g.fillRect(hx, hy + roofH, w, wallH);
      g.fillStyle = C.wallShade; g.fillRect(hx, hy + roofH + wallH * 0.8, w, wallH * 0.2);
      g.fillStyle = '#4a4238';
      g.fillRect(hx + w * 0.42, hy + roofH + wallH * 0.3, w * 0.14, wallH * 0.7);
      g.fillRect(hx + w * 0.12, hy + roofH + wallH * 0.3, w * 0.13, wallH * 0.32);
      g.fillRect(hx + w * 0.72, hy + roofH + wallH * 0.3, w * 0.13, wallH * 0.32);
      // Roof seen from above: two slopes, the near one lighter
      const roof = R() < 0.5 ? C.roof : C.slate;
      g.fillStyle = roof; g.fillRect(hx - S * 0.01, hy, w + S * 0.02, roofH);
      g.fillStyle = roof === C.roof ? C.roofLight : '#7c7e80'; g.fillRect(hx - S * 0.01, hy + roofH * 0.5, w + S * 0.02, roofH * 0.5);
      g.fillStyle = C.outline; g.fillRect(hx - S * 0.01, hy + roofH * 0.48, w + S * 0.02, Math.max(1, S * 0.008));
      g.fillStyle = '#7a6e62'; g.fillRect(hx + w * 0.75, hy - S * 0.025, S * 0.035, S * 0.07);
    }
  }

  // ---------- Men ----------

  // One man seen from above and a little in front: shadow, shoulders, helmet, face, rifle
  function man(g, x, y, side, facing, faded) {
    const P = SIDE[side], r = S * 0.032 * STYLE.size;
    g.globalAlpha = faded ? 0.55 : 1;
    shadow(g, x, y + r * 1.2, r * 1.1, r * 0.45);
    ellipse(g, x, y + r * 0.7, r * 1.05, r * 0.8, P.uniform);
    ellipse(g, x - r * 0.3, y + r * 0.5, r * 0.5, r * 0.35, P.uniformLight);
    // Rifle across the body, pointing towards the enemy
    g.strokeStyle = '#3a3128'; g.lineWidth = Math.max(1, r * 0.3);
    g.beginPath(); g.moveTo(x - facing * r * 0.6, y + r * 1.1); g.lineTo(x + facing * r * 1.5, y + r * 0.1); g.stroke();
    ellipse(g, x, y + r * 0.15, r * 0.45, r * 0.3, P.skin);
    ellipse(g, x, y - r * 0.25, r * 0.85, r * 0.7, P.helmet);
    ellipse(g, x - r * 0.25, y - r * 0.45, r * 0.38, r * 0.28, P.helmetLight);
    g.globalAlpha = 1;
  }

  // A platoon: three men close together, the way a section moves along a hedge
  function squad(g, x, y, side, facing, faded) {
    const k = STYLE.size;
    for (const [dx, dy] of [[0, 0.07], [0.07, 0], [0.075, 0.09]]) man(g, x + dx * S * k, y + dy * S * k, side, facing, faded);
  }

  // ---------- Guns and tanks ----------

  // A tank from above: tracks, hull, engine deck, turret and gun. Each kind its own shape
  function tank(g, x, y, kind, side, faded) {
    const P = SIDE[side], f = side === 'us' ? 1 : -1;
    const L = S * (kind === 'panther' ? 0.36 : 0.32), Wd = S * 0.17;
    g.save();
    g.translate(x, y);
    g.scale(f * STYLE.size, STYLE.size);
    g.globalAlpha = faded ? 0.6 : 1;
    // Shadow, then the two tracks with their links
    roundRect(g, -L / 2 + S * 0.02, -Wd / 2 + S * 0.03, L, Wd, S * 0.02, C.shadow);
    for (const ty of [-Wd / 2, Wd / 2 - Wd * 0.24]) {
      roundRect(g, -L / 2, ty, L, Wd * 0.24, S * 0.012, P.track);
      g.strokeStyle = '#2b2924'; g.lineWidth = Math.max(1, S * 0.006);
      for (let k = -L / 2 + S * 0.012; k < L / 2; k += S * 0.018) { g.beginPath(); g.moveTo(k, ty); g.lineTo(k, ty + Wd * 0.24); g.stroke(); }
    }
    // Side skirts on the Panzer IV and Panther
    if (kind === 'pz4' || kind === 'panther') for (const ty of [-Wd / 2 - S * 0.008, Wd / 2 - Wd * 0.2]) {
      roundRect(g, -L * 0.42, ty, L * 0.84, Wd * 0.2, S * 0.005, P.hullDark);
      g.strokeStyle = 'rgba(0,0,0,.25)'; for (let k = -L * 0.42; k < L * 0.42; k += L * 0.14) { g.beginPath(); g.moveTo(k, ty); g.lineTo(k, ty + Wd * 0.2); g.stroke(); }
    }
    // Hull: the Panther's front slopes to a point, the others are boxes
    const hw = Wd * 0.62;
    g.beginPath();
    if (kind === 'panther') { g.moveTo(-L * 0.46, -hw / 2); g.lineTo(L * 0.3, -hw / 2); g.lineTo(L * 0.48, -hw * 0.3); g.lineTo(L * 0.48, hw * 0.3); g.lineTo(L * 0.3, hw / 2); g.lineTo(-L * 0.46, hw / 2); g.closePath(); }
    else g.roundRect(-L * 0.46, -hw / 2, L * 0.92, hw, S * (kind === 'sherman' || kind === 'firefly' ? 0.03 : 0.01));
    g.fillStyle = P.hull; g.fill();
    g.strokeStyle = C.outline; g.lineWidth = Math.max(1, S * 0.008); g.stroke();
    // Light on the top-left half, shade on the near side
    g.fillStyle = P.hullLight; g.fillRect(-L * 0.42, -hw / 2 + S * 0.005, L * 0.7, hw * 0.3);
    g.fillStyle = P.hullDark; g.fillRect(-L * 0.44, hw / 2 - hw * 0.18, L * 0.82, hw * 0.16);
    // German camouflage stripes
    if (side === 'de') {
      g.save(); g.clip();
      g.fillStyle = P.camoGreen; g.beginPath(); g.ellipse(-L * 0.15, -hw * 0.1, L * 0.14, hw * 0.25, 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = P.camoBrown; g.beginPath(); g.ellipse(L * 0.2, hw * 0.15, L * 0.12, hw * 0.2, -0.5, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // Engine deck grilles at the back
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, S * 0.006);
    for (let k = 0; k < 4; k++) { const gx = -L * 0.42 + k * S * 0.014; g.beginPath(); g.moveTo(gx, -hw * 0.3); g.lineTo(gx, hw * 0.3); g.stroke(); }
    // Markings: a white star, or a black cross
    if (side === 'us') {
      g.fillStyle = P.mark; star(g, L * 0.12, 0, S * 0.026);
    } else {
      g.fillStyle = '#f2f0ea'; g.fillRect(-L * 0.3, -S * 0.016, S * 0.032, S * 0.032);
      g.fillStyle = P.mark; g.fillRect(-L * 0.3 + S * 0.008, -S * 0.016, S * 0.016, S * 0.032); g.fillRect(-L * 0.3, -S * 0.008, S * 0.032, S * 0.016);
    }
    // Turret: round cast Sherman, boxy Panzer IV with skirts, the Panther's set back
    const tx = kind === 'panther' ? -L * 0.05 : 0;
    const tr = S * (kind === 'panther' ? 0.065 : 0.058);
    if (kind === 'pz4') roundRect(g, tx - tr * 1.25, -tr * 1.15, tr * 2.5, tr * 2.3, S * 0.008, P.hullDark, C.outline);
    // Gun: long with a muzzle brake on the Firefly and the Panther
    const gunLen = S * ({ sherman: 0.17, firefly: 0.27, pz4: 0.21, panther: 0.27 }[kind] || 0.18);
    g.fillStyle = '#3d3b33'; g.fillRect(tx + tr * 0.6, -S * 0.008, gunLen, S * 0.016);
    if (kind === 'firefly' || kind === 'panther') g.fillRect(tx + tr * 0.6 + gunLen - S * 0.02, -S * 0.014, S * 0.02, S * 0.028);
    if (kind === 'pz4') { g.beginPath(); g.roundRect(tx - tr, -tr * 0.95, tr * 2, tr * 1.9, S * 0.01); }
    else { g.beginPath(); g.ellipse(tx, 0, tr * 1.08, tr, 0, 0, Math.PI * 2); }
    g.fillStyle = P.turret; g.fill(); g.strokeStyle = C.outline; g.stroke();
    ellipse(g, tx - tr * 0.3, -tr * 0.35, tr * 0.5, tr * 0.35, P.hullLight);
    // Commander's hatch
    ellipse(g, tx - tr * 0.35, tr * 0.25, tr * 0.28, tr * 0.28, P.hullDark);
    g.restore();
  }

  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }

  // An anti-tank gun: split trail, wheels, shield and a long barrel
  function antiTankGun(g, x, y, side, faded) {
    const f = side === 'us' ? 1 : -1;
    g.save(); g.translate(x, y); g.scale(f, 1); g.globalAlpha = faded ? 0.6 : 1;
    shadow(g, 0, S * 0.03, S * 0.09, S * 0.03);
    g.strokeStyle = '#4b4a40'; g.lineWidth = Math.max(1, S * 0.012);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-S * 0.11, -S * 0.05); g.moveTo(0, 0); g.lineTo(-S * 0.11, S * 0.05); g.stroke();
    ellipse(g, 0, -S * 0.04, S * 0.018, S * 0.018, '#2f2e29'); ellipse(g, 0, S * 0.04, S * 0.018, S * 0.018, '#2f2e29');
    roundRect(g, -S * 0.01, -S * 0.05, S * 0.025, S * 0.1, S * 0.005, '#6e7262', C.outline);
    g.fillStyle = '#3d3b33'; g.fillRect(S * 0.01, -S * 0.007, S * 0.17, S * 0.014);
    g.restore();
  }

  // ---------- Pieces in a field ----------

  // What a piece stands on, in its side's colour: a soft disc, or a counter like a board wargame
  function base(g, u, x, y, w, h) {
    if (STYLE.base === 'none') return;
    const col = u.side === 'us' ? '#5f7898' : '#8a6a60';
    if (STYLE.base === 'disc') { ellipse(g, x + w / 2, y + h / 2, w * 0.62, h * 0.55, col + '55'); return; }
    roundRect(g, x - w * 0.08, y - h * 0.1, w * 1.16, h * 1.2, S * 0.03, 'rgba(240,232,212,.92)', col);
    g.fillStyle = col; g.fillRect(x - w * 0.08, y - h * 0.1, w * 1.16, S * 0.025);
  }

  function drawPiece(g, u, x, y) {
    const facing = u.side === 'us' ? 1 : -1, faded = u.side === 'us' && u.acted;
    const k = STYLE.size;
    if (u.kind === 'company') base(g, u, x - S * 0.04 * k, y - S * 0.04 * k, S * 0.27 * k, S * 0.38 * k);
    else if (Sim.isTank(u)) base(g, u, x - S * 0.19 * k, y - S * 0.11 * k, S * 0.38 * k, S * (u.platoons > 1 ? 0.45 : 0.22) * k);
    else base(g, u, x - S * 0.05 * k, y - S * 0.05 * k, S * 0.17 * k, S * 0.16 * k);
    if (u.kind === 'company') {
      // Three platoons, each three men
      const spots = [[0, 0.02], [0.13, 0.13], [0, 0.24]].slice(0, u.platoons);
      for (const [dx, dy] of spots) squad(g, x + dx * S * k, y + dy * S * k, u.side, facing, faded);
      if (u.quality === 'elite') chevron(g, x + S * 0.2, y - S * 0.02);
    } else if (Sim.isTank(u)) {
      const spots = [[0, 0], [0.02, 0.22]].slice(0, u.platoons);
      for (const [dx, dy] of spots) tank(g, x + dx * S * k, y + dy * S * k, u.kind, u.side, faded);
    } else if (u.kind === 'pak') {
      antiTankGun(g, x, y + S * 0.05, u.side, faded);
    } else {
      // Captains, machine guns and anti-tank teams: two men, with their kit
      man(g, x, y + S * 0.04, u.side, facing, faded);
      if (u.kind !== 'captain') man(g, x + S * 0.06, y + S * 0.07, u.side, facing, faded);
      g.globalAlpha = faded ? 0.55 : 1;
      if (u.kind === 'captain') {
        g.fillStyle = '#4a3b2a'; g.fillRect(x + S * 0.05, y - S * 0.04, Math.max(1, S * 0.008), S * 0.11);
        g.fillStyle = SIDE[u.side].flag; g.fillRect(x + S * 0.058, y - S * 0.04, S * 0.05, S * 0.03);
      } else if (u.kind === 'mg' || u.kind === 'mg42') {
        g.fillStyle = '#2f2d27'; g.fillRect(x + facing * S * 0.03, y + S * 0.035, facing * S * 0.1, S * 0.012);
        g.strokeStyle = '#2f2d27'; g.lineWidth = Math.max(1, S * 0.006);
        g.beginPath(); g.moveTo(x + facing * S * 0.09, y + S * 0.045); g.lineTo(x + facing * S * 0.07, y + S * 0.075); g.moveTo(x + facing * S * 0.09, y + S * 0.045); g.lineTo(x + facing * S * 0.11, y + S * 0.075); g.stroke();
      } else {
        g.fillStyle = '#3f4636'; g.fillRect(x - facing * S * 0.03, y + S * 0.015, facing * S * 0.13, S * 0.016);
      }
      g.globalAlpha = 1;
    }
    if (u.shocked) shockMark(g, x + S * 0.08, y - S * 0.06);
  }

  function chevron(g, x, y) {
    g.strokeStyle = '#d9b44a'; g.lineWidth = Math.max(1.5, S * 0.014); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - S * 0.025, y - S * 0.01); g.lineTo(x, y + S * 0.015); g.lineTo(x + S * 0.025, y - S * 0.01); g.stroke();
  }

  // A shaken piece: a small pale question over it
  function shockMark(g, x, y) {
    ellipse(g, x, y, S * 0.03, S * 0.03, 'rgba(230,200,120,.9)');
    g.fillStyle = '#3a2d1a'; g.font = `bold ${Math.round(S * 0.045)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', x, y + S * 0.003);
  }

  // Where the pieces in one field stand: the company on the left, tanks on the right, captains and teams along the top
  function drawField(g, st, x, y, pieces) {
    const company = pieces.find(u => u.kind === 'company');
    const armour = pieces.find(u => Sim.isTank(u));
    const small = pieces.filter(u => Sim.isSmall(u));
    const px = x * S, py = y * S;
    small.forEach((u, i) => drawPiece(g, u, px + S * (0.12 + i * 0.28), py + S * 0.1));
    if (company) drawPiece(g, company, px + S * (armour ? 0.1 : 0.32), py + S * 0.42);
    if (armour) drawPiece(g, armour, px + S * (company ? 0.66 : 0.5), py + S * 0.5);
  }

  // ---------- Marks on top ----------

  const MARKS = { move: '#9fd6e8', charge: '#e0705f', shoot: '#e6cf6a', rally: '#9fd48c', fire: '#e8a05a', attach: '#c2a8e0' };

  function brackets(g, x, y, col, inset, width) {
    const px = x * S + inset, py = y * S + inset, s = S - inset * 2, l = S * 0.2;
    g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'round';
    g.beginPath();
    for (const [cx, cy, dx, dy] of [[px, py, 1, 1], [px + s, py, -1, 1], [px, py + s, 1, -1], [px + s, py + s, -1, -1]]) {
      g.moveTo(cx + dx * l, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy * l);
    }
    g.stroke();
  }

  function drawObjective(g, st) {
    const px = OBJECTIVE.x * S, py = OBJECTIVE.y * S;
    const us = Sim.at(st, OBJECTIVE.x, OBJECTIVE.y, 'us').some(u => u.kind === 'company');
    g.fillStyle = '#4a3b2a'; g.fillRect(px + S * 0.86, py + S * 0.18, Math.max(1.5, S * 0.012), S * 0.36);
    g.fillStyle = us ? SIDE.us.flag : SIDE.de.flag; g.fillRect(px + S * 0.872, py + S * 0.18, S * 0.11, S * 0.07);
    // The hamlet's name
    g.font = `600 ${Math.round(S * 0.17)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = S * 0.04; g.strokeStyle = 'rgba(40,32,22,.75)'; g.fillStyle = '#efe6cf';
    g.strokeText(OBJECTIVE.name, px + S * 0.5, py - S * 0.02); g.fillText(OBJECTIVE.name, px + S * 0.5, py - S * 0.02);
  }

  // Bursts: a flash and a puff of smoke that fades
  function drawFx(g, st, now) {
    for (const fx of st.fx) {
      if (!fx.t0) fx.t0 = now;
      const age = (now - fx.t0) / 900;
      if (age > 1) continue;
      const cx = (fx.x + 0.5) * S, cy = (fx.y + 0.5) * S;
      const n = fx.kind === 'shell' ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const ox = (k - (n - 1) / 2) * S * 0.18, r = S * (0.08 + age * 0.12);
        if (fx.kind !== 'miss' && age < 0.35) ellipse(g, cx + ox, cy, r * 0.8, r * 0.8, `rgba(240,190,110,${0.8 - age * 2})`);
        ellipse(g, cx + ox, cy - age * S * 0.15, r, r * 0.8, `rgba(170,165,155,${0.6 * (1 - age)})`);
      }
    }
  }

  // ---------- Putting it on the screen ----------

  function init(el) { canvas = el; ctx = canvas.getContext('2d'); }

  // Fit the board in its box, keeping fields square
  function resize(boxW, boxH) {
    dpr = window.devicePixelRatio || 1;
    S = Math.floor(Math.min(boxW / COLS, boxH / ROWS) * dpr);
    W = S * COLS; H = S * ROWS;
    canvas.width = W; canvas.height = H;
    canvas.style.width = W / dpr + 'px'; canvas.style.height = H / dpr + 'px';
  }

  // view: { spots: [{ x, y, kind }], selected: piece, hover: { x, y }, showAll }
  function render(st, view = {}) {
    const key = st.seed + ':' + S + ':' + STYLE.palette + ':' + Object.keys(st.hedges).length;
    if (groundKey !== key) { makeGround(st); groundKey = key; }
    const now = performance.now();
    ctx.drawImage(ground, 0, 0);
    drawObjective(ctx, st);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      // The Germans show only where the Americans can see them
      const here = Sim.at(st, x, y).filter(u => u.side === 'us' || view.showAll || Sim.sees(st, 'us', x, y));
      if (here.length) drawField(ctx, st, x, y, here);
    }
    if (view.hover) { ctx.fillStyle = 'rgba(255,250,235,.08)'; ctx.fillRect(view.hover.x * S, view.hover.y * S, S, S); }
    for (const s of view.spots || []) brackets(ctx, s.x, s.y, MARKS[s.kind] || '#fff', S * 0.06, Math.max(2, S * 0.03));
    if (view.selected && view.selected.x !== null) {
      const a = 0.65 + 0.35 * Math.sin(now / 250);
      brackets(ctx, view.selected.x, view.selected.y, `rgba(250,244,225,${a})`, S * 0.02, Math.max(2, S * 0.035));
    }
    drawFx(ctx, st, now);
  }

  // Which field is under a point on the page
  function fieldAt(cssX, cssY) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((cssX - r.left) / r.width * COLS), y = Math.floor((cssY - r.top) / r.height * ROWS);
    return Sim.inside(x, y) ? { x, y } : null;
  }

  // Is a burst still playing?
  const busy = st => st.fx.some(f => !f.t0 || performance.now() - f.t0 < 900);

  // A piece drawn on its own (for the panel's piece cards)
  function pieceIcon(el, u) {
    const keep = S;
    const size = 64 * (window.devicePixelRatio || 1);
    el.width = size; el.height = size;
    S = size * 1.2;
    const g = el.getContext('2d');
    g.clearRect(0, 0, size, size);
    if (u.kind === 'company') drawPiece(g, u, size * 0.25, size * 0.15);
    else if (Sim.isTank(u)) drawPiece(g, Object.assign({}, u, { platoons: 1 }), size * 0.5, size * 0.5);
    else drawPiece(g, u, size * 0.35, size * 0.45);
    S = keep;
  }

  return { init, resize, render, fieldAt, busy, pieceIcon, setStyle };
})();
