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
    const centre = new T.Vector3(COLS / 2, 0, ROWS / 2);
    const fits = () => corners.every(c => { const p = c.clone().project(camera); return Math.abs(p.x) < 0.99 && Math.abs(p.y) < 0.99; });
    const place = d => { camera.position.copy(centre).addScaledVector(dir, d); camera.lookAt(centre); camera.updateMatrixWorld(); };
    const dir = new T.Vector3(0, Math.sin(0.92), Math.cos(0.92));   // about 53° above the table, from the near side
    // The board's corners with the thinnest edge of table, and the guns and their names off each side
    const board = [[-0.06, -0.06], [COLS + 0.06, -0.06], [-0.06, ROWS + 0.06], [COLS + 0.06, ROWS + 0.06]];
    // (and where the drawn token lands, above each side's artillery)
    const guns = [[-1.75, 2.1], [-1.75, 4.7], [COLS + 1.75, 2.1], [COLS + 1.75, 4.7], [-1.35, 0.9], [-1.35, 1.9], [COLS + 1.35, 0.9], [COLS + 1.35, 1.9]];
    const corners = board.concat(guns).map(([x, z]) => new T.Vector3(x, 0, z));
    // Move the camera in until something would go off the screen; then aim a little further up or down the board so
    // the edges of table above and below come out even, and move in again
    let d = 30;
    for (let round = 0; round < 8; round++) {
      d = 30;
      for (let k = 0; k < 600; k++) { place(d - 0.05); if (!fits()) break; d -= 0.05; }
      place(d);
      const ys = board.map(([x, z]) => new T.Vector3(x, 0, z).project(camera).y);
      const above = 1 - Math.max(...ys), below = 1 + Math.min(...ys);
      if (Math.abs(above - below) < 0.01) break;
      centre.z = Math.max(0, Math.min(ROWS, centre.z + (above - below) * ROWS * 0.35));
    }
  }

  // ---------- The table: built once a game, hedges again when one is cut ----------

  // The mortars and artillery of each side, off the board behind its own back line, near the top (Steve): the Americans
  // left of the board, the Germans right. Where each stands, and where its pile of rounds goes (behind it)
  const GUNS = {
    us: { artillery: { x: -0.7, z: 2.55, pileX: -1.45, pileZ: 2.3 }, mortars: { x: -0.7, z: 4.05, pileX: -1.45, pileZ: 3.85 } },
    de: { artillery: { x: COLS + 0.7, z: 2.55, pileX: COLS + 1.25, pileZ: 2.3 }, mortars: { x: COLS + 0.7, z: 4.05, pileX: COLS + 1.25, pileZ: 3.85 } },
  };
  const GUN_NAMES = { us: { artillery: 'US artillery', mortars: 'US mortars' }, de: { artillery: 'German artillery', mortars: 'German mortars' } };
  const PILE_MAX = 12;
  let support = null;           // side → which → { model, rounds: [] }

  // Facing: towards the board, the Americans' east, the Germans' west
  const gunFacing = side => (side === 'us' ? 0 : Math.PI);
  const gunDir = side => ({ x: side === 'us' ? 1 : -1, z: 0 });

  function buildSupport() {
    support = {};
    for (const side of ['us', 'de']) {
      support[side] = {};
      for (const which of ['artillery', 'mortars']) {
        const spot = GUNS[side][which];
        const model = which === 'artillery' ? Models.howitzer(side) : Models.mortar(side);
        model.scale.setScalar(which === 'artillery' ? TANKS * 1.7 : MEN * 1.3);
        built.add(at(model, spot.x, 0, spot.z, 0, gunFacing(side), 0));
        // The pile of rounds beside it: shells standing in rows of three, mortar bombs lying in rows of four
        const rounds = [];
        for (let k = 0; k < PILE_MAX; k++) {
          const r = Models.round(which === 'artillery' ? 'shell' : 'bomb');
          r.scale.setScalar(which === 'artillery' ? TANKS * 1.7 : MEN * 1.3);
          const perRow = which === 'artillery' ? 3 : 4, gap = which === 'artillery' ? 0.07 : 0.075;
          built.add(at(r, spot.pileX + (k % perRow) * gap, which === 'artillery' ? 0 : 0.02, spot.pileZ + Math.floor(k / perRow) * gap));
          rounds.push(r);
        }
        // Its name, small, on the table in front
        const name = word(GUN_NAMES[side][which], '#efe6d2', false);
        name.scale.multiplyScalar(1.5);
        name.material.depthTest = true;
        name.position.set(spot.x + (side === 'us' ? -0.2 : 0.2), 0.05, spot.z + 0.55);
        built.add(name);
        support[side][which] = { model, rounds, name };
      }
    }
  }

  // Which of your mortars or artillery is under a point on the page: the model, or the table close round it
  function gunAt(clientX, clientY) {
    if (!support) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    for (const which of ['artillery', 'mortars']) if (support.us[which].model.visible && ray.intersectObject(support.us[which].model, true).length) return which;
    const p = new T.Vector3();
    if (!ray.ray.intersectPlane(table, p)) return null;
    for (const which of ['artillery', 'mortars']) {
      const spot = GUNS.us[which];
      if (support.us[which].model.visible && Math.hypot(p.x - spot.x, p.z - spot.z) < 0.45) return which;
    }
    return null;
  }

  // A ring under each of your guns, like the pieces: green if it can still fire this hour, grey if not, white if chosen
  function gunRings(state) {
    if (!state) return;
    for (const which of ['artillery', 'mortars']) {
      const spot = GUNS.us[which], s = state[which];
      if (!s.present) continue;
      const colour = s.chosen ? 0xfff6dc : s.ready ? 0x7fd06a : 0x77776f;
      const ring = new T.Mesh(new T.RingGeometry(0.3, s.chosen ? 0.36 : 0.335, 48), new T.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, depthWrite: false }));
      at(ring, spot.x, 0.006, spot.z, -Math.PI / 2, 0, 0); marks.add(ring);
    }
  }

  // ---------- The drawn token ----------
  // It flies from its place in the bar up onto the table, just above that side's artillery (Steve), in an arc: rising
  // (and growing) then dropping (and shrinking), turning over as it goes, and lands flat as a thick coin about twice the
  // size of a one-man base, then three times the radius (Steve). It sits there until that move is over, then shrinks away
  const COIN_SIZE = 0.48;            // radius on the table (Steve: three times the first size)
  let coinFlight = null;             // { mesh, from, to, t0, done, leaving }
  function flyToken(side, clientX, clientY, done) {
    clearTokenNow();
    const mesh = Models.coin(side);
    mesh.scale.set(COIN_SIZE, COIN_SIZE, COIN_SIZE);
    // Where it starts: the bar's spot, carried down onto the table's plane (off the bottom of the screen)
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    const from = new T.Vector3();
    if (!ray.ray.intersectPlane(table, from)) from.set(COLS / 2, 0, ROWS + 2);
    const gun = GUNS[side].artillery;
    const to = new T.Vector3(gun.x + (side === 'us' ? -0.1 : 0.1), 0.04, gun.z - 1.15);
    mesh.position.copy(from);
    scene.add(mesh);
    coinFlight = { mesh, from, to, t0: performance.now(), done, leaving: 0 };
  }
  // The move is over: the coin shrinks away
  function clearToken() { if (coinFlight) coinFlight.leaving = coinFlight.leaving || performance.now(); }
  function clearTokenNow() { if (coinFlight) { scene.remove(coinFlight.mesh); coinFlight = null; } }
  function moveCoin(now) {
    if (!coinFlight) return false;
    const c = coinFlight, m = c.mesh;
    if (c.leaving) {
      const k = Math.min(1, (now - c.leaving) / 350);
      m.scale.setScalar(COIN_SIZE * (1 - k));
      if (k >= 1) { clearTokenNow(); return false; }
      return true;
    }
    const p = Math.min(1, (now - c.t0) / 1150), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    m.position.set(T.MathUtils.lerp(c.from.x, c.to.x, e), c.to.y + 1.8 * Math.sin(Math.PI * e), T.MathUtils.lerp(c.from.z, c.to.z, e));
    m.scale.setScalar(COIN_SIZE * (1 + 0.9 * Math.sin(Math.PI * e)));
    m.rotation.set(Math.PI * 2 * (1 - e), 0, 0.3 * Math.sin(Math.PI * e));
    if (p >= 1 && c.done) { const d = c.done; c.done = null; Sound.play('select'); d(); }
    return p < 1;
  }

  // Show as many rounds beside each gun as it has shots left
  function updateSupport(st) {
    if (!support) return;
    const left = { us: { artillery: st.ammo.artillery, mortars: st.ammo.mortars }, de: { artillery: st.deArtilleryAmmo || 0, mortars: st.deMortarAmmo || 0 } };
    // Which guns have fired this hour, each side
    const fired = { us: st.fired || {}, de: st.deFired || {} };
    for (const side of ['us', 'de']) for (const which of ['artillery', 'mortars']) {
      const gun = support[side][which], n = left[side][which];
      gun.rounds.forEach((r, k) => { r.visible = k < n; });
      // Out of rounds: the gun isn't on the table this hour (Steve); it comes back when more arrive
      gun.model.visible = n > 0;
      gun.name.visible = n > 0;
      // Fired this hour: greyed out like a piece that has moved (Steve)
      greyOut(gun.model, !!fired[side][which]);
    }
  }

  // Where a side's mortar or gun fires from: just in front of the model, at the muzzle
  function muzzle(f) {
    const side = f.side === 'de' ? 'de' : 'us', which = f.support === 'artillery' ? 'artillery' : 'mortars';
    const spot = GUNS[side][which], d = gunDir(side), reach = which === 'artillery' ? 0.32 : 0.12;
    return new T.Vector3(spot.x + d.x * reach, which === 'artillery' ? 0.16 : 0.15, spot.z + d.z * reach);
  }

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
    // Barbed-wire fences: wooden posts, two twisted strands with barbs, and a coil of concertina wire along the foot
    const posts = [], strands = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (!Sim.inside(x + dx, y + dy) || !Sim.wire(st, x, y, x + dx, y + dy)) continue;
        const along = dx ? 'z' : 'x', cx = dx ? x + 1 : x + 0.5, cz = dx ? y + 0.5 : y + 1;
        // A point `a` along the fence, `h` up, `s` to one side
        const pt = (a, h, s = 0) => (along === 'z' ? new T.Vector3(cx + s, h, cz + a) : new T.Vector3(cx + a, h, cz + s));
        for (let a = -0.45; a <= 0.46; a += 0.15) posts.push(new T.Matrix4().compose(pt(a, 0.045), new T.Quaternion(), new T.Vector3(1, 1, 1)));
        // Each strand kinks and wanders, with a barb (a little cross) every few steps
        for (const h of [0.055, 0.075]) {
          let prev = pt(-0.45, h);
          for (let k = 1; k <= 90; k++) {
            const a = -0.45 + k * 0.01;
            const next = pt(a, h + 0.005 * Math.sin(k * 1.7 + h * 100), 0.005 * Math.cos(k * 1.3));
            strands.push(prev, next);
            prev = next;
            if (k % 4 === 0) strands.push(pt(a, h - 0.005, -0.004), pt(a, h + 0.005, 0.004), pt(a, h + 0.005, -0.004), pt(a, h - 0.005, 0.004));
          }
        }
        // The concertina: a loose coil rolled along the bottom, its loops leaning back and forth
        let prev = null;
        for (let i = 0; i <= 900; i++) {
          const turn = i * Math.PI * 2 / 36;
          const a = -0.45 + i * 0.001 + 0.012 * Math.sin(turn);
          const next = pt(a, 0.03 + 0.028 * Math.cos(turn), 0.028 * Math.sin(turn));
          if (prev) strands.push(prev, next);
          prev = next;
        }
      }
    }
    if (posts.length) {
      const pm = new T.InstancedMesh(new T.CylinderGeometry(0.004, 0.005, 0.09, 6), Models.M.wood, posts.length);
      posts.forEach((mm, k) => pm.setMatrixAt(k, mm)); pm.castShadow = true;
      hedgeGroup.add(pm);
      hedgeGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(strands), new T.LineBasicMaterial({ color: 0x5e5e58 })));
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
  // Each piece stands at its place in the field (Steve): a corner, the middle of an edge, or the centre. A platoon's three
  // bases cluster round it, a tank pair side by side, a team on its own; loose, shuffled each time they move
  function arrange(st, x, y) {
    const here = Sim.at(st, x, y);
    const loose = (u, k) => { const R = seeded(u.id.length * 977 + x * 131 + y * 71 + k * 7 + u.id.charCodeAt(0)); return [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05, (R() - 0.5) * 0.5]; };
    for (const u of here) {
      const g = model(u), p = Sim.placeXY(u.at);
      if (u.kind === 'company') {
        // Pulled in a little from the edge, so the bases sit just inside the hedge
        const cx = 0.5 + p.x * 0.24, cz = 0.5 + p.y * 0.24;
        const spread = [[-0.11, -0.09], [0.11, -0.07], [0, 0.11]];
        g.userData.bases.forEach((b, i) => { const [jx, jz, jr] = loose(u, i); b.visible = i < shownStrength(u); aim(b, cx + spread[i][0] + jx, cz + spread[i][1] + jz, g.userData.face + jr); });
      } else if (Sim.isTank(u)) {
        const cx = 0.5 + p.x * 0.22, cz = 0.5 + p.y * 0.22;
        const facing = u.aim !== undefined ? u.aim : g.userData.face;
        g.userData.bases.forEach((b, i) => { const [jx, jz, jr] = loose(u, i); b.visible = i < shownStrength(u); aim(b, cx + jx, cz + (i ? 0.11 : -0.11) + jz, facing + jr * 0.4); });
      } else {
        aim(g.userData.bases[0], 0.5 + p.x * 0.33, 0.5 + p.y * 0.33, g.userData.face);
      }
      aim(g, x, y, 0);
    }
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
      // On a longer move, through each field of the way in turn
      const way = o.userData.way;
      if (way && way.length && Math.hypot(way[0].x - o.position.x, way[0].z - o.position.z) < 0.12) way.shift();
      const to = way && way.length ? Object.assign({}, way[0], { ry: o.userData.to.ry }) : o.userData.to;
      if (!to) return;
      const dx = to.x - o.position.x, dz = to.z - o.position.z, dr = to.ry - o.rotation.y, dy = (to.y || 0) - o.position.y;
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dr) + Math.abs(dy) < 0.002) { o.position.x = to.x; o.position.z = to.z; o.position.y = to.y || 0; o.rotation.y = to.ry; return; }
      o.position.x += dx * k; o.position.z += dz * k; o.rotation.y += dr * k; o.position.y += dy * Math.min(1, k * 2.5);
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

  // A piece that has had its move this hour is greyed out: every material swapped for a dull grey copy, and back again
  const greyCache = {};
  function greyOut(g, grey) {
    if (g.userData.greyed === grey) return;
    g.userData.greyed = grey;
    g.traverse(c => {
      if (!c.isMesh) return;
      if (grey) {
        c.userData.orig = c.material;
        const swap = m => {
          if (!greyCache[m.uuid]) {
            const k = m.clone();
            if (k.color) { const l = k.color.r * 0.3 + k.color.g * 0.59 + k.color.b * 0.11; k.color.setRGB(l * 0.8 + 0.06, l * 0.8 + 0.06, l * 0.8 + 0.06); }
            if (k.map) k.map = null;
            k.transparent = true; k.opacity = 0.75;
            greyCache[m.uuid] = k;
          }
          return greyCache[m.uuid];
        };
        c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material);
      } else if (c.userData.orig) c.material = c.userData.orig;
    });
  }

  function updatePieces(st) {
    let ran = false, drove = false;
    for (const u of st.units) {
      const g = u.x === null ? pieces[u.id] : model(u);
      const h = holding(u.id);
      if (g) { g.visible = h ? h.visible : u.x !== null; greyOut(g, u.side === 'us' && u.acted); }
      // Taking cover: every figure crouches (tanks stay as they are)
      if (g && !Sim.isTank(u)) for (const b of g.userData.bases) b.scale.y = b.scale.x * (u.down ? 0.6 : 1);
      // A piece that has changed field: men run, tanks rumble (each sound once a frame, however many moved)
      const where = u.x === null ? null : u.x + ',' + u.y;
      if (g && g.userData.field !== undefined && g.userData.field !== where && where) { if (Sim.isTank(u)) drove = true; else ran = true; g.userData.newTrail = u.trail || []; g.userData.fromField = g.userData.field; }
      if (g) g.userData.field = where;
    }
    if (ran) Sound.play('run');
    if (drove) Sound.play('tank');
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) arrange(st, x, y);
    // The way a piece that just moved goes: through each field it passed, keeping its place in the field
    for (const u of st.units) {
      const g = pieces[u.id];
      if (!g || !g.userData.newTrail || u.x === null) continue;
      const offX = g.userData.to.x - u.x, offZ = g.userData.to.z - u.y;
      // Every field of the way; where men cross a hedge they hop up over it (Steve)
      const [fx, fy] = (g.userData.fromField || '').split(',').map(Number);
      const fields = [{ x: fx, y: fy }, ...g.userData.newTrail, { x: u.x, y: u.y }];
      const way = [];
      for (let i = 1; i < fields.length; i++) {
        const a = fields[i - 1], b = fields[i];
        const climbs = !Sim.isTank(u) && Number.isFinite(a.x) && Sim.adjacent(a, b) && Sim.hedge(st, a.x, a.y, b.x, b.y);
        if (climbs) {
          const ex = (a.x + b.x) / 2 + offX, ez = (a.y + b.y) / 2 + offZ, dx = (b.x - a.x) * 0.12, dz = (b.y - a.y) * 0.12;
          way.push({ x: ex - dx, z: ez - dz, y: 0.14 }, { x: ex + dx, z: ez + dz, y: 0.14 });
        }
        if (i < fields.length - 1) way.push({ x: b.x + offX, z: b.y + offZ, y: 0 });
      }
      g.userData.way = way;
      g.userData.newTrail = null;
    }
    for (const u of st.units) {
      if (!pieces[u.id]) continue;
      const big = u.kind === 'company' || Sim.isTank(u);
      const side = u.side === 'us' ? 1 : -1;
      marker(u, ':shock', '#9b2a22', '!', u.shocked, big ? 0.06 * side : 0.12 * side, big ? 0.12 : 0.24);
      marker(u, ':elite', '#b38a2e', '★', u.quality === 'elite' && u.kind === 'company', 0.06 * side, 0.93);
    }
  }

  // ---------- Highlights on the table ----------
  // Red diagonal hatching for the fields a Move & shoot can go to (fire from there)
  const hatchTex = {};
  // Diagonal stripes: red for Move & shoot, blue for the village to take
  function hatch(colour = 'rgba(232,53,42,.85)') {
    if (!hatchTex[colour]) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.strokeStyle = colour; g.lineWidth = 10;
      for (let k = -128; k < 256; k += 32) { g.beginPath(); g.moveTo(k, 128); g.lineTo(k + 128, 0); g.stroke(); }
      hatchTex[colour] = new T.CanvasTexture(c);
      hatchTex[colour].wrapS = hatchTex[colour].wrapT = T.RepeatWrapping;
    }
    return hatchTex[colour];
  }
  const MARK = { hatch: '#e8352a', goal: '#3c96ff', assault: '#ff2a1a', cover: '#7dff5a', line: '#7dff5a', move: '#7fc6e0', charge: '#e0705f', shoot: '#e6c95a', rally: '#8fd47a', fire: '#e8a05a', breach: '#c9a46a', attach: '#b9a0e0', select: '#fff6dc', hover: '#ffffff', blast: '#ff5a1e', splash: '#ff9a3c', reach: '#8fd47a' };

  // A coloured square of light on a field, with a brighter rim
  function mark(x, y, kind, inset = 0.05) {
    const c = new T.Color(MARK[kind]);
    const striped = kind === 'hatch' || kind === 'goal';
    const plane = new T.Mesh(new T.PlaneGeometry(1 - inset * 2, 1 - inset * 2), striped
      ? new T.MeshBasicMaterial({ map: hatch(kind === 'goal' ? 'rgba(60,150,255,.9)' : undefined), transparent: true, opacity: 0.8, depthWrite: false })
      : new T.MeshBasicMaterial({ color: c, transparent: true, opacity: kind === 'hover' ? 0.06 : kind === 'reach' ? 0.22 : kind === 'blast' ? 0.4 : kind === 'assault' || kind === 'splash' || kind === 'rally' ? 0.32 : 0.16, depthWrite: false }));
    at(plane, x + 0.5, 0.004, y + 0.5, -Math.PI / 2, 0, 0); marks.add(plane);
    // The pointer's field and the captain's reach are a plain wash, no rim
    if (kind === 'hover' || kind === 'reach') return;
    const s = 0.5 - inset, pts = [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]].map(([a, b]) => new T.Vector3(x + 0.5 + a, 0.006, y + 0.5 + b));
    marks.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95 })));
  }

  // Over a field a piece can move to: where it would stand (by the hedge under the pointer, or in the open), and
  // whether that is cover: a bright green bar along a hedge it would line, the field outlined green in houses or trees
  function showStand(st, view) {
    const h = view.hover;
    const spot = h && (view.spots || []).find(s => s.x === h.x && s.y === h.y && ['charge', 'hatch', 'line', 'goal'].includes(s.kind));
    if (!spot) return;
    const type = Sim.tileType(h.x, h.y);
    const inCover = ['village', 'hamlet', 'orchard'].includes(type);
    const green = new T.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false });
    // A bar along each hedge it would line (two in a corner where both edges have one)
    let byHedge = false;
    for (const d of (h.side || '').split('')) {
      const v = Sim.DIRS[d];
      if (!Sim.inside(h.x + v[0], h.y + v[1]) || !Sim.hedge(st, h.x, h.y, h.x + v[0], h.y + v[1])) continue;
      byHedge = true;
      const along = d === 'n' || d === 's';
      const bar = new T.Mesh(new T.PlaneGeometry(along ? 0.9 : 0.11, along ? 0.11 : 0.9), green);
      at(bar, h.x + 0.5 + v[0] * 0.36, 0.02, h.y + 0.5 + v[1] * 0.36, -Math.PI / 2, 0, 0); marks.add(bar);
    }
    // A ring where it would stand
    const p = Sim.placeXY(h.side);
    const ring = new T.Mesh(new T.RingGeometry(0.1, 0.14, 32), new T.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    at(ring, h.x + 0.5 + p.x * 0.3, 0.02, h.y + 0.5 + p.y * 0.3, -Math.PI / 2, 0, 0); marks.add(ring);
    if (inCover) mark(h.x, h.y, 'cover', 0.08);
    const text = byHedge ? 'Cover: hedge' : inCover ? `Cover: ${type === 'orchard' ? 'trees' : 'houses'}` : 'In the open';
    const w = word(text, byHedge || inCover ? '#9dff7a' : '#f0e8d6', false);
    w.position.set(h.x + 0.5 + p.x * 0.2, 0.32, h.y + 0.5 + p.y * 0.2);
    marks.add(w);
  }

  // Thin red lines from the shooter to each target in sight, the one under the pointer brighter
  function sightLines(shooter, list, hot) {
    const from = pieceCentre(shooter);
    for (const t of list) {
      const to = pieceCentre(t), lit = hot && hot.id === t.id;
      const pts = [new T.Vector3(from.x, 0.16, from.z), new T.Vector3(to.x, 0.16, to.z)];
      const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: lit ? 0xff5a40 : 0xe8352a, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: lit ? 1 : 0.7, depthTest: false }));
      line.computeLineDistances();
      marks.add(line);
    }
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

  // "5+": the score each die needs, in a small red label, and under it why (Steve): "−1 cover · −1 long range"
  const labelTex = {};
  // A word bubble (Steve): the score in big figures, why under it, and a pointed tail at the bottom (tailDown) or top,
  // towards the target. The sprite's anchor is the tip of the tail
  function needLabel(n, why = [], tailDown = true) {
    const key = n + '|' + why.join(',') + '|' + tailDown;
    if (!labelTex[key]) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const reason = why.join(' · ');
      g.font = 'bold 30px Georgia, serif';
      const tail = 26, boxH = why.length ? 96 : 60;
      c.width = Math.max(128, Math.ceil(g.measureText(reason).width) + 36); c.height = boxH + tail + 8;
      const top = tailDown ? 4 : tail + 4, mid = c.width / 2;
      // The bubble and its tail in one shape, with a pale outline
      g.beginPath();
      g.roundRect(4, top, c.width - 8, boxH, 16);
      if (tailDown) { g.moveTo(mid - 16, top + boxH - 1); g.lineTo(mid, c.height - 2); g.lineTo(mid + 16, top + boxH - 1); }
      else { g.moveTo(mid - 16, top + 1); g.lineTo(mid, 2); g.lineTo(mid + 16, top + 1); }
      g.fillStyle = 'rgba(150,25,20,.94)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,230,200,.85)'; g.stroke();
      g.fillStyle = '#fff4e8'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(n >= 6 ? '6' : n + '+', mid, top + 30);
      if (why.length) { g.font = 'bold 30px Georgia, serif'; g.fillStyle = '#ffd9a0'; g.fillText(reason, mid, top + 70); }
      labelTex[key] = { map: new T.CanvasTexture(c), w: c.width, h: c.height };
    }
    const t = labelTex[key];
    const s = new T.Sprite(new T.SpriteMaterial({ map: t.map, transparent: true, depthTest: false }));
    s.scale.set(0.45 * t.w / 128, 0.45 * t.h / 128, 1);
    s.center.set(0.5, tailDown ? 0 : 1);
    return s;
  }

  // A mortar or artillery line of fire (Steve: an arc): a dashed curve from the gun off the board, the way its rounds fly
  function fireArc(f, target, lit) {
    const to = pieceCentre(target);
    const pts = [];
    for (let k = 0; k <= 30; k++) pts.push(shellAt(f, to, k / 30));
    const arc = new T.Group();
    const line = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineDashedMaterial({ color: lit ? 0xff5a40 : 0xe8352a, dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: lit ? 1 : 0.75, depthTest: false }));
    line.computeLineDistances();
    arc.add(line);
    // Beads of light along it, so the curve shows clearly against the table
    for (let k = 1; k < 30; k += 2) {
      const bead = glow(lit ? 'rgba(255,110,80,1)' : 'rgba(232,60,40,.9)');
      bead.material.depthTest = false;
      bead.scale.setScalar(lit ? 0.07 : 0.05);
      bead.position.copy(pts[k]);
      arc.add(bead);
    }
    return arc;
  }

  // A word bubble's arrow (Steve: pointy, a triangle, not a line): wide where it leaves the bubble, a point at the target
  function wedge(from, to, width, colour) {
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz) || 1;
    const px = -dz / len * width / 2, pz = dx / len * width / 2;
    const g = new T.BufferGeometry().setFromPoints([new T.Vector3(from.x + px, from.y, from.z + pz), new T.Vector3(from.x - px, from.y, from.z - pz), to]);
    const m = new T.Mesh(g, new T.MeshBasicMaterial({ color: colour, side: T.DoubleSide, transparent: true, opacity: 0.94, depthTest: false }));
    m.renderOrder = 5;
    return m;
  }

  // Where a target's red cross-hair floats
  const reticleSpot = u => { const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u); return new T.Vector3(p.x, big ? 0.62 : 0.5, p.z); };

  // The red target nearest the pointer on the screen, within easy reach (a cross-hair over a house can be clicked)
  function targetAt(list, clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    let best = null, bestD = 70;
    for (const u of list) {
      const p = reticleSpot(u).project(camera);
      const d = Math.hypot(r.left + (p.x + 1) / 2 * r.width - clientX, r.top + (1 - p.y) / 2 * r.height - clientY);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  function markTargets(list, hot) {
    const pulse = 1 + 0.08 * Math.sin(performance.now() / 180);
    for (const u of list) {
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u), lit = hot && hot.id === u.id;
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.26 : 0.17, big ? 0.32 : 0.22, 48), new T.MeshBasicMaterial({ color: 0xe8352a, transparent: true, opacity: 0.9, depthWrite: false }));
      at(ring, p.x, 0.008, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
      // The cross-hair, bigger under the pointer
      const r = reticle(); r.scale.setScalar((big ? 0.62 : 0.5) * pulse * (lit ? 1.45 : 1)); r.position.copy(reticleSpot(u)); marks.add(r);
      // The score and why in a word bubble about three fields away (Steve), so it hides nothing near the target: up the
      // board for a target in the near half, down it for one in the far half, with a line from the tail to the cross-hair
      if (u.needNow) {
        const { farHalf, anchor } = labelAnchor(u);
        const l = needLabel(u.needNow, u.needWhy || [], !farHalf);
        l.position.copy(anchor); l.renderOrder = 6; marks.add(l);
        marks.add(wedge(anchor, reticleSpot(u), 0.2, lit ? 0xc0261c : 0x961914));
      }
    }
  }

  // Where a target's score bubble sits: about three fields up the board from a target in the near half, down it in the far half
  function labelAnchor(u) {
    const p = pieceCentre(u), farHalf = u.y < ROWS / 2;
    return { farHalf, anchor: new T.Vector3(p.x, 0.3, Math.max(0.4, Math.min(ROWS - 0.4, p.z + (farHalf ? 2.6 : -2.6)))) };
  }

  // The box a target's score bubble covers on the page, so the piece menu can keep clear of it
  function labelBox(u) {
    const { farHalf, anchor } = labelAnchor(u);
    const l = needLabel(u.needNow, u.needWhy || [], !farHalf);
    // The bubble faces the camera: it spreads along the camera's right, and up from its tail (or down, in the far half)
    camera.updateMatrixWorld();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const tall = l.scale.y * (farHalf ? -1 : 1);
    const corners = [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]].map(([a, b]) => anchor.clone().addScaledVector(right, a * l.scale.x).addScaledVector(up, b * tall));
    const pts = corners.map(v => screenPoint(v.x, v.z, v.y));
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    l.material.dispose();
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  // ---------- Shooting on the table ----------
  // Each new shot plays once: a muzzle flash at the shooter, then tracers (rifles a few, machine guns a stream) or one
  // glowing shell (tanks and guns) or a rocket trail flying to the target; where it lands, dust and sparks for bullets,
  // a bright strike on armour, or a high-explosive burst with smoke when a gun fires on men. Artillery and mortars burst only
  const glowTex = {};
  function glow(colour) {
    if (!glowTex[colour]) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, colour); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      glowTex[colour] = new T.CanvasTexture(c);
    }
    return new T.Sprite(new T.SpriteMaterial({ map: glowTex[colour], transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  }
  const smokeTex = (() => { let t = null; return () => {
    if (!t) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(110,104,96,.9)'); r.addColorStop(1, 'rgba(110,104,96,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); t = new T.CanvasTexture(c); }
    return t; }; })();

  // Words floating up off a target: a canvas label on a sprite, drawn once for each word and colour
  const wordTex = {};
  function word(text, colour, big) {
    const key = text + colour + big;
    if (!wordTex[key]) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const g = c.getContext('2d');
      g.font = `bold ${big ? 74 : 60}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = 'rgba(20,14,8,.85)'; g.strokeText(text, 256, 66);
      g.fillStyle = colour; g.fillText(text, 256, 66);
      wordTex[key] = new T.CanvasTexture(c);
    }
    const s = new T.Sprite(new T.SpriteMaterial({ map: wordTex[key], transparent: true, depthTest: false }));
    s.scale.set(big ? 1.05 : 0.78, (big ? 1.05 : 0.78) / 4, 1);
    return s;
  }
  const RESULT_COLOUR = { 'Missed': '#d8d2c4', 'No effect': '#e6d29a', 'Pinned': '#ffb04a', 'Section lost': '#ff6a50', 'Tank knocked out': '#ff6a50', 'Wiped out': '#ff3b2e', 'Destroyed': '#ff3b2e' };

  let shots = [];              // effects playing: { fx, t0 }
  // A piece hit keeps its look until the shot at it lands (Steve): piece id → { until, count, visible }
  const held = {};
  function holding(id) {
    const h = held[id];
    if (!h) return null;
    if (performance.now() < h.until) return h;
    delete held[id];
    return null;
  }
  // How many bases of a piece to show: what it had until the shot lands, then what it has
  const shownStrength = u => { const h = holding(u.id); return h ? h.count : u.platoons; };
  const seenFx = new WeakSet();

  function startShots(st) {
    for (const f of st.fx) {
      if (seenFx.has(f)) continue;
      seenFx.add(f);
      // A tank or gun turns to face what it fires at, and stays facing it
      const shooter = f.from && st.units.find(u => u.id === f.from.id);
      if (shooter && (Sim.isTank(shooter) || shooter.kind === 'pak')) shooter.aim = Math.atan2(-(f.y - f.from.y), f.x - f.from.x);
      const t0 = performance.now() + shots.filter(s => performance.now() - s.t0 < 300).length * 180;
      shots.push({ f, t0, objs: [] });
      // The target keeps its bases (or stays on the table) until this shot lands
      const target = f.to && pieces[f.to.id];
      if (target) {
        const land = f.from ? (f.weapon === 'gun' ? 0.25 : f.weapon === 'rocket' ? 0.45 : 0.35) : f.kind === 'shell' ? shellFlight(f) : 0;
        const until = t0 + (land + 0.15) * 1000;
        const before = held[f.to.id];
        held[f.to.id] = {
          until: Math.max(until, before ? before.until : 0),
          count: before ? before.count : target.userData.bases.filter(b => b.visible).length,
          visible: before ? before.visible : target.visible,
        };
      }
      // The sounds: the weapon firing, then what it does when it lands (same timing as the picture)
      const wait = (t0 - performance.now()) / 1000;
      if (f.from) {
        const flight = f.weapon === 'gun' ? 0.25 : f.weapon === 'rocket' ? 0.45 : 0.35;
        Sound.play(f.weapon === 'mg' && f.side === 'de' ? 'mg42' : f.weapon, wait);
        Sound.play(f.armour && f.weapon === 'gun' ? 'clang' : f.weapon === 'gun' || f.weapon === 'rocket' ? 'he' : 'bullets', wait + flight);
      } else if (f.kind === 'shell') {
        // Fire support: the first round of a mission is heard fired and coming in; up to four rounds are heard landing
        const flight = shellFlight(f);
        const sameMission = shots.filter(s => s.f.kind === 'shell' && !s.f.from && Math.abs(s.t0 - t0) < 1500).length;
        if (sameMission === 1) {
          Sound.play(f.support === 'artillery' ? 'distantGun' : 'mortar', wait);
          Sound.play('incoming', wait + 0.25, flight - 0.25);
        }
        if (sameMission <= 4) Sound.play('he', wait + flight, f.support === 'artillery');
      }
    }
  }

  // How long a mortar bomb or an artillery shell is in the air, seen arcing in
  const shellFlight = f => (f.support === 'artillery' ? 1.6 : 1.3);

  // Where a round is on its way, p from 0 (leaving the mortar or gun off the board) to 1 (landing): mortar bombs go up
  // high and drop steeply, artillery shells on a long arc
  function shellAt(f, to, p) {
    const from = muzzle(f), far = Math.hypot(to.x - from.x, to.z - from.z);
    const high = f.support === 'artillery' ? 1.2 + far * 0.1 : 1.8 + far * 0.08;
    return new T.Vector3(T.MathUtils.lerp(from.x, to.x, p), T.MathUtils.lerp(from.y, 0.05, p) + high * 4 * p * (1 - p), T.MathUtils.lerp(from.z, to.z, p));
  }

  // Dirt thrown up by a burst: dark puffs
  const dirtMat = () => new T.SpriteMaterial({ map: smokeTex(), color: 0x3a2c1c, transparent: true, depthWrite: false });
  const ringGeo = new T.RingGeometry(0.8, 1, 40);

  // Where a shot leaves from and lands: the middle of the pieces' bases, a little above the table
  function shotEnds(f) {
    const tu = { id: f.to && f.to.id, x: f.x, y: f.y, kind: f.armour ? 'sherman' : 'company' };
    const to = pieces[tu.id] ? pieceCentre(tu) : new T.Vector3(f.x + 0.5, 0, f.y + 0.5);
    let from = null;
    if (f.from) from = pieces[f.from.id] ? pieceCentre({ id: f.from.id, x: f.from.x, y: f.from.y }) : new T.Vector3(f.from.x + 0.5, 0, f.from.y + 0.5);
    return { from, to };
  }

  function playShots(now) {
    for (const s of shots) { for (const o of s.objs) marks.remove(o); s.objs = []; }
    shots = shots.filter(s => now - s.t0 < 5000);
    for (const s of shots) {
      const f = s.f, t = (now - s.t0) / 1000;
      if (t < 0) continue;
      const add = o => { marks.add(o); s.objs.push(o); return o; };
      const { from, to } = shotEnds(f);
      // A tank firing: it has turned to its target (see startShots); for a moment it rocks back with the recoil
      if (from && f.weapon === 'gun' && pieces[f.from.id] && t < 0.35) {
        const back = Math.sin(Math.min(1, t / 0.35) * Math.PI) * 0.04, d = new T.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
        for (const b of pieces[f.from.id].userData.bases) if (b.userData.to) { b.position.x = b.userData.to.x - d.x * back; b.position.z = b.userData.to.z - d.z * back; }
      }
      const h = f.weapon === 'gun' ? 0.16 : 0.12;
      const flight = f.weapon === 'gun' ? 0.25 : f.weapon === 'rocket' ? 0.45 : 0.35;
      // Muzzle flash
      if (from && t < 0.12) { const m = add(glow('rgba(255,200,90,.95)')); m.scale.setScalar(f.weapon === 'gun' ? 0.32 : 0.16); m.position.set(from.x + 0.05, h, from.z); }
      // Tracers, a shell or a rocket on its way
      if (from && t < flight + 0.2) {
        const n = f.weapon === 'mg' ? 9 : f.weapon === 'rifle' ? 4 : 1;
        for (let k = 0; k < n; k++) {
          const tk = t - k * (f.weapon === 'mg' ? 0.035 : 0.07);
          if (tk < 0 || tk > flight) continue;
          const p = tk / flight, spread = (k % 3 - 1) * 0.03;
          const head = new T.Vector3(T.MathUtils.lerp(from.x, to.x, p), h - 0.04 * p + 0.05 * Math.sin(p * Math.PI) * (f.weapon === 'rocket' ? 1 : 0.3), T.MathUtils.lerp(from.z, to.z, p) + spread);
          const back = Math.max(0, p - (f.weapon === 'gun' ? 0.18 : 0.1));
          const tail = new T.Vector3(T.MathUtils.lerp(from.x, to.x, back), h - 0.04 * back, T.MathUtils.lerp(from.z, to.z, back) + spread);
          // The streak: glowing beads from tail to head, red tracer for the Americans, green for the Germans, a white-hot shell
          const colour = f.weapon === 'gun' ? 'rgba(255,236,170,1)' : f.weapon === 'rocket' ? 'rgba(255,170,90,1)' : f.side === 'de' ? 'rgba(120,255,110,1)' : 'rgba(255,70,40,1)';
          for (let b = 0; b <= 4; b++) {
            const bead = add(glow(colour));
            bead.scale.setScalar((f.weapon === 'gun' ? 0.1 : 0.06) * (0.45 + b * 0.14));
            bead.position.lerpVectors(tail, head, b / 4);
          }
          if (f.weapon === 'rocket') { const sm = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.6 }))); sm.scale.setScalar(0.08); sm.position.copy(tail); }
        }
      }
      // A mortar bomb or shell arcing in: a glowing round with a trail of smoke behind it
      const land = from ? flight : f.kind === 'shell' ? shellFlight(f) : 0, lt = t - land;
      if (!from && f.kind === 'shell' && lt < 0) {
        const p = t / land;
        // The flash and smoke as it fires, at the mortar or gun off the board
        if (t < 0.15) { const m = add(glow('rgba(255,200,90,.95)')); m.scale.setScalar(f.support === 'artillery' ? 0.35 : 0.2); m.position.copy(muzzle(f)); }
        if (t < 0.9) { const sm = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.6 - t * 0.6 }))); sm.scale.setScalar(0.12 + t * 0.3); sm.position.copy(muzzle(f)).add(new T.Vector3(0, t * 0.2, 0)); }
        for (let b = 0; b < 6; b++) {
          const bead = add(glow('rgba(255,215,150,1)'));
          bead.scale.setScalar(0.09 * (1 - b * 0.14));
          bead.position.copy(shellAt(f, to, Math.max(0, p - b * 0.012)));
        }
        for (let b = 1; b <= 4; b++) {
          if (p - b * 0.05 < 0) continue;
          const sm = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.35 - b * 0.07 })));
          sm.scale.setScalar(0.07 + b * 0.02);
          sm.position.copy(shellAt(f, to, p - b * 0.05));
        }
      }
      // Where it lands
      if (lt < 0) continue;
      // The words: each die in turn, Hit or Miss, rising and fading; then what it did, bigger
      if (f.faces) {
        const n = Math.min(f.faces.length, 8);
        f.faces.slice(0, n).forEach((r, k) => {
          const wt = lt - k * 0.14;
          if (wt < 0 || wt > 1.1) return;
          const w = add(word(r.hit ? 'Hit!' : 'Miss', r.hit ? '#ffcf6a' : '#cfcac0', false));
          w.material.opacity = Math.min(1, 2.5 * (1.1 - wt));
          w.position.set(to.x + ((k % 3) - 1) * 0.3, 0.38 + wt * 0.4 + Math.floor(k / 3) * 0.12, to.z);
        });
        const rt = lt - n * 0.14 - 0.1;
        if (f.result && rt > 0 && rt < 1.6) {
          const w = add(word((f.tookCover ? 'Took cover · ' : '') + f.result, RESULT_COLOUR[f.result] || '#ffffff', true));
          w.material.opacity = Math.min(1, 2 * (1.6 - rt));
          w.position.set(to.x, 0.75 + rt * 0.15, to.z);
        }
      }
      const big = f.kind === 'shell' || (f.weapon === 'gun' && !f.armour) || f.weapon === 'rocket';
      if (big) explosion(add, f, to, lt); else if (f.armour && f.weapon === 'gun') {
        // A shell striking armour: a white-hot spark
        if (lt < 0.25) { const b = add(glow('rgba(255,255,220,1)')); b.scale.setScalar(0.25 * (1 - lt * 2)); b.position.set(to.x, 0.12, to.z); }
      } else if (lt < 0.6) {
        // Bullets: little spurts of dust round the target
        for (let k = 0; k < (f.weapon === 'mg' ? 6 : 3); k++) { const d = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.6 - lt }))); d.scale.setScalar(0.05 + lt * 0.1); d.position.set(to.x + Math.sin(k * 2.3) * 0.12, 0.03 + lt * 0.05, to.z + Math.cos(k * 1.7) * 0.1); }
      }
    }
    return shots.length > 0;
  }

  // High explosive going off: how big depends on what it was (artillery biggest, then mortars, a tank's shell, a rocket)
  function explosion(add, f, to, lt) {
    const size = f.support === 'artillery' ? 1 : f.kind === 'shell' ? 0.8 : f.weapon === 'gun' ? 0.75 : 0.55;
    // The flash
    if (lt < 0.12) { const b = add(glow('rgba(255,250,220,1)')); b.material.depthTest = false; b.scale.setScalar(1.3 * size); b.position.set(to.x, 0.15, to.z); }
    // The ball of fire, swelling and dying
    if (lt < 0.7) {
      const b = add(glow('rgba(255,100,20,1)'));
      b.material.depthTest = false;
      b.scale.setScalar(size * (0.5 + lt * 1.8) * (1 - lt / 0.9));
      b.position.set(to.x, 0.12 + lt * 0.3, to.z);
    }
    // The blast ring racing out across the ground
    if (lt < 0.45) {
      const r = add(new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.6 * (1 - lt / 0.45), depthWrite: false })));
      r.scale.setScalar(size * (0.1 + lt * 1.6));
      at(r, to.x, 0.012, to.z, -Math.PI / 2, 0, 0);
    }
    // Earth thrown up in clods that fall back
    if (lt < 1.4) {
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4, out = (0.3 + (k % 4) * 0.12) * size, up = (1.4 + (k % 3) * 0.4) * size;
        const y = up * lt - 2.6 * lt * lt;
        if (y < 0) continue;
        const c = add(new T.Sprite(dirtMat()));
        c.scale.setScalar(0.05 * size);
        c.position.set(to.x + Math.cos(a) * out * lt, 0.05 + y, to.z + Math.sin(a) * out * lt);
      }
    }
    // A column of smoke, rising, spreading and thinning out
    if (lt < 3.4) {
      for (let k = 0; k < 6; k++) {
        const age = lt - k * 0.08;
        if (age < 0) continue;
        const sm = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), color: 0x6a645e, transparent: true, depthWrite: false, opacity: Math.max(0, 0.9 - age * 0.26) })));
        sm.scale.setScalar(size * (0.3 + age * 0.35));
        sm.position.set(to.x + Math.sin(k * 2.1) * 0.08 * size + age * 0.04, 0.1 + age * (0.25 + k * 0.07) * size, to.z + Math.cos(k * 1.3) * 0.06 * size);
      }
    }
  }

  // ---------- Dice on the table ----------
  // The last three shots leave their dice in the target's field, six to a row along its near edge (a second shot at the
  // same field lines up behind the first). Hits are bright, misses dark, and a tag says who fired, what each die
  // needed and how many hit
  const DIE_SIZE = 4, DIE_GAP = 0.14;
  function showDice(st) {
    for (const d of dice) scene.remove(d);
    dice = [];
    const cursor = {};                                     // for each field, how far back the next shot's dice go
    for (const f of st.fx.filter(f => f.faces && f.faces.length).slice(-3)) {
      const key = f.x + ',' + f.y;
      let z = cursor[key] !== undefined ? cursor[key] : f.y + 0.9;
      // The dice, row by row
      f.faces.forEach((r, i) => {
        const d = Models.die(r.face); d.scale.setScalar(DIE_SIZE);
        at(d, f.x + 0.15 + (i % 6) * DIE_GAP, 0, z - Math.floor(i / 6) * DIE_GAP, 0, (i * 1.7) % 0.6 - 0.3, 0);
        // Misses are dimmed so the hits stand out
        if (!r.hit) d.traverse(c => { if (c.isMesh && c.material === Models.M.die) { c.material = c.material.clone(); c.material.color.multiplyScalar(0.4); } });
        scene.add(d); dice.push(d);
      });
      // The tag: a long word bubble a little up the board, with a pointed arrow to the middle of the dice (Steve)
      const rows = Math.ceil(f.faces.length / 6);
      const diceMid = new T.Vector3(f.x + 0.15 + (Math.min(6, f.faces.length) - 1) * DIE_GAP / 2, 0.03, z - (rows - 1) * DIE_GAP / 2);
      const tagZ = z - (rows - 1) * DIE_GAP - 0.55;
      const anchor = new T.Vector3(diceMid.x, 0.22, tagZ);
      const tag = diceTag(shotTagText(st, f), f.side);
      tag.position.copy(anchor); tag.renderOrder = 6;
      scene.add(tag); dice.push(tag);
      const arrow = wedge(anchor, diceMid, 0.16, f.side === 'de' ? 0x46484a : 0x1e3e6e);
      scene.add(arrow); dice.push(arrow);
      cursor[key] = tagZ - 0.3;
    }
  }

  // Clear the dice and their tags off the table (when the next piece is picked); they come back with the next shot
  function clearDice() {
    for (const d of dice) scene.remove(d);
    dice = [];
  }

  // ["1st Platoon", "needs 5+ · 2 hits"]: who fired, then the score each die needed and the hits
  function shotTagText(st, f) {
    const shooter = f.from ? st.units.find(u => u.id === f.from.id) : null;
    const who = shooter ? shooter.name
      : f.side === 'de' ? 'German mortars'
      : f.support === 'artillery' ? 'Our artillery' : 'Our mortars';
    const need = f.need >= 6 ? 'needs 6' : `needs ${f.need}+`;
    const hits = f.faces.filter(r => r.hit).length;
    return [who, `${need} · ${hits} hit${hits === 1 ? '' : 's'}`];
  }

  // The tag: a small rounded label, blue for our shots and grey for the Germans', drawn once for each text
  const tagTex = {};
  // A long word bubble on one line: who fired in white, the score and hits in gold; a pointed tail at the bottom middle,
  // where the sprite is anchored (the arrow carries on from it to the dice)
  function diceTag(lines, side) {
    const key = side + lines.join('/');
    if (!tagTex[key]) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const font = 'bold 40px Georgia, serif', sep = '  ·  ';
      g.font = font;
      const w0 = g.measureText(lines[0] + sep).width, w1 = g.measureText(lines[1]).width;
      const tail = 18, boxH = 64;
      c.width = Math.ceil(w0 + w1) + 48; c.height = boxH + tail + 6;
      const mid = c.width / 2;
      g.beginPath();
      g.roundRect(4, 4, c.width - 8, boxH, 20);
      g.moveTo(mid - 14, boxH + 3); g.lineTo(mid, c.height - 2); g.lineTo(mid + 14, boxH + 3);
      g.fillStyle = side === 'de' ? 'rgba(70,72,74,.94)' : 'rgba(30,62,110,.94)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(230,236,245,.8)'; g.stroke();
      g.font = font; g.textBaseline = 'middle';
      g.fillStyle = '#f4efe4'; g.fillText(lines[0] + sep, 24, 4 + boxH / 2);
      g.fillStyle = '#ffd98a'; g.fillText(lines[1], 24 + w0, 4 + boxH / 2);
      tagTex[key] = { map: new T.CanvasTexture(c), aspect: c.width / c.height };
    }
    const t = tagTex[key];
    const s = new T.Sprite(new T.SpriteMaterial({ map: t.map, transparent: true, depthTest: false }));
    s.scale.set(0.24 * t.aspect, 0.24, 1);
    s.center.set(0.5, 0);
    return s;
  }

  // view: { spots: [{ x, y, kind }], selected: piece, hover: { x, y }, blast: [{ x, y, main }] }. dt: seconds since the last frame.
  // Returns true while pieces are still gliding, so the page keeps drawing
  let lastT = 0;
  function render(st, view = {}) {
    const now = performance.now(), dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (!built || built.userData.seed !== st.seed) { for (const id in pieces) scene.remove(pieces[id]); for (const id in tokens) scene.remove(tokens[id]); pieces = {}; tokens = {}; build(st); buildSupport(); built.userData.seed = st.seed; }
    updateSupport(st);
    buildHedges(st);
    if (st.fxShown !== st.fx || st.fxCount !== st.fx.length) { showDice(st); startShots(st); st.fxShown = st.fx; st.fxCount = st.fx.length; }
    updatePieces(st);
    while (marks.children.length) marks.remove(marks.children[0]);
    if (view.hover) mark(view.hover.x, view.hover.y, 'hover', 0.02);
    for (const s of view.spots || []) mark(s.x, s.y, s.kind);
    // Where a shot that hits several pieces would land (Steve): the target's field bright, the fields its blast reaches paler
    for (const b of view.blast || []) mark(b.x, b.y, b.main ? 'blast' : 'splash', 0.03);
    showStand(st, view);
    gunRings(view.guns);
    if (view.selected && view.selected.x !== null && pieces[view.selected.id]) {
      const p = pieceCentre(view.selected), big = view.selected.kind === 'company' || Sim.isTank(view.selected);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.34 : 0.21, big ? 0.39 : 0.25, 56), new T.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.95, depthWrite: false }));
      at(ring, p.x, 0.009, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
    }
    if (view.targets && view.targets.length) markTargets(view.targets, view.hotTarget);
    // Shooting: a line of sight from the shooter to each target it can see
    if (view.shooter && view.shooter.x !== null && pieces[view.shooter.id]) sightLines(view.shooter, view.targets || [], view.hotTarget);
    // German mortars ranging on a piece: a line from their mortar off the board
    if (view.mortarAim && pieces[view.mortarAim.id]) marks.add(fireArc({ side: 'de', support: view.aimWhich || 'mortars' }, view.mortarAim, true));
    // Your mortars or artillery choosing a target: an arc from the gun to each one, the one under the pointer brighter
    if (view.fireFrom) for (const t of view.targets || []) if (pieces[t.id]) marks.add(fireArc({ side: 'us', support: view.fireFrom }, t, view.hotTarget && view.hotTarget.id === t.id));
    if (view.ready) for (const u of st.units) {
      if (u.side !== 'us' || u.x === null || !pieces[u.id]) continue;
      const can = view.ready(u);
      if (!can && !u.acted) continue;
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.3 : 0.17, big ? 0.335 : 0.195, 48), new T.MeshBasicMaterial({ color: can ? 0x7fd06a : 0x77776f, transparent: true, opacity: can ? 0.8 : 0.6, depthWrite: false }));
      at(ring, p.x, 0.006, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
    }
    const moving = glide(dt);
    const firing = playShots(now);
    const flying = moveCoin(now);
    renderer.render(scene, camera);
    if (firing || flying) return true;
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
    if (!Sim.inside(x, y)) return null;
    // Which of the nine places (Steve): thirds of the field across and down; a corner, an edge, or the middle (null)
    const fx = p.x - x, fz = p.z - y;
    const across = fx < 0.33 ? 'w' : fx > 0.67 ? 'e' : '', down = fz < 0.33 ? 'n' : fz > 0.67 ? 's' : '';
    const side = down + across || null;
    return { x, y, side };
  }

  // Which of your pieces is under a point on the page: the model the ray hits first, or else the nearest piece in that field
  function pieceAt(st, clientX, clientY, side = 'us') {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    const mine = st.units.filter(u => u.side === side && u.x !== null && pieces[u.id] && pieces[u.id].visible);
    const hits = ray.intersectObjects(mine.map(u => pieces[u.id]), true);
    if (hits.length) {
      // Climb from the mesh hit to the piece's own group
      for (let o = hits[0].object; o; o = o.parent) { const u = mine.find(m => pieces[m.id] === o); if (u) return u; }
    }
    const p = new T.Vector3();
    if (!ray.ray.intersectPlane(table, p)) return null;
    const fx = Math.floor(p.x), fy = Math.floor(p.z);
    const here = mine.filter(u => u.x === fx && u.y === fy);
    return here.sort((a, b) => pieceCentre(a).distanceTo(p) - pieceCentre(b).distanceTo(p))[0] || null;
  }

  // Where a field's top edge is on the page, for labels
  function screenPoint(x, y, h = 0) {
    const p = new T.Vector3(x, h, y).project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }

  return { init, resize, render, fieldAt, pieceAt, gunAt, targetAt, screenPoint, labelBox, clearDice, flyToken, clearToken, canvas: () => renderer.domElement };
})();
