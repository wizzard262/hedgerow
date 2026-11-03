// Hedgerow: the tabletop in 3D (three.js). The table, the flocked mat, foam hedges, Norman houses,
// painted miniatures on round bases, model tanks and dice, lit like a photograph of a wargame table

const Models = (() => {
  const T = THREE;

  // ---------- Textures painted on a canvas ----------

  function seeded(n) { let a = (n * 2654435761) >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

  function canvasTexture(w, h, paint, repeat = [1, 1]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repeat);
    t.anisotropy = 8;
    t.encoding = T.sRGBEncoding;   // painted colours are screen colours
    return t;
  }

  // Honey-coloured table boards with grain
  const woodTex = () => canvasTexture(1024, 1024, (g, w, h) => {
    const R = seeded(3);
    for (let b = 0; b < h; b += 128) {
      g.fillStyle = `hsl(32, ${42 + R() * 8}%, ${40 + R() * 7}%)`; g.fillRect(0, b, w, 128);
      for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(70,40,15,${0.08 + R() * 0.14})`; g.lineWidth = 1 + R() * 2; const y = b + R() * 128; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (R() - 0.5) * 14, w * 0.7, y + (R() - 0.5) * 14, w, y + (R() - 0.5) * 8); g.stroke(); }
      g.fillStyle = 'rgba(40,22,8,.6)'; g.fillRect(0, b, w, 3);
    }
  }, [2, 2]);

  // The top of a figure's base (Steve): green flock for the Americans, brown earth for the Germans, so the sides tell apart
  const BASE_EARTH = ['#6b5236', '#7a5f3e', '#5a4430', '#8a6d48', '#4f3c2a', '#76603f'];
  function baseTop(side) {
    // Made once for each side
    const key = side === 'de' ? 'flockTopDe' : 'flockTop';
    if (!M[key]) M[key] = new T.MeshStandardMaterial({ map: side === 'de' ? flockTex('#6a5034', BASE_EARTH, 37) : flockTex('#5f6d3c', GRASS, 31), roughness: 1 });
    return M[key];
  }

  // Flock: a static-grass mat speckled with many greens, browns and straws
  function flockTex(base, flecks, seed) {
    return canvasTexture(512, 512, (g, w, h) => {
      const R = seeded(seed);
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 18; k++) { g.fillStyle = flecks[k % flecks.length]; g.globalAlpha = 0.18; g.beginPath(); g.ellipse(R() * w, R() * h, 30 + R() * 90, 20 + R() * 60, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      for (let k = 0; k < 26000; k++) { g.fillStyle = flecks[Math.floor(R() * flecks.length)]; const s = 1 + R() * 2; g.fillRect(R() * w, R() * h, s, s); }
    });
  }
  const GRASS = ['#56663a', '#6b7a43', '#7d8a4c', '#4b5932', '#8c8a4e', '#6d5f3c', '#5f6f3d'];
  const WHEAT = ['#b19d5f', '#8d7c47', '#c4b073', '#a08c50', '#7f8a46'];
  const EARTH = ['#8a785b', '#9a876a', '#75654c', '#a69478', '#6f6048'];

  // ---------- Materials ----------
  // Colours are given as they look on screen, so they are turned into the renderer's linear light first
  const mat = (color, rough = 0.85, metal = 0, extra = {}) => {
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: rough, metalness: metal }, extra));
    m.color.set(color).convertSRGBToLinear();
    return m;
  };
  const M = {};
  function materials() {
    M.base = mat('#1d1c1a', 0.55);
    M.flesh = mat('#c99a7c', 0.7);
    M.boot = mat('#2a2017', 0.6);
    M.wood = mat('#5a3d25', 0.7);
    M.steel = mat('#2c2c2a', 0.45, 0.6);
    M.track = mat('#2a2925', 0.7, 0.4);
    M.foam = mat('#26371f', 1);
    M.foamLight = mat('#33472a', 1);
    M.hedgeBase = mat('#4f3f2c', 0.9);
    M.usUniform = mat('#7a7450', 0.85);        // the M41 jacket: a light olive tan
    M.usTrousers = mat('#5e5b3d', 0.85);
    M.usHelmet = mat('#4f5434', 0.6);
    M.usWebbing = mat('#9a8f62', 0.9);
    M.deUniform = mat('#5d6862', 0.85);        // field grey
    M.deHelmet = mat('#4a524f', 0.55);
    M.deHelmet.side = T.DoubleSide;           // the Stahlhelm is a lathed shell: both faces show
    M.deWebbing = mat('#2e2a25', 0.7);
    M.olive = mat('#4f5432', 0.65, 0.15);      // olive drab paint
    M.dunkelgelb = mat('#a8975f', 0.65, 0.15); // German dark yellow
    M.panzerGrey = mat('#565c5f', 0.65, 0.15); // German tanks (Steve): panzer grey
    M.gold = mat('#c9a13a', 0.35, 0.7);       // an elite piece's band round its bases
    M.white = mat('#e8e4d6', 0.6);
    M.black = mat('#151515', 0.6);
    M.stone = mat('#bfb397', 0.95);
    M.slate = mat('#5d6266', 0.7);
    M.shutter = mat('#5e6a5c', 0.8);
    M.window = mat('#262624', 0.3, 0.2);
    M.die = mat('#b5261e', 0.35);
    M.pip = mat('#f4efe6', 0.4);
  }

  // ---------- Small helpers ----------
  const box = (w, h, d, m) => new T.Mesh(new T.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, m, seg = 16) => new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), m);
  const sphere = (r, m, ws = 16, hs = 12) => new T.Mesh(new T.SphereGeometry(r, ws, hs), m);
  function at(o, x, y, z, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }
  function castAll(o) { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }

  // A side profile pushed out to a width: how tank hulls and turrets get their sloped faces
  function profile(points, width, m, bevel = 0.01) {
    const s = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
    const g = new T.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
    g.translate(0, 0, -width / 2 + bevel);
    return new T.Mesh(g, m);
  }

  // ---------- Men ----------
  // A painted figure, on its own round base or (base = false) standing on a shared one. A man is about 0.11 tall
  // before the game scales the men up (they are bigger models than the tanks: 1:54 against 1:76)
  function soldier(side, pose = 0, base = true) {
    const us = side === 'us', g = new T.Group();
    const uni = us ? M.usUniform : M.deUniform, legs = us ? M.usTrousers : M.deUniform, web = us ? M.usWebbing : M.deWebbing;
    // Base: a black disc with a bevel
    if (base) g.add(at(cyl(0.032, 0.034, 0.008, M.base, 24), 0, 0.004, 0));
    // Legs apart, boots (US leggings are paler)
    for (const s of [-1, 1]) {
      g.add(at(cyl(0.0065, 0.0055, 0.045, legs, 8), 0.004 * s + pose * 0.004 * s, 0.032, 0.007 * s, 0, 0, 0.12 * s * pose));
      g.add(at(box(0.012, 0.008, 0.009, us ? M.usWebbing : M.boot), 0.006 * s, 0.012, 0.007 * s));
    }
    // Body: jacket, belt with pouches, and (German) the bread bag and mess tin
    g.add(at(box(0.026, 0.038, 0.016, uni), 0, 0.075, 0));
    g.add(at(box(0.027, 0.006, 0.017, web), 0, 0.058, 0));
    for (const s of [-1, 1]) g.add(at(box(0.007, 0.008, 0.004, web), 0.008 * s, 0.059, 0.009));
    g.add(at(box(0.004, 0.036, 0.018, web), 0.0, 0.077, 0.0, 0, 0, 0.5));
    // Arms holding the rifle across the chest, the rifle pointing up and forward
    g.add(at(box(0.008, 0.026, 0.008, uni), 0.012, 0.074, 0.011, 0.6, 0, -0.5));
    g.add(at(box(0.008, 0.026, 0.008, uni), -0.006, 0.072, -0.011, -0.4, 0, 0.6));
    const rifle = new T.Group();
    rifle.add(at(box(0.07, 0.006, 0.006, M.wood), 0, 0, 0));
    rifle.add(at(cyl(0.0018, 0.0018, 0.03, M.steel, 6), 0.045, 0.002, 0, 0, 0, Math.PI / 2));
    at(rifle, 0.008, 0.078, 0.002, 0, 0, 0.75);
    g.add(rifle);
    g.add(at(sphere(0.0045, M.flesh, 8, 6), 0.02, 0.083, 0.004));
    // Head and helmet: the round American M1, the flared German Stahlhelm
    g.add(at(sphere(0.0085, M.flesh, 12, 10), 0, 0.104, 0));
    if (us) {
      const h = sphere(0.0125, M.usHelmet, 16, 10); h.scale.set(1, 0.72, 1.05); g.add(at(h, 0, 0.11, 0));
      g.add(at(cyl(0.0135, 0.0135, 0.002, M.usHelmet, 16), 0, 0.106, 0));
    } else {
      const lathe = new T.LatheGeometry([[0, 0.012], [0.008, 0.011], [0.0115, 0.006], [0.0125, 0.0], [0.0155, -0.004], [0.0158, -0.0045]].map(([x, y]) => new T.Vector2(x, y)), 16);
      g.add(at(new T.Mesh(lathe, M.deHelmet), 0, 0.108, 0));
    }
    return castAll(g);
  }

  // A platoon: four figures together on one small flocked base, as wargamers base a section. Built facing +x (east)
  function squad(side) {
    const g = new T.Group();
    // A small oval base, its top flocked like the table, its edge painted dark
    const b = new T.Mesh(new T.CylinderGeometry(0.05, 0.052, 0.008, 32), [mat('#3b3326', 0.8), baseTop(side), M.base]);
    b.scale.set(1.15, 1, 1.5); g.add(at(b, 0, 0.004, 0));
    // A little flock on the base, as on a finished model
    const tuft = mat(side === 'de' ? '#6e5a3a' : '#5d6b3c', 1);
    for (const [x, z] of [[-0.03, 0.05], [0.035, -0.045], [0.02, 0.06]]) g.add(at(sphere(0.007, tuft, 6, 4), x, 0.009, z));
    [[-0.02, -0.05, 0], [0.022, -0.018, 1], [-0.016, 0.018, -1], [0.02, 0.052, 0]].forEach(([x, z, p], i) => {
      const s = soldier(side, p, false); at(s, x, 0.008, z, 0, (i - 1.5) * 0.18, 0); g.add(s);
    });
    return castAll(g);
  }

  // A weapons team on a round flocked base. A machine-gun team is three men round a big gun on its tripod
  // (gunner kneeling behind, loader beside, an ammunition carrier with his boxes); an anti-tank team is two men on one base:
  // the gunner with a big tube, the loader with a big bag of rockets
  function team(side, kind) {
    const g = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(0.062, 0.064, 0.008, 32), [mat('#3b3326', 0.8), baseTop(side), M.base]);
    g.add(at(base, 0, 0.004, 0));
    if (kind === 'mg' || kind === 'mg42') {
      // The gun at the front of the base: a tripod, the receiver, a long barrel in its perforated jacket, the ammunition belt
      const gun = new T.Group();
      for (const [ax, az] of [[-0.03, -0.025], [-0.03, 0.025], [0.025, 0]]) {
        const leg = cyl(0.0022, 0.0022, 0.05, M.steel, 6);
        leg.lookAt(ax, -0.035, az); leg.rotateX(Math.PI / 2);
        gun.add(at(leg, ax / 2, 0.022, az / 2));
      }
      gun.add(at(box(0.04, 0.016, 0.014, M.steel), -0.006, 0.042, 0));
      gun.add(at(cyl(0.0055, 0.0055, 0.06, kind === 'mg42' ? M.steel : M.black, 10), 0.044, 0.044, 0, 0, 0, Math.PI / 2));
      gun.add(at(cyl(0.0025, 0.0025, 0.022, M.steel, 6), 0.085, 0.044, 0, 0, 0, Math.PI / 2));
      gun.add(at(box(0.008, 0.02, 0.006, M.wood), -0.03, 0.04, 0));
      gun.add(at(box(0.02, 0.003, 0.008, mat('#8a7a3a', 0.6, 0.4)), -0.004, 0.035, 0.012, 0.6, 0, 0));
      at(gun, 0.02, 0.008, 0);
      g.add(gun);
      // Gunner kneeling behind the gun, loader beside it, ammunition carrier behind with two boxes
      const gunner = soldier(side, 0, false); gunner.scale.y = 0.72; g.add(at(gunner, -0.02, 0.008, 0, 0, 0, 0));
      const loader = soldier(side, 1, false); loader.scale.y = 0.75; g.add(at(loader, 0.0, 0.008, 0.035, 0, -0.4, 0));
      g.add(at(soldier(side, -1, false), -0.04, 0.008, -0.035, 0, 0.3, 0));
      for (const z of [-0.012, 0.006]) g.add(at(box(0.012, 0.01, 0.016, side === 'us' ? M.usHelmet : M.deHelmet), -0.045, 0.013, z));
    } else if (kind === 'sniper') {
      // The sniper kneeling with his long scoped rifle, his spotter beside him with binoculars
      const shot = soldier(side, 0, false); shot.scale.y = 0.72; g.add(at(shot, 0.0, 0.008, -0.012, 0, 0, 0));
      g.add(at(cyl(0.0022, 0.0022, 0.1, M.wood, 6), 0.04, 0.06, -0.012, 0, 0, Math.PI / 2 - 0.06));
      g.add(at(cyl(0.0035, 0.0035, 0.024, M.black, 8), 0.03, 0.068, -0.012, 0, 0, Math.PI / 2));
      const spotter = soldier(side, 1, false); spotter.scale.y = 0.74; g.add(at(spotter, -0.022, 0.008, 0.026, 0, 0.3, 0));
      for (const z of [0.022, 0.03]) g.add(at(cyl(0.003, 0.003, 0.01, M.black, 8), -0.008, 0.07, z, 0, 0, Math.PI / 2));
    } else {
      // Two men: the gunner with a big anti-tank tube on his shoulder, and his loader carrying the rockets in a big bag
      const tubeMat = kind === 'schreck' ? mat('#4f5a3c', 0.6, 0.2) : mat('#56603a', 0.6, 0.2);
      g.add(at(soldier(side, 0, false), 0.018, 0.008, -0.018, 0, -0.15, 0));
      const tube = new T.Group();
      tube.add(at(cyl(0.0068, 0.0068, 0.11, tubeMat, 14), 0, 0, 0, 0, 0, Math.PI / 2));
      tube.add(at(cyl(0.009, 0.0075, 0.016, tubeMat, 14), -0.056, 0, 0, 0, 0, Math.PI / 2));   // the flared back end
      tube.add(at(box(0.012, 0.016, 0.004, M.wood), 0.01, -0.012, 0));                         // grip and trigger
      if (kind === 'schreck') tube.add(at(box(0.004, 0.03, 0.034, tubeMat), 0.035, 0.004, 0)); // the Panzerschreck's blast shield
      g.add(at(tube, 0.025, 0.098, -0.016, 0, 0, 0.08));
      // The loader in front: a big square bag of rockets carried at his side, like a suitcase
      g.add(at(soldier(side, 1, false), -0.02, 0.008, 0.026, 0, 0.25, 0));
      g.add(at(box(0.036, 0.04, 0.016, mat(side === 'us' ? '#7d7650' : '#5a5040', 0.9)), -0.02, 0.03, 0.05, 0, 0.25, 0));
      g.add(at(box(0.037, 0.004, 0.017, M.boot), -0.02, 0.051, 0.05, 0, 0.25, 0));
      g.add(at(box(0.012, 0.006, 0.004, M.boot), -0.02, 0.056, 0.05, 0, 0.25, 0));
    }
    return castAll(g);
  }

  // The captain: the company commander on his own base, with a tall company guidon (blue, crossed rifles in white),
  // so he is easy to find on the table. There is one for the whole company
  function captain(side) {
    const g = new T.Group();
    g.add(at(new T.Mesh(new T.CylinderGeometry(0.045, 0.047, 0.008, 28), [mat('#3b3326', 0.8), baseTop(side), M.base]), 0, 0.004, 0));
    g.add(at(soldier(side, 0, false), 0.01, 0.008, 0.008));
    // The guidon on its pole
    g.add(at(cyl(0.0016, 0.0016, 0.24, M.wood, 6), -0.022, 0.128, -0.018));
    g.add(at(sphere(0.003, mat('#c9a53a', 0.4, 0.6), 8, 6), -0.022, 0.25, -0.018));
    const flag = new T.Group();
    // Blue with crossed rifles in white for the Americans; plain red for the Germans (Steve)
    flag.add(at(box(0.07, 0.045, 0.002, mat(side === 'us' ? '#2f4f86' : '#c0261c', 0.8)), 0.035, 0, 0));
    if (side === 'us') for (const r of [0.6, -0.6]) flag.add(at(box(0.05, 0.004, 0.0025, mat('#f2efe6', 0.8)), 0.035, 0, 0, 0, 0, r));
    at(flag, -0.022, 0.222, -0.018, 0, 0.35, 0);
    g.add(flag);
    return castAll(g);
  }

  // A PaK 40 anti-tank gun: split trail, wheels, the angled shield and a long barrel with its muzzle brake
  function pak() {
    const g = new T.Group(), paint = camoPaint();
    for (const s of [-1, 1]) g.add(at(box(0.11, 0.008, 0.008, paint), -0.06, 0.012, s * 0.025, 0, s * 0.35, 0));
    for (const s of [-1, 1]) g.add(at(wheel(0.022, 0.012, M.track), 0.0, 0.022, s * 0.04));
    g.add(at(box(0.006, 0.05, 0.09, paint), 0.012, 0.04, 0, 0, 0, -0.15));
    g.add(at(cyl(0.004, 0.005, 0.15, M.steel, 10), 0.08, 0.04, 0, 0, 0, Math.PI / 2));
    g.add(at(cyl(0.007, 0.007, 0.012, M.steel, 10), 0.155, 0.04, 0, 0, 0, Math.PI / 2));
    // Its crew of three (Steve): the gunner crouched at the sight behind the shield, the loader with a shell beside the
    // breech, and one kneeling at the trail
    const gunner = soldier('de', 0, false); gunner.scale.y = 0.75; g.add(at(gunner, -0.025, 0, -0.03, 0, 0, 0));
    const loader = soldier('de', 1, false); loader.scale.y = 0.8; g.add(at(loader, -0.03, 0, 0.035, 0, -0.3, 0));
    const trail = soldier('de', -1, false); trail.scale.y = 0.72; g.add(at(trail, -0.1, 0, 0, 0, 0.4, 0));
    return castAll(g);
  }

  // ---------- Fire support, off the edge of the board ----------
  // A mortar team on a flocked base: the baseplate, the tube up at a steep angle on its bipod, two crew kneeling by it.
  // The American 81 mm M1 in olive drab, the German 8 cm GrW 34 in field grey. Its front is +x
  function mortar(side) {
    const g = new T.Group(), us = side === 'us';
    g.add(at(new T.Mesh(new T.CylinderGeometry(0.07, 0.072, 0.008, 32), [mat('#3b3326', 0.8), baseTop(side), M.base]), 0, 0.004, 0));
    const paint = us ? M.olive : mat('#4a524f', 0.6, 0.2);
    // Baseplate and tube
    g.add(at(box(0.034, 0.005, 0.034, M.steel), -0.012, 0.011, 0));
    g.add(at(cyl(0.0048, 0.0048, 0.075, paint, 12), 0.006, 0.04, 0, 0, 0, -0.62));
    g.add(at(cyl(0.0058, 0.0058, 0.006, M.steel, 12), 0.028, 0.07, 0, 0, 0, -0.62));     // the muzzle ring
    // The bipod: two legs splayed forward, and the sight
    for (const s of [-1, 1]) g.add(at(cyl(0.0018, 0.0018, 0.045, M.steel, 6), 0.03, 0.03, s * 0.012, s * 0.35, 0, 0.25));
    g.add(at(box(0.006, 0.008, 0.006, M.steel), 0.02, 0.05, 0.009));
    // Two crew: one kneeling with a bomb ready, one by the sight
    const loader = soldier(side, 0, false); loader.scale.y = 0.72; g.add(at(loader, -0.012, 0.008, 0.035, 0, 0.6, 0));
    const aimer = soldier(side, 1, false); aimer.scale.y = 0.75; g.add(at(aimer, -0.03, 0.008, -0.03, 0, -0.3, 0));
    return castAll(g);
  }

  // A field howitzer: two big wheels, the split trail behind, a small shield, the barrel raised. The American 105 mm
  // M2A1 in olive drab, the German 10.5 cm leFH 18 in dark yellow with green and brown, with a muzzle brake. Front +x
  function howitzer(side) {
    const g = new T.Group(), us = side === 'us', paint = us ? M.olive : camoPaint();
    // Wheels and axle
    for (const s of [-1, 1]) {
      g.add(at(wheel(0.03, 0.013, M.track), 0, 0.03, s * 0.047));
      g.add(at(wheel(0.012, 0.015, paint), 0, 0.03, s * 0.047));
    }
    g.add(at(cyl(0.004, 0.004, 0.1, M.steel, 8), 0, 0.03, 0, Math.PI / 2, 0, 0));
    // The split trail, legs spread on the ground behind
    for (const s of [-1, 1]) g.add(at(box(0.15, 0.009, 0.01, paint), -0.075, 0.018, s * 0.03, 0, s * 0.28, -0.12));
    for (const s of [-1, 1]) g.add(at(box(0.012, 0.012, 0.02, M.steel), -0.145, 0.006, s * 0.072));
    // The shield, the cradle and the barrel, raised
    g.add(at(box(0.005, 0.045, 0.1, paint), 0.012, 0.055, 0, 0, 0, -0.08));
    const gun = new T.Group();
    gun.add(at(box(0.08, 0.018, 0.024, paint), 0, 0, 0));
    gun.add(at(cyl(0.0065, 0.0072, 0.14, M.steel, 12), 0.08, 0.006, 0, 0, 0, Math.PI / 2));
    if (!us) gun.add(at(cyl(0.0095, 0.0095, 0.016, M.steel, 12), 0.152, 0.006, 0, 0, 0, Math.PI / 2));
    at(gun, 0.005, 0.05, 0, 0, 0, 0.32);
    g.add(gun);
    // Two crew: one at the breech, one carrying a round up
    g.add(at(soldier(side, 0, false), -0.07, 0.0, 0.045, 0, 0.4, 0));
    g.add(at(soldier(side, 1, false), -0.095, 0.0, -0.05, 0, -0.5, 0));
    return castAll(g);
  }

  // One round of ammunition, for the piles beside the guns: a brass-cased shell standing up, or a finned mortar bomb
  function round(kind) {
    const g = new T.Group();
    if (kind === 'shell') {
      g.add(at(cyl(0.0065, 0.0065, 0.024, mat('#b89a4a', 0.35, 0.8), 12), 0, 0.012, 0));
      g.add(at(cyl(0.0062, 0.0065, 0.014, M.olive, 12), 0, 0.031, 0));
      g.add(at(new T.Mesh(new T.ConeGeometry(0.0062, 0.016, 12), M.olive), 0, 0.046, 0));
    } else {
      const body = sphere(0.007, M.olive, 12, 10); body.scale.set(1, 1.8, 1);
      g.add(at(body, 0, 0.012, 0));
      g.add(at(cyl(0.0025, 0.0025, 0.016, M.steel, 8), 0, -0.004, 0));
      for (const r of [0, Math.PI / 2]) g.add(at(box(0.012, 0.008, 0.001, M.steel), 0, -0.01, 0, 0, r, 0));
      g.rotation.z = Math.PI / 2;
    }
    return castAll(g);
  }

  // A move token from the bag (Steve): a thick coin. American: green with a gold star; German: grey with a black cross
  // edged in white. Its faces are painted on a canvas; the rim is a darker shade
  const coinTex = {};
  function coin(side) {
    if (!coinTex[side]) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = side === 'us' ? '#3f8a36' : side === 'timer' ? '#141414' : '#8c8c86';
      g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
      g.lineWidth = 14; g.strokeStyle = side === 'us' ? '#2a5e24' : side === 'timer' ? '#3a3a3a' : '#5d5d57';
      g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
      if (side === 'timer') {
        // A white sand-glass (Steve): the top and bottom bars, and the glass bulging out between them, pinched in the
        // middle. Turned a quarter, so it stands upright as the coin lies on the table seen from the front
        g.save(); g.translate(128, 128); g.rotate(-Math.PI / 2); g.translate(-128, -128);
        g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round';
        g.beginPath(); g.moveTo(78, 52); g.lineTo(178, 52); g.moveTo(78, 204); g.lineTo(178, 204); g.stroke();
        g.lineWidth = 10;
        // Each side: out from the bar, round the bulb, in to the waist, then the same again down to the bottom bar
        g.beginPath(); g.moveTo(93, 52); g.bezierCurveTo(78, 100, 122, 112, 122, 128); g.bezierCurveTo(122, 144, 78, 156, 93, 204); g.stroke();
        g.beginPath(); g.moveTo(163, 52); g.bezierCurveTo(178, 100, 134, 112, 134, 128); g.bezierCurveTo(134, 144, 178, 156, 163, 204); g.stroke();
        g.restore();
      } else if (side === 'us') {
        // A five-pointed gold star
        g.fillStyle = '#f2c94c';
        g.beginPath();
        for (let k = 0; k < 10; k++) { const r = k % 2 ? 36 : 88, a = -Math.PI / 2 + k * Math.PI / 5; g.lineTo(128 + r * Math.cos(a), 128 + r * Math.sin(a)); }
        g.closePath(); g.fill();
      } else {
        // The black cross with a white edge
        g.fillStyle = '#111'; g.strokeStyle = '#eee'; g.lineWidth = 8;
        g.beginPath();
        const pts = [[98, 38], [158, 38], [158, 98], [218, 98], [218, 158], [158, 158], [158, 218], [98, 218], [98, 158], [38, 158], [38, 98], [98, 98]];
        pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.closePath(); g.stroke(); g.fill();
      }
      const tex = new T.CanvasTexture(c);
      tex.encoding = T.sRGBEncoding;
      coinTex[side] = tex;
    }
    // Matt, with no shine (Steve: the lamp washed the green out): it takes light and shadow but never glares
    const face = new T.MeshLambertMaterial({ map: coinTex[side] });
    const rim = new T.MeshLambertMaterial({ color: side === 'us' ? '#2f6a29' : side === 'timer' ? '#222' : '#6c6c66' });
    const m = new T.Mesh(new T.CylinderGeometry(1, 1, 0.3, 40), [rim, face, face]);
    m.castShadow = true;
    return m;
  }

  // A marker token on the table, like the counters wargamers put beside a unit: a small wooden or coloured disc
  function token(colour, label) {
    const g = new T.Group();
    const top = label ? new T.MeshStandardMaterial({ map: labelTex(label, colour), roughness: 0.6 }) : mat(colour, 0.6);
    const side = mat(colour, 0.6);
    const c = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.008, 24), [side, top, side]);
    g.add(at(c, 0, 0.004, 0));
    return castAll(g);
  }
  const labelCache = {};
  function labelTex(text, colour) {
    const key = text + colour;
    if (!labelCache[key]) labelCache[key] = canvasTexture(128, 128, (g2, w, h) => {
      g2.fillStyle = colour; g2.fillRect(0, 0, w, h);
      g2.fillStyle = '#f4efe6'; g2.font = 'bold 76px Georgia, serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText(text, w / 2, h / 2 + 4);
    });
    return labelCache[key];
  }

  // ---------- Tanks ----------
  // Built along +x (the gun points +x). About 0.42 long: a big model next to the figures, as on a real table

  // Road wheels as a short cylinder lying on its side
  function wheel(r, w, m) { const c = cyl(r, r, w, m, 18); c.rotation.x = Math.PI / 2; return c; }

  // A track: the top run, the bottom run on the ground and the curve round the sprocket and idler, with links marked
  function trackRun(len, h, w, y, z) {
    const g = new T.Group();
    const top = box(len, 0.008, w, M.track), bottom = box(len * 0.94, 0.008, w, M.track);
    g.add(at(top, 0, y + h / 2, z)); g.add(at(bottom, 0, y - h / 2 + 0.004, z));
    for (const s of [-1, 1]) g.add(at(wheel(h / 2, w, M.track), s * len / 2, y, z));
    // Track links: thin grooves across the top run
    for (let k = -len / 2; k < len / 2; k += 0.011) g.add(at(box(0.003, 0.0015, w * 1.02, M.black), k, y + h / 2 + 0.004, z));
    return g;
  }

  // A drive sprocket: a wheel with teeth round it
  function sprocket(r, w, m) {
    const g = new T.Group();
    g.add(wheel(r, w, m));
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.add(at(box(0.006, 0.006, w * 0.6, m), Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a)); }
    return g;
  }

  // Painted camouflage for German armour: dark yellow with soft green and brown bands
  let camoTex = null;
  function camoPaint() {
    if (!camoTex) camoTex = canvasTexture(512, 512, (g2, w, h) => {
      const R = seeded(41);
      g2.fillStyle = '#a8975f'; g2.fillRect(0, 0, w, h);
      g2.filter = 'blur(6px)';
      for (let k = 0; k < 14; k++) {
        g2.fillStyle = k % 2 ? '#56633f' : '#6e4e36';
        g2.beginPath(); const x = R() * w, y = R() * h;
        g2.moveTo(x, y); for (let q = 0; q < 5; q++) g2.lineTo(x + (R() - 0.3) * 220, y + (R() - 0.5) * 60);
        g2.closePath(); g2.fill();
      }
      g2.filter = 'none';
      // Wear and dust
      for (let k = 0; k < 3000; k++) { g2.fillStyle = `rgba(${R() < 0.5 ? '60,50,35' : '200,190,150'},${R() * 0.15})`; g2.fillRect(R() * w, R() * h, 2, 2); }
    }, [6, 6]);
    const m = new T.MeshStandardMaterial({ map: camoTex, roughness: 0.65, metalness: 0.15 });
    return m;
  }

  // Small fittings shared by the tanks: a hatch, a periscope block, a light
  const hatch = (r, m) => cyl(r, r, 0.005, m, 16);

  // The M4A1 Sherman: cast hull rounded at every edge, sponsons over the tracks, three VVSS bogies a side with their
  // return rollers, the rounded transmission cover, a low round turret with its mantlet and the short 75 mm, a .50 on the roof.
  // The Firefly has the long 17-pounder with its muzzle brake and a box on the turret's back
  function sherman(paint, firefly = false) {
    const g = new T.Group(), W = 0.2, L = 0.4;
    // Lower hull between the tracks, and the rounded transmission cover at the nose
    g.add(at(box(0.36, 0.05, W * 0.55, paint), -0.01, 0.06, 0));
    const nose = cyl(0.04, 0.04, W * 0.62, paint, 20); nose.rotation.x = Math.PI / 2; g.add(at(nose, 0.16, 0.07, 0));
    // Upper hull: a cast shell, its sloped glacis, wider than the hull so it covers the tops of the tracks
    g.add(at(profile([[-0.2, 0.085], [0.16, 0.085], [0.11, 0.16], [-0.19, 0.16], [-0.2, 0.15]], W, paint, 0.018), 0, 0, 0));
    // Driver's and co-driver's hatches and periscopes, the bow machine gun, headlights with guards
    for (const z of [-0.045, 0.045]) { g.add(at(hatch(0.018, paint), 0.115, 0.16, z)); g.add(at(box(0.008, 0.008, 0.016, M.steel), 0.128, 0.155, z)); }
    g.add(at(sphere(0.012, paint, 10, 8), 0.155, 0.118, 0.045));
    g.add(at(cyl(0.003, 0.003, 0.03, M.steel, 6), 0.175, 0.118, 0.045, 0, 0, Math.PI / 2));
    for (const z of [-0.07, 0.07]) g.add(at(cyl(0.007, 0.007, 0.01, M.steel, 10), 0.168, 0.11, z, 0, 0, Math.PI / 2));
    // Spare track links on the glacis, a common field addition
    for (let k = 0; k < 4; k++) g.add(at(box(0.012, 0.004, 0.06, M.track), 0.14 - k * 0.0, 0.13 + 0.0, -0.075 + k * 0.05 - 0.0, 0, 0, -0.95));
    // Engine deck: grilles and the two rear exhausts
    for (let k = 0; k < 6; k++) g.add(at(box(0.004, 0.003, 0.13, M.steel), -0.17 + k * 0.012, 0.162, 0));
    // Running gear each side: the track, three bogies with two wheels and a return roller each, the sprocket, the idler
    for (const s of [-1, 1]) {
      const z = s * W * 0.4;
      g.add(trackRun(L * 0.88, 0.065, 0.04, 0.04, z));
      for (const bx of [-0.12, 0, 0.12]) {
        g.add(at(box(0.05, 0.03, 0.014, paint), bx, 0.045, z + s * 0.022));
        for (const wx of [-0.022, 0.022]) { g.add(at(wheel(0.019, 0.028, M.steel), bx + wx, 0.026, z)); g.add(at(wheel(0.011, 0.03, M.black), bx + wx, 0.026, z)); }
        g.add(at(wheel(0.008, 0.02, M.steel), bx + 0.015, 0.066, z));
      }
      g.add(at(sprocket(0.024, 0.035, paint), 0.175, 0.055, z));
      g.add(at(wheel(0.02, 0.03, M.steel), -0.175, 0.04, z));
    }
    // Turret: a rounded casting sitting a little forward, the mantlet, the gun
    const tur = sphere(0.078, paint, 28, 18, ); tur.scale.set(1.05, 0.55, 0.95); g.add(at(tur, -0.015, 0.175, 0));
    g.add(at(cyl(0.077, 0.08, 0.012, paint, 28), -0.015, 0.166, 0));
    g.add(at(profile([[0, 0], [0.025, 0.004], [0.03, 0.036], [0, 0.04]], 0.075, paint, 0.006), 0.05, 0.16, 0));
    const len = firefly ? 0.3 : 0.17;
    g.add(at(cyl(0.0075, 0.009, len, M.steel, 14), 0.075 + len / 2, 0.181, 0, 0, 0, Math.PI / 2));
    if (firefly) {
      g.add(at(cyl(0.012, 0.012, 0.024, M.steel, 14), 0.075 + len, 0.181, 0, 0, 0, Math.PI / 2));
      g.add(at(box(0.05, 0.04, 0.08, paint), -0.1, 0.18, 0));
    }
    // Commander's hatch, loader's hatch, the .50 calibre on its mount
    g.add(at(hatch(0.022, paint), -0.04, 0.218, 0.03));
    g.add(at(hatch(0.016, paint), -0.03, 0.216, -0.035));
    g.add(at(cyl(0.002, 0.002, 0.03, M.steel, 6), -0.04, 0.23, 0.03));
    g.add(at(cyl(0.0035, 0.003, 0.07, M.steel, 8), -0.015, 0.245, 0.03, 0, 0, Math.PI / 2 - 0.1));
    // White stars: each side and the deck
    for (const s of [-1, 1]) g.add(at(starMesh(0.024), -0.02, 0.123, s * (W / 2 + 0.0015), 0, s > 0 ? 0 : Math.PI, 0));
    g.add(at(starMesh(0.03), -0.1, 0.1625, 0, -Math.PI / 2, 0, 0));
    return castAll(g);
  }

  // The Panther: long sloped glacis, upper sides sloping in, eight big interleaved road wheels a side, rear deck fans,
  // a narrow-fronted turret with a rounded mantlet, the commander's cupola, the long 75 mm with a double muzzle brake
  function panther() {
    const paint = M.panzerGrey;
    const g = new T.Group(), W = 0.22, L = 0.46;
    g.add(at(box(0.4, 0.05, W * 0.6, paint), -0.01, 0.06, 0));
    // Upper hull: glacis at the front, a short slope at the back
    g.add(at(profile([[-0.23, 0.08], [0.13, 0.08], [0.235, 0.085], [0.12, 0.155], [-0.2, 0.155], [-0.23, 0.125]], W, paint, 0.006), 0, 0, 0));
    // Sloping upper side plates
    for (const s of [-1, 1]) { const sp = box(0.33, 0.004, 0.04, paint); g.add(at(sp, -0.04, 0.14, s * (W / 2 - 0.012), s * 0.5, 0, 0)); }
    // Rear deck: two round fan housings and grilles
    for (const z of [-0.045, 0.045]) { g.add(at(cyl(0.02, 0.022, 0.008, paint, 18), -0.17, 0.159, z)); g.add(at(cyl(0.012, 0.012, 0.009, M.black, 14), -0.17, 0.16, z)); }
    for (let k = 0; k < 5; k++) g.add(at(box(0.004, 0.003, 0.05, M.black), -0.12 + k * 0.01, 0.157, 0));
    // Running gear: big wheels in two staggered rows, the track, sprocket at the front, idler at the back
    for (const s of [-1, 1]) {
      const z = s * W * 0.4;
      g.add(trackRun(L * 0.86, 0.07, 0.05, 0.038, z));
      for (let k = 0; k < 8; k++) {
        const outer = k % 2 === 0;
        g.add(at(wheel(0.031, 0.012, paint), -0.165 + k * 0.047, 0.04, z + s * (outer ? 0.017 : 0.002)));
        g.add(at(wheel(0.012, 0.014, M.steel), -0.165 + k * 0.047, 0.04, z + s * (outer ? 0.019 : 0.004)));
      }
      g.add(at(sprocket(0.026, 0.04, paint), 0.2, 0.06, z));
      g.add(at(wheel(0.024, 0.035, M.steel), -0.2, 0.06, z));
    }
    // Turret, set back: sloped sides, narrow front, the pot mantlet
    g.add(at(profile([[-0.075, 0], [0.055, 0], [0.065, 0.05], [-0.06, 0.056]], 0.12, paint, 0.008), -0.035, 0.155, 0));
    const mant = cyl(0.026, 0.026, 0.09, paint, 20); mant.rotation.x = Math.PI / 2; mant.scale.set(1, 1, 0.6); g.add(at(mant, 0.035, 0.18, 0));
    g.add(at(cyl(0.007, 0.009, 0.34, M.steel, 14), 0.22, 0.18, 0, 0, 0, Math.PI / 2));
    g.add(at(cyl(0.012, 0.012, 0.012, M.steel, 14), 0.39, 0.18, 0, 0, 0, Math.PI / 2));
    g.add(at(cyl(0.012, 0.012, 0.012, M.steel, 14), 0.405, 0.18, 0, 0, 0, Math.PI / 2));
    // Commander's cupola with its vision blocks, at the back left
    g.add(at(cyl(0.018, 0.02, 0.018, paint, 18), -0.07, 0.218, 0.03));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.add(at(box(0.005, 0.006, 0.005, M.black), -0.07 + Math.cos(a) * 0.019, 0.218, 0.03 + Math.sin(a) * 0.019)); }
    // Crosses on the hull sides
    for (const s of [-1, 1]) g.add(at(crossMesh(0.022), -0.12, 0.11, s * (W / 2 + 0.002), 0, s > 0 ? 0 : Math.PI, 0));
    return castAll(g);
  }

  // The Panzer IV (late model): a box hull, eight small road wheels in pairs on four bogies, return rollers,
  // armour skirts hung beside the hull and round the turret, the long 75 mm with its double muzzle brake
  function panzer4() {
    const paint = M.panzerGrey;
    const g = new T.Group(), W = 0.19, L = 0.38;
    g.add(at(box(0.36, 0.055, W * 0.62, paint), 0, 0.065, 0));
    g.add(at(profile([[-0.19, 0.09], [0.165, 0.09], [0.19, 0.11], [0.15, 0.135], [-0.19, 0.135]], W, paint, 0.004), 0, 0, 0));
    // Driver's visor and bow machine gun, engine deck grilles
    g.add(at(box(0.004, 0.012, 0.03, M.black), 0.152, 0.13, 0.04));
    g.add(at(cyl(0.003, 0.003, 0.025, M.steel, 6), 0.175, 0.118, -0.04, 0, 0, Math.PI / 2));
    for (let k = 0; k < 5; k++) g.add(at(box(0.004, 0.003, 0.09, M.black), -0.17 + k * 0.012, 0.137, 0));
    for (const s of [-1, 1]) {
      const z = s * W * 0.42;
      g.add(trackRun(L * 0.9, 0.05, 0.035, 0.032, z));
      for (let b = 0; b < 4; b++) for (const wx of [-0.017, 0.017]) g.add(at(wheel(0.015, 0.025, M.steel), -0.12 + b * 0.08 + wx, 0.022, z));
      for (let r = 0; r < 4; r++) g.add(at(wheel(0.006, 0.015, M.steel), -0.12 + r * 0.08, 0.055, z));
      g.add(at(sprocket(0.02, 0.03, paint), 0.17, 0.045, z));
      g.add(at(wheel(0.018, 0.03, M.steel), -0.172, 0.04, z));
      // Skirt plates on their rail, with gaps between
      g.add(at(box(0.33, 0.004, 0.004, M.steel), 0, 0.107, z + s * 0.03));
      for (let k = 0; k < 6; k++) g.add(at(box(0.052, 0.05, 0.003, paint), -0.14 + k * 0.056, 0.08, z + s * 0.032));
    }
    // Turret: box with a sloped front, the skirt round it, the cupola at the back
    g.add(at(profile([[-0.06, 0], [0.045, 0], [0.055, 0.035], [-0.055, 0.045]], 0.1, paint, 0.004), -0.02, 0.135, 0));
    for (const s of [-1, 1]) g.add(at(box(0.12, 0.035, 0.003, paint), -0.03, 0.155, s * 0.068));
    g.add(at(box(0.003, 0.035, 0.14, paint), -0.092, 0.155, 0));
    g.add(at(cyl(0.015, 0.017, 0.016, paint, 16), -0.06, 0.19, 0));
    g.add(at(box(0.02, 0.025, 0.035, paint), 0.04, 0.155, 0));
    g.add(at(cyl(0.0065, 0.008, 0.26, M.steel, 14), 0.18, 0.157, 0, 0, 0, Math.PI / 2));
    for (const dx of [0.305, 0.318]) g.add(at(cyl(0.011, 0.011, 0.009, M.steel, 14), dx, 0.157, 0, 0, 0, Math.PI / 2));
    for (const s of [-1, 1]) g.add(at(crossMesh(0.02), 0.0, 0.08, s * (W / 2 + 0.03), 0, s > 0 ? 0 : Math.PI, 0));
    return castAll(g);
  }

  // An elite piece's mark (Steve): a gold band round the edge of a base, in place of the old star token. The band is
  // the base's own edge made a touch bigger, so it fits an oval section base as well as a round team base
  function eliteBand(m) {
    // The base: the flocked cylinder at the bottom of the model (none on a tank)
    const base = m.children.find(c => c.isMesh && Array.isArray(c.material) && c.material.includes(M.base));
    if (!base) return;
    const p = base.geometry.parameters;
    const band = new T.Mesh(new T.CylinderGeometry(p.radiusTop * 1.05, p.radiusBottom * 1.05, p.height * 1.2, p.radialSegments, 1, true), M.gold);
    // It keeps its gold when the piece is greyed out
    band.userData.keep = true;
    base.add(band);
  }

  // Flat decals: a five-point star, a Balkenkreuz
  function starMesh(r) {
    const s = new T.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    return new T.Mesh(new T.ShapeGeometry(s), M.white);
  }
  function crossMesh(r) {
    const g = new T.Group();
    g.add(at(box(r * 2, r * 0.75, 0.001, M.white), 0, 0, 0));
    g.add(at(box(r * 0.75, r * 2, 0.001, M.white), 0, 0, 0));
    g.add(at(box(r * 1.6, r * 0.35, 0.0015, M.black), 0, 0, 0.0005));
    g.add(at(box(r * 0.35, r * 1.6, 0.0015, M.black), 0, 0, 0.0005));
    return g;
  }

  // ---------- Scenery ----------
  // A foam hedge on a thin base, len long along x: lumps of clump foliage
  function hedge(len, seed) {
    const g = new T.Group(), R = seeded(seed);
    g.add(at(box(len, 0.012, 0.075, M.hedgeBase), 0, 0.006, 0));
    for (let k = 0; k < len * 60; k++) {
      const r = 0.022 + R() * 0.02;
      const b = sphere(r, R() < 0.25 ? M.foamLight : M.foam, 7, 5);
      b.scale.set(1, 0.9 + R() * 0.4, 1);
      at(b, -len / 2 + R() * len, 0.035 + R() * 0.045, (R() - 0.5) * 0.045);
      g.add(b);
    }
    return castAll(g);
  }

  // A model tree: trunk and a foam crown
  function tree(seed, size = 1) {
    const g = new T.Group(), R = seeded(seed);
    g.add(at(cyl(0.008 * size, 0.012 * size, 0.12 * size, M.wood, 8), 0, 0.06 * size, 0));
    for (let k = 0; k < 18; k++) { const b = sphere(0.035 * size, k % 3 ? M.foam : M.foamLight, 7, 5); at(b, (R() - 0.5) * 0.08 * size, 0.14 * size + R() * 0.07 * size, (R() - 0.5) * 0.08 * size); g.add(b); }
    return castAll(g);
  }

  // A Norman stone farmhouse with a slate roof, shuttered windows and a chimney
  function house(seed) {
    const g = new T.Group();
    g.add(at(box(0.3, 0.14, 0.16, M.stone), 0, 0.07, 0));
    // The roof barely overhangs the walls (Steve), so pieces and the view past the house aren't hidden
    const roof = profile([[-0.088, 0], [0.088, 0], [0, 0.075]], 0.306, M.slate, 0.004); roof.rotation.y = Math.PI / 2; at(roof, 0, 0.14, 0, 0, Math.PI / 2, 0);
    g.add(roof);
    g.add(at(box(0.03, 0.08, 0.03, M.stone), 0.09, 0.22, 0.03));
    for (const x of [-0.09, 0.09]) { g.add(at(box(0.04, 0.035, 0.004, M.window), x, 0.085, 0.081)); for (const s of [-1, 1]) g.add(at(box(0.016, 0.035, 0.004, M.shutter), x + s * 0.03, 0.085, 0.082)); }
    g.add(at(box(0.04, 0.07, 0.004, M.wood), 0, 0.035, 0.081));
    return castAll(g);
  }

  // A die: a rounded red cube with white pips, showing value on top
  function die(value) {
    const g = new T.Group(), s = 0.03;
    g.add(at(box(s, s, s, M.die), 0, s / 2, 0));
    const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    for (const [px, pz] of P[value]) g.add(at(cyl(0.0035, 0.0035, 0.001, M.pip, 10), px * s * 0.27, s + 0.0005, pz * s * 0.27));
    return castAll(g);
  }

  // ---------- The table and the mat ----------
  function table(cols, rows) {
    const g = new T.Group();
    const top = new T.Mesh(new T.PlaneGeometry(cols + 14, rows + 12), new T.MeshStandardMaterial({ map: woodTex(), roughness: 1, metalness: 0 }));
    top.rotation.x = -Math.PI / 2; top.position.set(cols / 2, -0.004, rows / 2); top.receiveShadow = true;
    g.add(top);
    return g;
  }

  // One field of the mat: flock for grass, wheat or the village yard; lanes painted on top
  const texCache = {};
  function field(type, wheat, seed) {
    const key = type === 'village' ? 'v' : wheat ? 'w' : 'g' + (seed % 3);
    if (!texCache[key]) texCache[key] = key === 'v' ? flockTex('#7c7465', ['#6e675a', '#8a8272', '#5f584c', '#99907e'], 11) : key === 'w' ? flockTex('#9c8b55', WHEAT, 12) : flockTex(['#5f6d3c', '#647140', '#5a6838'][seed % 3], GRASS, 13 + seed % 3);
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: texCache[key], roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    return m;
  }
  function lane(len, width) {
    if (!texCache.lane) texCache.lane = flockTex('#8f7d60', EARTH, 21);
    const m = new T.Mesh(new T.PlaneGeometry(len, width), new T.MeshStandardMaterial({ map: texCache.lane, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    return m;
  }

  // Water for the river: a dark, slightly glossy surface just below the mat, with muddy banks
  function water(w, d) {
    const g = new T.Group();
    if (!M.water) { M.water = mat('#3f5450', 0.15, 0.2); M.bank = mat('#5b4a35', 1); }
    g.add(at(box(w + 0.08, 0.006, d, M.bank), 0, 0.001, 0));
    g.add(at(box(w, 0.006, d, M.water), 0, 0.003, 0));
    return castAll(g);
  }

  // A stone bridge across the river, built along x: arch, deck and low parapets
  function bridge() {
    const g = new T.Group();
    g.add(at(box(0.62, 0.05, 0.3, M.stone), 0, 0.03, 0));
    const arch = cyl(0.12, 0.12, 0.31, M.water, 20, ); arch.rotation.x = Math.PI / 2; arch.scale.set(1, 1, 1); g.add(at(arch, 0, -0.07, 0));
    for (const s of [-1, 1]) g.add(at(box(0.62, 0.045, 0.03, M.stone), 0, 0.075, s * 0.14));
    return castAll(g);
  }

  return { materials, M, eliteBand, water, bridge, soldier, squad, team, captain, pak, mortar, howitzer, round, coin, token, sherman, panther, panzer4, hedge, tree, house, die, table, field, lane, at };
})();
