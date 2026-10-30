// Hedgerow: the board as a wargame table in 3D. The whole board sits on the table, seen from one slanted camera.
// Fields are 1 unit square: field (x, y) covers x..x+1 across and y..y+1 into the table (three.js z)

const Board = (() => {
  const T = THREE, { at } = Models;
  const MEN = 2.45;     // the men are 1:54 models...
  const TANKS = 1.6;    // ...the tanks 1:76, so the men look big beside them, as on a real table
  let renderer, scene, camera, el, hedgeGroup = null, hedgeKey = '', marks, pieces = {}, tokens = {}, dice = [], built = null;
  const ray = new T.Raycaster(), table = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function init(container) {
    el = container;
    Models.materials();
    renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    el.appendChild(renderer.domElement);
    scene = new T.Scene();
    scene.background = new T.Color('#1f1b15');
    // A warm lamp above the top left of the table, a cool fill from the window, the room's bounce
    scene.add(new T.HemisphereLight(0xfff4e0, 0x3a2a18, 0.45));
    const lamp = new T.DirectionalLight(0xffe8c8, 1.6);
    lamp.position.set(-3, 9, -4); lamp.target.position.set(COLS / 2, 0, ROWS / 2);
    lamp.castShadow = true; lamp.shadow.mapSize.set(4096, 4096); lamp.shadow.radius = 4; lamp.shadow.bias = -0.0004;
    Object.assign(lamp.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
    scene.add(lamp, lamp.target);
    const fill = new T.DirectionalLight(0xcfe0ff, 0.2); fill.position.set(COLS + 6, 5, ROWS + 6); scene.add(fill);
    camera = new T.PerspectiveCamera(34, 16 / 9, 0.1, 80);
    marks = new T.Group(); scene.add(marks);
  }

  // Fit the whole table in the box: the camera keeps its slant and backs off until every corner shows
  function resize(w, h) {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const centre = new T.Vector3(COLS / 2, 0, ROWS / 2 + 0.15);
    const dir = new T.Vector3(0, Math.sin(0.92), Math.cos(0.92));   // about 53° above the table, from the near side
    const corners = [[-0.3, -0.3], [COLS + 0.3, -0.3], [-0.3, ROWS + 0.3], [COLS + 0.3, ROWS + 0.3]].map(([x, z]) => new T.Vector3(x, 0, z));
    let d = 6;
    for (let k = 0; k < 60; k++) {
      camera.position.copy(centre).addScaledVector(dir, d);
      camera.lookAt(centre); camera.updateMatrixWorld();
      if (corners.every(c => { const p = c.clone().project(camera); return Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.95; })) break;
      d += 0.25;
    }
  }

  // ---------- The table: built once a game, hedges again when one is cut ----------

  function build(st) {
    if (built) scene.remove(built);
    built = new T.Group();
    built.add(Models.table(COLS, ROWS));
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = Sim.tileType(x, y), seed = x * 7 + y * 13;
      built.add(at(Models.field(t, t === 'field' && seed % 5 === 0, seed), x + 0.5, 0, y + 0.5, -Math.PI / 2, 0, 0));
      if (t === 'laneEW' || t === 'crossroads') built.add(at(Models.lane(1, 0.3), x + 0.5, 0.001, y + 0.5, -Math.PI / 2, 0, 0));
      if (t === 'laneNS' || t === 'crossroads') built.add(at(Models.lane(0.3, 1), x + 0.5, 0.0012, y + 0.5, -Math.PI / 2, 0, 0));
      // The river: water down the field, joined to the river or bridge above and below; a bridge carries the lane over
      if (t === 'river' || t === 'bridge') {
        const wet = (xx, yy) => Sim.inside(xx, yy) && ['river', 'bridge'].includes(Sim.tileType(xx, yy));
        const top = wet(x, y - 1) || y === 0 ? 0 : 0.3, bottom = wet(x, y + 1) || y === ROWS - 1 ? 1 : 0.7;
        built.add(at(Models.water(0.42, bottom - top), x + 0.5, 0, y + (top + bottom) / 2));
        if (t === 'bridge') { built.add(at(Models.lane(1, 0.3), x + 0.5, 0.0012, y + 0.5, -Math.PI / 2, 0, 0)); const b = Models.bridge(); built.add(at(b, x + 0.5, 0, y + 0.5)); }
      }
      if (t === 'orchard') for (const [ox, oz] of [[0.2, 0.18], [0.82, 0.2], [0.18, 0.84], [0.84, 0.84]]) built.add(at(Models.tree(seed + ox * 10, 0.75), x + ox, 0, y + oz));
      if (t === 'village' || t === 'hamlet') {
        // Big model houses (about 1:44) round a yard: one along the back, one down the far side, the yard left free for a piece
        const H = 1.9;
        const back = Models.house(seed); back.scale.setScalar(H); built.add(at(back, x + 0.42, 0, y + 0.17, 0, 0, 0));
        const side = Models.house(seed + 1); side.scale.setScalar(H * 0.85); built.add(at(side, x + 0.86, 0, y + 0.55, 0, -Math.PI / 2, 0));
        // A low yard wall along the front of a hamlet
        if (t === 'hamlet') built.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.03), Models.M.stone), x + 0.32, 0.025, y + 0.97));
      }
    }
    scene.add(built);
    hedgeKey = '';
  }

  // Hedges: every lump of foam on the table drawn as one instanced mesh (one for dark foam, one for light, one for the bases),
  // so the whole board stays quick to draw. Rebuilt when a hedge is cut
  function buildHedges(st) {
    const key = Object.keys(st.hedges).sort().join(';') + '/' + Object.keys(st.wire).sort().join(';');
    if (key === hedgeKey) return;
    if (hedgeGroup) scene.remove(hedgeGroup);
    hedgeGroup = new T.Group();
    const runs = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (x + 1 < COLS && Sim.hedge(st, x, y, x + 1, y)) runs.push({ cx: x + 1, cz: y + 0.5, along: 'z', seed: x * 31 + y });
      if (y + 1 < ROWS && Sim.hedge(st, x, y, x, y + 1)) runs.push({ cx: x + 0.5, cz: y + 1, along: 'x', seed: x * 17 + y * 5 + 3 });
    }
    const lumps = [[], []], bases = [];
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3();
    for (const r of runs) {
      const R = seeded(r.seed);
      bases.push(new T.Matrix4().compose(new T.Vector3(r.cx, 0.006, r.cz), new T.Quaternion().setFromEuler(new T.Euler(0, r.along === 'z' ? Math.PI / 2 : 0, 0)), new T.Vector3(1, 1, 1)));
      for (let k = 0; k < 70; k++) {
        const a = -0.5 + R(), side = (R() - 0.5) * 0.07, rad = 0.035 + R() * 0.03;
        pos.set(r.along === 'x' ? r.cx + a : r.cx + side, 0.05 + R() * 0.07, r.along === 'x' ? r.cz + side : r.cz + a);
        sc.set(rad, rad * (0.9 + R() * 0.4), rad);
        m.compose(pos, q, sc);
        lumps[R() < 0.25 ? 1 : 0].push(m.clone());
      }
    }
    const ball = new T.SphereGeometry(1, 7, 5);
    [Models.M.foam, Models.M.foamLight].forEach((mat, i) => {
      const im = new T.InstancedMesh(ball, mat, lumps[i].length);
      lumps[i].forEach((mm, k) => im.setMatrixAt(k, mm));
      im.castShadow = im.receiveShadow = true;
      hedgeGroup.add(im);
    });
    const bm = new T.InstancedMesh(new T.BoxGeometry(1, 0.014, 0.12), Models.M.hedgeBase, bases.length);
    bases.forEach((mm, k) => bm.setMatrixAt(k, mm));
    bm.receiveShadow = true;
    hedgeGroup.add(bm);
    // Barbed-wire fences: wooden posts with three strands of wire, sagging a little
    const posts = [], strands = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (!Sim.inside(x + dx, y + dy) || !Sim.wire(st, x, y, x + dx, y + dy)) continue;
        const along = dx ? 'z' : 'x', cx = dx ? x + 1 : x + 0.5, cz = dx ? y + 0.5 : y + 1;
        const pt = (a, h) => (along === 'z' ? new T.Vector3(cx, h, cz + a) : new T.Vector3(cx + a, h, cz));
        for (let a = -0.45; a <= 0.46; a += 0.15) posts.push(new T.Matrix4().compose(pt(a, 0.035), new T.Quaternion(), new T.Vector3(1, 1, 1)));
        for (const h of [0.022, 0.042, 0.062]) for (let a = -0.45; a < 0.45; a += 0.15) { strands.push(pt(a, h), pt(a + 0.075, h - 0.004), pt(a + 0.075, h - 0.004), pt(a + 0.15, h)); }
      }
    }
    if (posts.length) {
      const pm = new T.InstancedMesh(new T.CylinderGeometry(0.004, 0.005, 0.07, 6), Models.M.wood, posts.length);
      posts.forEach((mm, k) => pm.setMatrixAt(k, mm)); pm.castShadow = true;
      hedgeGroup.add(pm);
      hedgeGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(strands), new T.LineBasicMaterial({ color: 0x8a8a84 })));
    }
    scene.add(hedgeGroup);
    hedgeKey = key;
  }

  function seeded(n) { let a = (n * 2654435761) >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

  // ---------- Pieces ----------

  // The model for a piece, made the first time it is needed
  function model(u) {
    if (pieces[u.id]) return pieces[u.id];
    const g = new T.Group();
    if (u.kind === 'company') {
      // One base a platoon; the bases are shown or hidden as platoons are lost
      g.userData.bases = [0, 1, 2].map(() => { const s = Models.squad(u.side); s.scale.setScalar(MEN); g.add(s); return s; });
    } else if (Sim.isTank(u)) {
      const make = { sherman: () => Models.sherman(Models.M.olive), firefly: () => Models.sherman(Models.M.olive, true), pz4: Models.panzer4, panther: Models.panther }[u.kind];
      g.userData.bases = [0, 1].map(() => { const m = make(); m.scale.setScalar(TANKS); g.add(m); return m; });
    } else {
      const m = u.kind === 'captain' ? Models.captain(u.side) : u.kind === 'pak' ? Models.pak() : Models.team(u.side, u.kind);
      m.scale.setScalar(u.kind === 'pak' ? TANKS * 1.3 : MEN);
      g.add(m); g.userData.bases = [m];
    }
    // The Germans face west
    g.userData.face = u.side === 'us' ? 0 : Math.PI;
    scene.add(g);
    pieces[u.id] = g;
    return g;
  }

  // Where things stand in a field: the company's three bases down the left, the pair of tanks on the right,
  // captains and teams along the back. Groups keep a loose formation that shuffles each time they move to a new field
  function arrange(st, x, y) {
    const here = Sim.at(st, x, y);
    const company = here.find(u => u.kind === 'company'), armour = here.find(u => Sim.isTank(u)), small = here.filter(u => Sim.isSmall(u));
    const west = here.length && here[0].side === 'us';
    const flip = v => (west ? v : 1 - v);
    // Pieces lining a hedge stand close to it: everything in the field is pushed that way
    const lead = here.find(u => u.kind === 'company') || here.find(u => Sim.isTank(u)) || here[0];
    const push = lead && lead.at ? { e: [0.14, 0], w: [-0.14, 0], s: [0, 0.12], n: [0, -0.12] }[lead.at] : [0, 0];
    const loose = (u, k) => { const R = seeded(u.id.length * 977 + x * 131 + y * 71 + k * 7 + u.id.charCodeAt(0)); return [(R() - 0.5) * 0.09, (R() - 0.5) * 0.07, (R() - 0.5) * 0.5]; };
    if (company) {
      const g = model(company), spots = armour ? [[0.2, 0.28], [0.17, 0.53], [0.22, 0.78]] : [[0.3, 0.3], [0.42, 0.55], [0.28, 0.8]];
      g.userData.bases.forEach((b, i) => { const [jx, jz, jr] = loose(company, i); b.visible = i < company.platoons; aim(b, flip(spots[i][0] + jx), spots[i][1] + jz, g.userData.face + jr); });
      aim(g, x + push[0], y + push[1], 0);
    }
    if (armour) {
      const g = model(armour);
      g.userData.bases.forEach((b, i) => { const [jx, jz, jr] = loose(armour, i); b.visible = i < armour.platoons; aim(b, flip((company ? 0.64 : 0.5) + jx * 0.6), (i ? 0.72 : 0.33) + jz * 0.5, g.userData.face + jr * 0.4); });
      aim(g, x + push[0] * 0.6, y + push[1] * 0.6, 0);
    }
    small.forEach((u, i) => {
      const g = model(u);
      aim(g.userData.bases[0], 0, 0, g.userData.face);
      aim(g, x + flip(0.16 + i * 0.24), y + 0.1, 0);
    });
  }

  // Set where an object should be; it glides there over a moment (snap: put it there at once)
  function aim(o, x, z, ry, snap = false) {
    o.userData.to = { x, z, ry };
    if (snap || o.userData.placed !== true) { o.position.set(x, 0, z); o.rotation.y = ry; o.userData.placed = true; }
  }

  // Move everything a step towards where it should be. Returns true while anything is still moving
  function glide(dt) {
    let moving = false;
    const k = 1 - Math.exp(-dt * 6);
    scene.traverse(o => {
      const to = o.userData.to;
      if (!to) return;
      const dx = to.x - o.position.x, dz = to.z - o.position.z, dr = to.ry - o.rotation.y;
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dr) < 0.002) { o.position.x = to.x; o.position.z = to.z; o.rotation.y = to.ry; return; }
      o.position.x += dx * k; o.position.z += dz * k; o.rotation.y += dr * k;
      moving = true;
    });
    return moving;
  }

  // Markers beside a piece: a red pin marker when shaken, a wooden order token once it has acted, a gold star for elite troops
  function marker(u, key, colour, label, show, dx, dz, size = 1.6) {
    const id = u.id + key;
    if (!tokens[id]) { tokens[id] = Models.token(colour, label); tokens[id].scale.setScalar(size); scene.add(tokens[id]); }
    const t = tokens[id];
    t.visible = show && u.x !== null;
    if (t.visible) { const to = pieces[u.id].userData.to; t.position.set(to.x + dx, 0, to.z + dz); }
  }

  function updatePieces(st) {
    for (const u of st.units) {
      const g = u.x === null ? pieces[u.id] : model(u);
      if (g) g.visible = u.x !== null;
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) arrange(st, x, y);
    for (const u of st.units) {
      if (!pieces[u.id]) continue;
      const big = u.kind === 'company' || Sim.isTank(u);
      const side = u.side === 'us' ? 1 : -1;
      marker(u, ':shock', '#9b2a22', '!', u.shocked, big ? 0.06 * side : 0.12 * side, big ? 0.12 : 0.24);
      marker(u, ':done', '#6b6b66', '✓', u.side === 'us' && u.acted, big ? 0.18 * side : 0.22 * side, big ? 0.9 : 0.3, 3.2);
      marker(u, ':elite', '#b38a2e', '★', u.quality === 'elite' && u.kind === 'company', 0.06 * side, 0.93);
    }
  }

  // ---------- Highlights on the table ----------
  const MARK = { move: '#7fc6e0', charge: '#e0705f', shoot: '#e6c95a', rally: '#8fd47a', fire: '#e8a05a', breach: '#c9a46a', attach: '#b9a0e0', select: '#fff6dc', hover: '#ffffff' };

  // A coloured square of light on a field, with a brighter rim
  function mark(x, y, kind, inset = 0.05) {
    const c = new T.Color(MARK[kind]);
    const plane = new T.Mesh(new T.PlaneGeometry(1 - inset * 2, 1 - inset * 2), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: kind === 'hover' ? 0.06 : 0.16, depthWrite: false }));
    at(plane, x + 0.5, 0.004, y + 0.5, -Math.PI / 2, 0, 0); marks.add(plane);
    if (kind === 'hover') return;
    const s = 0.5 - inset, pts = [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]].map(([a, b]) => new T.Vector3(x + 0.5 + a, 0.006, y + 0.5 + b));
    marks.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95 })));
  }

  // ---------- Red targets over the pieces that can be shot ----------
  // A red ring and cross-hairs floating over the piece, always facing the camera, and a red ring on the table under it
  let reticleTex = null;
  function reticle() {
    if (!reticleTex) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.strokeStyle = '#e8352a'; g.lineWidth = 9; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
      g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 7;
      for (const [x1, y1, x2, y2] of [[64, 6, 64, 36], [64, 92, 64, 122], [6, 64, 36, 64], [92, 64, 122, 64]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      g.fillStyle = '#e8352a'; g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
      reticleTex = new T.CanvasTexture(c);
    }
    return new T.Sprite(new T.SpriteMaterial({ map: reticleTex, depthTest: false, transparent: true }));
  }

  // Where a piece is on the table: the middle of its bases
  function pieceCentre(u) {
    const g = pieces[u.id], c = new T.Vector3(), n = { k: 0 };
    if (!g) return new T.Vector3(u.x + 0.5, 0, u.y + 0.5);
    for (const b of g.userData.bases) if (b.visible) { c.x += (b.userData.to ? b.userData.to.x : b.position.x); c.z += (b.userData.to ? b.userData.to.z : b.position.z); n.k++; }
    const to = g.userData.to || { x: g.position.x, z: g.position.z };
    return n.k ? new T.Vector3(to.x + c.x / n.k, 0, to.z + c.z / n.k) : new T.Vector3(u.x + 0.5, 0, u.y + 0.5);
  }

  function markTargets(list) {
    const pulse = 1 + 0.08 * Math.sin(performance.now() / 180);
    for (const u of list) {
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.26 : 0.17, big ? 0.32 : 0.22, 48), new T.MeshBasicMaterial({ color: 0xe8352a, transparent: true, opacity: 0.9, depthWrite: false }));
      at(ring, p.x, 0.008, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
      const r = reticle(); r.scale.setScalar((big ? 0.62 : 0.5) * pulse); r.position.set(p.x, big ? 0.62 : 0.5, p.z); marks.add(r);
    }
  }

  // ---------- Dice on the table ----------
  // Each shot leaves its dice by the target: hits stand on top of each other's line, misses lie further off
  function showDice(st) {
    for (const d of dice) scene.remove(d);
    dice = [];
    st.fx.filter(f => f.faces && f.faces.length).slice(-3).forEach((f, k) => {
      f.faces.forEach((r, i) => {
        const d = Models.die(r.face); d.scale.setScalar(1.7);
        const row = Math.floor(i / 6);
        at(d, f.x + 0.12 + (i % 6) * 0.075, 0, f.y + 0.98 + row * 0.075 + k * 0.03, 0, (i * 1.7) % 0.6 - 0.3, 0);
        // Misses are dimmed so the hits stand out
        if (!r.hit) d.traverse(c => { if (c.isMesh && c.material === Models.M.die) { c.material = c.material.clone(); c.material.color.multiplyScalar(0.45); } });
        scene.add(d); dice.push(d);
      });
    });
  }

  // view: { spots: [{ x, y, kind }], selected: piece, hover: { x, y } }. dt: seconds since the last frame.
  // Returns true while pieces are still gliding, so the page keeps drawing
  let lastT = 0;
  function render(st, view = {}) {
    const now = performance.now(), dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (!built || built.userData.seed !== st.seed) { for (const id in pieces) scene.remove(pieces[id]); for (const id in tokens) scene.remove(tokens[id]); pieces = {}; tokens = {}; build(st); built.userData.seed = st.seed; }
    buildHedges(st);
    updatePieces(st);
    while (marks.children.length) marks.remove(marks.children[0]);
    if (view.hover) mark(view.hover.x, view.hover.y, 'hover', 0.02);
    for (const s of view.spots || []) mark(s.x, s.y, s.kind);
    if (view.selected && view.selected.x !== null) mark(view.selected.x, view.selected.y, 'select', 0.015);
    if (view.targets && view.targets.length) markTargets(view.targets);
    if (view.ready) for (const u of st.units) {
      if (u.side !== 'us' || u.x === null || !pieces[u.id]) continue;
      const can = view.ready(u);
      if (!can && !u.acted) continue;
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.3 : 0.17, big ? 0.335 : 0.195, 48), new T.MeshBasicMaterial({ color: can ? 0x7fd06a : 0x77776f, transparent: true, opacity: can ? 0.8 : 0.6, depthWrite: false }));
      at(ring, p.x, 0.006, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
    }
    if (st.fxShown !== st.fx || st.fxCount !== st.fx.length) { showDice(st); st.fxShown = st.fx; st.fxCount = st.fx.length; }
    const moving = glide(dt);
    renderer.render(scene, camera);
    // Targets pulse, so keep drawing while they show
    return moving || !!(view.targets && view.targets.length);
  }

  // Which field is under a point on the page (by casting a ray onto the table)
  function fieldAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, camera);
    const p = new T.Vector3();
    if (!ray.ray.intersectPlane(table, p)) return null;
    const x = Math.floor(p.x), y = Math.floor(p.z);
    return Sim.inside(x, y) ? { x, y } : null;
  }

  // Where a field's top edge is on the page, for labels
  function screenPoint(x, y, h = 0) {
    const p = new T.Vector3(x, h, y).project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }

  return { init, resize, render, fieldAt, screenPoint, canvas: () => renderer.domElement };
})();
