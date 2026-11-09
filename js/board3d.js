// Hedgerow: the board as a wargame table in 3D. The whole board sits on the table, seen from one slanted camera.
// Fields are 1 unit square: field (x, y) covers x..x+1 across and y..y+1 into the table (three.js z)

const Board = (() => {
  const T = THREE, { at } = Models;
  const MEN = 2.45;     // the men are 1:54 models...
  const TANKS = 1.6;    // ...the tanks 1:76, so the men look big beside them, as on a real table
  let fxMarks, marksReady = false, shadowStale = true, wasBusy = true, pulsers = [];
  let renderer, scene, camera, el, hedgeGroup = null, hedgeKey = '', marks, pieces = {}, tokens = {}, dice = [], built = null;
  const ray = new T.Raycaster(), table = new T.Plane(new T.Vector3(0, 1, 0), 0);

  function init(container) {
    el = container;
    Models.materials();
    renderer = new T.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    // Shadows are only worked out again when something on the table has moved (see render)
    renderer.shadowMap.autoUpdate = false;
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
    fxMarks = new T.Group(); scene.add(fxMarks);
  }

  // How finely the table is drawn (Steve: a low-power laptop on a 4K screen ran poorly, and well in a smaller window). The
  // canvas always fills its box; on a big screen it is drawn with fewer pixels and stretched. See PIXELS in data.js
  let shownW = 0, shownH = 0, pixelBudget = PIXELS.start, frameGaps = [];
  function setResolution() {
    // The pixels the budget allows on this size of window
    renderer.setPixelRatio(pixelRatioFor(shownW, shownH, window.devicePixelRatio || 1, pixelBudget));
    renderer.setSize(shownW, shownH);
  }
  // Watch how long frames take while the table is being drawn without a break. Still slow after a good sample (the
  // middle frame, so one hard frame doesn't count): draw with fewer pixels, down to a floor. It doesn't come back up, so
  // the picture doesn't keep changing; a new page starts afresh. wanted: the last frame asked for another straight away
  function watchFrames(gap, wanted) {
    // The table was waiting for you (only moving the mouse now and then), or the tab was in the background: not slowness
    if (!wanted || gap > PIXELS.pause) { frameGaps = []; return; }
    frameGaps.push(gap);
    if (frameGaps.length < PIXELS.sample) return;
    const middle = frameGaps.sort((a, b) => a - b)[Math.floor(frameGaps.length / 2)];
    frameGaps = [];
    if (middle <= PIXELS.slowFrame) return;
    // What it draws now, not the budget: a small window may already be well under it
    const drawn = shownW * shownH * Math.pow(renderer.getPixelRatio(), 2);
    if (drawn <= PIXELS.least) return;
    pixelBudget = Math.max(PIXELS.least, drawn * PIXELS.step);
    setResolution();
  }

  // Fit the whole table in the box: the camera keeps its slant and backs off until every corner shows
  function resize(w, h) {
    shownW = w; shownH = h;
    setResolution();
    // (every fit from the plain camera: with the last shift still on, a resized window left the board higher up)
    camera.clearViewOffset();
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
    // Then the whole picture moved down a little (Steve: the top of the board was just out of sight; losing a little
    // of the table at the bottom doesn't matter). Picking and labels use the same camera, so they move with it
    camera.setViewOffset(w, h, 0, -h * BOARD_DOWN, w, h);
  }
  const BOARD_DOWN = 0.05;           // how far down the picture moves, as a share of the screen's height

  // ---------- The table: built once a game, hedges again when one is cut ----------

  // The mortars and artillery of each side, off the board behind its own back line, near the top (Steve): the Americans
  // left of the board, the Germans right. Where each stands, and where its pile of rounds goes (behind it)
  const GUNS = {
    us: { artillery: { x: -0.7, z: 2.55, pileX: -1.45, pileZ: 2.3 }, mortars: { x: -0.7, z: 4.05, pileX: -1.45, pileZ: 3.85 }, bomber: { x: -0.6, z: 5.5 } },
    de: { artillery: { x: COLS + 0.7, z: 2.55, pileX: COLS + 1.25, pileZ: 2.3 }, mortars: { x: COLS + 0.7, z: 4.05, pileX: COLS + 1.25, pileZ: 3.85 }, bomber: { x: COLS + 0.5, z: 5.5 } },
  };
  const GUN_NAMES = { us: { artillery: 'US artillery', mortars: 'US mortars', bomber: `US ${BOMBER_NAMES.us}` }, de: { artillery: 'German artillery', mortars: 'German mortars', bomber: `German ${BOMBER_NAMES.de}` } };
  const SUPPORT = ['artillery', 'mortars', 'bomber'];
  const PILE_MAX = 12;
  let support = null;           // side → which → { model, rounds: [] }

  // Facing: towards the board, the Americans' east, the Germans' west
  const gunFacing = side => (side === 'us' ? 0 : Math.PI);
  const gunDir = side => ({ x: side === 'us' ? 1 : -1, z: 0 });

  function buildSupport() {
    support = {};
    for (const side of ['us', 'de']) {
      support[side] = {};
      for (const which of SUPPORT) {
        const spot = GUNS[side][which];
        const makers = { artillery: Models.howitzer, mortars: Models.mortar, bomber: Models.bomberOnStand };
        const model = Models.mergeParts(makers[which](side));
        const sizes = { artillery: TANKS * 1.7, mortars: MEN * 1.3, bomber: 1 };
        model.scale.setScalar(sizes[which]);
        built.add(at(model, spot.x, 0, spot.z, 0, gunFacing(side), 0));
        // The pile of rounds beside it: shells standing in rows of three, mortar bombs lying in rows of four
        // (the bomber carries its own)
        const rounds = [];
        for (let k = 0; k < PILE_MAX && which !== 'bomber'; k++) {
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
        // (the plane stands near the edge of the screen: its name goes in towards the board)
        const nameOut = which === 'bomber' ? 0 : 0.2;
        name.position.set(spot.x + (side === 'us' ? -nameOut : nameOut), 0.05, spot.z + 0.55);
        built.add(name);
        support[side][which] = { model, rounds, name };
      }
    }
  }

  // Which of a side's mortars or artillery is under a point on the page: the model, or the table close round it
  function gunAt(clientX, clientY, side) {
    if (!support) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    for (const which of SUPPORT) if (support[side][which].model.visible && ray.intersectObject(support[side][which].model, true).length) return which;
    const p = new T.Vector3();
    if (!ray.ray.intersectPlane(table, p)) return null;
    for (const which of SUPPORT) {
      const spot = GUNS[side][which];
      if (support[side][which].model.visible && Math.hypot(p.x - spot.x, p.z - spot.z) < 0.45) return which;
    }
    return null;
  }

  // A ring under each of your guns, like the pieces: green if it can still fire this hour, grey if not, white if chosen
  function gunRings(state, side) {
    if (!state) return;
    for (const which of SUPPORT) {
      const spot = GUNS[side][which], s = state[which];
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
  const COIN_SIZE = 0.48;
  const TIMER_HOVER = 1.2;           // how high over the board the timer token stops            // radius on the table (Steve: three times the first size)
  let coinFlight = null;             // { mesh, from, to, t0, done, leaving }
  // Where a side's drawn token lands on the table: just above its artillery, a little further out (the dice sit beside it)
  function coinSpot(side) {
    const gun = GUNS[side].artillery;
    return { x: gun.x + (side === 'us' ? -0.1 : 0.1), z: gun.z - 1.15 };
  }
  function flyToken(side, clientX, clientY, done) {
    clearTokenNow();
    const mesh = Models.coin(side);
    mesh.scale.set(COIN_SIZE, COIN_SIZE, COIN_SIZE);
    // Where it starts: the bar's spot, carried down onto the table's plane (off the bottom of the screen)
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    const from = new T.Vector3();
    if (!ray.ray.intersectPlane(table, from)) from.set(COLS / 2, 0, ROWS + 2);
    // It lands above that side's artillery; the timer in the middle of the board (Steve)
    // (the timer stops in the air over the middle of the board, Steve, so it hides nothing on the table)
    const spot = side === 'timer' ? null : coinSpot(side);
    const to = side === 'timer' ? new T.Vector3(COLS / 2, TIMER_HOVER, ROWS / 2) : new T.Vector3(spot.x, 0.04, spot.z);
    mesh.position.copy(from);
    scene.add(mesh);
    coinFlight = { mesh, from, to, t0: performance.now(), done, leaving: 0 };
  }
  // A new round (Steve): a small coin, a third the size, flies up off each piece (and gun) a token activated last round
  // and back into the bag in the bar (the tokens never drawn are still in it; the first round, every piece's flies in), the same way the drawn token comes out but in reverse; one after another on each side with
  // a short overlap, both sides at once, then the timer. landed(side) is called as each one arrives, done after the last
  const HOME_GAP = 110, HOME_TIME = 900;
  let homing = [];                   // { mesh, from, to, t0, side, landed }
  let homingDone = null;
  function returnTokens(st, ends, landed, done) {
    // Where each side's coins go: the bar's spot for its tokens, carried down onto the table's plane
    const r = renderer.domElement.getBoundingClientRect();
    const onTable = pt => {
      ray.setFromCamera(new T.Vector2((pt.x - r.left) / r.width * 2 - 1, -(pt.y - r.top) / r.height * 2 + 1), camera);
      const p = new T.Vector3();
      if (!ray.ray.intersectPlane(table, p)) p.set(COLS / 2, 0, ROWS + 2);
      return p;
    };
    const now = performance.now();
    let last = now;
    for (const side of ['us', 'de']) {
      const from = homeFrom(st, side);
      const to = onTable(ends[side]);
      from.forEach((p, i) => {
        const t0 = now + i * HOME_GAP;
        last = Math.max(last, t0);
        homing.push(homeCoin(side, new T.Vector3(p.x, 0.1, p.z), to, t0, landed));
      });
    }
    // The timer last, from between the two sides' artillery, if it came out last round (or it's the first)
    const back = st.returning || { first: true };
    if (st.bag && st.bag.timer && (back.first || back.timerOut)) {
      const mid = new T.Vector3((GUNS.us.artillery.x + GUNS.de.artillery.x) / 2, 0.1, GUNS.us.artillery.z - 1.15);
      last += HOME_GAP;
      homing.push(homeCoin('timer', mid, onTable(ends.timer), last, landed));
    }
    homingDone = done;
    // Nothing to fly home: done at once
    if (!homing.length) { homingDone = null; done(); }
  }
  // Where a side's coins fly home from this round (see Sim.tokensHome: only those a token activated, Steve)
  function homeFrom(st, side) {
    const gunAt = which => new T.Vector3(GUNS[side][which].x, 0, GUNS[side][which].z);
    return Sim.tokensHome(st)[side].from.map(w => (w.gun ? gunAt(w.gun) : pieceCentre(Sim.unitById(st, w.id))));
  }

  // One small coin on its way home, not on the table until it sets off
  function homeCoin(side, from, to, t0, landed) {
    const mesh = Models.coin(side);
    mesh.visible = false;
    mesh.position.copy(from);
    scene.add(mesh);
    return { mesh, from, to, t0, side, landed };
  }
  // Move the coins going home; returns true while any is still flying
  function moveHoming(now) {
    if (!homing.length) return false;
    const size = COIN_SIZE / 3;
    for (const c of homing) {
      const p = Math.max(0, Math.min(1, (now - c.t0) / HOME_TIME));
      // Not off yet
      if (now < c.t0) continue;
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const m = c.mesh;
      m.visible = true;
      // Up in an arc, growing then shrinking, turning over, as the drawn token does
      m.position.set(T.MathUtils.lerp(c.from.x, c.to.x, e), T.MathUtils.lerp(c.from.y, c.to.y, e) + 1.2 * Math.sin(Math.PI * e), T.MathUtils.lerp(c.from.z, c.to.z, e));
      m.scale.setScalar(size * (1 + 0.9 * Math.sin(Math.PI * e)));
      m.rotation.set(Math.PI * 2 * e, 0, 0.3 * Math.sin(Math.PI * e));
      // Home: into the bag
      if (p >= 1 && !c.home) { c.home = true; scene.remove(m); if (c.landed) c.landed(c.side); }
    }
    homing = homing.filter(c => !c.home);
    if (!homing.length && homingDone) { const d = homingDone; homingDone = null; d(); }
    return homing.length > 0;
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
    // (no sound as it lands, Steve)
    if (p >= 1 && c.done) { const d = c.done; c.done = null; d(); }
    return p < 1;
  }

  // Show as many rounds beside each gun as it has shots left
  function updateSupport(st) {
    if (!support) return;
    for (const side of ['us', 'de']) for (const which of SUPPORT) {
      const gun = support[side][which], n = st.ammo[side][which];
      gun.rounds.forEach((r, k) => { r.visible = k < n; });
      // Out of rounds: the gun isn't on the table (Steve)
      gun.model.visible = n > 0;
      gun.name.visible = n > 0;
      // Fired this round: greyed out like a piece that has moved (Steve)
      greyOut(gun.model, st.fired[side][which] ? (side === 'us' ? 'green' : 'grey') : false);
    }
  }

  // Where a side's mortar or gun fires from: just in front of the model, at the muzzle
  function muzzle(f) {
    const side = f.side === 'de' ? 'de' : 'us', which = f.support === 'artillery' ? 'artillery' : 'mortars';
    const spot = GUNS[side][which], d = gunDir(side), reach = which === 'artillery' ? 0.32 : 0.12;
    return new T.Vector3(spot.x + d.x * reach, which === 'artillery' ? 0.16 : 0.15, spot.z + d.z * reach);
  }

  function build(st) {
    if (built) { scene.remove(built); freeObject(built); }
    built = new T.Group();
    built.add(Models.table(COLS, ROWS));
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = Sim.tileType(x, y), seed = x * 7 + y * 13;
      built.add(at(Models.field(t, t === 'field' && seed % 5 === 0, seed), x + 0.5, 0, y + 0.5, -Math.PI / 2, 0, 0));
      const cobbled = nearHouses(x, y);
      if (t === 'laneEW' || t === 'crossroads') built.add(at(Models.lane(1, 0.3, cobbled), x + 0.5, 0.001, y + 0.5, -Math.PI / 2, 0, 0));
      if (t === 'laneNS' || t === 'crossroads') built.add(at(Models.lane(0.3, 1, cobbled), x + 0.5, 0.0012, y + 0.5, -Math.PI / 2, 0, 0));
      // The river: water down the field, joined to the river or bridge above and below; a bridge carries the lane over
      if (t === 'river' || t === 'bridge') {
        const wet = (xx, yy) => Sim.inside(xx, yy) && ['river', 'bridge'].includes(Sim.tileType(xx, yy));
        const top = wet(x, y - 1) || y === 0 ? 0 : 0.3, bottom = wet(x, y + 1) || y === ROWS - 1 ? 1 : 0.7;
        built.add(at(Models.water(0.42, bottom - top), x + 0.5, 0, y + (top + bottom) / 2));
        if (t === 'bridge') built.add(at(Models.bridge(), x + 0.5, 0, y + 0.5));
        // Reeds along the banks, here and there (Steve)
        if (t === 'river') addReeds(x, y, seed);
      }
      if (t === 'orchard') for (const [ox, oz] of orchardTrees(seed)) built.add(at(Models.tree(seed + ox * 10 + oz * 3, 0.68 + ((ox * 31 + oz * 17) % 1) * 0.15), x + ox, 0, y + oz));
      if (t === 'village' || t === 'hamlet') addHouses(x, y, seed);
    }
    if (st.map.joins) addTracks(st);
    addSea(st);
    for (const f of st.features) addFeature(f);
    addScenery(st);
    // Fields, houses and trees never move: merged, they are drawn in a few goes
    Models.mergeParts(built);
    scene.add(built);
    shadowStale = true;
    hedgeKey = '';
  }

  // Where an orchard's trees stand (Steve: a couple more, staggered at random): six trees, each pushed about its own
  // spot in two loose rows, kept clear of the middle where the pieces stand and of the hedges
  function orchardTrees(seed) {
    const R = seeded(seed * 5 + 3);
    const spots = [[0.18, 0.18], [0.5, 0.14], [0.82, 0.2], [0.2, 0.84], [0.52, 0.86], [0.84, 0.8]];
    return spots.map(([x, z]) => [x + (R() - 0.5) * 0.14, z + (R() - 0.5) * 0.12]);
  }

  // Houses round the square (Steve): small ones, about as tall as a figure, two along each side of the field with gaps
  // between, their fronts facing in. They stand in a band just inside the edge; the pieces keep to the yard inside it
  // (see YARD in arrange), so none stands under a house
  // The things just to look at (see Scenery). Those that would stand in a piece's way go in a group for their field, hidden
  // while a piece is there (see hideSceneryUnderPieces); the rest are part of the table
  let sceneryGroups = [];
  function addScenery(st) {
    for (const g of sceneryGroups) { scene.remove(g); freeObject(g); }
    sceneryGroups = [];
    const byField = new Map();
    for (const item of Scenery.list(st)) {
      if (item.kind === 'crater') { built.add(at(Models.crater(item.seed), item.x, 0, item.y)); continue; }
      if (item.kind === 'lamp') { built.add(at(Models.lampPost(), item.x, 0, item.y)); continue; }
      if (item.kind === 'posters') { built.add(at(Models.posterColumn(item.seed), item.x, 0, item.y)); continue; }
      const MAKERS = { cow: Models.cow, sheep: Models.sheep, stall: Models.marketStall };
      const key = item.field.x + ',' + item.field.y;
      if (!byField.has(key)) {
        const group = new T.Group();
        group.userData.field = item.field;
        byField.set(key, group);
      }
      byField.get(key).add(at(MAKERS[item.kind](item.seed), item.x, 0, item.y, 0, item.turn, 0));
    }
    for (const group of byField.values()) {
      Models.mergeParts(group);
      scene.add(group);
      sceneryGroups.push(group);
    }
  }
  // Animals and stalls move out of the way of a piece in their field
  function hideSceneryUnderPieces(st) {
    for (const g of sceneryGroups) {
      const f = g.userData.field;
      g.visible = !st.units.some(u => u.x === f.x && u.y === f.y);
    }
  }

  // A lane is cobbled where it runs beside a village or a hamlet (Steve: a few cobbled streets on every map); only to look at
  function nearHouses(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!Sim.inside(x + dx, y + dy)) continue;
      const near = Sim.tileType(x + dx, y + dy);
      if (near === 'village' || near === 'hamlet') return true;
    }
    return false;
  }

  // Clumps of reeds along each bank of a river field: some of the places along it, not all
  const REEDS = { places: 4, chance: 0.55, bank: 0.25 };
  function addReeds(x, y, seed) {
    const R = (k => () => { k = (k * 16807) % 2147483647; return k / 2147483647; })(seed * 97 + 13);
    for (const bank of [-1, 1]) {
      for (let i = 0; i < REEDS.places; i++) {
        const showing = R() < REEDS.chance;
        const along = (i + 0.2 + R() * 0.6) / REEDS.places, out = R() * 0.03;
        if (!showing) continue;
        built.add(at(Models.reeds(seed * 31 + i * 7 + (bank + 1)), x + 0.5 + bank * (REEDS.bank + out), 0, y + along));
      }
    }
  }

  // ---------- The sea (Steve: the water moving in and out) ----------
  // The sea's own surface over the first column, then the surf: a sheet of shallow water whose edge runs in and out over the
  // sand, uneven along the shore, with a line of foam along that edge and another left behind it as it draws back. The landing
  // craft ride on it. Moved every frame in moveSea
  const SURF = { shore: 1, steps: 64, in: 0.2, slow: 0.65 };
  let sea = null;
  function ribbon(material, y) {
    const geo = new T.PlaneGeometry(1, ROWS, 1, SURF.steps);
    const mesh = new T.Mesh(geo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, y, ROWS / 2);
    mesh.renderOrder = 1;
    return mesh;
  }
  function addSea(st) {
    if (sea) { scene.remove(sea.group); freeObject(sea.group); sea = null; }
    if (!st.map.landing) return;
    const group = new T.Group();
    const R = seeded(st.seed + 5);
    // The deep water, its ripples drifting back and forth
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#2f5f68'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = i % 3 ? 'rgba(170,215,220,.2)' : 'rgba(20,50,60,.35)';
      g.lineWidth = 1 + R() * 2;
      const x = R() * 256, y = R() * 256, tall = 14 + R() * 30;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y + tall / 2, x, y + tall); g.stroke();
    }
    const ripples = new T.CanvasTexture(c);
    ripples.wrapS = ripples.wrapT = T.RepeatWrapping;
    ripples.repeat.set(1, ROWS);
    ripples.encoding = T.sRGBEncoding;
    const deep = new T.Mesh(new T.PlaneGeometry(SURF.shore, ROWS), new T.MeshStandardMaterial({ map: ripples, roughness: 0.2, metalness: 0.15 }));
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(SURF.shore / 2, 0.004, ROWS / 2);
    deep.receiveShadow = true;
    group.add(deep);
    // Sand the water has just left, darker
    const wet = new T.Mesh(new T.PlaneGeometry(0.42, ROWS), new T.MeshBasicMaterial({ color: 0x4d3f2b, transparent: true, opacity: 0.32, depthWrite: false }));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(SURF.shore + 0.13, 0.0035, ROWS / 2);
    group.add(wet);
    // The sheet of shallow water, and the two lines of foam
    const sheet = ribbon(new T.MeshStandardMaterial({ color: 0x4f8f96, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1, depthWrite: false }), 0.006);
    const foam = ribbon(new T.MeshBasicMaterial({ color: 0xf2f4ee, transparent: true, opacity: 0.92, depthWrite: false }), 0.0075);
    const oldFoam = ribbon(new T.MeshBasicMaterial({ color: 0xe6e8e0, transparent: true, opacity: 0.45, depthWrite: false }), 0.007);
    group.add(sheet, foam, oldFoam);
    // A landing craft in each field of the sea
    const craft = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (Sim.tileType(x, y) !== 'sea') continue;
      const m = Models.mergeParts(Models.landingCraft());
      group.add(at(m, x + 0.46, 0.006, y + 0.5));
      craft.push({ mesh: m, phase: R() * 6.28 });
    }
    // Smoke rising from the wrecks
    const plumes = [];
    for (const f of st.features) {
      if (f.kind !== 'hulk') continue;
      for (let i = 0; i < 6; i++) {
        const puff = new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), color: 0x24211e, transparent: true, depthWrite: false }));
        group.add(puff);
        plumes.push({ puff, x: f.x + 0.5, z: f.y + (f.side === 'n' ? 0.2 : 0.8), phase: i / 6, drift: R() * 6.28 });
      }
    }
    scene.add(group);
    sea = { group, ripples, sheet, foam, oldFoam, craft, plumes };
  }
  // Where the water's edge is, along the shore, at a moment (t in seconds): the main surge in and out, with slower and quicker
  // waves running along it so it is never a straight line
  function surfEdge(z, t) {
    const surge = Math.sin(t * SURF.slow) * SURF.in;
    const along = Math.sin(z * 1.3 + t * 0.5) * 0.06 + Math.sin(z * 3.7 - t * 0.9) * 0.03 + Math.sin(z * 9.1 + t * 1.4) * 0.012;
    return SURF.shore + 0.02 + surge + along;
  }
  // Set a ribbon between two lines, each given as x along the shore
  function setRibbon(mesh, inner, outer) {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // (a plane's vertices come in rows from one end to the other, two to a row: left, then right)
      const row = Math.floor(i / 2), z = (row / SURF.steps) * ROWS;
      p.setX(i, i % 2 === 0 ? inner(z) : outer(z));
    }
    p.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  // One frame of the sea. Returns true if there is a sea
  function moveSea(now) {
    if (!sea) return false;
    const t = now / 1000;
    sea.ripples.offset.x = Math.sin(t * SURF.slow) * 0.06 + t * 0.012;
    const edge = z => surfEdge(z, t);
    // (the line left behind lags: where the water reached a moment ago, as it draws back)
    const left = z => Math.max(surfEdge(z, t - 1.1), surfEdge(z, t)) + 0.006;
    setRibbon(sea.sheet, () => SURF.shore - 0.32, edge);
    setRibbon(sea.foam, z => edge(z) - 0.022 - Math.abs(Math.sin(z * 11 + t)) * 0.012, z => edge(z) + 0.004);
    setRibbon(sea.oldFoam, z => left(z) - 0.008, z => left(z));
    for (const c of sea.craft) {
      c.mesh.position.y = 0.006 + Math.sin(t * 0.9 + c.phase) * 0.004;
      c.mesh.rotation.z = Math.sin(t * 0.7 + c.phase) * 0.012;
      c.mesh.rotation.x = Math.sin(t * 0.55 + c.phase * 2) * 0.01;
    }
    for (const p of sea.plumes) {
      const age = (t * 0.14 + p.phase) % 1;
      p.puff.position.set(p.x + Math.sin(p.drift + t * 0.3) * 0.02 + age * 0.12, 0.08 + age * 0.75, p.z - age * 0.05);
      p.puff.scale.setScalar(0.1 + age * 0.34);
      p.puff.material.opacity = (1 - age) * 0.55;
    }
    return true;
  }

  // The railway yard's tracks: one along the north row of each field's areas and one along the south, a buffer stop where one
  // runs up against houses, and pieces of track where they join: within a field, or down to the track of the field below
  const TRACK_ROWS = [0.5 - 1 / 3, 0.5 + 1 / 3];
  function addTracks(st) {
    const isYard = (x, y) => Sim.inside(x, y) && Sim.tileType(x, y) === 'yard';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isYard(x, y)) continue;
      for (const row of TRACK_ROWS) {
        built.add(at(Models.track(1), x + 0.5, 0.002, y + row, -Math.PI / 2, 0, 0));
        if (Sim.inside(x + 1, y) && !isYard(x + 1, y)) built.add(at(Models.bufferStop(), x + 0.96, 0, y + row, 0, Math.PI, 0));
        if (Sim.inside(x - 1, y) && !isYard(x - 1, y)) built.add(at(Models.bufferStop(), x + 0.04, 0, y + row));
      }
    }
    for (const join of st.map.joins) {
      // From the track at one height to the track at the next, slanting across the field
      const upper = join.within ? TRACK_ROWS[0] : TRACK_ROWS[1], lower = join.within ? TRACK_ROWS[1] : 1 + TRACK_ROWS[0];
      const across = 0.7, down = lower - upper;
      const slant = Math.atan2(down, across) * (join.flip ? 1 : -1);
      const piece = Models.track(Math.hypot(across, down));
      piece.rotation.set(-Math.PI / 2, 0, slant);
      piece.position.set(join.x + 0.5, 0.0035, join.y + (upper + lower) / 2);
      built.add(piece);
    }
  }

  // A café, a barn, a fountain or a pond in its field: in the middle of the areas it takes, as long as they are (a third of a
  // field each, less a little), running the way they run, its front facing into the field
  function addFeature(f) {
    const MAKERS = {
      cafe: Models.cafe, barn: Models.barn, fountain: Models.fountain, pond: Models.pond,
      eiffel: Models.eiffel, tanktrap: Models.tankTrap, hulk: Models.hulk, engine: Models.engine, carriage: Models.carriage, wagon: Models.wagon, signalbox: Models.signalbox, signal: Models.signal, watertower: Models.watertower, coal: Models.coal,
    };
    // The tower stands over its whole field, on no areas of its own
    if (f.kind === 'eiffel') { built.add(at(MAKERS.eiffel(), f.x + 0.5, 0, f.y + 0.5)); return; }
    const spots = f.areas.map(k => Sim.placeXY(k === 'c' ? null : k));
    const midX = spots.reduce((n, p) => n + p.x, 0) / spots.length, midY = spots.reduce((n, p) => n + p.y, 0) / spots.length;
    const alongX = new Set(spots.map(p => p.y)).size === 1;
    const facing = alongX ? (midY > 0 ? Math.PI : 0) : (midX > 0 ? -Math.PI / 2 : Math.PI / 2);
    const length = f.areas.length / 3 - 0.1;
    built.add(at(MAKERS[f.kind](length, f.seed, f.load), f.x + 0.5 + midX / 3, 0, f.y + 0.5 + midY / 3, 0, facing, 0));
  }

  function addHouses(x, y, seed) {
    // Along each side: which way it runs, which edge, and which way the front faces (into the field)
    const sides = [
      { along: 'x', edge: 0, ry: 0 },               // north side, front facing south
      { along: 'x', edge: 1, ry: Math.PI },         // south side, front facing north
      { along: 'z', edge: 0, ry: Math.PI / 2 },     // west side, front facing east
      { along: 'z', edge: 1, ry: -Math.PI / 2 },    // east side, front facing west
    ];
    // The house is 0.16 deep before scaling: its middle sits half that in from the edge, plus a little gap
    const scaleAcross = 0.75, depth = 0.16 * scaleAcross, inset = 0.015 + depth / 2;
    sides.forEach((sd, i) => {
      for (const a of [0.3, 0.7]) {
        const k = seed + i * 3 + (a > 0.5 ? 1 : 0);
        const h = Models.house(k);
        // A little variety: some houses a touch taller
        h.scale.set(scaleAcross, 1 + (k % 3) * 0.06, scaleAcross);
        // Where it stands: `a` along the side, just inside the edge
        const across = sd.edge === 0 ? inset : 1 - inset;
        const hx = sd.along === 'x' ? x + a : x + across;
        const hz = sd.along === 'x' ? y + across : y + a;
        built.add(at(h, hx, 0, hz, 0, sd.ry, 0));
      }
    });
  }

  // A field's stretch of the sea wall along its west edge; with a bunker built into it, only the wall beyond the bunker
  function addSeaWall(st, x, y) {
    const here = (st.units.some(u => u.x === x && u.y === y && Sim.isBunker(u))) || st.wrecks.some(w => w.x === x && w.y === y && PIECES[w.kind].bunker);
    if (!here) { hedgeGroup.add(at(Models.seaWall(1.02, x * 31 + y), x, 0, y + 0.5)); return; }
    // The bunker covers the field's edge from BUNKER_GAP.from to .to
    hedgeGroup.add(at(Models.seaWall(BUNKER_GAP.from, x * 31 + y), x, 0, y + BUNKER_GAP.from / 2));
    hedgeGroup.add(at(Models.seaWall(1 - BUNKER_GAP.to, x * 31 + y + 500), x, 0, y + (1 + BUNKER_GAP.to) / 2));
  }
  const BUNKER_GAP = { from: 0.06, to: 0.63 };
  // The sea wall a tank has driven through (Steve: a collapsed section, as a trampled hedge): its two outer quarters still
  // standing, its boulders tumbled across the gap between
  function addBrokenSeaWall(x, y) {
    hedgeGroup.add(at(Models.seaWall(0.25, x * 31 + y), x, 0, y + 0.125));
    hedgeGroup.add(at(Models.seaWall(0.25, x * 31 + y + 500), x, 0, y + 0.875));
    hedgeGroup.add(at(Models.seaWallRubble(0.5, x * 31 + y), x, 0, y + 0.5));
  }

  // Hedges: every lump of foam on the table drawn as one instanced mesh (one for dark foam, one for light, one for the bases),
  // so the whole board stays quick to draw. Rebuilt when a hedge is cut
  function buildHedges(st) {
    const trampled = st.trampled || {};
    const key = Object.keys(st.hedges).sort().join(';') + '/' + Object.keys(st.wire).sort().join(';') + '/' + Object.keys(trampled).sort().join(';');
    if (key === hedgeKey) return;
    if (hedgeGroup) scene.remove(hedgeGroup);
    shadowStale = true;
    hedgeGroup = new T.Group();
    const runs = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (x + 1 < COLS && Sim.hedge(st, x, y, x + 1, y)) {
        // Where the sand meets the land it is the sea wall, not a hedge
        if (Sim.tileType(x, y) === 'beach') addSeaWall(st, x + 1, y);
        else runs.push({ cx: x + 1, cz: y + 0.5, along: 'z', seed: x * 31 + y });
      }
      if (y + 1 < ROWS && Sim.hedge(st, x, y, x, y + 1)) runs.push({ cx: x + 0.5, cz: y + 1, along: 'x', seed: x * 17 + y * 5 + 3 });
      // A hedge a tank has driven through (Steve): still there, its middle half trampled flat
      if (x + 1 < COLS && trampled[Sim.edgeKey(x, y, x + 1, y)]) {
        if (Sim.tileType(x, y) === 'beach') addBrokenSeaWall(x + 1, y);
        else runs.push({ cx: x + 1, cz: y + 0.5, along: 'z', seed: x * 31 + y, trampled: true });
      }
      if (y + 1 < ROWS && trampled[Sim.edgeKey(x, y, x, y + 1)]) runs.push({ cx: x + 0.5, cz: y + 1, along: 'x', seed: x * 17 + y * 5 + 3, trampled: true });
    }
    const lumps = [[], []], bases = [];
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pos = new T.Vector3();
    // A point `a` along a run and `side` across it, `h` up
    const along = (r, a, side, h) => pos.set(r.along === 'x' ? r.cx + a : r.cx + side, h, r.along === 'x' ? r.cz + side : r.cz + a);
    const turned = r => new T.Quaternion().setFromEuler(new T.Euler(0, r.along === 'z' ? Math.PI / 2 : 0, 0));
    for (const r of runs) {
      const R = seeded(r.seed);
      // The bank under it: the whole length, or (trampled) only its two outer quarters
      if (!r.trampled) bases.push(new T.Matrix4().compose(new T.Vector3(r.cx, 0.006, r.cz), turned(r), new T.Vector3(1, 1, 1)));
      else for (const end of [-1, 1]) bases.push(new T.Matrix4().compose(along(r, end * 0.375, 0, 0.006).clone(), turned(r), new T.Vector3(0.25, 1, 1)));
      for (let k = 0; k < 70; k++) {
        // (drawn in the same order as always, so the hedges look as they did)
        const a = -0.5 + R(), side = (R() - 0.5) * 0.07, rad = 0.035 + R() * 0.03, h = 0.05 + R() * 0.07, tall = 0.9 + R() * 0.4, light = R() < 0.25;
        // Trampled: the middle half crushed flat, lumps squashed low and spread a little wider
        // (only a few bits of it left, pressed into the ground, so the gap shows clearly)
        const crushed = r.trampled && Math.abs(a) < 0.25;
        if (crushed && k % 3) continue;
        along(r, a, crushed ? side * 2.2 : side, crushed ? 0.004 : h);
        if (crushed) sc.set(rad * 0.9, rad * 0.15, rad * 0.9);
        else sc.set(rad, rad * tall, rad);
        m.compose(pos, q, sc);
        lumps[light ? 1 : 0].push(m.clone());
      }
    }
    const ball = new T.SphereGeometry(1, 7, 5);
    [Models.M.foam, Models.M.foamLight].forEach((mat, i) => {
      // (a map may have no hedges at all)
      if (!lumps[i].length) return;
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
        // The concertina (Steve: big loose loops, not a tight coil): about eight wide loops rolled along the foot of the
        // fence, each a little different in size, leaning back and forth so they overlap
        const LOOPS = 8, STEPS = 48, RADIUS = 0.06;
        const wobble = seeded(x * 31 + y * 17 + dx * 7);
        const sizes = [...Array(LOOPS + 1)].map(() => RADIUS * (0.8 + wobble() * 0.4));
        let prev = null;
        for (let i = 0; i <= LOOPS * STEPS; i++) {
          const turn = i * Math.PI * 2 / STEPS;
          const loop = Math.floor(i / STEPS);
          // (each loop's size eases into the next one's)
          const r = sizes[loop] + (sizes[Math.min(LOOPS, loop + 1)] - sizes[loop]) * ((i % STEPS) / STEPS);
          const a = -0.45 + i * (0.9 / (LOOPS * STEPS)) + 0.045 * Math.sin(turn);
          const next = pt(a, r + 0.004 + r * Math.cos(turn), r * Math.sin(turn));
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

  // A bunker: its concrete, with who is in it kept apart, as they go when it is knocked out
  function bunkerBase(gun) {
    const walls = Models.mergeParts(Models.bunker(gun));
    markerSpots(walls);
    walls.userData.crew = Models.mergeParts(Models.bunkerCrew(gun));
    walls.add(walls.userData.crew);
    return walls;
  }

  // The model for a piece, made the first time it is needed
  // The models that make up a piece, each a base on the table, scaled: a rifle platoon's three section bases, a tank
  // (one to a unit, Steve), or a team's (or the captain's) one base. Used for the table and for the panel's picture
  function buildBases(side, kind, elite = false) {
    if (kind === 'company') {
      // One base a section; the bases are shown or hidden as sections are lost. Elite: in camouflage (Steve)
      return [0, 1, 2].map(() => { const s = Models.mergeParts(Models.squad(side, elite)); markerSpots(s); s.scale.setScalar(MEN); return s; });
    }
    if (PIECES[kind].tank) {
      const make = { sherman: () => Models.sherman(Models.M.olive), firefly: () => Models.sherman(Models.M.olive, true), pz4: Models.panzer4, panther: Models.panther }[kind];
      return [0].map(() => { const m = Models.mergeParts(make()); markerSpots(m); m.scale.setScalar(TANKS); m.userData.slowTurn = true; return m; });
    }
    if (PIECES[kind].bunker) return [bunkerBase(kind === 'bunker_gun')];
    const m = Models.mergeParts(kind === 'captain' ? Models.captain(side) : kind === 'pak' ? Models.pak() : Models.team(side, kind));
    markerSpots(m);
    m.scale.setScalar(kind === 'pak' ? TANKS * 1.3 : MEN);
    // The PaK swings round onto its target before it fires, as a tank does (Steve)
    if (kind === 'pak') m.userData.slowTurn = true;
    return [m];
  }

  function model(u) {
    if (pieces[u.id]) return pieces[u.id];
    const g = new T.Group();
    g.userData.bases = buildBases(u.side, u.kind, u.quality === 'elite');
    for (const b of g.userData.bases) g.add(b);
    // Elite, yours or theirs (Steve): a gold band round the edge of every base
    if (u.quality === 'elite') for (const b of g.userData.bases) Models.eliteBand(b);
    // A tank drives (Steve): it turns towards where it is going and goes forward, in curves, instead of sliding
    if (Sim.isTank(u)) g.userData.drives = g.userData.bases[0];
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
  // How far from the middle of the field a piece stands at the edge of its place: in an open field, and in the yard
  // inside a field's houses (platoon: its centre; spread: how loosely its bases cluster; tank: the pair's centre;
  // small: a team or the captain)
  // (Steve: nine areas a field) A piece stands at the middle of its areas: an area's middle is a third of the field
  // from the field's middle
  const OPEN = { platoon: 0.31, spread: 0.85, tank: 0.31, small: 0.31 };
  const YARD = { platoon: 0.2, spread: 0.7, tank: 0.2, small: 0.2 };
  // A yard with a wreck in it: a platoon pushes on out to the far corner, to clear the hull
  const YARD_WITH_WRECK = { platoon: 0.31, spread: 0.7, tank: 0.2, small: 0.2 };
  function arrange(st, x, y) {
    const here = Sim.at(st, x, y);
    const loose = (u, k) => { const R = seeded(u.id.length * 977 + x * 131 + y * 71 + k * 7 + u.id.charCodeAt(0)); return [(R() - 0.5) * 0.05, (R() - 0.5) * 0.05, (R() - 0.5) * 0.5]; };
    // A field with houses round it: the pieces keep to the yard inside the houses (Steve: never under a house), so they
    // stand closer to the middle and closer together
    const houses = ['village', 'hamlet'].includes(Sim.tileType(x, y));
    const reach = !houses ? OPEN : Sim.wreckAt(st, x, y) ? YARD_WITH_WRECK : YARD;
    for (const u of here) {
      const g = model(u);
      // A piece being shot stays where it stands until the shot lands (Steve: a platoon down to one section takes one area
      // at the hedge, and it went there before the shot arrived)
      const field = x + ',' + y;
      const keepsPlace = holding(u.id) && g.userData.spotField === field && g.userData.spot;
      const p = keepsPlace ? g.userData.spot : Sim.spotXY(u);
      g.userData.spot = p;
      g.userData.spotField = field;
      if (u.kind === 'company') {
        // Pulled in a little from the edge, so the bases sit just inside the hedge
        const cx = 0.5 + p.x * reach.platoon, cz = 0.5 + p.y * reach.platoon;
        const spread = [[-0.11, -0.09], [0.11, -0.07], [0, 0.11]].map(([sx, sz]) => [sx * reach.spread, sz * reach.spread]);
        g.userData.bases.forEach((b, i) => { const [jx, jz, jr] = loose(u, i); b.visible = i < shownStrength(u); aim(b, cx + spread[i][0] + jx, cz + spread[i][1] + jz, g.userData.face + jr); });
      } else if (Sim.isTank(u)) {
        let cx = 0.5 + p.x * reach.tank, cz = 0.5 + p.y * reach.tank;
        // Snagged in wire (Steve): half way through the edge it crossed, the wire dragged round it in a V (see drawSnags)
        // (in the middle of the edge, so the wire runs in from both end posts alike)
        if (u.snag) {
          if (u.snag.x !== x) { cx = u.snag.x < x ? 0.03 : 0.97; cz = 0.5; }
          if (u.snag.y !== y) { cz = u.snag.y < y ? 0.03 : 0.97; cx = 0.5; }
        }
        const facing = u.aim !== undefined ? u.aim : g.userData.face;
        // Side by side across the way they face, far enough apart that they never overlap (Steve); one left: in the middle
        const shown = shownStrength(u);
        const half = (g.userData.bases[0].userData.halfWidth || 0.08) * TANKS;
        const apart = shown > 1 ? half + 0.02 : 0;
        // Square to the way they face: facing angle a points along (cos a, -sin a) on the table, so across is (sin a, cos a)
        const acrossX = Math.sin(facing), acrossZ = Math.cos(facing);
        g.userData.bases.forEach((b, i) => {
          const [jx, jz, jr] = loose(u, i);
          b.visible = i < shown;
          const s = i ? 1 : -1;
          // Only a little shuffle, and both turned nearly the same way, so they stay clear of each other
          aim(b, cx + s * apart * acrossX + jx * 0.3, cz + s * apart * acrossZ + jz * 0.3, facing + jr * 0.1);
        });
      } else {
        // The PaK faces the way it last fired (Steve: it turns to shoot); everyone else the enemy's side
        const facing = u.kind === 'pak' && u.aim !== undefined ? u.aim : g.userData.face;
        aim(g.userData.bases[0], 0.5 + p.x * reach.small, 0.5 + p.y * reach.small, facing);
      }
      aim(g, x, y, 0);
      // On a bridge it stands up on the road
      g.userData.to.y = standsAt(x, y);
    }
  }
  // Wire a tank has hit (Steve: it goes from straight to stretched). Each half of the fence, from its end post, is dragged
  // the way the tank went: while a tank is snagged in it, in to the tank's front corners, a V with the tank at its point;
  // once the tank has gone on (or went straight through), pulled aside, leaving a gap in the middle that stops nobody
  let snagGroup = null;
  const SNAG_WIRE = new T.LineBasicMaterial({ color: 0x5e5e58 });
  function drawSnags(st) {
    if (snagGroup) { scene.remove(snagGroup); freeObject(snagGroup); }
    snagGroup = new T.Group();
    const points = [], posts = [];
    // One half of the fence, dragged from its post to a point: two strands and a stretched coil, its loops getting smaller
    const dragged = (post, end) => {
      posts.push(new T.Matrix4().compose(new T.Vector3(post.x, 0.045, post.z), new T.Quaternion(), new T.Vector3(1, 1, 1)));
      // Two taut strands
      for (const h of [0.055, 0.075]) points.push(new T.Vector3(post.x, h, post.z), new T.Vector3(end.x, h * 0.7, end.z));
      const LOOPS = 5, STEPS = 32;
      const len = Math.hypot(end.x - post.x, end.z - post.z) || 1;
      // (the coil's loops stand across the line it is dragged along)
      const nx = -(end.z - post.z) / len, nz = (end.x - post.x) / len;
      let prev = null;
      for (let i = 0; i <= LOOPS * STEPS; i++) {
        const t = i / (LOOPS * STEPS), turn = i * Math.PI * 2 / STEPS;
        const r = 0.045 * (1 - t * 0.6);
        const cx = post.x + (end.x - post.x) * t, cz = post.z + (end.z - post.z) * t;
        const next = new T.Vector3(cx + nx * r * Math.sin(turn), r + 0.004 + r * Math.cos(turn), cz + nz * r * Math.sin(turn));
        if (prev) points.push(prev, next);
        prev = next;
      }
    };
    // The edge a tank went over: the way it went, across that, and the middle of the edge
    const edgeOf = (from, to) => {
      const way = { x: to.x - from.x, z: to.y - from.y };
      const across = { x: way.z !== 0 ? 1 : 0, z: way.x !== 0 ? 1 : 0 };
      const mid = { x: way.x ? Math.max(from.x, to.x) : to.x + 0.5, z: way.z ? Math.max(from.y, to.y) : to.y + 0.5 };
      return { way, across, mid };
    };
    // Snagged tanks: the V round each
    const held = new Set();
    for (const u of st.units) {
      if (!u.snag || u.x === null || !Sim.isTank(u)) continue;
      const g = pieces[u.id];
      if (!g || !g.userData.bases[0]) continue;
      held.add(Sim.edgeKey(u.snag.x, u.snag.y, u.x, u.y));
      const { way, across, mid } = edgeOf(u.snag, u);
      // Where the tank stands (the first one shown)
      const b = g.userData.bases[0].userData.to;
      const tank = { x: u.x + b.x, z: u.y + b.z };
      for (const side of [-1, 1]) {
        const post = { x: mid.x + across.x * side * 0.45, z: mid.z + across.z * side * 0.45 };
        const corner = { x: tank.x + way.x * 0.17 + across.x * side * 0.09, z: tank.z + way.z * 0.17 + across.z * side * 0.09 };
        dragged(post, corner);
      }
    }
    // Wire a tank has torn open and gone on from: each half pulled aside the way it went, a gap in the middle
    for (const [key, open] of Object.entries(st.openWire || {})) {
      if (held.has(key)) continue;
      const { way, across, mid } = edgeOf(open.from, open.to);
      for (const side of [-1, 1]) {
        const post = { x: mid.x + across.x * side * 0.45, z: mid.z + across.z * side * 0.45 };
        const end = { x: mid.x + way.x * 0.22 + across.x * side * 0.2, z: mid.z + way.z * 0.22 + across.z * side * 0.2 };
        dragged(post, end);
      }
    }
    if (points.length) snagGroup.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points), SNAG_WIRE));
    if (posts.length) {
      const pm = new T.InstancedMesh(new T.CylinderGeometry(0.004, 0.005, 0.09, 6), Models.M.wood, posts.length);
      posts.forEach((m, k) => pm.setMatrixAt(k, m));
      snagGroup.add(pm);
    }
    scene.add(snagGroup);
  }

  // How high a piece stands in a field: on the road over a bridge, otherwise on the table
  const standsAt = (x, y) => (Sim.inside(x, y) && Sim.tileType(x, y) === 'bridge' ? Models.BRIDGE_DECK : 0);

  // The bomber's compass (Steve): sixteen points on a card hovering flat over the middle of the board, where the timer
  // token stops, its needle spinning round and stopping on the way the bomber will fly. The card lies flat, so the needle
  // points that way across the board too. Once the needle has stopped it stays a moment, then fades away, so it hides
  // nothing while the line is aimed (Steve: it disappears when set)
  const COMPASS = { x: COLS / 2, y: TIMER_HOVER, z: ROWS / 2, radius: 0.8, spin: 1700, turns: 3, hold: 800, fade: 500 };
  let compass = null;                // { group, needle, parts, t0, to }: built the first time it is needed
  let compassShown = false;
  function compassCard() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    // The card
    g.fillStyle = '#efe6d2';
    g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a2017'; g.lineWidth = 8; g.stroke();
    // A tick for each of the points: long on the four main ones, shorter on the rest
    for (let k = 0; k < BOMBER.directions; k++) {
      const a = k * 2 * Math.PI / BOMBER.directions, main = k % 4 === 0, half = k % 2 === 0;
      const inner = main ? 150 : half ? 180 : 200;
      g.lineWidth = main ? 9 : half ? 6 : 4;
      g.beginPath();
      g.moveTo(256 + Math.sin(a) * inner, 256 - Math.cos(a) * inner);
      g.lineTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236);
      g.stroke();
    }
    // The four main letters
    g.fillStyle = '#2a2017'; g.font = 'bold 56px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    [['N', 0], ['E', 1], ['S', 2], ['W', 3]].forEach(([letter, k]) => {
      const a = k * Math.PI / 2;
      g.fillText(letter, 256 + Math.sin(a) * 112, 256 - Math.cos(a) * 112);
    });
    return new T.CanvasTexture(c);
  }
  function buildCompass() {
    const group = new T.Group();
    // (drawn over everything, so nothing on the board shows through it; transparent, so it can fade)
    const cardMat = new T.MeshBasicMaterial({ map: compassCard(), transparent: true, depthTest: false });
    const card = new T.Mesh(new T.CircleGeometry(COMPASS.radius, 48), cardMat);
    card.renderOrder = 20;
    group.add(at(card, 0, 0, 0, -Math.PI / 2, 0, 0));
    // The needle: a long red arrow, its point on the way it flies (drawn after the card, so on top of it)
    const r = COMPASS.radius;
    const shape = new T.Shape();
    shape.moveTo(0, r * 0.82); shape.lineTo(r * 0.11, -r * 0.28); shape.lineTo(0, -r * 0.14); shape.lineTo(-r * 0.11, -r * 0.28); shape.closePath();
    const needleMat = new T.MeshBasicMaterial({ color: 0xc8261c, transparent: true, depthTest: false });
    const arrow = new T.Mesh(new T.ShapeGeometry(shape), needleMat);
    arrow.renderOrder = 21;
    const needle = new T.Group();
    needle.add(at(arrow, 0, 0, 0, -Math.PI / 2, 0, 0));
    needle.position.y = 0.01;
    group.add(needle);
    group.position.set(COMPASS.x, COMPASS.y, COMPASS.z);
    scene.add(group);
    compass = { group, needle, parts: [cardMat, needleMat], t0: 0, to: 0 };
  }
  // Show the compass while heading is a number, hide it when null. Each time it comes up it spins, then fades away
  function setCompass(heading) {
    if (heading === null || heading === undefined) {
      compassShown = false;
      if (compass) compass.group.visible = false;
      return;
    }
    if (compassShown) return;
    compassShown = true;
    if (!compass) buildCompass();
    compass.group.visible = true;
    for (const m of compass.parts) m.opacity = 1;
    compass.t0 = performance.now();
    compass.to = -heading * 2 * Math.PI / BOMBER.directions;
  }
  // Picked again while showing: it spins again next time the marks are built
  function respinCompass() { compassShown = false; }
  // One frame of the compass: the spin, fast and slowing to a stop on the way; a moment still; then fading out. Returns
  // true while it is still moving or fading
  function moveCompass(now) {
    if (!compass || !compass.group.visible) return false;
    const age = now - compass.t0;
    // The spin
    const p = Math.min(1, age / COMPASS.spin);
    const slowing = 1 - Math.pow(1 - p, 3);
    compass.needle.rotation.y = compass.to + (1 - slowing) * COMPASS.turns * 2 * Math.PI;
    // Set: after the moment still, it fades, and then it is gone (until it is picked again)
    const fading = (age - COMPASS.spin - COMPASS.hold) / COMPASS.fade;
    const opacity = Math.max(0, Math.min(1, 1 - fading));
    for (const m of compass.parts) m.opacity = opacity;
    if (opacity <= 0) { compass.group.visible = false; return false; }
    return true;
  }

  // The bomber's line on the table: a red strip along it, across the whole board
  function markFlightLine(run) {
    const line = Sim.bomberLine(run.x, run.y, run.heading);
    const angle = run.heading * 2 * Math.PI / BOMBER.directions;
    const dir = { x: Math.sin(angle), z: -Math.cos(angle) };
    const from = line[0].t - 0.5, to = line[line.length - 1].t + 0.5;
    const middle = (from + to) / 2;
    const strip = new T.Mesh(new T.PlaneGeometry(to - from, 0.05), new T.MeshBasicMaterial({ color: 0xe8352a, transparent: true, opacity: 0.8, depthWrite: false }));
    at(strip, run.x + 0.5 + dir.x * middle, 0.012, run.y + 0.5 + dir.z * middle, -Math.PI / 2, 0, Math.atan2(-dir.z, dir.x));
    marks.add(strip);
  }

  // The bomber in the air (Steve): in from off the screen, straight along its line and off the screen the other side
  const FLIGHT = { speed: 6.5, lead: 8, height: 0.8, fall: 0.5, size: 1.25 };
  let flight = null;                 // { model, from, dir, length, t0, start }
  let flightUntil = 0;               // when it has gone: the page waits for that before the next token
  function endFlight() {
    if (flight) { scene.remove(flight.model); freeObject(flight.model); }
    flight = null;
  }
  function startFlight(f) {
    endFlight();
    const angle = f.heading * 2 * Math.PI / BOMBER.directions;
    const dir = { x: Math.sin(angle), z: -Math.cos(angle) };
    // From before the first field under it to after the last, measured from the chosen field
    const start = f.line[0].t - FLIGHT.lead, end = f.line[f.line.length - 1].t + FLIGHT.lead;
    const model = Models.mergeParts(Models.bomber(f.side));
    model.rotation.y = -Math.atan2(dir.z, dir.x);
    model.scale.setScalar(FLIGHT.size);
    scene.add(model);
    const length = (end - start) / FLIGHT.speed;
    flight = { model, centre: { x: f.x + 0.5, z: f.y + 0.5 }, dir, length, start, t0: performance.now() };
    flightUntil = flight.t0 + length * 1000;
    f.length = length;
    Sound.play('bomberPass', 0, false, length);
    moveFlight(0);
  }
  // Where it is t seconds into its flight; off the far side it has gone
  function moveFlight(t) {
    if (!flight) return;
    if (t > flight.length) { endFlight(); return; }
    const along = flight.start + t * FLIGHT.speed;
    flight.model.position.set(flight.centre.x + flight.dir.x * along, FLIGHT.height, flight.centre.z + flight.dir.z * along);
  }

  // A piece picked hops up a little and drops back down (Steve), yours or the Germans', and so do the mortars and
  // artillery off the board when they are picked
  const HOP = { height: 0.09, time: 340 };
  let hop = null;                    // { obj, t0 }: the model hopping now
  function bounce(u) {
    if (u && pieces[u.id]) hop = { obj: pieces[u.id], t0: performance.now() };
  }
  function bounceGun(side, which) {
    const gun = support && support[side] && support[side][which];
    if (gun) hop = { obj: gun.model, t0: performance.now() };
  }
  // Lift the hopping model for this frame (after the glide); returns true while it is still in the air
  function moveHop(now) {
    if (!hop) return false;
    const g = hop.obj;
    const p = (now - hop.t0) / HOP.time;
    // (from where it stands: on a bridge, that is up on the road)
    const ground = g && g.userData.to && g.userData.to.y ? g.userData.to.y : 0;
    // Landed (or gone): back on the table
    if (!g || p >= 1) { if (g) g.position.y = ground; hop = null; return false; }
    g.position.y = ground + HOP.height * Math.sin(Math.PI * p);
    return true;
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
    // Tanks turn at a steadier pace (Steve: medium speed), so you see them swing round onto a target before they fire
    const kTurn = 1 - Math.exp(-dt * TANK_TURN_RATE);
    scene.traverse(o => {
      // On a longer move, through each field of the way in turn
      const way = o.userData.way;
      // (an ambush shot on the way: it waits at that point until the shot has landed)
      const waiting = way && way.length && way[0].holdUntil && performance.now() < way[0].holdUntil;
      if (waiting) moving = true;
      if (way && way.length && !waiting && Math.hypot(way[0].x - o.position.x, way[0].z - o.position.z) < 0.12) way.shift();
      const to = way && way.length ? Object.assign({}, way[0], { ry: o.userData.to.ry }) : o.userData.to;
      if (!to) return;
      // A tank drives there instead of sliding
      if (o.userData.drives) { if (drive(o, to, dt)) moving = true; return; }
      // The short way round (Steve: tanks spun a whole turn when the angles were a full turn apart)
      const dr = shortTurn(to.ry - o.rotation.y);
      const dx = to.x - o.position.x, dz = to.z - o.position.z, dy = (to.y || 0) - o.position.y;
      if (Math.abs(dx) + Math.abs(dz) + Math.abs(dr) + Math.abs(dy) < 0.002) { o.position.x = to.x; o.position.z = to.z; o.position.y = to.y || 0; o.rotation.y = to.ry; return; }
      o.position.x += dx * k; o.position.z += dz * k; o.position.y += dy * Math.min(1, k * 2.5);
      // A tank driving does its own turning (see drive); otherwise it turns onto the way it should face
      if (!o.userData.driving) o.rotation.y += dr * (o.userData.slowTurn ? kTurn : k);
      moving = true;
    });
    return moving;
  }

  // An angle brought into -π..π, so a turn always goes the short way round
  function shortTurn(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  // A tank driving to a point (Steve: in normal driving curves): it turns towards it a little at a time and goes forward
  // the way it is facing, slower while it is still turning and on the spot if the point is behind it. Once there, it
  // stops driving and turns to the way it should face (as any piece does, in glide). Returns true while it is moving
  const TANK_SPEED = 2.2;            // fields a second, flat out
  const TANK_STEER = 3.5;            // how fast it can turn while driving, in radians a second
  function drive(g, to, dt) {
    const tank = g.userData.drives;
    const dx = to.x - g.position.x, dz = to.z - g.position.z, dy = (to.y || 0) - g.position.y;
    const far = Math.hypot(dx, dz);
    // The hop when it is picked still lifts it
    g.position.y += dy * Math.min(1, (1 - Math.exp(-dt * 6)) * 2.5);
    // There: it stops driving
    if (far < 0.01) {
      g.position.x = to.x; g.position.z = to.z;
      tank.userData.driving = false;
      return Math.abs(dy) > 0.002;
    }
    tank.userData.driving = true;
    // The way to go, and how far off its heading that is (facing angle a points along cos a, -sin a on the table)
    const want = Math.atan2(-dz, dx);
    const off = shortTurn(want - tank.rotation.y);
    // Steer towards it
    const steer = Math.max(-TANK_STEER * dt, Math.min(TANK_STEER * dt, off));
    tank.rotation.y += steer;
    // Forward along its heading: full speed when facing the way, slowing as it turns, never past the point
    const speed = TANK_SPEED * Math.max(0, Math.cos(off));
    const step = Math.min(far, speed * dt);
    g.position.x += Math.cos(tank.rotation.y) * step;
    g.position.z -= Math.sin(tank.rotation.y) * step;
    return true;
  }

  // Markers on a piece (Steve): the red shaken token sits on the back edge of its (first) base, or on a tank's back
  // deck. It rides on the base, so it moves with it. (Elite pieces have a gold band round their bases instead, see model)
  function marker(u, key, colour, label, show, where) {
    const id = u.id + key, base = pieces[u.id].userData.bases[0];
    if (!tokens[id]) {
      const t = Models.token(colour, label);
      // About the same size on the table whatever the model's scale
      const size = (Sim.isTank(u) ? 0.045 : 0.04) / (0.03 * base.scale.x);
      t.scale.setScalar(size);
      // Its colour stays when the piece is greyed out
      t.traverse(c => { c.userData.keep = true; });
      const spot = base.userData[where];
      t.position.set(spot.x, spot.y, spot.z);
      base.add(t);
      tokens[id] = t;
    }
    tokens[id].visible = show && u.x !== null;
  }

  // Where on a model the markers sit, found once when it is made (before it is scaled): the top of whatever is at the
  // back of it (the base's rim, or a tank's back deck), and the top of its side edge
  const downRay = new T.Raycaster();
  function markerSpots(m) {
    m.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(m);
    // The height of the model's top surface at a point, looking straight down
    const topAt = (x, z) => {
      downRay.set(new T.Vector3(x, 2, z), new T.Vector3(0, -1, 0));
      const hit = downRay.intersectObject(m, true)[0];
      return hit ? hit.point.y + 0.001 : 0.009;
    };
    const backX = box.min.x * 0.85, sideZ = box.max.z * 0.85;
    m.userData.back = { x: backX, y: topAt(backX, 0), z: 0 };
    m.userData.side = { x: box.min.x * 0.3, y: topAt(box.min.x * 0.3, sideZ), z: sideZ };
    // Half its width (across the way it faces), so a tank pair can stand side by side without overlapping
    m.userData.halfWidth = (box.max.z - box.min.z) / 2;
  }

  // A piece that has had its move this hour is greyed out: every material swapped for a dull grey copy, and back again
  const greyCache = {};
  // tint: false (its own colours), 'grey' (a German that has moved, or a gun that has fired) or 'green' (one of yours that
  // has moved: light green, Steve, so yours and the Germans' are told apart)
  function greyOut(g, tint) {
    if (g.userData.greyed === tint) return;
    g.userData.greyed = tint;
    g.traverse(c => {
      // Markers (the shaken token, the elite band) keep their colours
      if (!c.isMesh || c.userData.keep) return;
      // Back to its own colours first
      if (c.userData.orig) { c.material = c.userData.orig; c.userData.orig = null; }
      if (!tint) return;
      c.userData.orig = c.material;
      const swap = m => {
        const key = m.uuid + tint;
        if (!greyCache[key]) {
          const k = m.clone();
          // How light the colour is, kept, in grey or a pale green
          if (k.color) {
            const l = k.color.r * 0.3 + k.color.g * 0.59 + k.color.b * 0.11;
            if (tint === 'green') k.color.setRGB(0.32 + l * 0.35, 0.58 + l * 0.35, 0.28 + l * 0.3);
            else k.color.setRGB(l * 0.8 + 0.06, l * 0.8 + 0.06, l * 0.8 + 0.06);
          }
          if (k.map) k.map = null;
          k.transparent = true; k.opacity = 0.75;
          greyCache[key] = k;
        }
        return greyCache[key];
      };
      c.material = Array.isArray(c.material) ? c.material.map(swap) : swap(c.material);
    });
  }

  function updatePieces(st) {
    let ran = false, drove = false;
    for (const u of st.units) {
      const g = u.x === null ? pieces[u.id] : model(u);
      const h = holding(u.id);
      // Tinted only once its move is complete (Steve): not while its token is still in play (a German making its move,
      // one of yours with a shot or a rally still to come), nor while its fight or shot is still being shown
      const movingNow = st.computer && st.computer.move && st.computer.move.id === u.id;
      const activeNow = st.drawn === st.human && st.activeId === u.id;
      // (in ambush it hasn't finished: it goes light green or grey once it has fired, Steve)
      const done = u.acted && !u.ambush && !movingNow && !activeNow && !h;
      // Moved this round: Americans light green, Germans grey (Steve), whichever side the player has
      const tint = done && u.x !== null ? (u.side === 'us' ? 'green' : 'grey') : false;
      // A knocked-out tank stays on the table as its wreck (see updateWrecks)
      const wrecked = u.x === null && st.wrecks.some(w => w.id === u.id);
      if (g) { g.visible = h ? h.visible : u.x !== null || wrecked; greyOut(g, tint); }
      // A piece lost in hand to hand is no longer arranged in a field: its bases drop away blow by blow here
      if (g && u.x === null && h) g.userData.bases.forEach((b, i) => { b.visible = i < shownStrength(u); });
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
    drawSnags(st);
    hideSceneryUnderPieces(st);
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
        if (i < fields.length - 1) way.push({ x: b.x + offX, z: b.y + offZ, y: standsAt(b.x, b.y) });
      }
      g.userData.way = way;
      g.userData.newTrail = null;
      // Where an ambush shoots it on the way, it stops until the shot lands: where it set off, or a field it passes
      for (const stop of g.userData.stops || []) {
        if (stop.n === 0) { way.unshift({ x: g.position.x, z: g.position.z, y: 0, holdUntil: stop.until }); continue; }
        const entry = way.find(w => Math.abs(w.x - (stop.x + offX)) < 1e-6 && Math.abs(w.z - (stop.y + offZ)) < 1e-6);
        if (entry) entry.holdUntil = Math.max(entry.holdUntil || 0, stop.until);
      }
    }
    // (used, or for a piece that never set off)
    for (const u of st.units) if (pieces[u.id]) pieces[u.id].userData.stops = null;
    for (const u of st.units) {
      if (!pieces[u.id]) continue;
      marker(u, ':shock', '#9b2a22', '!', u.shocked, 'back');
    }
    updateWrecks(st);
  }

  // ---------- Wrecks (Steve): a knocked-out tank burns where it died, black and scorched, and stays ----------

  // Where a wreck's hull sits from the middle of its field, towards its corner: along the way it points and across it.
  // It has to clear the hedges in a field, or the houses round a yard, and leave room for a platoon opposite
  const WRECK_OPEN = { along: 0.16, across: 0.22 };
  const WRECK_YARD = { along: 0.04, across: 0.18 };
  // The fires on the table: piece id → { fire, x, y }
  const wreckFires = {};

  // Bring the table up to date with the wrecks in the game: a new one once the shot that killed it has landed, and any
  // older one a newer one has cleared away. Its look is set just the once
  function updateWrecks(st) {
    for (const w of st.wrecks) {
      const g = pieces[w.id];
      if (!g || wreckFires[w.id] || holding(w.id)) continue;
      wreckFires[w.id] = { fire: setWreck(st, w, g) };
      shadowStale = true;
    }
    for (const id of Object.keys(wreckFires)) {
      if (!st.wrecks.some(w => w.id === id)) removeFire(id);
    }
  }

  // A bunker knocked out: it stays where it stands, scorched and burning, with nobody in it. Returns the fire
  function setBunkerWreck(w, g, hull) {
    g.userData.way = null;
    hull.visible = true;
    hull.userData.crew.visible = false;
    Fire.scorch(hull);
    const fire = Fire.make(Math.PI);
    fire.position.set(w.x + hull.position.x, 0, w.y + hull.position.z);
    fire.userData.wreck = w;
    scene.add(fire);
    return fire;
  }

  // Scorch the hull, set it down in its corner, and light it. Returns the fire
  function setWreck(st, w, g) {
    const hull = g.userData.bases[0];
    if (PIECES[w.kind].bunker) return setBunkerWreck(w, g, hull);
    // Square to the field: the way it faced, to the nearest quarter turn
    const quarter = Math.round(hull.rotation.y / (Math.PI / 2));
    const facing = quarter * (Math.PI / 2);
    // A tank's length runs the way it faces: east-west on an even quarter turn, north-south on an odd one
    const eastWest = Math.abs(quarter) % 2 === 0;
    const houses = ['village', 'hamlet'].includes(Sim.tileType(w.x, w.y));
    const reach = houses ? WRECK_YARD : WRECK_OPEN;
    const offX = eastWest ? reach.along : reach.across;
    const offZ = eastWest ? reach.across : reach.along;
    // Towards its corner, from the middle of the field
    const cx = 0.5 + (w.corner.includes('e') ? offX : -offX);
    const cz = 0.5 + (w.corner.includes('s') ? offZ : -offZ);
    // Stops dead there, a little askew and down on one side
    g.userData.way = null;
    aim(g, w.x, w.y, 0, true);
    hull.visible = true;
    const askew = (w.x * 7 + w.y * 13) % 2 ? 0.09 : -0.09;
    aim(hull, cx, cz, facing + askew, true);
    hull.rotation.z = 0.03;
    hull.rotation.x = askew * 0.35;
    Fire.scorch(hull);
    // The fire on the hull
    const fire = Fire.make(facing);
    fire.position.set(w.x + cx, 0, w.y + cz);
    fire.userData.wreck = w;
    scene.add(fire);
    return fire;
  }

  function removeFire(id) {
    scene.remove(wreckFires[id].fire);
    Fire.free(wreckFires[id].fire);
    delete wreckFires[id];
    // The hull goes when the piece isn't drawn (see updatePieces), the patch and flames with the fire
  }

  // One frame of the fires: burning hard to the end of the next round, then just smouldering. Returns true if any is lit
  function burnWrecks(st, now, dt) {
    const ids = Object.keys(wreckFires);
    for (const id of ids) {
      const { fire } = wreckFires[id];
      Fire.burn(fire, now, dt, st.turn <= fire.userData.wreck.turn + 1 ? 1 : 0.3);
    }
    return ids.length > 0;
  }

  // ---------- Highlights on the table ----------
  // Red diagonal hatching for the fields a Move & shoot can go to (fire from there)
  const hatchTex = {};
  // Diagonal stripes: red for Move & shoot, blue for the village to take. crossed: stripes both ways, for a Move & shoot
  // to where it has a shot at close range (Steve). HAIL_MARY_RED: weaker red, where its only shot would be a Hail Mary (Steve)
  const HAIL_MARY_RED = 'rgba(232,53,42,.32)';
  function hatch(colour = 'rgba(232,53,42,.85)', crossed = false) {
    const key = colour + (crossed ? '/crossed' : '');
    if (!hatchTex[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.strokeStyle = colour; g.lineWidth = 10;
      for (let k = -128; k < 256; k += 32) { g.beginPath(); g.moveTo(k, 128); g.lineTo(k + 128, 0); g.stroke(); }
      if (crossed) for (let k = -128; k < 256; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); }
      hatchTex[key] = new T.CanvasTexture(c);
      hatchTex[key].wrapS = hatchTex[key].wrapT = T.RepeatWrapping;
    }
    return hatchTex[key];
  }
  const MARK = { hatch: '#e8352a', goal: '#3c96ff', assault: '#ff2a1a', cover: '#7dff5a', line: '#7dff5a', move: '#7fc6e0', charge: '#e0705f', shoot: '#e6c95a', rally: '#8fd47a', fire: '#e8a05a', breach: '#c9a46a', attach: '#b9a0e0', select: '#fff6dc', hover: '#ffffff', blast: '#ff5a1e', splash: '#ff9a3c', reach: '#8fd47a' };

  // A coloured square of light on a field, with a brighter rim
  // spot: a Move & shoot field's cells (Steve: only the areas it can fire from are hatched; the rest a Charge's wash if
  // it can charge there)
  function mark(x, y, kind, inset = 0.05, spot = null) {
    // (a field that takes a click but shows nothing: the bomber's aim)
    if (kind === 'unlit') return;
    const c = new T.Color(MARK[kind]);
    if (spot && spot.cells && kind === 'hatch') { markCells(x, y, spot); return; }
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

  // A Move & shoot field area by area: red hatching on each area it could fire from, a Charge's wash on the others if it
  // can charge there, and the field's red rim
  function markCells(x, y, spot) {
    const red = new T.Color(MARK.hatch);
    for (const k of ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']) {
      const p = Sim.placeXY(k === 'c' ? null : k), cx = x + 0.5 + p.x / 3, cz = y + 0.5 + p.y / 3;
      const shoots = spot.cells.includes(k);
      if (!shoots && !spot.canCharge) continue;
      // A Hail Mary is only ever pale, one way (Steve: pale and crossed was confusing), even at close range
      const hailMary = shoots && (spot.hailCells || []).includes(k);
      const close = shoots && !hailMary && (spot.closeCells || []).includes(k);
      const material = shoots
        ? new T.MeshBasicMaterial({ map: hatch(hailMary ? HAIL_MARY_RED : undefined, close), transparent: true, opacity: close ? 0.95 : 0.8, depthWrite: false })
        : new T.MeshBasicMaterial({ color: new T.Color(MARK.charge), transparent: true, opacity: 0.16, depthWrite: false });
      const cell = new T.Mesh(new T.PlaneGeometry(1 / 3 - 0.02, 1 / 3 - 0.02), material);
      at(cell, cx, 0.004, cz, -Math.PI / 2, 0, 0); marks.add(cell);
    }
    const s = 0.45, pts = [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]].map(([a, b]) => new T.Vector3(x + 0.5 + a, 0.006, y + 0.5 + b));
    // (the rim as weak as the hatching, if nothing better than a Hail Mary is to be had anywhere in the field)
    const onlyHail = spot.cells.length > 0 && spot.cells.every(k => (spot.hailCells || []).includes(k));
    marks.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: red, transparent: true, opacity: onlyHail ? 0.4 : 0.95 })));
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
    // A bar along each burnt-out landing craft it would be right beside (Steve: cover like a hedge, shown like one)
    const wrecks = Sim.wrecksBeside(st, h.x, h.y, [h.side || 'c']);
    for (const { feature: f, way } of wrecks) {
      // The wreck's middle, then out past its edge towards the piece
      const mid = Sim.placeXY(f.side);
      const cx = f.x + 0.5 + mid.x / 3 + way.x * 0.22, cz = f.y + 0.5 + mid.y / 3 + way.y * 0.22;
      const along = f.side === 'n' || f.side === 's';
      const bar = new T.Mesh(new T.PlaneGeometry(along ? 0.9 : 0.12, along ? 0.12 : 0.9), green);
      // (drawn after the wreck, so its hull never hides it)
      bar.renderOrder = 10;
      at(bar, cx, 0.02, cz, -Math.PI / 2, 0, 0); marks.add(bar);
    }
    const byWreck = wrecks.length > 0;
    // A ring where it would stand
    const p = Sim.placeXY(h.side);
    const ring = new T.Mesh(new T.RingGeometry(0.1, 0.14, 32), new T.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }));
    at(ring, h.x + 0.5 + p.x * 0.3, 0.02, h.y + 0.5 + p.y * 0.3, -Math.PI / 2, 0, 0); marks.add(ring);
    if (inCover) mark(h.x, h.y, 'cover', 0.08);
    const text = byHedge ? 'Cover: hedge' : inCover ? `Cover: ${type === 'orchard' ? 'trees' : 'houses'}` : byWreck ? 'Cover: wreck' : 'In the open';
    const w = word(text, byHedge || inCover || byWreck ? '#9dff7a' : '#f0e8d6', false);
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
  const reticleTex = {};
  function reticle(colour = '#e8352a') {
    if (!reticleTex[colour]) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.strokeStyle = colour; g.lineWidth = 9; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
      g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 7;
      for (const [x1, y1, x2, y2] of [[64, 6, 64, 36], [64, 92, 64, 122], [6, 64, 36, 64], [92, 64, 122, 64]]) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
      g.fillStyle = colour; g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
      reticleTex[colour] = new T.CanvasTexture(c);
    }
    return new T.Sprite(new T.SpriteMaterial({ map: reticleTex[colour], depthTest: false, transparent: true }));
  }

  // Where a piece is on the table: the middle of its bases
  function pieceCentre(u) {
    const g = pieces[u.id], c = new T.Vector3(), n = { k: 0 };
    if (!g) return new T.Vector3(u.x + 0.5, 0, u.y + 0.5);
    for (const b of g.userData.bases) if (b.visible) { c.x += (b.userData.to ? b.userData.to.x : b.position.x); c.z += (b.userData.to ? b.userData.to.z : b.position.z); n.k++; }
    const to = g.userData.to || { x: g.position.x, z: g.position.z };
    return n.k ? new T.Vector3(to.x + c.x / n.k, 0, to.z + c.z / n.k) : new T.Vector3(u.x + 0.5, 0, u.y + 0.5);
  }

  // The score each die needs, in a red label that reads top to bottom (Steve): "3+", "+1 small target", "+1 long range",
  // then the total, "5+", in big figures
  const labelTex = {};
  // A word bubble: why, row by row, the score in big figures under it, and a pointed tail at the bottom (tailDown) or
  // top, towards the target. The sprite's anchor is the tip of the tail
  function needLabel(n, why = [], tailDown = true) {
    const key = n + '|' + why.join(',') + '|' + tailDown;
    if (!labelTex[key]) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      // One row for each modifier (Steve: stacked, not all on one line), then the score
      g.font = 'bold 30px Georgia, serif';
      // (no tail of its own, Steve: the long arrow to the target comes out from behind the bubble)
      const tail = 0, row = 36, big = 64, boxH = big + why.length * row + (why.length ? 10 : 0);
      const widest = Math.max(0, ...why.map(w => g.measureText(w).width));
      // Past 6: a Hail Mary (Steve), in words instead of a score
      const hailMary = n > MAX_NEED, scoreText = hailMary ? 'HAIL MARY' : n + '+', scoreFont = hailMary ? 'bold 36px Georgia, serif' : 'bold 48px Georgia, serif';
      g.font = scoreFont;
      const scoreWide = g.measureText(scoreText).width;
      g.font = 'bold 30px Georgia, serif';
      c.width = Math.max(128, Math.ceil(Math.max(widest, scoreWide)) + 36); c.height = boxH + tail + 8;
      const top = tailDown ? 4 : tail + 4, mid = c.width / 2;
      // The bubble and its tail in one shape, with a pale outline
      g.beginPath();
      g.roundRect(4, top, c.width - 8, boxH, 16);
      g.fillStyle = 'rgba(150,25,20,.94)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,230,200,.85)'; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // The rows: the 3+ start, then each +1 (or −1 elite)
      g.font = 'bold 30px Georgia, serif'; g.fillStyle = '#ffd9a0';
      why.forEach((w, k) => g.fillText(w, mid, top + 10 + row / 2 + k * row));
      // A line under them, then the score in big figures
      const scoreY = top + (why.length ? 10 + why.length * row : 0) + big / 2;
      if (why.length) { g.fillStyle = 'rgba(255,230,200,.6)'; g.fillRect(16, scoreY - big / 2 - 2, c.width - 32, 2); }
      g.fillStyle = '#fff4e8'; g.font = scoreFont;
      g.fillText(scoreText, mid, scoreY);
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
  const reticleHome = u => { const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u); return new T.Vector3(p.x, big ? 0.62 : 0.5, p.z); };
  // (nudged clear of the cross-hair beside it when two would overlap, Steve: see placeLabels)
  let reticleNudges = new Map();     // target id: how far it is moved, on the table
  const reticleSpot = u => { const home = reticleHome(u), nudge = reticleNudges.get(u.id); return nudge ? home.add(nudge) : home; };

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

  // The pieces the chosen captain can rally (Steve): a blue ring and a blue cross-hair on each, himself too; a click rallies
  function markRallies(list) {
    for (const u of list) {
      if (!pieces[u.id]) continue;
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.26 : 0.17, big ? 0.32 : 0.22, 48), new T.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.9, depthWrite: false }));
      at(ring, p.x, 0.008, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
      const r = reticle('#3f8cff'); r.scale.setScalar(big ? 0.62 : 0.5); r.position.copy(reticleSpot(u)); marks.add(r);
    }
  }

  function markTargets(list, hot) {
    const pulse = 1 + 0.08 * Math.sin(performance.now() / 180);
    // Where each score bubble goes, all together, so none covers another target or another bubble (Steve)
    placeLabels(list.filter(u => u.needNow));
    for (const u of list) {
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u), lit = hot && hot.id === u.id;
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.26 : 0.17, big ? 0.32 : 0.22, 48), new T.MeshBasicMaterial({ color: 0xe8352a, transparent: true, opacity: 0.9, depthWrite: false }));
      at(ring, p.x, 0.008, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
      // The cross-hair, bigger under the pointer
      const r = reticle(); r.scale.setScalar((big ? 0.62 : 0.5) * pulse * (lit ? 1.45 : 1)); r.position.copy(reticleSpot(u)); marks.add(r);
      pulsers.push({ sprite: r, size: (big ? 0.62 : 0.5) * (lit ? 1.45 : 1) });
      // Nudged off its piece: a thin red line back down to it, so it is clear whose it is
      if (reticleNudges.has(u.id)) marks.add(new T.Line(new T.BufferGeometry().setFromPoints([reticleSpot(u), new T.Vector3(p.x, 0.02, p.z)]), new T.LineBasicMaterial({ color: 0xe8352a, transparent: true, opacity: 0.8, depthTest: false })));
      // The score and why in a word bubble about three fields away (Steve), so it hides nothing near the target: up the
      // board for a target in the near half, down it for one in the far half, with a line from the tail to the cross-hair
      if (u.needNow) {
        const { farHalf, anchor } = labelAnchor(u);
        const l = needLabel(u.needNow, u.needWhy || [], !farHalf);
        l.position.copy(anchor); l.renderOrder = 6; marks.add(l);
        // The arrow starts behind the middle of the bubble, so it seems to come out of it (Steve)
        marks.add(wedge(bubbleMiddle(l, anchor, farHalf), reticleSpot(u), 0.22, lit ? 0xc0261c : 0x961914));
      }
    }
  }

  // Where a target's score bubble sits: wherever placeLabels put it this frame, otherwise about three fields up the board
  // from a target in the near half, down it in the far half
  let labelPlaces = new Map();       // target id → { anchor, farHalf }
  function labelAnchor(u) {
    if (labelPlaces.has(u.id)) return labelPlaces.get(u.id);
    const p = pieceCentre(u), farHalf = u.y < ROWS / 2;
    return { farHalf, anchor: new T.Vector3(p.x, 0.3, Math.max(0.4, Math.min(ROWS - 0.4, p.z + (farHalf ? 2.6 : -2.6)))) };
  }

  // The middle of a bubble on the table, from its anchor (the edge nearest its target)
  function bubbleMiddle(l, anchor, farHalf) {
    camera.updateMatrixWorld();
    const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    return anchor.clone().addScaledVector(up, l.scale.y * 0.5 * (farHalf ? -1 : 1));
  }

  // The box a bubble covers on the page, from its tail's spot (farHalf: the bubble hangs below its tail)
  function bubbleBox(u, anchor, farHalf) {
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

  // The box a target's score bubble covers on the page, so the piece menu can keep clear of it
  function labelBox(u) {
    const { farHalf, anchor } = labelAnchor(u);
    return bubbleBox(u, anchor, farHalf);
  }

  // Place every target's bubble so neither it nor its arrow covers another target (Steve), no two arrows cross and it
  // stays on the screen (see Labels). The spots to try ring each target, near first. Worked out once for each set of
  // targets, not every frame
  const LABEL_RINGS = [1.1, 1.6, 2.2, 2.9, 3.6];
  const LABEL_ANGLES = 16;
  let labelKey = '', labelReport = null;
  function placeLabels(list) {
    if (!list.length) { labelPlaces = new Map(); reticleNudges = new Map(); labelKey = ''; labelReport = null; return; }
    const r = renderer.domElement.getBoundingClientRect();
    const key = [r.width, r.height, ...list.map(u => { const p = pieceCentre(u); return [u.id, p.x.toFixed(2), p.z.toFixed(2), u.needNow, (u.needWhy || []).join('/')].join(':'); })].join('|');
    if (key === labelKey) return;
    labelKey = key;
    camera.updateMatrixWorld();
    const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    // First the cross-hairs, nudged apart where they would overlap (see Labels.spread)
    reticleNudges = new Map();
    const sized = list.map(u => {
      const spot = reticleHome(u), p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u), world = big ? 0.3 : 0.24;
      const aim = screenPoint(spot.x, spot.z, spot.y), across = spot.clone().addScaledVector(right, world), edge = screenPoint(across.x, across.z, across.y);
      const radius = Math.hypot(edge.x - aim.x, edge.y - aim.y), base = screenPoint(p.x, p.z, 0);
      return { x: aim.x, y: aim.y, r: radius, base: { x: base.x, y: base.y, r: radius }, perPixel: world / radius };
    });
    Labels.spread(sized).forEach((m, i) => {
      if (Math.hypot(m.dx, m.dy) < 0.5) return;
      // Pixels on the page to a move on the table: across and up the screen (the page's y runs down)
      reticleNudges.set(list[i].id, right.clone().multiplyScalar(m.dx * sized[i].perPixel).addScaledVector(up, -m.dy * sized[i].perPixel));
    });
    const items = list.map((u, n) => {
      const p = pieceCentre(u), spot = reticleSpot(u), radius = sized[n].r;
      const aim = screenPoint(spot.x, spot.z, spot.y);
      // The target on the page: its cross-hair and the ring round its base, each a circle
      const base = sized[n].base;
      const circles = [{ x: aim.x, y: aim.y, r: radius }, { x: base.x, y: base.y, r: radius }];
      // The spots round it
      const options = [];
      for (const ring of LABEL_RINGS) for (let k = 0; k < LABEL_ANGLES; k++) {
        const angle = k / LABEL_ANGLES * Math.PI * 2;
        const anchor = new T.Vector3(Math.max(-0.6, Math.min(COLS + 0.6, p.x + ring * Math.cos(angle))), 0.3, Math.max(-0.9, Math.min(ROWS - 0.2, p.z + ring * Math.sin(angle))));
        // (a bubble below its target on the screen hangs down from its edge, one above stands on it)
        const farHalf = anchor.z > p.z;
        const box = bubbleBox(u, anchor, farHalf);
        options.push({ anchor, farHalf, box, mid: { x: box.x + box.w / 2, y: box.y + box.h / 2 } });
      }
      return { id: u.id, aim, circles, options };
    });
    const chosen = Labels.place(items, { x: r.left, y: r.top, w: r.width, h: r.height });
    labelPlaces = new Map();
    items.forEach((item, i) => { const o = item.options[chosen[i]]; labelPlaces.set(item.id, { anchor: o.anchor, farHalf: o.farHalf }); });
    labelReport = Labels.problems(items, chosen);
  }

  // ---------- Shooting on the table ----------
  // Each new shot plays once: a muzzle flash at the shooter, then tracers (rifles a few, machine guns a stream) or one
  // glowing shell (tanks and guns) or a rocket trail flying to the target; where it lands, dust and sparks for bullets,
  // a bright strike on armour, or a high-explosive burst with smoke when a gun fires on men. Artillery and mortars burst only
  // ---------- Fireworks (Steve: Paris liberated) ----------
  // Rockets going up over the Eiffel Tower and bursting into stars in the colours of the French flag, then falling and
  // fading. Each rocket: when it goes up, where it bursts, its stars flying out
  let fireworks = null;
  const FIREWORK = { rise: 1.1, burstHigh: [3.2, 4.2], stars: 36, starLife: 1.8, speed: 0.9, fall: 0.6, every: 0.6 };
  const FIREWORK_COLOURS = ['rgba(60,110,255,1)', 'rgba(255,255,255,1)', 'rgba(255,60,50,1)', 'rgba(255,215,90,1)'];
  function startFireworks(x, z, seconds) {
    endFireworks();
    const group = new T.Group();
    scene.add(group);
    const t0 = performance.now() / 1000;
    const rockets = [];
    for (let k = 0; k < seconds / FIREWORK.every; k++) {
      const colour = FIREWORK_COLOURS[k % FIREWORK_COLOURS.length];
      const burst = new T.Vector3(x + (Math.random() - 0.5) * 2.4, FIREWORK.burstHigh[0] + Math.random() * (FIREWORK.burstHigh[1] - FIREWORK.burstHigh[0]), z + (Math.random() - 0.5) * 1.2);
      const trail = glow('rgba(255,220,150,1)');
      trail.scale.setScalar(0.12);
      trail.visible = false;
      group.add(trail);
      const stars = [];
      for (let i = 0; i < FIREWORK.stars; i++) {
        // A direction on a sphere
        const up = Math.random() * 2 - 1, round = Math.random() * Math.PI * 2, flat = Math.sqrt(1 - up * up);
        const s = glow(colour);
        s.visible = false;
        group.add(s);
        stars.push({ sprite: s, dir: new T.Vector3(flat * Math.cos(round), up, flat * Math.sin(round)).multiplyScalar(FIREWORK.speed * (0.7 + Math.random() * 0.3)) });
      }
      rockets.push({ start: t0 + k * FIREWORK.every + Math.random() * 0.3, from: new T.Vector3(x, 0.2, z), burst, trail, stars });
    }
    fireworks = { group, rockets, until: t0 + seconds + FIREWORK.rise + FIREWORK.starLife };
  }
  function endFireworks() {
    if (!fireworks) return;
    scene.remove(fireworks.group);
    freeObject(fireworks.group);
    fireworks = null;
  }
  // Move them on; true while any are still in the sky
  function moveFireworks(now) {
    if (!fireworks) return false;
    const t = now / 1000;
    if (t > fireworks.until) { endFireworks(); return false; }
    for (const r of fireworks.rockets) {
      const age = t - r.start;
      // Going up: a spark on its way to where it bursts
      const rising = age >= 0 && age < FIREWORK.rise;
      r.trail.visible = rising;
      if (rising) r.trail.position.lerpVectors(r.from, r.burst, age / FIREWORK.rise);
      // Burst: the stars fly out, drop and fade
      const after = age - FIREWORK.rise;
      const shining = after >= 0 && after < FIREWORK.starLife;
      for (const s of r.stars) {
        s.sprite.visible = shining;
        if (!shining) continue;
        const slow = 1 - Math.exp(-after * 2.2);
        s.sprite.position.copy(r.burst).addScaledVector(s.dir, slow);
        s.sprite.position.y -= FIREWORK.fall * after * after;
        const fade = 1 - after / FIREWORK.starLife;
        s.sprite.material.opacity = fade;
        s.sprite.scale.setScalar(0.09 + 0.05 * fade);
      }
    }
    return true;
  }

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
      // The canvas as wide as the words need (long ones like "Tank knocked out" were clipped), never narrower than 512
      const font = `bold ${big ? 74 : 60}px Georgia, serif`;
      const c = document.createElement('canvas'), g = c.getContext('2d');
      g.font = font;
      c.width = Math.max(512, Math.ceil(g.measureText(text).width) + 40); c.height = 128;
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 12; g.strokeStyle = 'rgba(20,14,8,.85)'; g.strokeText(text, c.width / 2, 66);
      g.fillStyle = colour; g.fillText(text, c.width / 2, 66);
      wordTex[key] = { map: new T.CanvasTexture(c), wide: c.width / 512 };
    }
    const t = wordTex[key], size = big ? 1.05 : 0.78;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t.map, transparent: true, depthTest: false }));
    s.scale.set(size * t.wide, size / 4, 1);
    return s;
  }
  const RESULT_COLOUR = { 'Missed': '#d8d2c4', 'No effect': '#e6d29a', 'Shaken': '#ffb04a', 'Section lost': '#ff6a50', 'Tank knocked out': '#ff6a50', 'Wiped out': '#ff3b2e', 'Destroyed': '#ff3b2e' };

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
  // How many bases of a piece to show: what it had until the shot lands, then what it has. In hand to hand, a base
  // goes at each blow that takes it (steps: the times they go)
  const shownStrength = u => {
    const h = holding(u.id);
    if (!h) return u.platoons;
    const now = performance.now();
    const gone = h.steps ? h.steps.filter(t => now >= t).length : 0;
    return Math.max(0, h.count - gone);
  };

  // Hand to hand on the table (Steve): each blow in turn, MELEE_BLOW seconds apart. The striking side's bases lunge at
  // the other side, Hit! or Miss rises over the other side for each die, and each base a hit takes drops away
  const MELEE_BLOW = 1.1;            // seconds for each side's blow
  const MELEE_LAND = 0.45;           // when in its blow the hits land
  // Until when the fights on the table are still being shown (the page waits for them before the next token)
  let meleeUntil = 0;
  function busyFor() { return settledIn(); }
  // How long until every shot on the table has landed and every fight is shown (Steve: the game's end waits for it)
  function settledIn() {
    const untils = Object.values(held).map(h => h.until);
    const latest = Math.max(meleeUntil, flightUntil, ...untils);
    return Math.max(0, latest - performance.now());
  }

  function startMelee(f, t0) {
    // When each piece loses each base, from the blows in order
    const steps = {};
    f.strikes.forEach((b, k) => b.losses.forEach((id, j) => (steps[id] = steps[id] || []).push(t0 + (k * MELEE_BLOW + MELEE_LAND + j * 0.08) * 1000)));
    const end = t0 + f.strikes.length * MELEE_BLOW * 1000;
    meleeUntil = Math.max(meleeUntil, end + 300);
    // Everyone in the fight keeps the bases they started with until each is taken, and stays on the table till then
    for (const id of Object.keys(f.before)) {
      const times = steps[id] || [];
      held[id] = { until: times.length && times.length >= f.before[id] ? times[times.length - 1] + 1 : end, count: f.before[id], visible: true, steps: times };
    }
    // The sounds of each blow: rifles and the thud of blows, a tank's gun for a tank
    f.strikes.forEach((b, k) => {
      const wait = (t0 - performance.now()) / 1000 + k * MELEE_BLOW;
      Sound.play('rifle', wait);
      if (b.losses.length) Sound.play('bullets', wait + MELEE_LAND);
    });
  }

  // Draw one fight's blows at time t (seconds since it began)
  function playMelee(f, t, add) {
    f.strikes.forEach((b, k) => {
      const bt = t - k * MELEE_BLOW;
      if (bt < 0 || bt > MELEE_BLOW) return;
      // Where the other side is: the middle of its pieces' bases
      const spots = b.victims.filter(id => pieces[id]).map(id => pieceCentre({ id, x: f.x, y: f.y }));
      if (!spots.length) return;
      const aim = spots.reduce((a, p) => a.add(p), new T.Vector3()).multiplyScalar(1 / spots.length);
      // The lunge: out and back in the first part of the blow
      const lunge = bt < 0.5 ? Math.sin(bt / 0.5 * Math.PI) * 0.16 : 0;
      for (const id of b.strikers) {
        const g = pieces[id];
        if (!g) continue;
        for (const base of g.userData.bases) {
          if (!base.visible || !base.userData.to) continue;
          const wx = g.userData.to.x + base.userData.to.x, wz = g.userData.to.z + base.userData.to.z;
          const d = new T.Vector3(aim.x - wx, 0, aim.z - wz);
          if (d.length() < 0.001) continue;
          d.normalize();
          base.position.x = base.userData.to.x + d.x * lunge; base.position.z = base.userData.to.z + d.z * lunge;
        }
      }
      // Hit! or Miss for each die, rising over the other side one after another
      b.faces.slice(0, 9).forEach((r, i) => {
        const wt = bt - MELEE_LAND + 0.1 - i * 0.07;
        if (wt < 0 || wt > 0.9) return;
        const w = add(word(r.hit ? 'Hit!' : 'Miss', r.hit ? '#ffcf6a' : '#cfcac0', false));
        w.material.opacity = Math.min(1, 2.5 * (0.9 - wt));
        w.position.set(aim.x + ((i % 3) - 1) * 0.28, 0.38 + wt * 0.4 + Math.floor(i / 3) * 0.12, aim.z);
      });
      // A puff of dust where the blows land
      if (bt > MELEE_LAND - 0.1 && bt < MELEE_LAND + 0.5) {
        const dt2 = bt - (MELEE_LAND - 0.1);
        const d = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), color: 0x8a7a5a, transparent: true, depthWrite: false, opacity: 0.5 - dt2 * 0.8 })));
        d.scale.setScalar(0.2 + dt2 * 0.4); d.position.set(aim.x, 0.08, aim.z);
      }
    });
    // At the end, who won, over the field
    const tEnd = t - f.strikes.length * MELEE_BLOW;
    if (tEnd >= 0 && tEnd < 1.6) {
      const ours = f.side === playerSide;
      const text = f.won ? (ours ? 'Field taken!' : 'Overrun!') : (ours ? 'Charge beaten' : 'Charge beaten off');
      const w = add(word(text, f.won === ours ? '#9fe08a' : '#ff6a50', true));
      w.material.opacity = Math.min(1, 2 * (1.6 - tEnd));
      w.position.set(f.x + 0.5, 0.75 + tEnd * 0.15, f.y + 0.5);
    }
  }
  const seenFx = new WeakSet();

  // Tanks (Steve): they turn onto the target first, then each tank fires one shell, one after the other
  const TANK_TURN_RATE = 3;          // how fast a tank turns (higher is quicker; everything else glides at 6)
  const TANK_TURN = 0.9;             // seconds a tank takes to swing round before it fires
  const TANK_GAP = 0.45;             // seconds between the two tanks' shells
  // Seconds between one round of a shot and the next: each tank's shell in turn, an MG's burst, a platoon's rifles
  const roundGap = f => (f.weapon === 'gun' ? TANK_GAP : f.weapon === 'mg' ? 0.06 : 0.05);
  // How many rounds a shot sends (one from each base, five from an MG), as counted when it is fired
  const roundsOf = f => (f.weapon === 'mg' ? 5 : Math.max(1, f.bases || 1));

  // An ambush on a piece on the move (Steve: it moved, then was shot, out of order): the shot waits until the piece has
  // got to where it was seen. The rules have worked it all out at once; this only puts it on the table in order
  const FIELD_TIME = { men: 0.5, tank: 0.7 };   // seconds to cross a field, a little over, so it gets there first
  const STOP_AFTER_LANDING = 350;               // how long it stays there after the shot lands, in milliseconds
  let stopsNow = new Map();                     // this batch of shots: piece id → { n, delay, until }

  // When the shot at a piece on the move should go, in seconds from now, and which field along its way that is
  function ambushStop(st, f) {
    const none = { delay: 0 };
    const g = f.midMove && f.to && pieces[f.to.id];
    const u = g && st.units.find(o => o.id === f.to.id);
    if (!u || !g.userData.field) return none;
    const [fromX, fromY] = g.userData.field.split(',').map(Number);
    const seen = { x: f.x, y: f.y };
    const dead = u.x === null;
    // The fields it goes through: to where it now stands, or, killed on the way, to where it was seen
    const fields = dead ? [{ x: fromX, y: fromY }, seen] : [{ x: fromX, y: fromY }, ...(u.trail || []), { x: u.x, y: u.y }];
    const n = Math.max(0, fields.findIndex(p => p.x === seen.x && p.y === seen.y));
    // Killed on the way: it still goes there, to be shot where it was seen
    if (dead && n > 0) {
      const to = g.userData.to;
      g.userData.to = { x: to.x + seen.x - fromX, z: to.z + seen.y - fromY, ry: to.ry };
    }
    const perField = Sim.isTank(u) ? FIELD_TIME.tank : FIELD_TIME.men;
    const before = stopsNow.get(u.id);
    let delay = n * perField;
    if (before) delay = n === before.n ? before.delay : Math.max(delay, (before.until - performance.now()) / 1000 + (n - before.n) * perField);
    return { delay, n, seen, last: fields.length - 1, id: u.id, g };
  }

  // The piece waits there until the shot has landed (at the end of its way it just stands)
  function noteStop(stop, until) {
    if (!stop.g) return;
    const ends = until + STOP_AFTER_LANDING;
    const before = stopsNow.get(stop.id);
    stopsNow.set(stop.id, { n: stop.n, delay: stop.delay, until: Math.max(ends, before && before.n === stop.n ? before.until : 0) });
    if (stop.n >= stop.last) return;
    stop.g.userData.stops = (stop.g.userData.stops || []).concat([{ n: stop.n, x: stop.seen.x, y: stop.seen.y, until: ends }]);
  }

  function startShots(st) {
    stopsNow = new Map();
    for (const f of st.fx) {
      if (seenFx.has(f)) continue;
      seenFx.add(f);
      // A rally: its words float up off the piece
      if (f.kind === 'rally') { shots.push({ f, t0: performance.now(), objs: [] }); continue; }
      // The bomber itself
      if (f.kind === 'flyover') { startFlight(f); shots.push({ f, t0: performance.now(), objs: [] }); continue; }
      // A bomb falls as the plane passes over its field
      if (f.kind === 'bomb' && flight) f.fall = (f.along - flight.start) / FLIGHT.speed + FLIGHT.fall;
      // Hand to hand: its own show, blow by blow
      if (f.kind === 'melee') {
        const t0 = performance.now() + shots.filter(s => performance.now() - s.t0 < 300).length * 180;
        shots.push({ f, t0, objs: [] });
        startMelee(f, t0);
        continue;
      }
      // A tank or gun turns to face what it fires at, and stays facing it
      const shooter = f.from && st.units.find(u => u.id === f.from.id);
      if (shooter && (Sim.isTank(shooter) || shooter.kind === 'pak')) shooter.aim = Math.atan2(-(f.y - f.from.y), f.x - f.from.x);
      // A tank (or the PaK) waits while it turns onto the target (Steve)
      const turning = shooter && (Sim.isTank(shooter) || shooter.kind === 'pak') ? TANK_TURN * 1000 : 0;
      // How many bases fire it: one round each (Steve)
      f.bases = shooter && pieces[shooter.id] ? pieces[shooter.id].userData.bases.filter(b => b.visible).length : 1;
      // (bombs keep to the plane's own time)
      // (an ambush on a piece on the move waits for it to get there)
      const stop = ambushStop(st, f);
      const t0 = f.kind === 'bomb' ? performance.now() : performance.now() + shots.filter(s => performance.now() - s.t0 < 300).length * 180 + turning + stop.delay * 1000;
      shots.push({ f, t0, objs: [] });
      // The target keeps its bases (or stays on the table) until this shot lands
      const target = f.to && pieces[f.to.id];
      if (target) {
        // (the last of a tank pair's shells lands a moment after the first)
        const lastRound = f.weapon === 'gun' ? (roundsOf(f) - 1) * TANK_GAP : 0;
        const land = f.from ? (f.weapon === 'gun' ? 0.25 : f.weapon === 'rocket' ? 0.45 : 0.35) + lastRound : f.kind === 'shell' || f.kind === 'bomb' ? shellFlight(f) : 0;
        const until = t0 + (land + 0.15) * 1000;
        noteStop(stop, until);
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
        // Each tank's gun is heard in turn, and each shell landing; rifles a shot from each base, an MG its five rounds
        // (Steve: as many as the table shows); other weapons once
        const heard = f.weapon === 'gun' ? roundsOf(f) : 1;
        for (let k = 0; k < heard; k++) {
          Sound.play(Sim.fireSound(shooter, f.weapon, f.side), wait + k * TANK_GAP, false, roundsOf(f));
          // (a hit on a tank too, Steve: the same burst as a bazooka's, not the old clang)
          Sound.play(f.weapon === 'gun' || f.weapon === 'rocket' ? 'he' : 'bullets', wait + k * TANK_GAP + flight);
        }
      } else if (f.kind === 'shell') {
        // Fire support: the first round of a mission is heard fired and coming in; up to four rounds are heard landing
        const flight = shellFlight(f);
        const sameMission = shots.filter(s => s.f.kind === 'shell' && !s.f.from && Math.abs(s.t0 - t0) < 1500).length;
        if (sameMission === 1) {
          Sound.play(f.support === 'artillery' ? 'distantGun' : 'mortar', wait);
          Sound.play('incoming', wait + 0.25, flight - 0.25);
        }
        if (sameMission <= 4) Sound.play('he', wait + flight, f.support === 'artillery');
      } else if (f.kind === 'bomb') {
        // Each bomb bursting as it lands
        Sound.play('he', wait + shellFlight(f), true);
      }
    }
  }

  // How long a mortar bomb or an artillery shell is in the air, seen arcing in
  const shellFlight = f => (f.kind === 'bomb' ? f.fall || 0 : f.support === 'artillery' ? 1.6 : 1.3);

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
    // (an ambush on a piece on the move lands where it was seen, not where it is going: the same place in that field)
    let to = new T.Vector3(f.x + 0.5, 0, f.y + 0.5);
    if (pieces[tu.id]) {
      to = pieceCentre(tu);
      const g = pieces[tu.id];
      if (f.midMove && g.userData.to) to = new T.Vector3(f.x + to.x - g.userData.to.x, to.y, f.y + to.z - g.userData.to.z);
    }
    let from = null;
    if (f.from) from = pieces[f.from.id] ? pieceCentre({ id: f.from.id, x: f.from.x, y: f.from.y }) : new T.Vector3(f.from.x + 0.5, 0, f.from.y + 0.5);
    return { from, to };
  }

  function playShots(now) {
    while (fxMarks.children.length) { const o = fxMarks.children[0]; fxMarks.remove(o); freeObject(o); }
    // (a hand-to-hand fight stays as long as its blows take)
    // (the bomber stays until it has flown off, a bomb until its words have faded)
    const lasts = f => (f.kind === 'melee' ? (f.strikes.length * MELEE_BLOW + 2) * 1000 : f.kind === 'flyover' ? f.length * 1000 + 200 : f.kind === 'bomb' ? ((f.fall || 0) + 3) * 1000 : 5000);
    shots = shots.filter(s => now - s.t0 < lasts(s.f));
    for (const s of shots) {
      const f = s.f, t = (now - s.t0) / 1000;
      if (t < 0) continue;
      const add = o => { fxMarks.add(o); return o; };
      if (f.kind === 'melee') { playMelee(f, t, add); continue; }
      if (f.kind === 'flyover') { moveFlight(t); continue; }
      // A rally (Steve): "Rallied!" in green (or the captain's "Up and moving"), rising off the piece
      if (f.kind === 'rally') {
        if (t > 1.8 || !pieces[f.to.id]) continue;
        const p = pieceCentre({ id: f.to.id, x: f.x, y: f.y });
        const w = add(word(f.result, f.ok ? '#9fe08a' : '#ff6a50', true));
        w.material.opacity = Math.min(1, 2 * (1.8 - t));
        w.position.set(p.x, 0.5 + t * 0.2, p.z);
        continue;
      }
      const { from, to } = shotEnds(f);
      // A tank firing: it has turned to its target (see startShots); each tank rocks back with the recoil of its own
      // shot, one after the other (Steve)
      if (from && f.weapon === 'gun' && pieces[f.from.id]) {
        const d = new T.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
        const firing = pieces[f.from.id].userData.bases.filter(b => b.visible && b.userData.to);
        firing.forEach((b, k) => {
          // This tank's own moment: from its shot to a third of a second after
          const bt = t - k * roundGap(f);
          if (bt < 0 || bt > 0.35) return;
          const back = Math.sin(bt / 0.35 * Math.PI) * 0.04;
          b.position.x = b.userData.to.x - d.x * back; b.position.z = b.userData.to.z - d.z * back;
        });
      }
      const h = f.weapon === 'gun' ? 0.16 : 0.12;
      const flight = f.weapon === 'gun' ? 0.25 : f.weapon === 'rocket' ? 0.45 : 0.35;
      // Muzzle flash: at each base as its round goes (each tank in turn)
      if (from) {
        shotMuzzles(f, from).forEach((o, k) => {
          const mt = t - k * roundGap(f);
          if (mt < 0 || mt > 0.12 || (f.weapon === 'mg' && k)) return;
          const m = add(glow('rgba(255,200,90,.95)')); m.scale.setScalar(f.weapon === 'gun' ? 0.32 : 0.16); m.position.set(o.x, h, o.z);
        });
      }
      // Tracers, a shell or a rocket on its way: one from each base that fires (Steve), the MG team five
      if (from && t < flight + 0.2 + (roundsOf(f) - 1) * roundGap(f)) {
        const muzzles = shotMuzzles(f, from);
        for (let k = 0; k < muzzles.length; k++) {
          const tk = t - k * roundGap(f);
          if (tk < 0 || tk > flight) continue;
          const o = muzzles[k];
          const p = tk / flight, spread = f.weapon === 'mg' ? (k % 3 - 1) * 0.03 : 0;
          const head = new T.Vector3(T.MathUtils.lerp(o.x, to.x, p), h - 0.04 * p + 0.05 * Math.sin(p * Math.PI) * (f.weapon === 'rocket' ? 1 : 0.3), T.MathUtils.lerp(o.z, to.z, p) + spread);
          const back = Math.max(0, p - (f.weapon === 'gun' ? 0.18 : 0.1));
          const tail = new T.Vector3(T.MathUtils.lerp(o.x, to.x, back), h - 0.04 * back, T.MathUtils.lerp(o.z, to.z, back) + spread);
          // The streak: glowing beads from tail to head, red tracer for the Americans, green for the Germans, a white-hot shell
          const colour = f.weapon === 'gun' ? 'rgba(255,236,170,1)' : f.weapon === 'rocket' ? 'rgba(255,170,90,1)' : f.side === 'de' ? 'rgba(120,255,110,1)' : 'rgba(255,70,40,1)';
          for (let b = 0; b <= 4; b++) {
            const bead = add(glow(colour));
            bead.scale.setScalar((f.weapon === 'gun' ? 0.1 : 0.06) * (0.45 + b * 0.14));
            bead.position.lerpVectors(tail, head, b / 4);
          }
          if (f.weapon === 'rocket') rocketFlames(add, o, head, tail, tk);
          // A tank's shell flies like the bazooka's rocket (Steve): a glowing round trailing smoke, no flame
          if (f.weapon === 'gun') shellTrail(add, o, tail);
        }
      }
      // A mortar bomb or shell arcing in: a glowing round with a trail of smoke behind it
      const land = from ? flight : f.kind === 'shell' || f.kind === 'bomb' ? shellFlight(f) : 0, lt = t - land;
      // A bomb on its way down from the plane
      if (f.kind === 'bomb' && lt < 0 && lt > -FLIGHT.fall) {
        const b = add(glow('rgba(40,36,30,1)'));
        b.scale.setScalar(0.09);
        b.position.set(to.x, FLIGHT.height * (-lt / FLIGHT.fall), to.z);
      }
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
          const w = add(word(r.hit ? 'Hit!' : r.lead ? '6! Again' : 'Miss', r.hit || r.lead ? '#ffcf6a' : '#cfcac0', false));
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
      const big = f.kind === 'shell' || f.kind === 'bomb' || (f.weapon === 'gun' && !f.armour) || f.weapon === 'rocket';
      // A tank pair's shells land one after the other: each its own burst (the first lands at lt = 0)
      const bursts = f.weapon === 'gun' ? roundsOf(f) : 1;
      if (big) for (let k = 0; k < bursts; k++) { const bt = lt - k * TANK_GAP; if (bt >= 0) explosion(add, f, to, bt); }
      else if (f.armour && f.weapon === 'gun') {
        // A shell striking armour: a white-hot spark for each tank's shell
        for (let k = 0; k < bursts; k++) { const bt = lt - k * TANK_GAP; if (bt >= 0 && bt < 0.25) { const b = add(glow('rgba(255,255,220,1)')); b.scale.setScalar(0.25 * (1 - bt * 2)); b.position.set(to.x, 0.12, to.z); } }
      } else if (lt < 0.6) {
        // Bullets: little spurts of dust round the target
        for (let k = 0; k < (f.weapon === 'mg' ? 6 : 3); k++) { const d = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.6 - lt }))); d.scale.setScalar(0.05 + lt * 0.1); d.position.set(to.x + Math.sin(k * 2.3) * 0.12, 0.03 + lt * 0.05, to.z + Math.cos(k * 1.7) * 0.1); }
      }
    }
    return shots.length > 0;
  }

  // Where each round of a shot leaves from (Steve): one from each base of the piece that fires (a rifle platoon one a
  // section, a tank one a tank, the sniper, the captain and a bazooka one), but an MG team fires five from its gun
  function shotMuzzles(f, from) {
    const g = pieces[f.from.id];
    const bases = g ? g.userData.bases.filter(b => b.visible && b.userData.to) : [];
    // Each base, where it stands on the table
    const spots = bases.map(b => new T.Vector3(g.userData.to.x + b.userData.to.x, 0, g.userData.to.z + b.userData.to.z));
    if (!spots.length) spots.push(from);
    // The machine gun: five rounds from the one gun
    if (f.weapon === 'mg') return [0, 1, 2, 3, 4].map(() => spots[0]);
    return spots;
  }

  // A tank's shell on its way: smoke left behind along the way it came
  function shellTrail(add, from, tail) {
    for (let b = 1; b <= 3; b++) {
      const sm = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.45 - b * 0.1 })));
      sm.scale.setScalar(0.06 + b * 0.03);
      sm.position.copy(tail).lerp(from, b * 0.12);
    }
  }

  // A bazooka or Panzerschreck rocket (Steve): flames out of its tail, a trail of smoke behind, and the back-blast where
  // it was fired; it explodes where it lands (see explosion)
  function rocketFlames(add, from, head, tail, tk) {
    // The flame at its tail, flickering
    const flicker = 0.8 + 0.4 * Math.sin(tk * 90);
    const flame = add(glow('rgba(255,150,40,1)')); flame.scale.setScalar(0.11 * flicker); flame.position.copy(tail).lerp(head, 0.35);
    const core = add(glow('rgba(255,240,180,1)')); core.scale.setScalar(0.05 * flicker); core.position.copy(tail).lerp(head, 0.6);
    // Smoke left behind it, along the way it came
    for (let b = 1; b <= 3; b++) {
      const sm = add(new T.Sprite(new T.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, opacity: 0.5 - b * 0.12 })));
      sm.scale.setScalar(0.07 + b * 0.03);
      sm.position.copy(tail).lerp(from, b * 0.12);
    }
    // The back-blast as it leaves the tube
    if (tk < 0.12) {
      // Behind the tube: the other way from where the rocket is going
      const away = new T.Vector3(head.x - from.x, 0, head.z - from.z).normalize();
      const bb = add(glow('rgba(255,180,80,.9)')); bb.scale.setScalar(0.22 * (1 - tk * 5)); bb.position.set(from.x - away.x * 0.08, 0.12, from.z - away.z * 0.08);
    }
  }

  // High explosive going off: how big depends on what it was (artillery biggest, then mortars, a tank's shell, a rocket)
  function explosion(add, f, to, lt) {
    const size = f.support === 'bomber' ? 1.15 : f.support === 'artillery' ? 1 : f.kind === 'shell' ? 0.8 : f.weapon === 'gun' ? 0.75 : 0.55;
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
  // The dice of every attack (Steve: shots, shells and hand to hand, both sides) sit on the table right beside the side's
  // drawn token, the American star or the German cross, above the attacking side's artillery (Steve: not at the top of
  // the table, where they went off the screen): the red dice, six to a row, each with a tag over it saying who rolled at
  // whom, what each die needed and how many hit. The newest at the bottom, level with the token, the rest stacked above
  // it. Hits are outlined in yellow on a glow; misses are dimmed. They appear once the attack has landed on the table, and
  // stay until the next piece is chosen (Steve)
  const DIE_SIZE = 6.5, DIE_GAP = 0.22;
  // A fire mission's or bomber run's dice, smaller (Steve), and how far apart across and up the table (further up than
  // across, as the table is seen at a slant)
  const MISSION_DIE_SIZE = 4.8, MISSION_DIE_ACROSS = 0.2, MISSION_DIE_UP = 0.27;
  const COIN_EDGE = COIN_SIZE + 0.12;  // from the token's middle to just past its edge
  const DICE_BESIDE = COIN_EDGE + 0.6; // from the token's middle to the middle of the dice beside it (six dice across)
  const DICE_LEVEL = 0.35;             // the newest dice's bottom row: this far down the table from the token's middle
  let diceDue = null;                  // when the dice of the latest attack go on the table
  let diceComing = [];                 // those rolls, kept as they were (the next token clears the attacks list)
  let rollLog = [], rollSeen = new Set();   // the rolls in the corner now, oldest first; every roll already shown
  function showDice(st, coming = rollsOf(st)) {
    // Add the rolls not seen before (each roll's faces are its own list)
    for (const r of coming) if (!rollSeen.has(r.faces)) { rollSeen.add(r.faces); rollLog.push(r); }
    diceShownAt = performance.now();
    shadowStale = true;
    for (const d of dice) { scene.remove(d); freeObject(d); }
    dice = [];
    const rolls = rollLog;
    for (const side of ['us', 'de']) {
      // Where this side's dice can go: beside its token, then above it
      const columns = diceColumns(side);
      // Newest first, from level with the token upwards. Every roll since the last piece was picked. A fire mission or a
      // bomber run (Steve): smaller dice, one upright column for each piece it caught, side by side, under one label for
      // the guns or the plane (no label for each piece). When the rolls reach the top of the screen they carry on above
      // the token; past that the oldest are left off
      let column = 0, z = columns[0].z, inColumn = 0;
      const list = rolls.filter(o => o.side === side).reverse();
      for (let n = 0; n < list.length; n++) {
        const r = list[n];
        // A mission: every roll of it at once, first piece hit on the left
        const group = [r];
        while (r.mission && list[n + 1] && list[n + 1].mission === r.mission) group.unshift(list[++n]);
        const mission = !!r.mission;
        // How big and how far apart its dice are, how wide and tall the lot is
        const size = mission ? MISSION_DIE_SIZE : DIE_SIZE;
        const gap = mission ? MISSION_DIE_ACROSS : DIE_GAP, up = mission ? MISSION_DIE_UP : DIE_GAP;
        const across = mission ? group.length : Math.min(6, r.faces.length);
        const tall = mission ? Math.max(...group.map(g => g.faces.length)) : Math.ceil(r.faces.length / 6);
        // Room for it and its label in this column? If not, the next column (the newest always goes beside the token)
        const lift = 0.15;
        const reachesTop = () => offTop(new T.Vector3(columns[column].x, 0.05, z - (tall - 1) * up - lift));
        if (inColumn > 0 && reachesTop()) {
          // No more columns: the older rolls are left off
          if (column >= columns.length - 1) break;
          column++;
          z = columns[column].z;
          inColumn = 0;
          // (no room above the token either)
          if (reachesTop()) break;
        }
        const colX = columns[column].x;
        const left = colX - (across - 1) * gap / 2;
        if (mission) {
          // Each piece's dice in an upright column, from the bottom up
          group.forEach((g, k) => g.faces.forEach((d, i) => placeDie(d, left + k * gap, z - i * up, i, size)));
        } else {
          // A shot: its dice six to a row
          r.faces.forEach((d, i) => placeDie(d, left + (i % 6) * gap, z - Math.floor(i / 6) * gap, i, size));
        }
        // The tag just above the dice: for a mission, the guns or plane, how many pieces it caught and the hits in all
        const top = z - (tall - 1) * up - lift;
        const hits = group.reduce((t, g) => t + g.faces.filter(d => d.hit).length, 0);
        const lines = mission ? [r.who, `${group.length} piece${group.length === 1 ? '' : 's'} · ${hits} hit${hits === 1 ? '' : 's'}`] : r.text;
        // Its tail at one edge of the dice, the tag running across them and on from there
        const out = columns[column].tagOut;
        const edge = (across - 1) * gap / 2 + 0.1;
        const anchor = new T.Vector3(colX - out * edge, 0.05, top);
        placeDiceTag(lines, side, anchor, mission ? 1.05 : 1.15, out);
        // The next (older) roll goes above this one
        z = top - 0.48;
        inColumn++;
      }
    }
  }

  // Where a side's dice go: first beside its drawn token, on the side away from the board (slid in a little if that
  // would be off the edge of the screen), then above the token. x: the middle of the dice; z: their bottom row; tagOut:
  // which way across the table the tag runs from the dice (+1 east, -1 west)
  function diceColumns(side) {
    const coin = coinSpot(side);
    const away = side === 'us' ? -1 : 1;
    // Beside the token: the outer die must be on the screen
    let besideX = coin.x + away * DICE_BESIDE;
    for (let k = 0; k < 20; k++) {
      const outer = new T.Vector3(besideX + away * 0.65, 0.05, coin.z).project(camera);
      if (Math.abs(outer.x) < 0.98) break;
      besideX -= away * 0.1;
    }
    // (its tag runs from the dice's edge nearest the token out away from it, so it doesn't cover the token)
    const beside = { x: besideX, z: coin.z + DICE_LEVEL, tagOut: away };
    // Above the token: its bottom row just past the token's far edge; the tag runs in towards the board
    const above = { x: coin.x, z: coin.z - COIN_EDGE, tagOut: -away };
    return [beside, above];
  }

  // One die of a throw on the table: misses dimmed, hits on a yellow glow (Steve). size: how big (a mission's are smaller)
  function placeDie(d, x, z, i, size) {
    const die = Models.die(d.face);
    die.scale.setScalar(size);
    at(die, x, 0, z, 0, (i * 1.7) % 0.4 - 0.2, 0);
    // (a Hail Mary's first 6 stays bright: it has earned its second throw)
    if (!d.hit && !d.lead) die.traverse(c => { if (c.isMesh && c.material === Models.M.die) { c.material = c.material.clone(); c.material.color.multiplyScalar(0.35); } });
    scene.add(die); dice.push(die);
    if (d.hit) {
      const glow = hitGlow();
      glow.scale.setScalar(size / DIE_SIZE);
      at(glow, x, 0.002, z, -Math.PI / 2, 0, 0);
      scene.add(glow); dice.push(glow);
      // A yellow outline round the die itself: a slightly bigger box, only its inside faces drawn
      die.add(at(new T.Mesh(new T.BoxGeometry(0.037, 0.037, 0.037), HIT_EDGE), 0, 0.015, 0));
    }
  }

  // A dice tag at a point, its tail there. out: which way across the table it runs from there (+1 east, -1 west).
  // Slid back onto the screen if it would go off a side
  function placeDiceTag(lines, side, anchor, size, out) {
    const tag = diceTag(lines, side, false);
    tag.scale.multiplyScalar(size);
    tag.center.x = out > 0 ? 0 : 1;
    tag.position.copy(anchor);
    tag.renderOrder = 6;
    keepInSide(tag);
    scene.add(tag);
    dice.push(tag);
  }

  const HIT_EDGE = new T.MeshBasicMaterial({ color: 0xffd23f, side: T.BackSide });
  // A soft yellow square under a die that hit (Steve: a yellow glow border round each hitting die)
  let dieGlowTex = null;
  function hitGlow() {
    if (!dieGlowTex) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 10, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,214,64,1)'); grad.addColorStop(0.6, 'rgba(255,200,40,.85)'); grad.addColorStop(1, 'rgba(255,190,30,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      dieGlowTex = new T.CanvasTexture(c);
    }
    // A crisp yellow square just bigger than the die (the border), on a soft glow round it
    const g = new T.Group();
    g.add(new T.Mesh(new T.PlaneGeometry(0.36, 0.36), new T.MeshBasicMaterial({ map: dieGlowTex, transparent: true, depthWrite: false })));
    const edge = new T.Mesh(new T.PlaneGeometry(0.175, 0.175), new T.MeshBasicMaterial({ color: 0xffd23f }));
    edge.position.z = 0.001;
    g.add(edge);
    return g;
  }

  // Every roll in the attacks on the table now, in order: { side, faces, text } for each shot or shell, and for each
  // side's blow in a hand-to-hand fight
  function rollsOf(st) {
    const out = [];
    for (const f of st.fx) {
      if (f.kind === 'melee') {
        for (const b of f.strikes) {
          if (!b.faces.length) continue;
          const names = b.strikers.map(id => (st.units.find(u => u.id === id) || { name: '' }).name).filter(Boolean);
          const hits = b.faces.filter(d => d.hit).length;
          out.push({ side: b.side, faces: b.faces, text: [names.join(' and ') || 'Hand to hand', `hand to hand · ${hits} hit${hits === 1 ? '' : 's'}`] });
        }
        continue;
      }
      if (!f.faces || !f.faces.length) continue;
      const text = shotTagText(st, f);
      // A mortar or artillery mission, or a bomber run: one row of many (consecutive rolls of the same guns or plane)
      const who = text[0].split(' → ')[0];
      const mission = f.support ? f.support + '/' + f.side : null;
      out.push({ side: f.side, faces: f.faces, text, mission, who });
    }
    return out;
  }

  // How long until the last dice have been on the table long enough to read (the next token waits for that)
  const DICE_READ = 2500;
  let diceShownAt = 0;
  function diceLeft() {
    if (diceDue !== null) return DICE_READ;
    return dice.length ? Math.max(0, diceShownAt + DICE_READ - performance.now()) : 0;
  }

  // The next piece is chosen (or a new game): the corners are empty again
  function clearDice(newGame = false) {
    if (dice.length) shadowStale = true;
    for (const d of dice) { scene.remove(d); freeObject(d); }
    dice = [];
    rollLog = [];
    if (newGame) rollSeen = new Set();
  }

  // ["1st Platoon", "needs 5+ · 2 hits"]: who fired, then the score each die needed and the hits
  function shotTagText(st, f) {
    const shooter = f.from ? st.units.find(u => u.id === f.from.id) : null;
    const gunName = f.support === 'bomber' ? BOMBER_NAMES[f.side] : f.support === 'artillery' ? 'artillery' : 'mortars';
    // ("Our" only with one human playing: two humans, or two robots, have no "our")
    const onePlayer = st.mode === 'us' || st.mode === 'de';
    const whose = onePlayer && f.side === st.human ? 'Our' : f.side === 'de' ? 'German' : 'American';
    const who = shooter ? shooter.name : `${whose} ${gunName}`;
    const need = f.need > MAX_NEED ? 'HAIL MARY: 6, then 6' : `needs ${f.need}+`;
    const hits = f.faces.filter(r => r.hit).length;
    // Taking cover (Steve: the tag says so; its +2 is in the score needed)
    const target = f.to && st.units.find(u => u.id === f.to.id);
    const cover = target && target.down ? 'taking cover · ' : '';
    // Who it was at (Steve: a mortar or artillery mission has a row for each piece it caught)
    return [target ? `${who} → ${target.name}` : who, `${cover}${need} · ${hits} hit${hits === 1 ? '' : 's'}`];
  }

  // The tag: a small rounded label, blue for our shots and grey for the Germans', drawn once for each text
  const tagTex = {};
  // A long word bubble on one line: who fired in white, the score and hits in gold; a pointed tail at the bottom middle,
  // where the sprite is anchored (the arrow carries on from it to the dice)
  // tailUp: the bubble hangs below its point, tail at the top (for something near the top of the screen, Steve)
  function diceTag(lines, side, tailUp = false) {
    const key = side + lines.join('/') + (tailUp ? '/up' : '');
    if (!tagTex[key]) {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const font = 'bold 40px Georgia, serif', sep = '  ·  ';
      g.font = font;
      const w0 = g.measureText(lines[0] + sep).width, w1 = g.measureText(lines[1]).width;
      const tail = 18, boxH = 64;
      c.width = Math.ceil(w0 + w1) + 48; c.height = boxH + tail + 6;
      const mid = c.width / 2;
      // Where the box starts: under the tail when it points up, at the top otherwise
      const top = tailUp ? tail + 2 : 4;
      g.beginPath();
      g.roundRect(4, top, c.width - 8, boxH, 20);
      if (tailUp) { g.moveTo(mid - 14, top + 1); g.lineTo(mid, 2); g.lineTo(mid + 14, top + 1); }
      else { g.moveTo(mid - 14, boxH + 3); g.lineTo(mid, c.height - 2); g.lineTo(mid + 14, boxH + 3); }
      g.fillStyle = side === 'de' ? 'rgba(70,72,74,.94)' : 'rgba(30,62,110,.94)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = 'rgba(230,236,245,.8)'; g.stroke();
      g.font = font; g.textBaseline = 'middle';
      g.fillStyle = '#f4efe4'; g.fillText(lines[0] + sep, 24, top + boxH / 2);
      g.fillStyle = '#ffd98a'; g.fillText(lines[1], 24 + w0, top + boxH / 2);
      tagTex[key] = { map: new T.CanvasTexture(c), aspect: c.width / c.height };
    }
    const t = tagTex[key];
    const s = new T.Sprite(new T.SpriteMaterial({ map: t.map, transparent: true, depthTest: false }));
    s.scale.set(0.24 * t.aspect, 0.24, 1);
    // The tip of the tail is the sprite's anchor
    s.center.set(0.5, tailUp ? 1 : 0);
    return s;
  }

  // Would a word bubble standing on this point (tail at the bottom, `height` tall) go off the top of the screen?
  function offTop(point, height = 0.24) {
    const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(height);
    const top = point.clone().add(up).project(camera);
    return top.y > 0.9;
  }

  // Slide a word bubble sideways so it stays on the screen (its width from the sprite's scale)
  function keepInSide(sprite) {
    const right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(sprite.scale.x / 2);
    // Its middle: the anchor, moved across by how far from the middle the anchor is (a tag anchored at one end)
    const toMiddle = right.clone().multiplyScalar((0.5 - sprite.center.x) * 2);
    for (let k = 0; k < 20; k++) {
      const middle = sprite.position.clone().add(toMiddle);
      const l = middle.clone().sub(right).project(camera), r = middle.clone().add(right).project(camera);
      // Past the left or right edge: a step back in, along the screen's across
      if (l.x < -0.98) sprite.position.addScaledVector(right, 0.1);
      else if (r.x > 0.98) sprite.position.addScaledVector(right, -0.1);
      else break;
    }
  }

  // The German move on show: an orange ring under the piece (or their gun off the board) and a grey word bubble over it
  // with its name and what it does, e.g. "1. Fallschirmjäger-Zug · Fires on 2nd Platoon"
  function computerMoveMark(st, m) {
    let spot, name, big;
    // (the move remembers its side: it stays on show after its token has ended)
    const side = m.side || Sim.computerSide(st);
    if (m.gun) {
      // Their mortars or artillery, off the board
      const g = GUNS[side][m.gun];
      spot = new T.Vector3(g.x, 0, g.z); name = GUN_NAMES[side][m.gun]; big = true;
    } else {
      // A piece: gone from the table (wiped out in a fight) means nothing to ring
      const u = Sim.unitById(st, m.id);
      if (!u || u.x === null || !pieces[u.id]) return;
      spot = pieceCentre(u); name = u.name; big = u.kind === 'company' || Sim.isTank(u);
    }
    const ring = new T.Mesh(new T.RingGeometry(big ? 0.36 : 0.22, big ? 0.42 : 0.27, 56), new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.95, depthWrite: false }));
    at(ring, spot.x, 0.01, spot.z, -Math.PI / 2, 0, 0); marks.add(ring);
    // The ring shows as soon as it is picked; the word bubble once it has chosen what to do
    if (!m.what) return;
    // Over the piece, or below it when over it would go off the top of the screen (Steve)
    const over = new T.Vector3(m.gun ? spot.x - 1.1 : spot.x, 0.32, spot.z);
    const below = offTop(over);
    const bubble = diceTag([name, m.what], side, below);
    // A gun's bubble sits a little in from the table's edge, so it stays on the screen
    if (below) bubble.position.set(over.x, 0.05, spot.z + 0.3); else bubble.position.copy(over);
    keepInSide(bubble);
    bubble.renderOrder = 7; marks.add(bubble);
  }

  // view: { spots: [{ x, y, kind }], selected: piece, hover: { x, y }, blast: [{ x, y, main }], computerMove: { id | gun, what } }. dt: seconds since the last frame.
  // Returns true while pieces are still gliding, so the page keeps drawing
  let lastT = 0, onlyFires = false, drawingOn = false;
  let playerSide = 'us';             // the side the player commands, for what the table says about a fight
  const FIRE_FRAME = 33;             // milliseconds between frames when only fires are moving (about 30 a second)
  // Free what an object made for itself (geometry, materials), not what it shares: textures, sprites' common shape, the
  // models' own materials
  function freeObject(o) {
    o.traverse(c => {
      if (c.geometry && !c.isSprite) c.geometry.dispose();
      for (const m of [].concat(c.material || [])) if (!Object.values(Models.M).includes(m) && m !== HIT_EDGE) m.dispose();
    });
  }

  // A new game: nothing left over from the last one still flying, falling or waiting
  function reset() {
    endFireworks();
    for (const c of homing) scene.remove(c.mesh);
    homing = []; homingDone = null;
    clearTokenNow();
    shots = [];
    for (const id in held) delete held[id];
    meleeUntil = 0;
    endFlight(); flightUntil = 0;
    setCompass(null);
    // No wrecks left over: their fires go, and their scorched models, so the next game builds them new
    for (const id of Object.keys(wreckFires)) {
      removeFire(id);
      if (pieces[id]) { scene.remove(pieces[id]); freeObject(pieces[id]); delete pieces[id]; }
    }
    diceDue = null; diceComing = [];
    labelKey = ''; reticleNudges = new Map();
    marksReady = false; shadowStale = true;
    clearDice(true);
  }

  function render(st, view = {}) {
    playerSide = st.human;
    const now = performance.now();
    // Nothing happening on the table but fires flickering: they don't need every frame the screen can show
    if (onlyFires && view.same && now - lastT < FIRE_FRAME) return true;
    const gap = lastT ? (now - lastT) / 1000 : 0, dt = lastT ? Math.min(0.1, gap) : 0.016;
    lastT = now;
    if (gap) watchFrames(gap, drawingOn);
    if (!built || built.userData.seed !== st.seed || built.userData.map !== st.map) { clearDice(true); for (const id in pieces) { scene.remove(pieces[id]); freeObject(pieces[id]); } for (const id in tokens) scene.remove(tokens[id]); pieces = {}; tokens = {}; build(st); buildSupport(); built.userData.seed = st.seed; built.userData.map = st.map; }
    updateSupport(st);
    buildHedges(st);
    // New attacks: they play out, and their dice go in the corner once they have landed (Steve)
    // (the rolls are kept now: a tank's shot lands late, and the next token may have cleared the attacks by then)
    if (st.fxShown !== st.fx || st.fxCount !== st.fx.length) {
      startShots(st); st.fxShown = st.fx; st.fxCount = st.fx.length;
      const fresh = rollsOf(st).filter(r => !rollSeen.has(r.faces));
      if (fresh.length) { diceComing = diceComing.concat(fresh); diceDue = now + settledIn(); }
    }
    if (diceDue !== null && now >= diceDue) { diceDue = null; showDice(st, diceComing); diceComing = []; }
    updatePieces(st);
    // The marks on the table: built again only when something has changed. Between times just the cross-hairs pulse
    if (view.same && marksReady) {
      const pulse = 1 + 0.08 * Math.sin(now / 180);
      for (const p of pulsers) p.sprite.scale.setScalar(p.size * pulse);
    } else {
      buildMarks(st, view);
      showMarksOverBridges();
      marksReady = true;
    }
    if (view.stateChanged) shadowStale = true;
    const moving = glide(dt);
    const hopping = moveHop(now);
    const waiting = pulseAmbush(now);
    const firing = playShots(now);
    const flying = moveCoin(now) | moveHoming(now) | moveCompass(now);
    // Fires flicker all the time, but cast no shadows, so they don't count as busy
    const burning = burnWrecks(st, now, dt) | moveSea(now) | moveFireworks(now);
    // Shadows: worked out again only while something moves, and once more after it stops
    const busy = moving || hopping || firing || flying || shadowStale;
    renderer.shadowMap.needsUpdate = busy || wasBusy;
    wasBusy = busy; shadowStale = false;
    renderer.render(scene, camera);
    // (dice still to come: keep drawing until they are on the table, or they only appear at the next redraw)
    if (firing || flying || diceDue !== null) { onlyFires = false; drawingOn = true; return true; }
    // Targets pulse, so keep drawing while they show
    const others = moving || hopping || waiting || !!(view.targets && view.targets.length);
    onlyFires = burning && !others;
    drawingOn = others || burning;
    return drawingOn;
  }

  // A piece in ambush (Steve): a dashed amber ring under it, slowly pulsing. Either side's, as the table hides nothing
  let ambushRings = [];
  function markAmbush(u) {
    const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u);
    const inner = big ? 0.3 : 0.17, outer = big ? 0.35 : 0.21;
    const material = new T.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new T.Group();
    const dashes = 12, each = 2 * Math.PI / dashes;
    for (let k = 0; k < dashes; k++) {
      ring.add(at(new T.Mesh(new T.RingGeometry(inner, outer, 6, 1, k * each, each * 0.6), material), 0, 0, 0, -Math.PI / 2, 0, 0));
    }
    at(ring, p.x, 0.007, p.z);
    marks.add(ring);
    ambushRings.push({ ring, material });
  }
  // One frame of the slow pulse. Returns true while any ring is showing, so the page keeps drawing
  function pulseAmbush(now) {
    const wave = Math.sin(now / 450);
    for (const r of ambushRings) {
      r.ring.scale.setScalar(1 + 0.07 * wave);
      r.material.opacity = 0.65 + 0.3 * wave;
    }
    return ambushRings.length > 0;
  }

  // Everything marked on the table for this view: lit fields, rings, targets and their bubbles, lines of fire
  // What is marked in a bridge's field would be hidden under the bridge: it shows through
  function showMarksOverBridges() {
    for (const m of marks.children) {
      const x = Math.floor(m.position.x), y = Math.floor(m.position.z);
      if (m.material && Sim.inside(x, y) && Sim.tileType(x, y) === 'bridge') m.material.depthTest = false;
    }
  }

  function buildMarks(st, view) {
    pulsers = [];
    ambushRings = [];
    while (marks.children.length) { const o = marks.children[0]; marks.remove(o); freeObject(o); }
    setCompass(view.compass);
    if (view.hover) mark(view.hover.x, view.hover.y, 'hover', 0.02);
    for (const s of view.spots || []) mark(s.x, s.y, s.kind, 0.05, s);
    // Where a shot that hits several pieces would land (Steve): the target's field bright, the fields its blast reaches paler
    for (const b of view.blast || []) mark(b.x, b.y, b.main ? 'blast' : 'splash', 0.03);
    if (view.flightLine) markFlightLine(view.flightLine);
    showStand(st, view);
    gunRings(view.guns, st.human);
    if (view.selected && view.selected.x !== null && pieces[view.selected.id]) {
      const p = pieceCentre(view.selected), big = view.selected.kind === 'company' || Sim.isTank(view.selected);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.34 : 0.21, big ? 0.39 : 0.25, 56), new T.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 0.95, depthWrite: false }));
      at(ring, p.x, 0.009, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
    }
    if (view.targets && view.targets.length) markTargets(view.targets, view.hotTarget);
    if (view.rallies && view.rallies.length) markRallies(view.rallies);
    // The German piece or gun moving now: a ring round it and a word bubble saying what it does (Steve)
    if (view.computerMove) computerMoveMark(st, view.computerMove);
    // Shooting: a line of sight from the shooter to each target it can see
    if (view.shooter && view.shooter.x !== null && pieces[view.shooter.id]) sightLines(view.shooter, view.targets || [], view.hotTarget);
    // German mortars ranging on a piece: a line from their mortar off the board
    if (view.mortarAim && pieces[view.mortarAim.id]) marks.add(fireArc({ side: Sim.computerSide(st), support: view.aimWhich || 'mortars' }, view.mortarAim, true));
    // Your mortars or artillery choosing a target: an arc from the gun to each one, the one under the pointer brighter
    if (view.fireFrom) for (const t of view.targets || []) if (pieces[t.id]) marks.add(fireArc({ side: st.human, support: view.fireFrom }, t, view.hotTarget && view.hotTarget.id === t.id));
    for (const u of st.units) if (u.ambush && u.x !== null && pieces[u.id]) markAmbush(u);
    if (view.ready) for (const u of st.units) {
      if (u.side !== st.human || u.x === null || !pieces[u.id] || u.ambush) continue;
      const can = view.ready(u);
      if (!can && !u.acted) continue;
      const p = pieceCentre(u), big = u.kind === 'company' || Sim.isTank(u);
      const ring = new T.Mesh(new T.RingGeometry(big ? 0.3 : 0.17, big ? 0.335 : 0.195, 48), new T.MeshBasicMaterial({ color: can ? 0x7fd06a : 0x77776f, transparent: true, opacity: can ? 0.8 : 0.6, depthWrite: false }));
      at(ring, p.x, 0.006, p.z, -Math.PI / 2, 0, 0); marks.add(ring);
    }
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

  // Which of a side's pieces is under a point on the page: the model the ray hits first, or else the nearest piece in that field
  function pieceAt(st, clientX, clientY, side) {
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

  // A picture of a piece for the bottom panel (Steve): its models on their own, lit like the table, seen from the front
  // and a little above. which: 'mortars' or 'artillery' for the guns off the board. Made once for each side and kind
  const portraits = {};
  let studio = null;
  // elite: as the piece looks on the table (Steve: Rangers, Fallschirmjäger, the gold band)
  function portrait(side, kind, elite = false) {
    const key = side + ':' + kind + (elite ? ':elite' : '');
    if (portraits[key]) return portraits[key];
    // One small renderer, scene and camera for every picture
    if (!studio) {
      const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setSize(200, 160);
      r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
      const sc = new T.Scene();
      sc.add(new T.HemisphereLight(0xfff4e0, 0x3a2a18, 0.75));
      const lamp = new T.DirectionalLight(0xffe8c8, 1.3); lamp.position.set(2, 4, 3); sc.add(lamp);
      studio = { r, sc, cam: new T.PerspectiveCamera(30, 200 / 160, 0.01, 50) };
    }
    const { r, sc, cam } = studio;
    // The models, laid out as on the table: a platoon's bases in a loose triangle, tanks side by side
    const g = new T.Group();
    let bases;
    if (kind === 'bomber') bases = [Models.bomberOnStand(side)];
    else if (kind === 'mortars' || kind === 'artillery') {
      const m = kind === 'artillery' ? Models.howitzer(side) : Models.mortar(side);
      m.scale.setScalar(kind === 'artillery' ? TANKS * 1.7 : MEN * 1.3);
      bases = [m];
    } else bases = buildBases(side, kind, elite);
    if (elite) for (const b of bases) Models.eliteBand(b);
    const spots = kind === 'company' ? [[-0.11, -0.09], [0.11, -0.07], [0, 0.11]] : [[0, 0]];
    bases.forEach((b, i) => { b.position.set(spots[i][0], 0, spots[i][1]); g.add(b); });
    sc.add(g);
    // Framed: the camera off the front corner, a little above, backed off to fit it all
    const box = new T.Box3().setFromObject(g), mid = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3()).length();
    cam.position.set(mid.x + size * 0.95, mid.y + size * 0.6, mid.z + size * 0.75);
    cam.lookAt(mid);
    r.render(sc, cam);
    portraits[key] = r.domElement.toDataURL();
    sc.remove(g);
    return portraits[key];
  }

  // The piece whose model is under a point on the page, either side, or null when the pointer is on no model
  function pieceUnder(st, clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), camera);
    const shown = st.units.filter(u => u.x !== null && pieces[u.id] && pieces[u.id].visible);
    const hits = ray.intersectObjects(shown.map(u => pieces[u.id]), true);
    if (!hits.length) return null;
    // Climb from the mesh hit to the piece's own group
    for (let o = hits[0].object; o; o = o.parent) { const u = shown.find(m => pieces[m.id] === o); if (u) return u; }
    return null;
  }

  // Where a field's top edge is on the page, for labels
  // Where a piece is on the screen: the middle of its bases, a little above the table
  function pieceScreen(u) {
    const p = pieceCentre(u);
    return screenPoint(p.x, p.z, 0.15);
  }

  function screenPoint(x, y, h = 0) {
    const p = new T.Vector3(x, h, y).project(camera), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }

  // Where a piece's first base is on the table this moment (for the checks in a browser)
  function whereNow(id) {
    const g = pieces[id];
    if (!g) return null;
    const b = g.userData.bases.find(o => o.visible) || g.userData.bases[0];
    return { x: g.position.x + b.position.x, z: g.position.z + b.position.z, visible: g.visible, bases: g.userData.bases.filter(o => o.visible).length };
  }

  return {
    whereNow, reset, diceLeft, labelReport: () => labelReport, init, resize, render, fieldAt, pieceAt,
    pieceUnder, portrait, bounce, bounceGun, busyFor, settledIn, gunAt, targetAt, screenPoint, pieceScreen,
    labelBox, clearDice, respinCompass, flyToken, clearToken, returnTokens, fireworks: startFireworks,
    canvas: () => renderer.domElement,
  };
})();
