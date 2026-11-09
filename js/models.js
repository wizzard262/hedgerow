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
  // (one material for each look, shared, so that parts can be merged and drawn together)
  const matCache = {};
  const mat = (color, rough = 0.85, metal = 0, extra = {}) => {
    const key = Object.keys(extra).length ? null : [color, rough, metal].join();
    if (key && matCache[key]) return matCache[key];
    const m = new T.MeshStandardMaterial(Object.assign({ roughness: rough, metalness: metal }, extra));
    m.color.set(color).convertSRGBToLinear();
    if (key) matCache[key] = m;
    return m;
  };

  // Merge a model's many small parts into one mesh for each material, so the graphics card draws a piece in a few goes
  // instead of dozens. Parts with several materials (the flocked bases) and instanced meshes stay as they are
  function mergeParts(model) {
    model.updateMatrixWorld(true);
    const toModel = new T.Matrix4().copy(model.matrixWorld).invert();
    const buckets = new Map();
    model.traverse(c => {
      if (!c.isMesh || c.isInstancedMesh || Array.isArray(c.material) || c.userData.keep) return;
      const key = c.material.uuid + (c.castShadow ? 'c' : '') + (c.receiveShadow ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    });
    for (const parts of buckets.values()) {
      if (parts.length < 2) continue;
      const pieces = parts.map(c => {
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        g.applyMatrix4(new T.Matrix4().multiplyMatrices(toModel, c.matrixWorld));
        return g;
      });
      const total = pieces.reduce((n, g) => n + g.attributes.position.count, 0);
      const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), uv = new Float32Array(total * 2);
      // (colours painted on the points, as on a crater, kept too)
      const colours = pieces[0].attributes.color ? new Float32Array(total * 3) : null;
      let at3 = 0, at2 = 0;
      for (const g of pieces) {
        position.set(g.attributes.position.array, at3);
        if (g.attributes.normal) normal.set(g.attributes.normal.array, at3);
        if (colours && g.attributes.color) colours.set(g.attributes.color.array, at3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, at2);
        at3 += g.attributes.position.count * 3;
        at2 += g.attributes.position.count * 2;
        g.dispose();
      }
      const merged = new T.BufferGeometry();
      merged.setAttribute('position', new T.BufferAttribute(position, 3));
      merged.setAttribute('normal', new T.BufferAttribute(normal, 3));
      merged.setAttribute('uv', new T.BufferAttribute(uv, 2));
      if (colours) merged.setAttribute('color', new T.BufferAttribute(colours, 3));
      const mesh = new T.Mesh(merged, parts[0].material);
      mesh.castShadow = parts[0].castShadow; mesh.receiveShadow = parts[0].receiveShadow;
      for (const c of parts) { c.parent.remove(c); c.geometry.dispose(); }
      model.add(mesh);
    }
    return model;
  }
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
    M.deTrousers = mat('#56605a', 0.85);
    M.deHelmet = mat('#4a524f', 0.55);
    M.deHelmet.side = T.DoubleSide;           // the Stahlhelm is a lathed shell: both faces show
    M.fjHelmet = mat('#141414', 0.5);          // the Fallschirmjäger's helmet: black (Steve)
    M.fjHelmet.side = T.DoubleSide;
    M.rangerJacket = mat('#6b5236', 0.85);     // the Rangers' brown jacket (Steve: noticeably different)
    M.rangerTrousers = mat('#5a4a33', 0.85);
    M.rangerDiamond = mat('#e07a1f', 0.6);     // the orange Ranger diamond on the back of the helmet
    M.deWebbing = mat('#2e2a25', 0.7);
    M.olive = mat('#4f5432', 0.65, 0.15);      // olive drab paint
    M.dunkelgelb = mat('#a8975f', 0.65, 0.15); // German dark yellow
    M.panzerGrey = mat('#565c5f', 0.65, 0.15); // German tanks (Steve): panzer grey
    M.gold = mat('#e2b53a', 0.3, 0.6);        // an elite piece's band round its bases: bright, glowing a little
    M.gold.emissive = new T.Color('#6a4c08');
    M.gold.side = T.DoubleSide;
    M.white = mat('#e8e4d6', 0.6);
    M.black = mat('#151515', 0.6);
    M.stone = mat('#bfb397', 0.95);
    M.slate = mat('#5d6266', 0.7);
    M.shutter = mat('#5e6a5c', 0.8);
    M.window = mat('#262624', 0.3, 0.2);
    // The dice matt, with no shine (Steve: the lamp over the American corner glared off them, too bright to read), like
    // the drawn token: they take light and shadow but never glare
    M.die = mattMat('#b5261e');
    M.pip = mattMat('#f4efe6');
  }
  // A colour that takes light and shadow but has no shine at all
  function mattMat(color) {
    const m = new T.MeshLambertMaterial();
    m.color.set(color).convertSRGBToLinear();
    return m;
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
  // elite (Steve): the Americans are Rangers in brown, with the orange diamond on the helmet; the Germans are
  // Fallschirmjäger in a camouflage jump smock and the black rimless helmet
  function soldier(side, pose = 0, base = true, elite = false) {
    const us = side === 'us', g = new T.Group();
    const fj = !us && elite, ranger = us && elite;
    const uni = fj ? camoCloth('de') : ranger ? M.rangerJacket : us ? M.usUniform : M.deUniform;
    const legs = ranger ? M.rangerTrousers : us ? M.usTrousers : M.deTrousers, web = us ? M.usWebbing : M.deWebbing;
    // Base: a black disc with a bevel
    if (base) g.add(at(cyl(0.032, 0.034, 0.008, M.base, 24), 0, 0.004, 0));
    // Legs apart, boots (US leggings are paler)
    for (const s of [-1, 1]) {
      g.add(at(cyl(0.0065, 0.0055, 0.045, legs, 8), 0.004 * s + pose * 0.004 * s, 0.032, 0.007 * s, 0, 0, 0.12 * s * pose));
      g.add(at(box(0.012, 0.008, 0.009, us ? M.usWebbing : M.boot), 0.006 * s, 0.012, 0.007 * s));
    }
    // Body: jacket, belt with pouches, and (German) the bread bag and mess tin. The paratrooper's jump smock is longer,
    // down over the hips
    g.add(at(box(0.026, 0.038, 0.016, uni), 0, 0.075, 0));
    if (fj) g.add(at(box(0.028, 0.014, 0.018, uni), 0, 0.052, 0));
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
      // Rangers: the orange diamond on the back of the helmet
      if (ranger) g.add(at(box(0.001, 0.006, 0.006, M.rangerDiamond), -0.0128, 0.111, 0, Math.PI / 4, 0, 0));
    } else if (fj) {
      // The paratrooper's helmet (Steve): round, close to the head, no flared brim, in black
      const lathe = new T.LatheGeometry([[0, 0.0125], [0.008, 0.0115], [0.0118, 0.006], [0.0128, 0.0], [0.0132, -0.003], [0.0128, -0.0035]].map(([x, y]) => new T.Vector2(x, y)), 16);
      g.add(at(new T.Mesh(lathe, M.fjHelmet), 0, 0.108, 0));
    } else {
      // The Stahlhelm, with its flared brim
      const lathe = new T.LatheGeometry([[0, 0.012], [0.008, 0.011], [0.0115, 0.006], [0.0125, 0.0], [0.0155, -0.004], [0.0158, -0.0045]].map(([x, y]) => new T.Vector2(x, y)), 16);
      g.add(at(new T.Mesh(lathe, M.deHelmet), 0, 0.108, 0));
    }
    return castAll(g);
  }

  // Camouflage cloth, made once a side: the American two-tone green and brown spots (not used now: the Rangers wear
  // brown), the German paratroopers' splinter pattern of green and brown slashes on tan
  const camo = {};
  function camoCloth(side) {
    if (camo[side]) return camo[side];
    const us = side === 'us';
    const tex = canvasTexture(128, 128, (g, w, h) => {
      const R = seeded(us ? 61 : 67);
      g.fillStyle = us ? '#6f7448' : '#8f8a62'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 60; k++) {
        g.fillStyle = ['#3f4a2a', '#5a4630', '#4f6236'][k % 3];
        g.beginPath();
        if (us) g.ellipse(R() * w, R() * h, 4 + R() * 8, 3 + R() * 6, R() * 3, 0, 7);
        else { const x = R() * w, y = R() * h, a = R() * 3; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.lineTo(x + Math.cos(a + 0.5) * 9, y + Math.sin(a + 0.5) * 9); }
        g.fill();
      }
    });
    camo[side] = new T.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    return camo[side];
  }

  // A platoon: three figures together on one small round flocked base (Steve: round, three a base), as wargamers base
  // a section. Elite: Rangers or Fallschirmjäger. Built facing +x (east)
  function squad(side, elite = false) {
    const g = new T.Group();
    // A small oval base, its top flocked like the table, its edge painted dark
    const b = new T.Mesh(new T.CylinderGeometry(0.062, 0.064, 0.008, 32), [mat('#3b3326', 0.8), baseTop(side), M.base]);
    g.add(at(b, 0, 0.004, 0));
    // A little flock on the base, as on a finished model
    const tuft = mat(side === 'de' ? '#6e5a3a' : '#5d6b3c', 1);
    for (const [x, z] of [[-0.04, 0.03], [0.035, -0.04], [0.03, 0.04]]) g.add(at(sphere(0.007, tuft, 6, 4), x, 0.009, z));
    // Three men in a triangle on the round base
    [[0.024, 0.0, 1], [-0.018, -0.028, 0], [-0.018, 0.028, -1]].forEach(([x, z, p], i) => {
      const s = soldier(side, p, false, elite); at(s, x, 0.008, z, 0, (i - 1) * 0.2, 0); g.add(s);
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

  // A bomber (Steve), nose towards +x: the Americans' four-engined B-17 in olive drab with white stars, the Germans'
  // twin-engined Ju 88 in grey-green with crosses
  function bomber(side) {
    const g = new T.Group(), us = side === 'us';
    const paint = us ? mat('#5f6240', 0.6, 0.2) : mat('#57675a', 0.6, 0.2);
    const glass = mat('#a9cfdd', 0.2, 0.3);
    const blur = mat('#2c2c2a', 0.5, 0.2, { transparent: true, opacity: 0.35 });
    const length = us ? 0.86 : 0.7, radius = us ? 0.056 : 0.052, span = us ? 1.16 : 0.8;
    // The fuselage, narrowing to the tail, and the glazed nose
    g.add(at(cyl(radius, radius * 0.45, length, paint), 0, 0, 0, 0, 0, -Math.PI / 2));
    const nose = new T.Mesh(new T.SphereGeometry(radius, 14, 10), glass);
    nose.scale.x = us ? 1.3 : 1.7;
    g.add(at(nose, length / 2, 0, 0));
    // The cockpit: glass on top, further back on the B-17
    g.add(at(box(0.09, 0.03, radius * 1.1, glass), us ? length * 0.3 : length * 0.36, radius * 0.9, 0));
    // The wings: wide by the fuselage, narrower at the tips
    g.add(at(box(0.17, 0.012, span * 0.55, paint), length * 0.06, 0, 0));
    for (const s of [-1, 1]) g.add(at(box(0.11, 0.01, span * 0.24, paint), length * 0.07, 0, s * span * 0.38));
    // The tailplane and the fin (the B-17's tall)
    g.add(at(box(0.08, 0.009, span * 0.34, paint), -length * 0.44, 0.01, 0));
    g.add(at(box(0.1, us ? 0.17 : 0.12, 0.012, paint), -length * 0.44, us ? 0.09 : 0.07, 0));
    // The engines, each with its propeller a blur in front
    const engines = us ? [0.18, 0.34] : [0.17];
    for (const s of [-1, 1]) for (const out of engines) {
      g.add(at(cyl(0.024, 0.018, 0.12, M.steel, 10), length * 0.14, -0.004, s * out, 0, 0, -Math.PI / 2));
      g.add(at(cyl(0.07, 0.07, 0.003, blur, 20), length * 0.14 + 0.065, -0.004, s * out, 0, 0, -Math.PI / 2));
    }
    // The markings on the wings
    for (const s of [-1, 1]) {
      if (us) {
        g.add(at(cyl(0.042, 0.042, 0.002, mat('#1d2c56', 0.7), 20), length * 0.07, 0.007, s * span * 0.38));
        g.add(at(cyl(0.024, 0.024, 0.002, M.white, 5), length * 0.07, 0.009, s * span * 0.38));
      } else {
        const white = M.white, black = mat('#141414', 0.7);
        g.add(at(box(0.07, 0.002, 0.024, white), length * 0.07, 0.007, s * span * 0.38));
        g.add(at(box(0.024, 0.002, 0.07, white), length * 0.07, 0.007, s * span * 0.38));
        g.add(at(box(0.056, 0.002, 0.012, black), length * 0.07, 0.009, s * span * 0.38));
        g.add(at(box(0.012, 0.002, 0.056, black), length * 0.07, 0.009, s * span * 0.38));
      }
    }
    return castAll(g);
  }

  // The bomber waiting off the board: smaller, on a wargamer's flying stand
  function bomberOnStand(side) {
    const g = new T.Group();
    g.add(at(cyl(0.11, 0.115, 0.012, M.base, 24), 0, 0.006, 0));
    g.add(at(cyl(0.005, 0.005, 0.27, M.steel, 8), 0, 0.14, 0));
    const plane = bomber(side);
    plane.scale.setScalar(0.5);
    g.add(at(plane, 0, 0.28, 0));
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

  // The M8 Greyhound (Steve: an American armoured car): six big wheels under mudguards, a low boxy hull with a sloped
  // nose, an open-topped round turret with the short 37 mm and a .50 on a ring at the back, white stars
  function greyhound() {
    const paint = M.olive;
    const g = new T.Group(), W = 0.18;
    // The hull: low, with a sloped front plate and a short slope at the back
    g.add(at(profile([[-0.17, 0.05], [0.13, 0.05], [0.18, 0.075], [0.12, 0.12], [-0.16, 0.12], [-0.18, 0.1]], W * 0.8, paint, 0.006), 0, 0, 0));
    // Mudguards over the wheels, a stowage box on each, the six wheels
    for (const s of [-1, 1]) {
      const z = s * W * 0.43;
      g.add(at(box(0.3, 0.006, 0.04, paint), -0.01, 0.083, z));
      g.add(at(box(0.07, 0.02, 0.03, paint), -0.03, 0.096, z));
      for (const x of [-0.11, -0.03, 0.11]) {
        g.add(at(wheel(0.034, 0.03, M.black), x, 0.034, z));
        g.add(at(wheel(0.016, 0.032, M.steel), x, 0.034, z));
      }
    }
    // The driver's hatches and visors at the front
    for (const z of [-0.035, 0.035]) g.add(at(box(0.004, 0.012, 0.03, M.black), 0.14, 0.105, z));
    // The open turret: a short round tub, its inside dark, the 37 mm and its mantlet, the .50 on its ring
    g.add(at(cyl(0.058, 0.062, 0.045, paint, 24), -0.02, 0.143, 0));
    g.add(at(cyl(0.05, 0.05, 0.002, M.black, 24), -0.02, 0.166, 0));
    g.add(at(box(0.022, 0.028, 0.04, paint), 0.04, 0.143, 0));
    g.add(at(cyl(0.006, 0.007, 0.12, M.steel, 12), 0.11, 0.145, 0, 0, 0, Math.PI / 2));
    const ring = new T.Mesh(new T.TorusGeometry(0.05, 0.003, 6, 24), M.steel); ring.rotation.x = Math.PI / 2; g.add(at(ring, -0.02, 0.178, 0));
    g.add(at(cyl(0.003, 0.003, 0.06, M.steel, 6), -0.05, 0.19, 0.02, 0, 0, Math.PI / 2 - 0.15));
    // White stars on the sides
    for (const s of [-1, 1]) g.add(at(starMesh(0.02), -0.06, 0.085, s * (W * 0.4 + 0.002), 0, s > 0 ? 0 : Math.PI, 0));
    return castAll(g);
  }

  // The Sd.Kfz. 234/2 Puma (Steve: a German armoured car): eight wheels, a long hull pointed at both ends with stowage bins
  // along the sides, an angled closed turret with the long 50 mm and its muzzle brake, crosses on the sides
  function puma() {
    const paint = M.panzerGrey;
    const g = new T.Group(), W = 0.18;
    // The hull: sloped plates front and back, coming to a point each end
    g.add(at(profile([[-0.21, 0.07], [-0.16, 0.045], [0.16, 0.045], [0.215, 0.075], [0.15, 0.115], [-0.16, 0.115]], W * 0.78, paint, 0.004), 0, 0, 0));
    // Stowage bins along both sides, the eight wheels under them
    for (const s of [-1, 1]) {
      const z = s * W * 0.43;
      g.add(at(box(0.27, 0.03, 0.03, paint), 0, 0.085, z));
      for (const x of [-0.135, -0.055, 0.055, 0.135]) {
        g.add(at(wheel(0.03, 0.028, M.black), x, 0.03, z));
        g.add(at(wheel(0.014, 0.03, M.steel), x, 0.03, z));
      }
    }
    // The turret, angled sides, set a little back; the long 50 mm with its muzzle brake
    g.add(at(profile([[-0.06, 0], [0.05, 0], [0.042, 0.04], [-0.05, 0.043]], 0.1, paint, 0.004), -0.02, 0.115, 0));
    g.add(at(box(0.02, 0.026, 0.035, paint), 0.04, 0.135, 0));
    g.add(at(cyl(0.006, 0.007, 0.22, M.steel, 12), 0.16, 0.137, 0, 0, 0, Math.PI / 2));
    g.add(at(cyl(0.01, 0.01, 0.014, M.steel, 12), 0.275, 0.137, 0, 0, 0, Math.PI / 2));
    // The aerial at the back, the crosses on the sides
    g.add(at(cyl(0.0015, 0.0015, 0.12, M.steel, 4), -0.15, 0.17, 0.05, 0.15, 0, 0));
    for (const s of [-1, 1]) g.add(at(crossMesh(0.018), -0.07, 0.085, s * (W * 0.43 + 0.017), 0, s > 0 ? 0 : Math.PI, 0));
    return castAll(g);
  }

  // An elite piece's mark (Steve): a gold band round the edge of a base, in place of the old star token. The band is
  // the base's own edge made a touch bigger, so it fits an oval section base as well as a round team base
  function eliteBand(m) {
    // The base: the flocked cylinder at the bottom of the model (none on a tank)
    const base = m.children.find(c => c.isMesh && Array.isArray(c.material) && c.material.includes(M.base));
    if (!base) return;
    const p = base.geometry.parameters;
    const band = new T.Mesh(new T.CylinderGeometry(p.radiusTop * 1.06, p.radiusBottom * 1.06, p.height * 1.5, p.radialSegments, 1, true), M.gold);
    // A flat gold rim round the top edge, so it shows from above
    const rim = new T.Mesh(new T.RingGeometry(p.radiusTop * 0.86, p.radiusTop * 1.06, p.radialSegments), M.gold);
    rim.rotation.x = -Math.PI / 2; rim.position.y = p.height / 2 + 0.0008;
    // They keep their gold when the piece is greyed out
    band.userData.keep = true; rim.userData.keep = true;
    base.add(band, rim);
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

  // Cobbles: rows of rounded stones, each row shifted half a stone, dark between them. Stone width and height, in pixels
  function cobbleTex(shades, wide, tall, repeat, seed) {
    return canvasTexture(512, 512, (g, w, h) => {
      const R = seeded(seed);
      g.fillStyle = '#2f2c27';
      g.fillRect(0, 0, w, h);
      const rows = Math.round(h / tall), across = Math.round(w / wide);
      for (let row = 0; row < rows; row++) {
        const y = row * (h / rows), shift = row % 2 ? (w / across) / 2 : 0;
        // (one more than fits, so the row wraps round the edge of the picture)
        for (let i = -1; i <= across; i++) {
          const x = i * (w / across) + shift;
          g.fillStyle = shades[Math.floor(R() * shades.length)];
          g.beginPath();
          g.roundRect(x + 2, y + 2, w / across - 4, h / rows - 4, Math.min(wide, tall) * 0.3);
          g.fill();
          // Worn smooth on top
          g.fillStyle = 'rgba(255,250,235,.1)';
          g.beginPath();
          g.ellipse(x + (w / across) * 0.45, y + (h / rows) * 0.4, (w / across) * 0.26, (h / rows) * 0.2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }, repeat);
  }

  // One field of the mat: flock for grass, wheat or the village yard; lanes painted on top
  const texCache = {};
  const fieldMats = {};
  function field(type, wheat, seed) {
    const key = type === 'village' ? 'v' : type === 'orchard' ? 'o' : type === 'street' ? 'st' : type === 'square' ? 'sq' : type === 'yard' ? 'yd' : type === 'beach' ? 'bc' : type === 'sea' ? 'se' : wheat ? 'w' : 'g' + (seed % 3);
    // The city's paving (Steve: cobbled): grey cobbles for the streets, big pale flagstones for the squares
    if (key === 'st' && !texCache.st) texCache.st = cobbleTex(['#6b675f', '#5d5a53', '#77736a', '#524f49', '#827d73'], 26, 26, [4, 4], 41);
    if (key === 'sq' && !texCache.sq) texCache.sq = cobbleTex(['#a39c8b', '#928c7d', '#b0a998', '#88826f', '#9b9585'], 64, 44, [3, 3], 43);
    // Wet sand for the beach; under the water, just dark
    if (key === 'bc' && !texCache.bc) texCache.bc = flockTex('#c9b589', ['#bda97e', '#d6c398', '#b09c72', '#ddcca4'], 67);
    if (key === 'se' && !texCache.se) texCache.se = flockTex('#2f4f55', ['#28454b', '#35575d'], 71);
    // The railway yard: dark, oily ballast
    if (key === 'yd' && !texCache.yd) texCache.yd = flockTex('#57504a', ['#4a443f', '#625b53', '#3f3a36', '#6d665d'], 53);
    if (!texCache[key]) texCache[key] = key === 'o' ? orchardGrass() : key === 'v' ? flockTex('#7c7465', ['#6e675a', '#8a8272', '#5f584c', '#99907e'], 11) : key === 'w' ? flockTex('#9c8b55', WHEAT, 12) : flockTex(['#5f6d3c', '#647140', '#5a6838'][seed % 3], GRASS, 13 + seed % 3);
    if (!fieldMats[key]) fieldMats[key] = new T.MeshStandardMaterial({ map: texCache[key], roughness: 1 });
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), fieldMats[key]);
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    return m;
  }
  // The grass under an orchard's trees (Steve): darker than a field, rough and tufty, in mixed shades. Soft patches of
  // greens and browns, then hundreds of little tufts: a dark shadow under each, a spray of short blades over it
  function orchardGrass() {
    return canvasTexture(512, 512, (g, w, h) => {
      const R = seeded(53);
      g.fillStyle = '#3f4d29'; g.fillRect(0, 0, w, h);
      // Patches of mixed shades
      const patches = ['#4a5a30', '#36421f', '#55613a', '#4d4a2c', '#3a4a2c'];
      for (let k = 0; k < 40; k++) { g.fillStyle = patches[k % patches.length]; g.globalAlpha = 0.35; g.beginPath(); g.ellipse(R() * w, R() * h, 20 + R() * 60, 14 + R() * 40, R() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      // The tufts
      const blades = ['#5d6e3a', '#6f7d45', '#4b5b2e', '#7d7a48', '#3c4a24', '#88864f'];
      for (let k = 0; k < 900; k++) {
        const x = R() * w, y = R() * h, r = 3 + R() * 5;
        g.fillStyle = 'rgba(20,26,10,.45)'; g.beginPath(); g.ellipse(x, y + 1.5, r, r * 0.6, 0, 0, 7); g.fill();
        g.strokeStyle = blades[Math.floor(R() * blades.length)]; g.lineWidth = 1.2;
        g.beginPath();
        for (let b = 0; b < 7; b++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.2; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4); }
        g.stroke();
      }
    });
  }

  // A lane of worn earth; cobbled (Steve), a strip of the street's cobbles, running along or across
  function lane(len, width, cobbled = false) {
    if (!texCache.lane) texCache.lane = flockTex('#8f7d60', EARTH, 21);
    const across = len < width;
    const cobbleKey = across ? 'cobbleNS' : 'cobbleEW';
    if (cobbled && !texCache[cobbleKey]) texCache[cobbleKey] = cobbleTex(['#7a766c', '#6b675f', '#868175', '#5f5b53', '#8f8a7d'], 26, 26, across ? [1.4, 4.5] : [4.5, 1.4], 47);
    const m = new T.Mesh(new T.PlaneGeometry(len, width), new T.MeshStandardMaterial({ map: cobbled ? texCache[cobbleKey] : texCache.lane, roughness: 1 }));
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

  // ---------- Things standing in fields (Steve) ----------
  // Each is built along x, with its back to the edge of the field and its front facing +z; the table turns it to its side

  // A café: cream walls and a slate roof, a striped awning over the front, and little tables on the pavement. length: along x
  function cafe(length = 0.9) {
    const g = new T.Group();
    if (!M.cafeWall) {
      M.cafeWall = mat('#d9cdb0', 0.95);
      M.cafeRoof = mat('#4d5158', 0.9);
      M.cafeGlass = mat('#2d3a40', 0.3);
      M.cafeDoor = mat('#3f2a1c', 0.8);
      M.awningRed = mat('#a8322a', 0.9);
      M.awningWhite = mat('#e8e1cf', 0.9);
      M.cafeTable = mat('#2c2b28', 0.6, 0.3);
    }
    const depth = 0.2, height = 0.17;
    g.add(at(box(length, height, depth, M.cafeWall), 0, height / 2, -0.04));
    g.add(at(box(length + 0.02, 0.05, depth + 0.02, M.cafeRoof), 0, height + 0.025, -0.04));
    // Windows and a door along the front
    const bays = Math.floor((length - 0.06) / 0.25);
    for (let i = -bays; i <= bays; i++) {
      const doorway = i === 0;
      g.add(at(box(0.075, doorway ? 0.1 : 0.06, 0.004, doorway ? M.cafeDoor : M.cafeGlass), i * 0.125, doorway ? 0.05 : 0.075, 0.062));
    }
    // The awning in red and white stripes, sloping out over the pavement
    const awning = length - 0.06, stripes = Math.max(4, Math.round(awning / 0.06));
    for (let i = 0; i < stripes; i++) {
      const x = -awning / 2 + (i + 0.5) * (awning / stripes);
      g.add(at(box(awning / stripes, 0.005, 0.07, i % 2 ? M.awningWhite : M.awningRed), x, 0.118, 0.092, 0.45, 0, 0));
    }
    // Round tables out in front
    const tables = Math.max(1, Math.round(length / 0.22));
    for (let i = 0; i < tables; i++) {
      const x = -length / 2 + ((i + 0.5) / tables) * length;
      g.add(at(cyl(0.022, 0.022, 0.004, M.cafeTable, 12), x, 0.042, 0.14));
      g.add(at(cyl(0.003, 0.003, 0.04, M.cafeTable, 6), x, 0.02, 0.14));
    }
    return castAll(g);
  }

  // A barn: weathered red boards, a dark steep roof and big doors. length: along x
  function barn(length = 0.9) {
    const g = new T.Group();
    if (!M.barnWall) {
      M.barnWall = mat('#6e3a2a', 1);
      M.barnRoof = mat('#3b3a36', 1);
      M.barnDoor = mat('#4a2a1e', 1);
      M.barnTrim = mat('#b8ab90', 1);
    }
    const depth = 0.25, height = 0.15;
    g.add(at(box(length, height, depth, M.barnWall), 0, height / 2, 0));
    // The roof, two slopes meeting along the ridge
    for (const s of [-1, 1]) g.add(at(box(length + 0.03, 0.012, depth * 0.62, M.barnRoof), 0, height + 0.04, s * depth * 0.25, s * 0.55, 0, 0));
    // Big doors in the middle of the front, with a white cross brace
    g.add(at(box(0.2, 0.125, 0.004, M.barnDoor), 0, 0.0625, depth / 2 + 0.002));
    g.add(at(box(0.008, 0.125, 0.005, M.barnTrim), 0, 0.0625, depth / 2 + 0.004));
    for (const s of [-1, 1]) g.add(at(box(0.2, 0.006, 0.005, M.barnTrim), 0, 0.0625, depth / 2 + 0.004, 0, 0, s * 0.55));
    // Boards up and down the walls
    const boards = Math.floor(length / 2 / 0.052) - 1;
    for (let i = -boards; i <= boards; i++) if (Math.abs(i) > 1) g.add(at(box(0.004, height, 0.003, M.barnDoor), i * 0.052, height / 2, depth / 2 + 0.001));
    return castAll(g);
  }

  // A fountain: a stone basin of water and a column with a small bowl on top
  function fountain() {
    const g = new T.Group();
    if (!M.water) { M.water = mat('#3f5450', 0.15, 0.2); M.bank = mat('#5b4a35', 1); }
    if (!M.fountainStone) { M.fountainStone = mat('#b5ad9b', 1); M.fountainWater = mat('#5f8d92', 0.1, 0.2); }
    g.add(at(cyl(0.12, 0.13, 0.03, M.fountainStone, 20), 0, 0.015, 0));
    g.add(at(cyl(0.1, 0.1, 0.004, M.fountainWater, 20), 0, 0.031, 0));
    g.add(at(cyl(0.012, 0.018, 0.09, M.fountainStone, 10), 0, 0.075, 0));
    g.add(at(cyl(0.04, 0.012, 0.015, M.fountainStone, 14), 0, 0.122, 0));
    g.add(at(cyl(0.032, 0.032, 0.003, M.fountainWater, 14), 0, 0.13, 0));
    g.add(at(cyl(0.006, 0.009, 0.03, M.fountainStone, 8), 0, 0.145, 0));
    return castAll(g);
  }

  // Reeds at the water's edge: a clump of thin stems, some with a brown seed head. seed: so each clump differs
  function reeds(seed, stems = 10) {
    const g = new T.Group(), R = seeded(seed + 1);
    if (!M.reed) { M.reed = mat('#6f8440', 1); M.reedDry = mat('#9a9050', 1); M.reedHead = mat('#4a3320', 1); }
    for (let i = 0; i < stems; i++) {
      const tall = 0.1 + R() * 0.1, x = (R() - 0.5) * 0.09, z = (R() - 0.5) * 0.07;
      const stem = cyl(0.0016, 0.0036, tall, R() < 0.3 ? M.reedDry : M.reed, 5);
      const lean = (R() - 0.5) * 0.3;
      g.add(at(stem, x, tall / 2, z, lean, 0, (R() - 0.5) * 0.3));
      if (R() < 0.4) g.add(at(cyl(0.0042, 0.0042, 0.016, M.reedHead, 6), x, tall + 0.003, z + lean * tall * 0.5));
    }
    return castAll(g);
  }

  // A duck pond (Steve: round, not oval): water in a round muddy bank, as wide as the row of areas it lies in, reeds on
  // either side, and ducks on it
  function pond() {
    const g = new T.Group(), R = seeded(61);
    if (!M.water) { M.water = mat('#3f5450', 0.15, 0.2); M.bank = mat('#5b4a35', 1); }
    if (!M.duck) { M.duck = mat('#e8e4d6', 0.9); M.duckBrown = mat('#6d5438', 0.9); M.duckHead = mat('#2c5a3a', 0.6); M.duckBill = mat('#d8922e', 0.7); }
    // (its row is a third of a field deep: the bank just inside that)
    const BANK = 0.155, WATER = 0.135;
    g.add(at(cyl(BANK, BANK, 0.006, M.bank, 36), 0, 0.003, 0));
    g.add(at(cyl(WATER, WATER, 0.006, M.water, 36), 0, 0.005, 0));
    // Reeds in clumps round the bank, more at the two ends
    for (const angle of [2.9, 3.4, 0.1, -0.35, 1.9]) g.add(at(reeds(Math.round(R() * 1000), 5), Math.cos(angle) * (BANK - 0.01), 0, Math.sin(angle) * (BANK - 0.01)));
    // The ducks: a body, a head, a bill; a white one and brown ones
    for (const [x, z, ry, white] of [[-0.06, 0.02, 0.5, true], [0.03, -0.05, 2.4, false], [0.06, 0.05, 4.2, false]]) {
      const duck = new T.Group();
      const body = new T.Mesh(new T.SphereGeometry(0.018, 10, 8), white ? M.duck : M.duckBrown); body.scale.set(1.5, 0.8, 1);
      duck.add(at(body, 0, 0.012, 0));
      duck.add(at(new T.Mesh(new T.SphereGeometry(0.01, 8, 6), white ? M.duck : M.duckHead), 0.022, 0.03, 0));
      duck.add(at(box(0.012, 0.003, 0.006, M.duckBill), 0.034, 0.029, 0));
      g.add(at(duck, x, 0.006, z, 0, ry, 0));
    }
    return castAll(g);
  }

  // ---------- The beach landing (Steve) ----------

  // A landing craft, its ramp down towards the beach (+x): grey steel sides, open top
  function landingCraft() {
    const g = new T.Group();
    if (!M.craft) { M.craft = mat('#5d6660', 0.7, 0.3); M.craftDark = mat('#3a403c', 0.8, 0.2); }
    const long = 0.84, wide = 0.74, tall = 0.075;
    g.add(at(box(long, 0.012, wide, M.craftDark), 0, 0.008, 0));
    for (const s of [-1, 1]) g.add(at(box(long, tall, 0.018, M.craft), 0, tall / 2, s * (wide / 2)));
    g.add(at(box(0.05, tall * 1.5, wide, M.craft), -long / 2, tall * 0.75, 0));
    // The ramp, lowered into the surf
    g.add(at(box(0.012, 0.09, wide - 0.05, M.craft), long / 2 + 0.03, 0.026, 0, 0, 0, -1.15));
    return castAll(g);
  }

  // A steel tank trap: three crossed girders, in a loose row across the field
  function tankTrap() {
    const g = new T.Group();
    if (!M.girder) M.girder = mat('#4a3f35', 0.8, 0.4);
    const hedgehog = () => {
      const h = new T.Group();
      for (const [rx, rz] of [[0.6, 0.6], [-0.6, 0.6], [0, -0.85]]) h.add(at(box(0.008, 0.1, 0.012, M.girder), 0, 0.034, 0, rx, 0, rz));
      return h;
    };
    for (const [x, z] of [[-0.3, -0.32], [-0.08, -0.14], [0.2, -0.3], [0.32, 0.06], [-0.28, 0.2], [0.02, 0.3], [0.3, 0.34]]) g.add(at(hedgehog(), x, 0, z, 0, x * 7, 0));
    return castAll(g);
  }

  // A burnt-out wreck on the sand: a blackened landing craft or lorry, slewed round, with bits lying about. Along x
  function hulk(length = 0.8, seed = 0) {
    const g = new T.Group(), R = seeded(seed + 37);
    if (!M.burnt) { M.burnt = mat('#1f1c1a', 1); M.burntRust = mat('#4a2f22', 1); M.burntAsh = mat('#3b3836', 1); }
    const long = length * 0.86, wide = 0.2;
    const body = new T.Group();
    body.add(at(box(long, 0.02, wide, M.burnt), 0, 0.012, 0));
    for (const s of [-1, 1]) body.add(at(box(long, 0.07 + R() * 0.02, 0.012, s > 0 ? M.burntRust : M.burnt), 0, 0.045, s * (wide / 2), (0.1 + R() * 0.2) * s, 0, 0));
    body.add(at(box(0.016, 0.1, wide, M.burntRust), -long / 2, 0.05, 0, 0, 0, 0.15));
    // Its ramp, dropped open and bent
    body.add(at(box(0.012, 0.13, wide * 0.92, M.burntRust), long / 2 + 0.05, 0.03, 0, 0, 0, -1.15 - R() * 0.2));
    g.add(at(body, 0, 0, 0, 0.05 + R() * 0.08, (R() - 0.5) * 0.65, 0.06));
    for (let i = 0; i < 6; i++) g.add(at(box(0.02 + R() * 0.03, 0.006, 0.012 + R() * 0.02, i % 2 ? M.burnt : M.burntAsh), (R() - 0.5) * long, 0.004, (R() - 0.5) * 0.26, 0, R() * 3, 0));
    return castAll(g);
  }

  // The Eiffel Tower (Steve): a thousand thin girders, all one shape so it is one thing to draw. Four legs lean in from the
  // corners of its field and join into a single shaft, with open rings for platforms, so the pieces under it still show
  const EIFFEL_HEIGHT = 2.8;
  function eiffel() {
    const g = new T.Group();
    if (!M.eiffelIron) { M.eiffelIron = mat('#5c4f43', 0.85, 0.15); M.eiffelIron.side = T.DoubleSide; M.eiffelStone = mat('#a39a88', 1); }
    const H = EIFFEL_HEIGHT;
    const out = [];
    // One girder from a to b: a four-sided bar, thick either side of its line
    const girder = (a, b, thick) => {
      const from = new T.Vector3(...a), to = new T.Vector3(...b);
      const along = to.clone().sub(from).normalize();
      const helper = Math.abs(along.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
      const side = new T.Vector3().crossVectors(along, helper).normalize().multiplyScalar(thick);
      const other = new T.Vector3().crossVectors(along, side).normalize().multiplyScalar(thick);
      const corner = (end, s, o) => end.clone().addScaledVector(side, s).addScaledVector(other, o);
      const round = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      for (let k = 0; k < 4; k++) {
        const [s1, o1] = round[k], [s2, o2] = round[(k + 1) % 4];
        for (const p of [corner(from, s1, o1), corner(from, s2, o2), corner(to, s2, o2), corner(from, s1, o1), corner(to, s2, o2), corner(to, s1, o1)]) out.push(p.x, p.y, p.z);
      }
    };
    // How far the tower reaches from its middle at a height (0 the ground, 1 the top): the curve it is famous for
    const reach = t => 0.49 * Math.exp(-3.4 * t) + 0.004;
    const JOIN = 0.35;     // where the four legs have become one
    const PLATFORMS = [0.17, JOIN];
    // A box frame between two heights: four corner posts, a ring at the top, and crossed bracing on each face.
    // shape(t) gives its four corners at a height, in order round
    const frame = (shape, t1, t2, post, brace) => {
      const low = shape(t1), high = shape(t2);
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        girder(low[k], high[k], post);
        girder(high[k], high[next], brace);
        girder(low[k], high[next], brace);
        girder(low[next], high[k], brace);
      }
    };
    // The legs, one from each corner of the field
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = t => {
        const r = reach(t);
        // Narrowest at the foot, so there is room for the pieces; at the join each leg fills a quarter of the shaft
        const wide = 0.08 + (reach(JOIN) - 0.08) * (t / JOIN);
        const y = t * H;
        return [[sx * r, y, sz * r], [sx * (r - wide), y, sz * r], [sx * (r - wide), y, sz * (r - wide)], [sx * r, y, sz * (r - wide)]];
      };
      const STEPS = 8;
      for (let i = 0; i < STEPS; i++) frame(leg, JOIN * i / STEPS, JOIN * (i + 1) / STEPS, 0.006, 0.0028);
      // Its stone foot
      g.add(at(box(0.11, 0.03, 0.11, M.eiffelStone), sx * 0.43, 0.015, sz * 0.43));
    }
    // The shaft, up to the top
    const shaft = t => { const r = reach(t), y = t * H; return [[r, y, r], [-r, y, r], [-r, y, -r], [r, y, -r]]; };
    const SHAFT_STEPS = 14, TOP = 0.95;
    for (let i = 0; i < SHAFT_STEPS; i++) {
      const t1 = JOIN + (TOP - JOIN) * i / SHAFT_STEPS, t2 = JOIN + (TOP - JOIN) * (i + 1) / SHAFT_STEPS;
      frame(shaft, t1, t2, 0.0055 * (1 - t1 * 0.6), 0.0024);
    }
    // The big arch on each side, between the legs under the first platform
    for (const face of [0, 1, 2, 3]) {
      const point = a => {
        // a runs from one leg to the other
        const t = 0.135 * Math.sin(a * Math.PI) + 0.012;
        const r = reach(t), along = (a * 2 - 1) * (r - 0.05), out2 = r;
        const y = t * H;
        if (face === 0) return [along, y, out2];
        if (face === 1) return [along, y, -out2];
        if (face === 2) return [out2, y, along];
        return [-out2, y, along];
      };
      for (let i = 0; i < 14; i++) girder(point(i / 14), point((i + 1) / 14), 0.0065);
    }
    // The platforms: open rings of girders round the tower
    for (const t of PLATFORMS) {
      const y = t * H, outer = reach(t) + 0.035, inner = reach(t) - 0.03;
      const ring = r => [[r, y, r], [-r, y, r], [-r, y, -r], [r, y, -r]];
      const o = ring(outer), n = ring(inner);
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        girder(o[k], o[next], 0.0095);
        girder(n[k], n[next], 0.006);
        // Cross pieces between the two rings along this side
        for (let i = 0; i <= 8; i++) {
          const f = i / 8;
          const mix = (p, q) => [p[0] + (q[0] - p[0]) * f, y, p[2] + (q[2] - p[2]) * f];
          girder(mix(o[k], o[next]), mix(n[k], n[next]), 0.003);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(out), 3));
    geometry.computeVertexNormals();
    const iron = new T.Mesh(geometry, M.eiffelIron);
    iron.userData.keep = true;
    g.add(iron);
    // The third platform and the top
    g.add(at(box(reach(0.86) * 2 + 0.05, 0.016, reach(0.86) * 2 + 0.05, M.eiffelIron), 0, 0.86 * H, 0));
    g.add(at(cyl(0.012, reach(TOP) + 0.006, 0.05, M.eiffelIron, 8), 0, TOP * H + 0.025, 0));
    g.add(at(cyl(0.002, 0.005, H * (1 - TOP) - 0.05, M.eiffelIron, 6), 0, TOP * H + 0.05 + (H * (1 - TOP) - 0.05) / 2, 0));
    return castAll(g);
  }

  // A shell crater on the sand (Steve picked option B): a bowl, a raised sandy lip sloping down into a dark scorched
  // bottom, a little uneven all round so no two are alike
  const CRATER_PROFILE = [
    // Out from the middle: how far (times its size), how high, and the colour there
    { r: 0.0, y: 0.02, c: '#241c15' }, { r: 0.45, y: 0.04, c: '#33291f' }, { r: 0.8, y: 0.16, c: '#6b5a42' },
    { r: 1.05, y: 0.36, c: '#b39d76' }, { r: 1.2, y: 0.4, c: '#d4c29e' }, { r: 1.5, y: 0.2, c: '#dccbaa' }, { r: 1.9, y: 0.0, c: '#e6d8bc' },
  ];
  let craterMat = null;
  function crater(seed = 0) {
    const R = seeded(seed + 41);
    const size = 0.06 + R() * 0.05;
    if (!craterMat) craterMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    // The bowl turned on a lathe: one ring of points for each step of the profile, each ring pushed in and out a little
    const ring = 40, pos = [], col = [], idx = [];
    const bumps = [...Array(6)].map(() => ({ k: 1 + Math.floor(R() * 5), p: R() * 6.28, a: (R() - 0.5) * 0.1 }));
    CRATER_PROFILE.forEach((pt, i) => {
      const colour = new T.Color(pt.c).convertSRGBToLinear();
      for (let j = 0; j <= ring; j++) {
        const ang = j / ring * Math.PI * 2;
        // (the wobble grows towards the rim; the middle stays round)
        const wobble = 1 + bumps.reduce((n, b) => n + b.a * Math.sin(b.k * ang + b.p), 0) * (i / CRATER_PROFILE.length);
        const r = pt.r * size * wobble;
        pos.push(Math.cos(ang) * r, pt.y * size, Math.sin(ang) * r);
        col.push(colour.r, colour.g, colour.b);
      }
    });
    for (let i = 0; i < CRATER_PROFILE.length - 1; i++) {
      for (let j = 0; j < ring; j++) {
        const a = i * (ring + 1) + j, b = a + ring + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setIndex(idx);
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const bowl = new T.Mesh(geo, craterMat);
    bowl.receiveShadow = true;
    const g = new T.Group();
    g.add(bowl);
    return g;
  }

  // A stretch of the sea wall, along z (Steve: rocky): a bank of rough boulders, big ones at the foot and smaller ones
  // piled on them, in greys and browns, about as high as a hedge bank. seed: so each stretch is piled differently
  function seaWall(length = 1.02, seed = 0) {
    if (!M.rock) M.rock = [mat('#7d776b', 1), mat('#948c7c', 1), mat('#66625a', 1), mat('#8a7a62', 1)];
    const g = new T.Group(), R = seeded(seed * 97 + 13);
    // The core the rocks are piled on, dark, so no gap between them shows through
    g.add(at(box(0.09, 0.06, length, M.rock[2]), 0, 0.03, 0));
    // Rows of rocks along it: at the foot, in the middle, on top
    const rows = [{ y: 0.03, r: 0.042, spread: 0.045 }, { y: 0.07, r: 0.033, spread: 0.03 }, { y: 0.1, r: 0.022, spread: 0.015 }];
    for (const row of rows) {
      for (let z = -length / 2 + row.r * 0.7; z < length / 2 - row.r * 0.5; z += row.r * (1.1 + R() * 0.5)) {
        const r = row.r * (0.7 + R() * 0.55);
        const rock = new T.Mesh(new T.IcosahedronGeometry(r, 0), M.rock[Math.floor(R() * M.rock.length)]);
        // Lumpy, not round: squashed a little each way and turned at random
        rock.scale.set(0.8 + R() * 0.5, 0.65 + R() * 0.35, 0.8 + R() * 0.5);
        g.add(at(rock, (R() - 0.5) * row.spread, row.y + (R() - 0.5) * 0.01, z, R() * 3, R() * 3, R() * 3));
      }
    }
    return mergeParts(castAll(g));
  }

  // Where a tank has driven through the sea wall (Steve: a collapsed section, as a trampled hedge): its boulders tumbled
  // down and spread out low across the gap, along z
  function seaWallRubble(length = 0.5, seed = 0) {
    if (!M.rock) M.rock = [mat('#7d776b', 1), mat('#948c7c', 1), mat('#66625a', 1), mat('#8a7a62', 1)];
    const g = new T.Group(), R = seeded(seed * 89 + 7);
    for (let k = 0; k < 14; k++) {
      const r = 0.016 + R() * 0.02;
      const rock = new T.Mesh(new T.IcosahedronGeometry(r, 0), M.rock[Math.floor(R() * M.rock.length)]);
      rock.scale.set(0.8 + R() * 0.5, 0.5 + R() * 0.3, 0.8 + R() * 0.5);
      // (spread across the gap, further out to either side than the wall stood)
      g.add(at(rock, (R() - 0.5) * 0.22, r * 0.4, (R() - 0.5) * length, R() * 3, R() * 3, R() * 3));
    }
    return mergeParts(castAll(g));
  }

  // A bunker (Steve): a U of concrete, open at the back and to the sky so you can see who is in it. The front (+x) is a thick,
  // tall wall with a slit down it; the sides are thin and low, to show it is the place to hit it. Long along z, two areas of a
  // field. gun: a wider slit, for the PaK 40
  const BUNKER = { deep: 0.38, wide: 0.56, tall: 0.13, low: 0.065, front: 0.055, side: 0.014, sill: 0.035, slitGun: 0.11, slitMg: 0.08 };
  function bunker(gun) {
    const g = new T.Group(), B = BUNKER;
    if (!M.concrete) { M.concrete = mat('#a9a79c', 0.95); M.concreteDark = mat('#6b6a62', 1); M.concreteThin = mat('#8f8d82', 1); }
    const frontX = B.deep / 2 - B.front / 2;
    // The floor
    g.add(at(box(B.deep, 0.006, B.wide, M.concreteDark), 0, 0.003, 0));
    // The front: a sill right across, then a thick wall either side of the slit, with a darker cap
    g.add(at(box(B.front, B.sill, B.wide, M.concrete), frontX, B.sill / 2, 0));
    const slit = gun ? B.slitGun : B.slitMg, length = (B.wide - slit) / 2, height = B.tall - B.sill;
    for (const s of [-1, 1]) {
      const z = s * (slit / 2 + length / 2);
      g.add(at(box(B.front, height, length, M.concrete), frontX, B.sill + height / 2, z));
      g.add(at(box(B.front + 0.012, 0.012, length, M.concreteDark), frontX, B.tall + 0.006, z));
      // The thin low sides
      g.add(at(box(B.deep - B.front, B.low, B.side, M.concreteThin), -B.front / 2, B.low / 2, s * (B.wide / 2 - B.side / 2)));
    }
    return castAll(g);
  }
  // Who is in it, gun through the slit: a PaK 40 and its crew, or an MG team
  function bunkerCrew(gun) {
    const g = new T.Group();
    if (gun) { const pakGun = pak(); pakGun.scale.setScalar(1.35); g.add(at(pakGun, 0, 0, 0)); }
    else { const mgTeam = team('de', 'mg42'); mgTeam.scale.setScalar(2); g.add(at(mgTeam, -0.02, 0, 0)); }
    return castAll(g);
  }
  // ---------- The railway (Steve) ----------

  // A length of track along x, flat on the ground: pale ballast, dark sleepers across it, two steel rails along it
  function trackTex() {
    return canvasTexture(512, 128, (g, w, h) => {
      const R = seeded(59);
      g.fillStyle = '#7b7367';
      g.fillRect(0, 0, w, h);
      for (let k = 0; k < 1400; k++) {
        g.fillStyle = R() < 0.5 ? 'rgba(40,36,30,.3)' : 'rgba(210,200,185,.2)';
        g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3);
      }
      // The sleepers, and the rails with a shine along the top: a little faint against the ballast (Steve), so the yard
      // doesn't shout over the pieces
      for (let i = 0; i < 9; i++) { g.fillStyle = i % 3 ? '#5a4a3d' : '#625142'; g.fillRect((i + 0.25) * (w / 9), 8, w / 9 * 0.42, h - 16); }
      for (const y of [h * 0.26, h * 0.7]) {
        g.fillStyle = '#56565a'; g.fillRect(0, y, w, 8);
        g.fillStyle = '#a3a7ab'; g.fillRect(0, y + 1, w, 3);
      }
    });
  }
  function track(length) {
    if (!M.track2) M.track2 = new T.MeshStandardMaterial({ map: trackTex(), roughness: 0.9 });
    const m = new T.Mesh(new T.PlaneGeometry(length, 0.2), M.track2);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    return m;
  }

  // Where a track ends against a building: a buffer stop
  function bufferStop() {
    const g = new T.Group();
    if (!M.buffer) { M.buffer = mat('#5a2a22', 0.9); M.bufferPad = mat('#2a2a2c', 0.6, 0.3); }
    g.add(at(box(0.016, 0.05, 0.13, M.buffer), 0, 0.025, 0));
    for (const z of [-0.04, 0.04]) g.add(at(box(0.02, 0.012, 0.012, M.bufferPad), 0.014, 0.036, z));
    return castAll(g);
  }

  // What a railway vehicle stands on, along x: a chassis on axles
  function railMaterials() {
    if (M.wagonDark) return;
    M.wagonDark = mat('#26242a', 0.8, 0.3);
    M.wagonVans = ['#6a3d2a', '#5b5f48', '#7a5a34', '#4f4436'].map(c => mat(c, 0.95));
    M.wagonRoof = mat('#8f8c80', 0.95);
    M.coalLump = M.coalLump || mat('#1c1b1d', 1);
    M.tankBody = mat('#3a3d42', 0.6, 0.3);
    M.wheatLoad = mat('#c9a544', 1);
    M.wheatDark = mat('#a5842f', 1);
    M.timberLoad = mat('#8a6a42', 1);
    M.timberEnd = mat('#c7a878', 1);
    M.carriageColours = [['#2f4a38', '#d8d0ba'], ['#5a2a2a', '#d8d0ba'], ['#2d3a52', '#cfc8b4']].map(([body, band]) => [mat(body, 0.8), mat(band, 0.9)]);
    M.carriageGlass = mat('#2a3338', 0.3);
    M.engineBlack = mat('#1f2022', 0.55, 0.45);
    M.engineGreen = mat('#28402f', 0.5, 0.3);
    M.engineRed = mat('#8f2a22', 0.7);
    M.engineBrass = mat('#a88a44', 0.4, 0.6);
  }
  const RAIL = { width: 0.15, floor: 0.035 };
  function addChassis(g, length, axles = 2) {
    railMaterials();
    g.add(at(box(length, 0.014, RAIL.width * 0.8, M.wagonDark), 0, RAIL.floor, 0));
    for (let i = 0; i < axles; i++) {
      const x = axles === 1 ? 0 : -length * 0.34 + (i / (axles - 1)) * length * 0.68;
      for (const z of [-0.055, 0.055]) g.add(at(cyl(0.02, 0.02, 0.008, M.wagonDark, 10), x, 0.02, z, Math.PI / 2, 0, 0));
    }
  }

  // A goods wagon, along x: a closed van, or an open truck loaded with coal, wheat or timber, or a tank. length: along x
  function wagon(length = 0.56, seed = 0, load = 'van') {
    const g = new T.Group(), R = seeded(seed + 17);
    addChassis(g, length);
    const body = length - 0.03, width = RAIL.width, floor = RAIL.floor;
    const colour = M.wagonVans[Math.floor(R() * M.wagonVans.length)];
    if (load === 'tank') {
      // A long drum lying on its side
      g.add(at(cyl(0.056, 0.056, body * 0.96, M.tankBody, 14), 0, floor + 0.062, 0, 0, 0, Math.PI / 2));
      g.add(at(cyl(0.014, 0.014, 0.02, M.tankBody, 8), 0, floor + 0.124, 0));
      return castAll(g);
    }
    if (load === 'van') {
      // Boards, a sliding door each side, a low roof
      g.add(at(box(body, 0.1, width, colour), 0, floor + 0.057, 0));
      g.add(at(box(body + 0.008, 0.012, width + 0.012, M.wagonRoof), 0, floor + 0.113, 0));
      for (const s of [-1, 1]) g.add(at(box(0.07, 0.085, 0.003, M.wagonDark), 0, floor + 0.052, s * (width / 2 + 0.001)));
      return castAll(g);
    }
    // An open truck: low sides, and what it carries
    g.add(at(box(body, 0.05, width, colour), 0, floor + 0.032, 0));
    if (load === 'coal') {
      g.add(at(box(body - 0.016, 0.004, width - 0.016, M.coalLump), 0, floor + 0.056, 0));
      const lumps = Math.round(body / 0.04);
      for (let i = 0; i < lumps; i++) {
        const lump = new T.Mesh(new T.DodecahedronGeometry(0.02 + R() * 0.012), M.coalLump);
        g.add(at(lump, -body / 2 + (i + 0.5) * (body / lumps), floor + 0.066, (R() - 0.5) * 0.08, R(), R(), R()));
      }
    }
    if (load === 'wheat') {
      // Heaped grain, with a darker ridge along it
      g.add(at(box(body - 0.012, 0.03, width - 0.012, M.wheatLoad), 0, floor + 0.065, 0));
      g.add(at(box(body - 0.05, 0.02, width * 0.5, M.wheatDark), 0, floor + 0.086, 0));
      const heaps = Math.round(body / 0.09);
      for (let i = 0; i < heaps; i++) {
        const heap = new T.Mesh(new T.SphereGeometry(0.036, 8, 6), M.wheatLoad);
        heap.scale.y = 0.55;
        g.add(at(heap, -body / 2 + (i + 0.5) * (body / heaps), floor + 0.082, (R() - 0.5) * 0.04));
      }
    }
    if (load === 'timber') {
      // Logs lying along it, pale at the cut ends
      for (const [z, y] of [[-0.044, 0.07], [0, 0.07], [0.044, 0.07], [-0.022, 0.104], [0.022, 0.104]]) {
        g.add(at(cyl(0.02, 0.02, body - 0.01, M.timberLoad, 8), 0, floor + y, z, 0, 0, Math.PI / 2));
        for (const s of [-1, 1]) g.add(at(cyl(0.017, 0.017, 0.003, M.timberEnd, 8), s * (body / 2 - 0.004), floor + y, z, 0, 0, Math.PI / 2));
      }
    }
    return castAll(g);
  }

  // A passenger carriage, along x: a long body in its railway's colours, a band of windows, a curved roof
  function carriage(length = 0.56, seed = 0) {
    const g = new T.Group(), R = seeded(seed + 23);
    addChassis(g, length);
    const body = length - 0.02, width = RAIL.width, floor = RAIL.floor;
    const [colour, band] = M.carriageColours[Math.floor(R() * M.carriageColours.length)];
    g.add(at(box(body, 0.1, width, colour), 0, floor + 0.057, 0));
    g.add(at(box(body + 0.002, 0.03, width + 0.002, band), 0, floor + 0.078, 0));
    // The roof: a low hump
    const roof = cyl(0.082, 0.082, body + 0.006, M.wagonRoof, 14);
    roof.scale.x = 0.34;
    g.add(at(roof, 0, floor + 0.106, 0, 0, 0, Math.PI / 2));
    // Windows along both sides
    const windows = Math.max(2, Math.floor(body / 0.05));
    for (const s of [-1, 1]) {
      for (let i = 0; i < windows; i++) {
        const x = -body / 2 + (i + 0.5) * (body / windows);
        g.add(at(box(body / windows * 0.62, 0.02, 0.003, M.carriageGlass), x, floor + 0.08, s * (width / 2 + 0.002)));
      }
    }
    return castAll(g);
  }

  // A steam engine, along x, chimney towards +x: boiler, chimney and dome, a cab, a tender of coal, big driving wheels
  function engine(length = 0.9, seed = 0) {
    const g = new T.Group(), R = seeded(seed + 29);
    railMaterials();
    const coat = R() < 0.5 ? M.engineBlack : M.engineGreen;
    const floor = RAIL.floor;
    g.add(at(box(length, 0.016, RAIL.width * 0.8, M.wagonDark), 0, floor, 0));
    // The boiler, the front two thirds
    const boilerLong = length * 0.52, boilerX = length * 0.16;
    g.add(at(cyl(0.05, 0.05, boilerLong, coat, 16), boilerX, floor + 0.062, 0, 0, 0, Math.PI / 2));
    g.add(at(cyl(0.052, 0.052, 0.024, M.engineBlack, 16), boilerX + boilerLong / 2, floor + 0.062, 0, 0, 0, Math.PI / 2));
    // Chimney, dome and a brass band
    g.add(at(cyl(0.02, 0.015, 0.05, M.engineBlack, 10), boilerX + boilerLong * 0.4, floor + 0.128, 0));
    g.add(at(cyl(0.024, 0.024, 0.008, M.engineBlack, 10), boilerX + boilerLong * 0.4, floor + 0.154, 0));
    g.add(at(new T.Mesh(new T.SphereGeometry(0.022, 10, 6), M.engineBrass), boilerX - boilerLong * 0.05, floor + 0.112, 0));
    g.add(at(cyl(0.052, 0.052, 0.006, M.engineBrass, 16), boilerX - boilerLong * 0.3, floor + 0.062, 0, 0, 0, Math.PI / 2));
    // The red buffer beam at the front
    g.add(at(box(0.01, 0.022, RAIL.width, M.engineRed), length / 2 - 0.005, floor + 0.004, 0));
    // The cab
    const cabX = boilerX - boilerLong / 2 - 0.05;
    g.add(at(box(0.1, 0.11, RAIL.width, coat), cabX, floor + 0.062, 0));
    g.add(at(box(0.116, 0.008, RAIL.width + 0.012, M.engineBlack), cabX, floor + 0.122, 0));
    for (const s of [-1, 1]) g.add(at(box(0.04, 0.035, 0.003, M.carriageGlass), cabX, floor + 0.086, s * (RAIL.width / 2 + 0.002)));
    // The tender, heaped with coal
    const tenderX = -length / 2 + 0.085;
    g.add(at(box(0.15, 0.07, RAIL.width, coat), tenderX, floor + 0.042, 0));
    g.add(at(box(0.13, 0.008, RAIL.width - 0.02, M.coalLump), tenderX, floor + 0.08, 0));
    for (let i = 0; i < 8; i++) {
      const lump = new T.Mesh(new T.DodecahedronGeometry(0.014 + R() * 0.01), M.coalLump);
      g.add(at(lump, tenderX + (R() - 0.5) * 0.11, floor + 0.09, (R() - 0.5) * 0.09, R(), R(), R()));
    }
    // Wheels: big driving wheels under the boiler, small ones under the tender
    for (const s of [-1, 1]) {
      for (const x of [boilerX + boilerLong * 0.3, boilerX, boilerX - boilerLong * 0.3]) g.add(at(cyl(0.032, 0.032, 0.008, M.engineRed, 14), x, 0.032, s * 0.066, Math.PI / 2, 0, 0));
      for (const x of [tenderX - 0.04, tenderX + 0.04]) g.add(at(cyl(0.02, 0.02, 0.008, M.wagonDark, 10), x, 0.02, s * 0.06, Math.PI / 2, 0, 0));
    }
    return castAll(g);
  }

  // A signal box: a brick base, a glazed cabin all round, and a slate roof
  function signalbox() {
    const g = new T.Group();
    if (!M.boxBrick) { M.boxBrick = mat('#7a4a36', 1); M.boxWood = mat('#b5ad8f', 1); M.boxGlass = mat('#34464c', 0.3); M.boxRoof = mat('#46494f', 0.9); }
    g.add(at(box(0.2, 0.09, 0.16, M.boxBrick), 0, 0.045, 0));
    g.add(at(box(0.2, 0.06, 0.16, M.boxWood), 0, 0.12, 0));
    g.add(at(box(0.204, 0.036, 0.164, M.boxGlass), 0, 0.122, 0));
    for (const s of [-1, 1]) g.add(at(box(0.12, 0.01, 0.12, M.boxRoof), 0, 0.166, s * 0.045, s * 0.5, 0, 0));
    g.add(at(box(0.21, 0.006, 0.17, M.boxRoof), 0, 0.152, 0));
    return castAll(g);
  }

  // A signal: a tall post, a red arm with a white stripe, a lamp, on a small base
  function signal() {
    const g = new T.Group();
    if (!M.signalPost) { M.signalPost = mat('#d8d3c4', 0.8); M.signalArm = mat('#a12a22', 0.7); M.signalStripe = mat('#ece6d6', 0.8); M.signalLamp = mat('#2a2a2c', 0.5, 0.3); }
    g.add(at(box(0.04, 0.012, 0.04, M.signalLamp), 0, 0.006, 0));
    g.add(at(cyl(0.004, 0.006, 0.22, M.signalPost, 8), 0, 0.116, 0));
    g.add(at(box(0.07, 0.016, 0.004, M.signalArm), 0.034, 0.2, 0, 0, 0, -0.18));
    g.add(at(box(0.008, 0.016, 0.005, M.signalStripe), 0.044, 0.198, 0, 0, 0, -0.18));
    g.add(at(box(0.012, 0.016, 0.01, M.signalLamp), 0.004, 0.176, 0));
    return castAll(g);
  }

  // A water tower: an iron drum on four legs, with a hose hanging down
  function watertower() {
    const g = new T.Group();
    if (!M.towerIron) { M.towerIron = mat('#34373a', 0.7, 0.3); M.towerTank = mat('#4d4f4a', 0.8, 0.2); }
    for (const x of [-0.055, 0.055]) for (const z of [-0.055, 0.055]) g.add(at(cyl(0.005, 0.007, 0.13, M.towerIron, 6), x, 0.065, z));
    g.add(at(cyl(0.09, 0.09, 0.07, M.towerTank, 16), 0, 0.165, 0));
    g.add(at(cyl(0.02, 0.095, 0.03, M.towerIron, 16), 0, 0.215, 0));
    g.add(at(cyl(0.006, 0.006, 0.08, M.towerIron, 6), 0.09, 0.09, 0));
    return castAll(g);
  }

  // A coal heap: lumps piled up behind a low wall of sleepers
  function coal(length, seed = 0) {
    const g = new T.Group(), R = seeded(seed + 19);
    if (!M.coalLump) M.coalLump = mat('#1c1b1d', 1);
    if (!M.sleeper) M.sleeper = mat('#3f2e22', 1);
    const heap = cyl(0.03, 0.11, 0.08, M.coalLump, 10);
    g.add(at(heap, 0, 0.04, 0));
    for (let i = 0; i < 12; i++) {
      const lump = new T.Mesh(new T.DodecahedronGeometry(0.012 + R() * 0.012), M.coalLump);
      const a = R() * 6.28, r = R() * 0.09;
      g.add(at(lump, Math.cos(a) * r, 0.03 + R() * 0.05, Math.sin(a) * r, R(), R(), R()));
    }
    for (const s of [-1, 1]) g.add(at(box(0.24, 0.04, 0.012, M.sleeper), 0, 0.02, s * 0.115));
    return castAll(g);
  }

  // ---------- Just to look at (Steve) ----------

  // Normandy cows: pale with brown patches, a head down to graze or up. Built along x. seed: so each differs
  function cow(seed) {
    const g = new T.Group(), R = seeded(seed + 3);
    if (!M.cowPale) { M.cowPale = mat('#e3dccb', 1); M.cowPatch = mat('#6b4a30', 1); M.cowDark = mat('#2c2622', 1); }
    g.add(at(box(0.11, 0.05, 0.05, M.cowPale), 0, 0.06, 0));
    // Brown patches on the flanks and back, each cow its own
    for (let i = 0; i < 3; i++) {
      const size = 0.024 + R() * 0.018;
      g.add(at(box(size, 0.052, 0.052, M.cowPatch), -0.04 + R() * 0.08, 0.061 + (R() - 0.5) * 0.004, 0));
    }
    for (const lx of [-0.04, 0.04]) for (const lz of [-0.018, 0.018]) g.add(at(box(0.01, 0.038, 0.01, M.cowDark), lx, 0.019, lz));
    const grazing = R() < 0.5;
    g.add(at(box(0.036, 0.026, 0.028, M.cowPatch), 0.068, grazing ? 0.03 : 0.082, 0, 0, 0, grazing ? -0.8 : 0.1));
    g.add(at(box(0.012, 0.012, 0.024, M.cowPale), grazing ? 0.082 : 0.09, grazing ? 0.014 : 0.078, 0));
    return castAll(g);
  }

  // A sheep: a woolly body of round lumps, a dark face and legs
  function sheep(seed) {
    const g = new T.Group(), R = seeded(seed + 5);
    if (!M.wool) { M.wool = mat('#ddd6c4', 1); M.sheepDark = mat('#26231f', 1); }
    for (let i = 0; i < 5; i++) {
      const lump = new T.Mesh(new T.SphereGeometry(0.017 + R() * 0.005, 8, 6), M.wool);
      g.add(at(lump, -0.024 + i * 0.012, 0.033 + (R() - 0.5) * 0.006, (R() - 0.5) * 0.012));
    }
    for (const lx of [-0.018, 0.018]) for (const lz of [-0.009, 0.009]) g.add(at(box(0.005, 0.02, 0.005, M.sheepDark), lx, 0.01, lz));
    g.add(at(box(0.016, 0.014, 0.012, M.sheepDark), 0.038, 0.036, 0));
    return castAll(g);
  }

  // A street lamp: a thin iron post, a lantern on top
  function lampPost() {
    const g = new T.Group();
    if (!M.iron) { M.iron = mat('#23272a', 0.6, 0.4); M.lampGlass = mat('#d9cf9c', 0.4); }
    g.add(at(cyl(0.008, 0.012, 0.012, M.iron, 8), 0, 0.006, 0));
    g.add(at(cyl(0.0035, 0.005, 0.2, M.iron, 8), 0, 0.106, 0));
    g.add(at(cyl(0.012, 0.008, 0.024, M.lampGlass, 6), 0, 0.216, 0));
    g.add(at(cyl(0.002, 0.016, 0.012, M.iron, 6), 0, 0.234, 0));
    return castAll(g);
  }

  // A poster column: a dark green drum with bright bills pasted round it, and a little domed cap
  function posterColumn(seed) {
    const g = new T.Group(), R = seeded(seed + 11);
    if (!M.columnGreen) {
      M.columnGreen = mat('#2d4a3a', 0.9);
      M.posters = ['#c9a23d', '#b5473a', '#d8d0ba', '#3f6a8a', '#a8652f'].map(c => mat(c, 1));
    }
    g.add(at(cyl(0.03, 0.034, 0.16, M.columnGreen, 14), 0, 0.08, 0));
    g.add(at(cyl(0.006, 0.038, 0.03, M.columnGreen, 14), 0, 0.175, 0));
    const bills = 6;
    for (let i = 0; i < bills; i++) {
      const a = (i / bills) * Math.PI * 2 + R();
      const bill = box(0.024, 0.05 + R() * 0.03, 0.002, M.posters[Math.floor(R() * M.posters.length)]);
      g.add(at(bill, Math.sin(a) * 0.032, 0.07 + R() * 0.03, Math.cos(a) * 0.032, 0, a, 0));
    }
    return castAll(g);
  }

  // A market stall: four poles, a striped canvas top, and a table of crates in bright colours
  function marketStall(seed) {
    const g = new T.Group(), R = seeded(seed + 13);
    if (!M.canvasA) {
      M.canvasA = mat('#3f6a5a', 0.95);
      M.canvasB = mat('#e4dcc8', 0.95);
      M.produce = ['#b5473a', '#d09a30', '#5f8a3a', '#a8652f', '#8f3f6a'].map(c => mat(c, 1));
    }
    const wide = 0.2, deep = 0.13;
    for (const x of [-wide / 2, wide / 2]) for (const z of [-deep / 2, deep / 2]) g.add(at(cyl(0.0025, 0.0025, 0.11, M.wood, 5), x, 0.055, z));
    for (let i = 0; i < 6; i++) g.add(at(box(wide / 6 + 0.008, 0.004, deep + 0.02, i % 2 ? M.canvasA : M.canvasB), -wide / 2 + (i + 0.5) * (wide / 6), 0.114, 0));
    g.add(at(box(wide - 0.02, 0.006, deep - 0.05, M.wood), 0, 0.045, 0));
    for (let i = 0; i < 4; i++) {
      g.add(at(box(0.034, 0.018, 0.04, M.produce[Math.floor(R() * M.produce.length)]), -0.066 + i * 0.044, 0.057, 0));
    }
    return castAll(g);
  }

  // ---------- The bridge (Steve: wide, arched, rustic stone) ----------
  // Built along x, the whole length of a field, its road humped over one low arch
  const BRIDGE = { length: 1, width: 0.76, crown: 0.1, archHalf: 0.25, archRise: 0.066 };
  const BRIDGE_DECK = 0.095;         // how high pieces stand on it
  // How high the road is at x along the bridge (x from -half to +half): nearly level over the river, dropping to the banks
  function bridgeRoad(x) {
    const along = Math.abs(x) / (BRIDGE.length / 2);
    return BRIDGE.crown * (1 - Math.pow(along, 4));
  }
  // Rough-cut stone: courses of uneven blocks in mixed greys and browns, dark mortar, a little moss
  function bridgeStoneTex() {
    return canvasTexture(512, 512, (g, w, h) => {
      const R = seeded(83);
      const shades = ['#a89d88', '#8e8472', '#b4a98f', '#7d7565', '#9c917b', '#6f695b', '#a3977f'];
      g.fillStyle = '#463f33';
      g.fillRect(0, 0, w, h);
      // Each course of blocks: its own height, the blocks their own widths
      for (let y = 0; y < h;) {
        const tall = 40 + Math.floor(R() * 34);
        for (let x = -Math.floor(R() * 40); x < w;) {
          const wide = 50 + Math.floor(R() * 80);
          g.fillStyle = shades[Math.floor(R() * shades.length)];
          g.fillRect(x + 3, y + 3, wide - 5, tall - 5);
          // A worn, lighter top edge on some
          if (R() < 0.5) { g.fillStyle = 'rgba(255,245,220,.13)'; g.fillRect(x + 3, y + 3, wide - 5, 5); }
          x += wide;
        }
        y += tall;
      }
      // Pitted all over
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = R() < 0.5 ? 'rgba(30,25,18,.16)' : 'rgba(255,245,225,.09)';
        g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3);
      }
      // Moss in the damp
      for (let k = 0; k < 26; k++) {
        g.fillStyle = `rgba(${70 + R() * 30},${95 + R() * 30},50,${0.2 + R() * 0.25})`;
        g.beginPath();
        g.ellipse(R() * w, R() * h, 8 + R() * 24, 5 + R() * 12, R() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }, [5, 5]);
  }
  function bridgeMaterials() {
    if (M.bridgeStone) return;
    M.bridgeStone = mat('#ffffff', 1, 0, { map: bridgeStoneTex() });
    M.bridgeBlock = mat('#8a8170', 1);
    M.bridgeBlockLight = mat('#a79c86', 1);
    M.bridgeCap = mat('#7b7364', 1);
    if (!texCache.lane) texCache.lane = flockTex('#8f7d60', EARTH, 21);
    M.bridgeRoad = new T.MeshStandardMaterial({ map: texCache.lane, roughness: 1 });
  }
  function bridge() {
    bridgeMaterials();
    const g = new T.Group(), R = seeded(29), half = BRIDGE.length / 2, side = BRIDGE.width / 2;
    // The body: its side view, the road along the top and the arch cut out of the bottom, drawn out across the width
    const shape = new T.Shape();
    shape.moveTo(-half, 0);
    for (let i = 1; i <= 28; i++) {
      const x = -half + (i / 28) * BRIDGE.length;
      shape.lineTo(x, bridgeRoad(x));
    }
    shape.lineTo(BRIDGE.archHalf, 0);
    for (let i = 1; i <= 20; i++) {
      const a = (i / 20) * Math.PI;
      shape.lineTo(Math.cos(a) * BRIDGE.archHalf, Math.sin(a) * BRIDGE.archRise);
    }
    shape.lineTo(-half, 0);
    const body = new T.ExtrudeGeometry(shape, { depth: BRIDGE.width, bevelEnabled: false });
    body.translate(0, 0, -side);
    g.add(new T.Mesh(body, M.bridgeStone));
    // Each side: the arch's own ring of wedge stones, standing a little proud
    for (const s of [-1, 1]) {
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        const x = Math.cos(a) * (BRIDGE.archHalf + 0.012), y = Math.sin(a) * (BRIDGE.archRise + 0.012);
        const stone = box(0.036, 0.024 + R() * 0.006, 0.012, i % 2 ? M.bridgeBlock : M.bridgeBlockLight);
        g.add(at(stone, x, y, s * (side + 0.003), 0, 0, a - Math.PI / 2));
      }
      // A buttress of rough blocks each side of the arch, standing in the river's edge
      for (const end of [-1, 1]) {
        g.add(at(box(0.05, 0.085, 0.034, M.bridgeBlock), end * (BRIDGE.archHalf + 0.05), 0.042, s * (side + 0.012)));
        g.add(at(box(0.036, 0.03, 0.05, M.bridgeBlockLight), end * (BRIDGE.archHalf + 0.05), 0.016, s * (side + 0.02)));
      }
      // The parapet: a low, uneven wall following the road, block by block
      const blocks = 16;
      for (let i = 0; i < blocks; i++) {
        const x = -half + ((i + 0.5) / blocks) * BRIDGE.length;
        const step = BRIDGE.length / blocks;
        const slope = Math.atan2(bridgeRoad(x + step / 2) - bridgeRoad(x - step / 2), step);
        const tall = 0.026 + R() * 0.012;
        const wall = box(step * 1.04, tall, 0.03 + R() * 0.008, i % 3 === 0 ? M.bridgeBlockLight : M.bridgeBlock);
        g.add(at(wall, x, bridgeRoad(x) + tall / 2 - 0.002, s * (side - 0.012), 0, 0, slope));
        // A flat coping stone on some of them
        if (i % 2 === 0) g.add(at(box(step * 0.92, 0.007, 0.042, M.bridgeCap), x, bridgeRoad(x) + tall + 0.001, s * (side - 0.012), 0, 0, slope));
      }
    }
    // The lane carries on over the top, as worn earth down the middle of the stones
    const pieces = 14;
    for (let i = 0; i < pieces; i++) {
      const x = -half + ((i + 0.5) / pieces) * BRIDGE.length;
      const step = BRIDGE.length / pieces;
      const slope = Math.atan2(bridgeRoad(x + step / 2) - bridgeRoad(x - step / 2), step);
      g.add(at(box(step * 1.04, 0.003, 0.3, M.bridgeRoad), x, bridgeRoad(x) + 0.001, 0, 0, 0, slope));
    }
    return castAll(g);
  }

  return { greyhound, puma, EIFFEL_HEIGHT, eiffel, landingCraft, tankTrap, hulk, crater, seaWall, seaWallRubble, bunker, bunkerCrew, BUNKER, track, bufferStop, engine, carriage, wagon, signalbox, signal, watertower, coal, cow, sheep, lampPost, posterColumn, marketStall, cafe, barn, fountain, pond, reeds, BRIDGE_DECK, materials, M, mergeParts, eliteBand, water, bridge, soldier, squad, team, captain, pak, mortar, bomber, bomberOnStand, howitzer, round, coin, token, sherman, panther, panzer4, hedge, tree, house, die, table, field, lane, at };
})();
