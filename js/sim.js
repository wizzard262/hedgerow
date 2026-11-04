// Hedgerow: the rules (no DOM). A US rifle company attacks through the bocage; the Germans defend field by field.
// In the code a rifle platoon's kind is 'company' and its sections are counted in `platoons`

const Sim = (() => {
  // Seeded random numbers, so the same seed plays the same game
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- The board ----------

  const TYPES = { '.': 'field', o: 'orchard', v: 'village', h: 'hamlet', r: 'river', '#': 'bridge', '=': 'laneEW', '|': 'laneNS', '+': 'crossroads' };
  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  const tileType = (x, y) => TYPES[MAP[y][x]];
  const isLane = t => t === 'laneEW' || t === 'laneNS' || t === 'crossroads' || t === 'bridge';
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // The four sides of a field, for a piece lining a hedge
  const DIRS = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
  const SIDE_NAMES = { n: 'north', e: 'east', s: 'south', w: 'west' };
  // Where in its field a piece stands (Steve): every field is nine areas, a 3×3 grid: the middle (null; 'c' in a list
  // of areas), the four edges 'n', 'e', 's', 'w' and the four corners 'ne', 'nw', 'se', 'sw'. Most pieces take one
  // area; the PaK 40 two side by side (u.at 'n+ne'); a tank, or a platoon of two or three sections, four in a 2×2
  // block: a corner, the two edges beside it and the middle (u.at names its corner), or the middle of the field (u.at
  // null, Steve: so it can hide): there it stands in the centre only, touching no hedge, but keeps the four edge areas
  // clear round it (only the corners are left for others). Pieces share a field as long as their areas don't overlap.
  // A piece lines every hedge one of the areas it stands in is against (the eight round the edge)
  const PLACES = [null, 'n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
  const CORNERS = ['nw', 'ne', 'sw', 'se'];
  const GRID = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'];
  // Every two areas side by side in a row or column (where the PaK can stand)
  const PAIRS = [];
  for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
    const far = Math.abs(i % 3 - j % 3) + Math.abs(Math.floor(i / 3) - Math.floor(j / 3));
    if (far === 1) PAIRS.push(GRID[i] + '+' + GRID[j]);
  }
  const areaXY = k => ({ x: k.includes('e') ? 1 : k.includes('w') ? -1 : 0, y: k.includes('s') ? 1 : k.includes('n') ? -1 : 0 });
  // A place given as one area (or null, the middle): where it is
  const placeXY = at => areaXY(at || 'c');
  // How many areas a piece takes
  function sizeOf(u) {
    // (a bare field or point, with no piece: one area)
    if (!PIECES[u.kind]) return 1;
    if (u.kind === 'pak') return 2;
    if (isTank(u) || (u.kind === 'company' && u.platoons >= 2)) return 4;
    return 1;
  }
  // The areas a piece takes, standing at `at` (its corner for a 2×2 block, its pair for the PaK; a big piece in the
  // middle keeps the four edges clear too)
  function footprint(u, at = u.at) {
    const size = sizeOf(u);
    if (size === 4) {
      if (!at || at === 'c') return ['c', 'n', 'e', 's', 'w'];
      // A block sits in a corner; an edge asked for gives the corner on that side
      const corner = CORNERS.includes(at) ? at : { n: 'nw', e: 'ne', s: 'se', w: 'sw' }[at];
      return [corner, corner[0], corner[1], 'c'];
    }
    if (size === 2) return at && at.includes('+') ? at.split('+') : PAIRS.find(p => p.split('+').includes(at || 'c')).split('+');
    return [at && !at.includes('+') ? at : 'c'];
  }
  // The areas a piece is actually in (for seeing and lining hedges): a big piece in the middle only the centre
  const standsIn = (u, at = u.at) => (sizeOf(u) === 4 && !at ? ['c'] : footprint(u, at));
  // Every place a piece of its size could stand in a field
  const anchorsFor = u => (sizeOf(u) === 4 ? [...CORNERS, null] : sizeOf(u) === 2 ? PAIRS : PLACES);
  // Where a piece is in its field, as one point (the middle of its areas): for the table and for distances
  function spotXY(u, at = u.at) {
    const areas = standsIn(u, at).map(areaXY);
    return { x: areas.reduce((n, a) => n + a.x, 0) / areas.length, y: areas.reduce((n, a) => n + a.y, 0) / areas.length };
  }
  const lines = (u, d) => standsIn(u).some(k => k !== 'c' && k.includes(d));
  const placeName = at => {
    const a = at && at.includes('+') ? at.split('+').find(k => k !== 'c') : at;
    return !a || a === 'c' ? 'the middle of the field' : a.length === 2 ? `the ${SIDE_NAMES[a[0]]}-${SIDE_NAMES[a[1]]} corner` : `the ${SIDE_NAMES[a]} side`;
  };
  // The areas of a field other pieces take (leaving: pieces on their way out)
  function takenAreas(st, u, x, y, leaving = []) {
    const taken = new Set();
    for (const o of st.units) if (o !== u && o.x === x && o.y === y && !leaving.includes(o)) for (const k of footprint(o)) taken.add(k);
    return taken;
  }
  const fitsAt = (st, u, x, y, at, leaving = []) => { const taken = takenAreas(st, u, x, y, leaving); return footprint(u, at).every(k => !taken.has(k)); };
  // The place nearest the one wanted where the piece fits among the others (Steve: where other pieces allow it)
  function freePlace(st, u, x, y, want) {
    const options = anchorsFor(u).filter(a => fitsAt(st, u, x, y, a));
    if (options.includes(want)) return want;
    if (!options.length) return want;
    // Nearest to the point wanted (an area, or a pair's middle)
    const wantAreas = want && want.includes('+') ? want.split('+') : [want || 'c'];
    const w = { x: wantAreas.reduce((n, k) => n + areaXY(k).x, 0) / wantAreas.length, y: wantAreas.reduce((n, k) => n + areaXY(k).y, 0) / wantAreas.length };
    const far = a => { const p = spotXY(u, a); return Math.hypot(p.x - w.x, p.y - w.y); };
    options.sort((a, b) => far(a) - far(b));
    return options[0];
  }
  // Which piece takes a given area of a field (a click there means that piece)
  function occupant(st, x, y, area) {
    return st.units.find(o => o.x === x && o.y === y && footprint(o).includes(area || 'c')) || null;
  }
  // Which side of a's field faces b (b next to a)
  const dirTo = (a, b) => Object.keys(DIRS).find(d => DIRS[d][0] === b.x - a.x && DIRS[d][1] === b.y - a.y);

  // The same key for an edge whichever side it is looked at from
  function edgeKey(ax, ay, bx, by) {
    return ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
  }

  // Does a hedge grow on this edge before any gaps are made? Villages, hamlets and orchards have none round them (Steve);
  // lanes run between hedges but not along themselves
  function hedgeWanted(ax, ay, bx, by) {
    const a = tileType(ax, ay), b = tileType(bx, by);
    if (PLACE_COVER[a] || PLACE_COVER[b]) return false;
    // The river has open banks, and a bridge carries its lane straight on
    if (a === 'river' || b === 'river') return false;
    const eastWest = ay === by;
    // Along a lane: open. A lane running east-west has open ends to the east and west, and so on
    const openAlong = (t, ew) => t === 'crossroads' || ((t === 'laneEW' || t === 'bridge') && ew) || (t === 'laneNS' && !ew);
    if (isLane(a) && isLane(b) && openAlong(a, eastWest) && openAlong(b, eastWest)) return false;
    return true;
  }

  function hedge(st, ax, ay, bx, by) { return !!st.hedges[edgeKey(ax, ay, bx, by)]; }
  function wire(st, ax, ay, bx, by) { return !!st.wire[edgeKey(ax, ay, bx, by)]; }

  // ---------- Pieces ----------

  function makeUnit(def, side) {
    const kind = def.kind;
    // at: the hedge the piece lines (n, e, s or w), or null out in the open. Both sides start lining the hedge towards the enemy
    const u = Object.assign({ side, shocked: false, acted: false, at: side === 'us' ? 'e' : 'w' }, def);
    if (kind === 'company') u.platoons = 3;
    // A team, the captain, a gun, or a tank (Steve: one tank to a unit, not a pair)
    else u.platoons = 1;
    if (!u.quality) u.quality = 'standard';
    return u;
  }

  const unitById = (st, id) => st.units.find(u => u.id === id);
  const at = (st, x, y, side) => st.units.filter(u => u.x === x && u.y === y && (!side || u.side === side));
  const isTank = u => !!PIECES[u.kind].tank;
  const isTeam = u => !!PIECES[u.kind].team;
  const isSmall = u => isTeam(u) || u.kind === 'captain';
  // A small target (Steve): a piece of two men or fewer (the sniper, a bazooka team, the captain), one more to hit
  const smallTarget = u => !!u.kind && (PIECES[u.kind].men || 99) <= 2;
  const enemyOf = side => (side === 'us' ? 'de' : 'us');
  const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

  // Is there room for a unit in a field? (Steve: the nine areas decide, see footprint.) Never with the enemy, except in
  // a hand-to-hand fight
  function roomFor(st, unit, x, y, leaving = []) {
    const here = at(st, x, y).filter(u => !leaving.includes(u) && u !== unit);
    if (!here.length) return true;
    if (here.some(u => u.side !== unit.side)) return false;
    return anchorsFor(unit).some(a => fitsAt(st, unit, x, y, a, leaving));
  }


  function newGame(seed) {
    seed = seed || (Date.now() % 1e9);
    const R = rng(seed);
    const st = {
      seed, turn: 1, hedges: {}, wire: {}, units: [], report: [], fx: [],
      fired: {},          // fire support used this hour (the mortars and the guns each fire once an hour)
      ammo: { mortars: MORTARS.ammo, artillery: ARTILLERY.ammo, bomber: BOMBER.ammo },
      deMortarAmmo: DE_MORTAR.ammo, deArtilleryAmmo: DE_ARTILLERY.ammo, deBomberAmmo: BOMBER.ammo, won: false, lost: false,
      spin: {},           // the bomber's compass this round, each side: picked again, it spins to the same direction (Steve)
    };
    // This game's objective: one of the villages
    st.objective = VILLAGES[Math.floor(R() * VILLAGES.length)];
    // Hedges on every edge that wants one, less the gaps; some gaps between fields are fenced with barbed wire
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const bx = x + dx, by = y + dy;
        if (!inside(bx, by) || !hedgeWanted(x, y, bx, by)) continue;
        if (R() >= HEDGE_GAP) st.hedges[edgeKey(x, y, bx, by)] = true;
        else if (!isLane(tileType(x, y)) && !isLane(tileType(bx, by)) && R() < WIRE) st.wire[edgeKey(x, y, bx, by)] = true;
      }
    }
    for (const d of US_START) st.units.push(makeUnit(d, 'us'));
    for (const d of DE_START) st.units.push(makeUnit(d, 'de'));
    // German teams that start with a company
    st.rand = R;
    deploy(st, 'us'); deploy(st, 'de');
    st.report = [`${START_DATE}. The company attacks into the bocage. Take ${st.objective.name} and hold it at the end of a round${TURNS ? ` within ${TURNS} rounds` : ''}.`];
    return st;
  }

  // Each side starts spread at random over its own end of the board (DEPLOY of the width), in cover where it can be:
  // a field with a hedge facing the enemy, an orchard or the village. Captains and teams start with a platoon
  function deploy(st, side) {
    const cols = Math.max(1, Math.round(COLS * DEPLOY));
    const xs = side === 'us' ? [...Array(cols).keys()] : [...Array(cols).keys()].map(i => COLS - 1 - i);
    const fields = [];
    for (const x of xs) for (let y = 0; y < ROWS; y++) if (tileType(x, y) !== 'river') fields.push({ x, y });
    // How good a field is to start in: cover towards the enemy, then a little luck
    const front = side === 'us' ? 1 : -1;
    const worth = f => {
      const t = tileType(f.x, f.y);
      const hedged = inside(f.x + front, f.y) && hedge(st, f.x, f.y, f.x + front, f.y);
      return (hedged ? 2 : 0) + (t === 'village' || t === 'hamlet' ? 2 : t === 'orchard' ? 1 : 0) + st.rand() * 2.5;
    };
    const leaders = st.units.filter(u => u.side === side);
    // German posts round the objective; the garrison is already in them
    if (side === 'de') {
      const taken = [];
      const withPost = st.units.filter(u => u.side === 'de' && u.post);
      const offset = {};
      for (const u of withPost.filter(u => u.kind === 'company')) { offset[u.post.join()] = u; u.post = postField(st, u.post, taken); taken.push(u.post); }
      for (const u of withPost.filter(u => u.kind !== 'company')) {
        const platoon = isSmall(u) && !PIECES[u.kind].fixed && offset[u.post.join()];
        u.post = platoon ? platoon.post : postField(st, u.post, taken);
        if (!platoon) taken.push(u.post);
      }
    }
    for (const u of leaders.filter(u => u.garrison)) { u.x = u.post.x; u.y = u.post.y; }
    for (const u of leaders) {
      if (u.garrison) continue;
      const options = fields.map(f => ({ f, w: worth(f) })).sort((a, b) => b.w - a.w);
      const spot = options.find(o => roomFor(st, u, o.f.x, o.f.y));
      u.x = spot.f.x; u.y = spot.f.y;
    }
    // Pieces sharing a field stand in different places in it
    for (const u of st.units.filter(o => o.side === side && o.x !== null)) u.at = freePlace(st, u, u.x, u.y, u.at);
  }

  // A post given from the objective: the field there, or the nearest one that isn't river and no other unit has
  function postField(st, [dx, dy], taken = []) {
    const want = { x: Math.max(0, Math.min(COLS - 1, st.objective.x + dx)), y: Math.max(0, Math.min(ROWS - 1, st.objective.y + dy)) };
    const free = (x, y) => inside(x, y) && tileType(x, y) !== 'river' && !taken.some(t => t.x === x && t.y === y);
    let best = null, bestD = Infinity;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const d = Math.abs(x - want.x) + Math.abs(y - want.y) + (x < st.objective.x ? 0.1 : 0);
      if (free(x, y) && d < bestD) { bestD = d; best = { x, y }; }
    }
    return best || want;
  }

  // There are no hours, only rounds (Steve)
  const roundText = turn => `round ${turn}`;

  // ---------- Who commands whom ----------

  // A piece has used its move for the hour
  function spend(st, u) {
    u.acted = true;
    if (st.tokens) { st.activeId = u.id; activated(st, { side: u.side, id: u.id }); }
    for (const o of st.units) o.halfShot = false;
  }

  // Note who a token activated this round, once each: a piece ({ side, id }) or a gun ({ side, gun }). At the next round
  // only their tokens fly back into the bag (Steve: activated, moved or not)
  function activated(st, who) {
    st.activated = st.activated || [];
    const same = a => a.side === who.side && a.id === who.id && a.gun === who.gun;
    if (!st.activated.some(same)) st.activated.push(who);
  }

  // With the bag (the page plays this way): an American piece moves only on an American token, and only one piece a token
  const tokenAllows = (st, u) => !st.tokens || (st.drawn === 'us' && (!st.activeId || st.activeId === u.id));

  // ---------- Seeing ----------



  // Can one piece see another to shoot it, and how hard is the target to hit?
  // As far as its weapon reaches (RANGES) over open fields and lanes; villages, hamlets and orchards in between block the view.
  // Hedges (Steve): the hedge next to the shooter is seen through only if the shooter lines it; the hedge next to the target
  // only if the target lines it (it is then in cover, one more to hit); with one hedge between them either lining it will do,
  // and the target has cover if it lines it. Any other hedge in between blocks the view. Beyond the next field: one more to hit.
  // Returns null (can't see) or { cover } added to the score needed, with what it is made of (hedge, tankCorner) for the label
  // Is a target at long range for this shooter? Machine guns, tanks and guns reach a field further first (Steve)
  // Which range a piece shoots at: its weapon's (see RANGES)
  function rangeOf(u) {
    if (!u.kind) return { sight: SIGHT_RANGE, long: 1 };
    if (PIECES[u.kind].sniper) return RANGES.sniper;
    if (isTank(u) || ['mg', 'mg42', 'pak'].includes(u.kind)) return RANGES.heavy;
    if (u.kind === 'company' || u.kind === 'captain') return RANGES.rifle;
    return RANGES.short;
  }

  function isFar(from, target) {
    return Math.hypot(target.x - from.x, target.y - from.y) > rangeOf(from).long + 0.5;
  }

  // A field whose houses or trees block the view across it
  const screens = f => ['village', 'hamlet', 'orchard'].includes(tileType(f.x, f.y));

  // spotting: only whether it can be seen (to call fire on it), as far as the board goes (Steve); otherwise whether
  // the piece can shoot at it, up to its weapon's reach
  // Line of sight (Steve): straight lines between the middles of areas (a field is 3×3 areas). Each hedge is three
  // thirds, one against each edge area beside it: a third blocks a line that crosses it, unless the piece at either end
  // stands in an area touching that third (it sees across it; a target touching it is in cover, +1). A line through a
  // field's corner exactly runs on between the fields that meet there (two fields corner to corner see each other along
  // the 45° line, villages, hamlets and orchards too); but where a hedge ends at that corner it gets past only if one of
  // the pieces stands in a corner area at that very point (Steve: touching its corner), and then the hedge gives both
  // cover, +1, unless either of them touches the third of it at that corner. Villages, hamlets and orchards in between
  // block it. A tank blocks every line through the areas it stands in, for everyone (Steve); past a tank's corner only
  // a piece in an area touching that corner sees, along the 45° line, and both get +1, unless either of them is right
  // beside that side of the tank (as at a hedge end). A big piece sees, and is seen, from whichever of its areas does best.
  // spotting: only whether it can be seen (to call fire on it), as far as the board goes (Steve), any area of the
  // field; otherwise whether the piece can shoot at it, up to its weapon's reach.
  // Returns null (can't see) or { cover } added to the score needed, with what it is made of (hedge, tankCorner)
  function sight(st, from, target, spotting = false) {
    const dist = Math.hypot(target.x - from.x, target.y - from.y);
    const reach = spotting ? SIGHT_RANGE : rangeOf(from).sight;
    if (dist === 0 || dist > reach + 0.01) return null;
    // The best line between any of the shooter's areas and any of the target's
    const fromPoints = areaPoints(from);
    const toPoints = target.kind ? areaPoints(target) : GRID.map(k => areaPoint(target, k));
    let best = null;
    for (const a of fromPoints) {
      for (const b of toPoints) {
        const line = lineOfSight(st, from, target, a, b);
        if (line && (!best || line.cover < best.cover)) best = line;
        if (best && best.cover === 0) break;
      }
      if (best && best.cover === 0) break;
    }
    if (!best) return null;
    best.cover += isFar(from, target) ? LONG_RANGE : 0;
    return best;
  }

  // The middle of one area of a field, on the board (a field spans x..x+1, y..y+1)
  const areaPoint = (f, k) => ({ x: f.x + 0.5 + areaXY(k).x / 3, y: f.y + 0.5 + areaXY(k).y / 3 });
  const areaPoints = u => standsIn(u).map(k => areaPoint(u, k));
  // The area of a field against its side d at third i along it (thirds run west to east, or north to south)
  const AREA_AT = { n: ['nw', 'n', 'ne'], s: ['sw', 's', 'se'], w: ['nw', 'w', 'sw'], e: ['ne', 'e', 'se'] };
  // Does a piece stand against side d of field (fx, fy), at any of the thirds given?
  function touches(u, fx, fy, d, thirds) {
    if (!u.kind || u.x !== fx || u.y !== fy) return false;
    const areas = standsIn(u);
    return thirds.some(i => areas.includes(AREA_AT[d][i]));
  }
  // Which thirds a point t (0 to 1 along a hedge) is in: two where it is on the line between them
  const thirdsAt = t => {
    const out = [];
    if (t < 1 / 3 + 1e-6) out.push(0);
    if (t > 1 / 3 - 1e-6 && t < 2 / 3 + 1e-6) out.push(1);
    if (t > 2 / 3 - 1e-6) out.push(2);
    return out;
  };

  // One straight line from point a (an area of from) to point b (an area of target, or of a field)
  function lineOfSight(st, from, target, a, b) {
    const EPS = 1e-6, dx = b.x - a.x, dy = b.y - a.y;
    // Every place the line crosses a line between fields: s is how far along it, 0 to 1
    const hits = [];
    for (let k = Math.ceil(Math.min(a.x, b.x)); k <= Math.floor(Math.max(a.x, b.x)); k++) {
      if (Math.abs(dx) < EPS) break;
      const s = (k - a.x) / dx;
      if (s > EPS && s < 1 - EPS) hits.push({ s, x: k, y: a.y + s * dy });
    }
    for (let k = Math.ceil(Math.min(a.y, b.y)); k <= Math.floor(Math.max(a.y, b.y)); k++) {
      if (Math.abs(dy) < EPS) break;
      const s = (k - a.y) / dy;
      if (s > EPS && s < 1 - EPS) hits.push({ s, x: a.x + s * dx, y: k });
    }
    hits.sort((p, q) => p.s - q.s);
    let hedgeCover = false, placeCorner = null;
    const corners = new Set();
    for (const h of hits) {
      const onX = Math.abs(h.x - Math.round(h.x)) < EPS, onY = Math.abs(h.y - Math.round(h.y)) < EPS;
      // Exactly through a field's corner: not blocked; a hedge ending there is cover for both (see above)
      if (onX && onY) {
        const vx = Math.round(h.x), vy = Math.round(h.y), key = vx + ',' + vy;
        if (corners.has(key)) continue;
        corners.add(key);
        const atCorner = cornerHedge(st, from, target, vx, vy);
        if (atCorner === 'blocked') return null;
        if (atCorner === 'cover') hedgeCover = true;
        // The corner of a village, hamlet or orchard beside the line, the same way (Steve)
        const place = cornerPlace(st, from, target, vx, vy, dx, dy);
        if (place === 'blocked') return null;
        if (place) placeCorner = place;
        continue;
      }
      // Across a line between two fields, side by side (a line x = k) or one above the other (y = k)
      const across = onX ? { ax: Math.round(h.x) - 1, ay: Math.floor(h.y), bx: Math.round(h.x), by: Math.floor(h.y), t: h.y - Math.floor(h.y), da: 'e', db: 'w' }
        : { ax: Math.floor(h.x), ay: Math.round(h.y) - 1, bx: Math.floor(h.x), by: Math.round(h.y), t: h.x - Math.floor(h.x), da: 's', db: 'n' };
      if (!inside(across.ax, across.ay) || !inside(across.bx, across.by) || !hedge(st, across.ax, across.ay, across.bx, across.by)) continue;
      // A hedge: blocked, unless one of them stands against this third of it
      const thirds = thirdsAt(across.t);
      const touching = u => touches(u, across.ax, across.ay, across.da, thirds) || touches(u, across.bx, across.by, across.db, thirds);
      const shooterTouches = touching(from), targetTouches = touching(target);
      if (!shooterTouches && !targetTouches) return null;
      if (targetTouches) hedgeCover = true;
    }
    // The fields it passes through on the way (not its two ends): houses or trees block it
    const marks = [0, ...hits.map(h => h.s), 1];
    for (let n = 0; n + 1 < marks.length; n++) {
      if (marks[n + 1] - marks[n] < EPS) continue;
      const m = (marks[n] + marks[n + 1]) / 2;
      const fx = Math.floor(a.x + m * dx), fy = Math.floor(a.y + m * dy);
      if ((fx === from.x && fy === from.y) || (fx === target.x && fy === target.y)) continue;
      if (screens({ x: fx, y: fy })) return null;
    }
    // Tanks in the way (Steve): no line through the areas one stands in; past its corner, see tankInWay
    const tank = tankInWay(st, from, target, a, b);
    if (tank === 'blocked') return null;
    const tankCorner = tank === 'cover';
    return { cover: (hedgeCover ? COVER.hedge : 0) + (tankCorner ? COVER.tankCorner : 0) + (placeCorner ? COVER.placeCorner : 0), hedge: hedgeCover, tankCorner, placeCorner };
  }

  // One area of a field as a square on the board (a third of a field a side)
  const cellOf = (f, k) => { const p = areaXY(k); return { x0: f.x + (p.x + 1) / 3, y0: f.y + (p.y + 1) / 3 }; };
  const THIRD = 1 / 3;
  // Where a line from a to b meets a square: the part of it inside (s from 0 to 1 along the line), or null
  function lineInCell(a, b, c) {
    let s0 = 0, s1 = 1;
    const d = [b.x - a.x, b.y - a.y], lo = [c.x0 - a.x, c.y0 - a.y], hi = [c.x0 + THIRD - a.x, c.y0 + THIRD - a.y];
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (lo[i] > 1e-9 || hi[i] < -1e-9) return null; continue; }
      let t0 = lo[i] / d[i], t1 = hi[i] / d[i];
      if (t0 > t1) [t0, t1] = [t1, t0];
      s0 = Math.max(s0, t0); s1 = Math.min(s1, t1);
      if (s0 > s1 + 1e-9) return null;
    }
    return { s0, s1 };
  }
  // Does a line pass a tank (not the shooter or the target)? 'blocked' through one of its areas, or past its corner
  // with neither piece in an area touching that corner; 'cover' past its corner from such an area (both +1) unless
  // either piece is right beside that side of the tank there; null if no tank is in the way
  function tankInWay(st, from, target, a, b) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const piecesCells = [from, target].map(u => (u.kind ? standsIn(u).map(k => cellOf(u, k)) : []));
    let cover = false;
    for (const t of st.units) {
      if (t === from || t === target || t.x === null || !isTank(t)) continue;
      for (const k of standsIn(t)) {
        const cell = cellOf(t, k);
        const hit = lineInCell(a, b, cell);
        if (!hit) continue;
        // Through the area itself: blocked
        if ((hit.s1 - hit.s0) * len > 1e-6) return 'blocked';
        // Only touching a corner of it: from an area at that very corner it sees past, in cover
        const p = { x: a.x + hit.s0 * (b.x - a.x), y: a.y + hit.s0 * (b.y - a.y) };
        const cornerOf = c => [[c.x0, c.y0], [c.x0 + THIRD, c.y0], [c.x0, c.y0 + THIRD], [c.x0 + THIRD, c.y0 + THIRD]].some(([x, y]) => Math.abs(x - p.x) < 1e-6 && Math.abs(y - p.y) < 1e-6);
        const atIt = piecesCells.map(cells => cells.some(cornerOf));
        if (!atIt[0] && !atIt[1]) return 'blocked';
        // Right beside that side of the tank (its area shares a side with the tank's, at that corner): no cover
        const beside = cells => cells.some(c => cornerOf(c) && (Math.abs(c.x0 - cell.x0) < 1e-6 || Math.abs(c.y0 - cell.y0) < 1e-6));
        if (!piecesCells.some(beside)) cover = true;
      }
    }
    return cover ? 'cover' : null;
  }

  // A line through the corner point (vx, vy) where fields meet: 'blocked' if a hedge ends there and neither piece stands
  // in a corner area at that point (Steve); 'cover' if one does and the hedge isn't touched at that corner by either of
  // them (then both get +1); null if nothing stops or covers it
  // The corner area of each of the four fields round the point that touches it
  const cornerAreas = (vx, vy) => [[vx - 1, vy - 1, 'se'], [vx, vy - 1, 'sw'], [vx - 1, vy, 'ne'], [vx, vy, 'nw']];
  const atPoint = (u, vx, vy) => !!u.kind && cornerAreas(vx, vy).some(([fx, fy, k]) => u.x === fx && u.y === fy && standsIn(u).includes(k));
  // A line through the corner point (vx, vy) only touches the two fields either side of it there (it runs through the
  // other two). If one is a village, hamlet or orchard: 'blocked' unless one of the pieces stands in a corner area at
  // that point (Steve: as at a hedge end); then its kind, and both get +1. null if neither is
  function cornerPlace(st, from, target, vx, vy, dx, dy) {
    const beside = [[vx - (dx > 0 ? 1 : 0), vy - (dy > 0 ? 0 : 1)], [vx - (dx > 0 ? 0 : 1), vy - (dy > 0 ? 1 : 0)]];
    for (const [fx, fy] of beside) {
      if (!inside(fx, fy) || !PLACE_COVER[tileType(fx, fy)]) continue;
      if (!atPoint(from, vx, vy) && !atPoint(target, vx, vy)) return 'blocked';
      return tileType(fx, fy);
    }
    return null;
  }

  function cornerHedge(st, from, target, vx, vy) {
    // The four hedges that can end at this point: [field a, field b, a's side, b's side, the third at this end]
    const ends = [
      [vx - 1, vy - 1, vx, vy - 1, 'e', 'w', 2], [vx - 1, vy, vx, vy, 'e', 'w', 0],
      [vx - 1, vy - 1, vx - 1, vy, 's', 'n', 2], [vx, vy - 1, vx, vy, 's', 'n', 0],
    ];
    let cover = false;
    for (const [ax, ay, bx, by, da, db, third] of ends) {
      if (!inside(ax, ay) || !inside(bx, by) || !hedge(st, ax, ay, bx, by)) continue;
      // Only from that very corner can it see past a hedge ending there
      if (!atPoint(from, vx, vy) && !atPoint(target, vx, vy)) return 'blocked';
      const near = u => touches(u, ax, ay, da, [third]) || touches(u, bx, by, db, [third]);
      if (!near(from) && !near(target)) cover = true;
    }
    return cover ? 'cover' : null;
  }


  // Can a side see this field (to call fire on it)? Any of its pieces next to it, or with a line of sight to it, however
  // far (Steve: the whole board), moved this round or not
  function sees(st, side, x, y) {
    return st.units.some(u => u.side === side && u.x !== null && (Math.abs(u.x - x) + Math.abs(u.y - y) <= 1 || sight(st, u, { x, y, at: null }, true)));
  }

  // ---------- Fire ----------

  // Firepower of a piece. hard: against tanks. Attached teams shoot on their own
  function firepower(st, u) {
    const P = PIECES[u.kind];
    let soft = P.soft * u.platoons, hard = P.hard * u.platoons;
    return { soft, hard };
  }

  // The dice a piece rolls against men: its own, and half its anti-tank weapons' (Steve asked why a bazooka showed 0:
  // it rolls one die at men, half its two anti-tank dice)
  function menDice(f) {
    return f.soft + f.hard * 0.5;
  }

  // Whole dice from a firepower: the fraction is a chance of one more
  const dice = (st, f) => Math.floor(f) + (st.rand() < f - Math.floor(f) ? 1 : 0);

  // Roll n six-sided dice needing `need` or more. Past MAX_NEED it is a Hail Mary (Steve): a die that throws a 6 throws
  // again, and only a second 6 hits (lead: the first 6; the second die follows it). The faces go into `faces` for the dice on the table
  function roll(st, n, need, faces = []) {
    let hits = 0;
    const hailMary = need > MAX_NEED;
    for (let i = 0; i < n; i++) {
      const face = 1 + Math.floor(st.rand() * 6);
      if (hailMary && face === 6) {
        const again = 1 + Math.floor(st.rand() * 6);
        faces.push({ face, hit: false, lead: true }, { face: again, hit: again === 6 });
        if (again === 6) hits++;
        continue;
      }
      const hit = !hailMary && face >= need;
      faces.push({ face, hit });
      if (hit) hits++;
    }
    return hits;
  }

  // Is a piece lining the hedge that faces another piece next to it? And is there a hedge between two pieces next to each other?
  const atHedge = (u, other) => lines(u, dirTo(u, other));
  function acrossHedge(st, from, target) {
    return adjacent(from, target) && hedge(st, from.x, from.y, target.x, target.y);
  }

  // Cover for a target, added to the score needed: lining a hedge it is shot across, at range, in a village or an orchard
  function cover(st, from, target) {
    let c = 0;
    if (from) { const s2 = sight(st, from, target); if (s2) c += s2.cover; }
    c += placeCover(st, target, from);
    return c;
  }

  // What hits do to a piece (Steve): every hit shakes it, and each hit is a coin toss whether it wounds: a section
  // of a platoon, a whole team, or a tank lost. Only anti-tank (hard) hits count against tanks
  function damage(st, u, softHits, hardHits, deadly = false) {
    const name = u.name, out = [];
    const hits = isTank(u) ? hardHits : softHits + hardHits;
    if (hits <= 0) return out;
    // Each hit: on a piece already shaken it kills (Steve: shaken twice kills); otherwise it shakes it, and a coin toss says
    // whether it wounds as well
    let wounds = 0;
    const wasShocked = u.shocked;
    for (let k = 0; k < hits; k++) {
      // A bazooka, Panzerschreck or tank gun hitting men kills outright (Steve: they're powerful)
      if (deadly && !isTank(u)) wounds++;
      else if (u.shocked) wounds++;
      else if (st.rand() < WOUND_CHANCE) wounds++;
      u.shocked = true;
    }
    if (isTank(u)) {
      const lost = Math.min(u.platoons, wounds);
      u.platoons -= lost;
      if (lost) out.push(`${name}: ${lost} tank${lost > 1 ? 's' : ''} knocked out`);
    } else if (isTeam(u) || u.kind === 'captain') {
      // A team is one base: one wound and it's gone
      if (wounds) { u.platoons = 0; out.push(`${name} wiped out`); }
    } else {
      const lost = Math.min(u.platoons, wounds);
      u.platoons -= lost;
      if (lost) out.push(`${name} loses ${lost} section${lost > 1 ? 's' : ''}`);
    }
    if (!out.length && u.platoons > 0) out.push(wasShocked ? `${name} still shaken` : `${name} shaken`);
    if (u.platoons <= 0) out.push(...remove(st, u));
    return out;
  }

  // A piece leaves the board
  function remove(st, u) {
    u.x = null; u.y = null; u.shocked = false;
    // The last piece of a side gone: the game stops there and then, without finishing the round (Steve)
    wipedOut(st);
    if (u.kind === 'company') {
      return [`💀 ${u.name} destroyed`];
    }
    return [];
  }

  // Shoot at one piece. Hard dice go against tanks; soft dice against everything else (and only shake tanks).
  // withdraw: the target spends a point to try to pull back: if it works it takes half the hits and falls back a field
  // The score each die needs: TO_HIT, plus cover and range, plus one on the move, less one for elite troops
  function needFor(st, shooter, target, moving = false) {
    // The sniper: no cover, no long range (Steve)
    // A small target needs one more, whoever shoots (Steve)
    const small = smallTarget(target) ? SMALL_TARGET : 0;
    // Taking cover: two more from every weapon (Steve), but not the sniper (no cover helps against him)
    const down = target.down ? TAKE_COVER : 0;
    if (PIECES[shooter.kind].sniper) return TO_HIT + small + (moving ? ON_THE_MOVE : 0) + (shooter.shocked ? SHAKEN_SHOOT : 0) - QUALITY[shooter.quality || 'standard'].shoot;
    return TO_HIT + cover(st, shooter, target) + small + down + (moving ? ON_THE_MOVE : 0) + (shooter.shocked ? SHAKEN_SHOOT : 0) - QUALITY[shooter.quality || 'standard'].shoot;
  }

  // Why a shot needs what it needs, for the label on the target (Steve): each thing that makes it harder (−) or easier (+),
  // each cover named on its own, after the score every shot starts from
  function needWhy(st, shooter, target, moving = false) {
    const why = [];
    if (PIECES[shooter.kind].sniper) {
      why.push('sniper: no cover or range');
      if (smallTarget(target)) why.push(`+${SMALL_TARGET} small target`);
      if (moving) why.push(`+${ON_THE_MOVE} moving`);
      if (shooter.shocked) why.push(`+${SHAKEN_SHOOT} shaken`);
      return withStart(why);
    }
    const s = sight(st, shooter, target);
    const far = isFar(shooter, target);
    // The covers one by one: the hedge it lines, a tank in a field in between, the field it stands in, its own tank beside it
    if (s && s.hedge) why.push(`+${COVER.hedge} hedge`);
    if (s && s.tankCorner) why.push(`+${COVER.tankCorner} tank's corner`);
    if (s && s.placeCorner) why.push(`+${COVER.placeCorner} cover`);
    why.push(...placeWhy(st, target, shooter));
    if (target.down) why.push(`+${TAKE_COVER} take cover`);
    // Two men or fewer (Steve)
    if (smallTarget(target)) why.push(`+${SMALL_TARGET} small target`);
    if (far) why.push(`+${LONG_RANGE} long range`);
    if (moving) why.push(`+${ON_THE_MOVE} moving`);
    if (shooter.shocked) why.push(`+${SHAKEN_SHOOT} shaken`);
    if (armourOf(target)) why.push(`+${armourOf(target)} armour`);
    if (QUALITY[shooter.quality || 'standard'].shoot) why.push(`−${QUALITY[shooter.quality || 'standard'].shoot} elite`);
    return withStart(why);
  }

  // Cover from the field a target stands in: a village, a hamlet or an orchard
  function placeWhy(st, target, from, shells = false) {
    const n = placeCover(st, target, from, shells);
    // (Steve: just "cover", not which kind of place)
    return n ? [`+${n} cover`] : [];
  }

  // The cover a village, hamlet or orchard gives a piece in it (see PLACE_COVER): men, a tank, or against shells; none
  // at all against an enemy inside the same one (Steve). Open fields and lanes give none
  function placeCover(st, target, from, shells = false) {
    const cover = PLACE_COVER[tileType(target.x, target.y)];
    if (!cover) return 0;
    if (from && samePlace(from, target)) return 0;
    if (shells) return cover.shells;
    return isTank(target) ? cover.tank : cover.men;
  }

  // Are two pieces inside the same village, hamlet or orchard? Only in the very same field (Steve: not the next field of
  // a block of them)
  const samePlace = (a, b) => a.x === b.x && a.y === b.y;


  // Put the score every shot starts from first (Steve: "3+", then "+1 small target"…, then the total), so the sum adds
  // up on the label; a plain 3+ shot needs no reasons at all
  function withStart(why) {
    if (!why.length) return why;
    return [`${TO_HIT}+`, ...why];
  }

  // The score mortar and artillery dice need against a piece: a village, hamlet or orchard gives cover from shells, and
  // a tank its armour, and men who have taken cover two more (Steve)
  function shellNeed(st, t) {
    // Cover from shells: a village, hamlet or orchard (Steve: +1 against mortars and artillery)
    const place = placeCover(st, t, null, true);
    return TO_HIT + place + armourOf(t) + (t.down ? TAKE_COVER : 0);
  }

  // A tank's armour (Steve: shown on the label and the panel): added to what anti-tank dice need; 0 for anyone else
  function armourOf(t) {
    return isTank(t) ? PIECES[t.kind].armour || 0 : 0;
  }



  // Why mortar and artillery dice need what they need, for the label on the target
  function shellWhy(st, t) {
    const why = [];
    // Only the village counts against shells
    why.push(...placeWhy(st, t, null, true));
    if (armourOf(t)) why.push(`+${armourOf(t)} armour`);
    // Men already down in cover: two more
    if (t.down) why.push(`+${TAKE_COVER} take cover`);
    return withStart(why);
  }

  // `blast` is set for the other pieces caught in a tank's high-explosive burst (they don't spread it again)
  const weaponOf = u => (isTank(u) || u.kind === 'pak' ? 'gun' : u.kind === 'mg' || u.kind === 'mg42' ? 'mg' : u.kind === 'bazooka' || u.kind === 'schreck' ? 'rocket' : 'rifle');

  function fireAt(st, shooter, target, power, withdraw = false, moving = false, blast = false) {
    const f = firepower(st, shooter);
    // A German piece fired on takes cover when it is wise to (Steve), as you can
    if (!withdraw && target.side === 'de' && germanTakesCover(st, target, menDice(f) * power, needFor(st, shooter, target, moving))) withdraw = true;
    // Taking cover happens before the dice roll: its men are already down (and two more are needed)
    const pre = withdraw ? takeCover(st, target) : null;
    const need = needFor(st, shooter, target, moving);
    const faces = [];
    let softHits, hardHits;
    if (isTank(target)) {
      hardHits = roll(st, dice(st, f.hard * power), need + armourOf(target), faces);
      softHits = roll(st, dice(st, f.soft * power), need, []);
    } else {
      // Anti-tank weapons are poor against men in a hedge: half value
      const full = dice(st, menDice(f) * power);
      softHits = roll(st, full, need, faces);
      hardHits = 0;
    }
    // Where the target stood, so its dice still land there if it is wiped out
    const stood = { x: target.x, y: target.y };
    const before = { strength: target.platoons, shocked: target.shocked };
    const deadly = isTank(shooter) || ['bazooka', 'schreck', 'pak'].includes(shooter.kind);
    const out = (pre ? [pre.line] : []).concat(damage(st, target, softHits, hardHits, deadly));
    // In a word, what the shot did, for the words that float up off the target
    const lost = before.strength - (target.x === null ? 0 : target.platoons);
    const result = target.x === null ? (isTank(target) ? 'Destroyed' : 'Wiped out')
      : lost ? (isTank(target) ? `Tank knocked out` : lost > 1 ? `${lost} sections lost` : 'Section lost')
      : target.shocked && !before.shocked ? 'Shaken' : softHits + hardHits ? 'No effect' : 'Missed';
    // What the table shows: the weapon's muzzle flash and tracers from the shooter, and what lands on the target
    st.fx.push({ from: { id: shooter.id, x: shooter.x, y: shooter.y }, to: { id: target.id }, weapon: weaponOf(shooter), armour: isTank(target), x: target.x === null ? stood.x : target.x, y: target.x === null ? stood.y : target.y, kind: softHits + hardHits ? 'hit' : 'miss', faces, need: need + armourOf(target), side: shooter.side, result, tookCover: !!pre });
    // A tank firing high explosive at men hits the whole field, like a mortar: every other piece on foot in it rolls too
    if (isTank(shooter) && !isTank(target) && !blast) {
      for (const other of at(st, stood.x, stood.y, target.side)) {
        if (other === target || isTank(other)) continue;
        out.push(...fireAt(st, shooter, other, power, false, moving, true));
      }
    }
    return out.length ? out : [`${target.name}: no hits`];
  }

  // A piece fired on takes cover (Steve): no moving back, its men get down where they are. One more is needed to hit it
  // for the rest of the German hour, and it misses its move next hour unless the captain gets it up
  // The chance of one die hitting, given the score it needs
  const hitChance = need => (need > MAX_NEED ? 1 / 36 : Math.max(0, 7 - need) / 6);

  // Does a German piece about to be fired on (dice at it, each needing `need`) take cover? When it is wise (Steve):
  // a shaken piece, where one more hit kills, as soon as a hit is likely; a weakened one against a fair volley; a
  // whole one only against a heavy one. Taking cover costs its move this round, so only a piece that still has it
  function germanTakesCover(st, t, diceAt, need) {
    if (!canReact(st, t) || isTank(t)) return false;
    const expected = diceAt * hitChance(need);
    const whole = t.platoons >= (t.kind === 'company' ? 3 : 1);
    if (t.shocked) return expected >= 0.5;
    if (!whole) return expected >= 1;
    return expected >= 1.8;
  }

  function takeCover(st, u) {
    if (st.tokens && !u.acted) u.acted = true;
    else u.spentNext = true;
    u.down = true;
    return { line: `${u.name} takes cover` };
  }

  // Can this piece react now: a piece not already down in cover, that hasn't moved this round (Steve: taking cover
  // uses the move it still has). You are asked; the Germans decide for themselves (germanTakesCover)
  function canReact(st, u) {
    // Tanks can't take cover (Steve): they just take it
    return u.x !== null && !isTank(u) && !PIECES[u.kind].fixed && !u.spentNext && !u.down && !u.acted;
  }

  // The score a shot needs, the Panther's armour included
  function shotNeed(st, shooter, target, moving = false) {
    return needFor(st, shooter, target, moving) + armourOf(target);
  }

  // Pieces a shooter could fire at (moving: firing on the move): enemies it can see, that its weapons can hurt, and
  // that need 6 or less on the dice. A shot needing 7 or more is a Hail Mary (Steve, see roll)
  function targets(st, shooter, moving = false) {
    // Anything without weapons shoots at nobody
    const f = firepower(st, shooter);
    if (f.soft + f.hard <= 0) return [];
    // Tanks only to those with anti-tank weapons: rifles and machine guns can't hurt them
    // Captains too (Steve: he dies like all the others)
    return st.units.filter(t => t.side !== shooter.side && t.x !== null && (!isTank(t) || f.hard > 0)
      && !!sight(st, shooter, t));
  }

  // ---------- Moving ----------

  // Can a piece step to a field next to it? Tanks can't climb the hedge banks: they need a gap or a lane,
  // unless they carry hedge cutters and drive straight through
  const cutter = u => isTank(u) && !!PIECES[u.kind].cutter;
  function canStep(st, u, x, y, leaving = []) {
    if (!inside(x, y) || !adjacent(u, { x, y })) return false;
    if (tileType(x, y) === 'river') return false;
    // Only tanks with hedge cutters go across a hedge; everyone else needs a gap, a lane, or to break through
    if (!cutter(u) && hedge(st, u.x, u.y, x, y)) return false;
    // Barbed wire stops men until it is cut; tanks roll over it
    if (!isTank(u) && wire(st, u.x, u.y, x, y)) return false;
    if (PIECES[u.kind].fixed) return false;
    return roomFor(st, u, x, y, leaving);
  }

  // Move a piece. A tank with hedge cutters going through a hedge leaves a gap.
  // Returns what happened to the hedge: 'cut' (driven through), 'climbed' (men clambered over) or ''
  function step(st, u, x, y, assault = false) {
    let how = '';
    u.trail = null;
    if (wire(st, u.x, u.y, x, y)) { delete st.wire[edgeKey(u.x, u.y, x, y)]; how = isTank(u) ? 'flattened' : 'wirecut'; }
    if (hedge(st, u.x, u.y, x, y)) {
      if (cutter(u)) { delete st.hedges[edgeKey(u.x, u.y, x, y)]; how = 'cut'; } else how = 'climbed';
    }
    const heading = dirTo(u, { x, y });
    u.x = x; u.y = y; u.at = freePlace(st, u, x, y, heading);
    // The way it is facing, for the table (tanks turn to fire, and turn again when they move)
    u.aim = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 }[heading];
    // A tank stops facing the nearest enemy it can see (Steve)
    if (isTank(u)) faceEnemy(st, u);
    return how;
  }

  // Which way a tank faces after it moves (Steve): towards the nearest enemy it can see; with none, towards the enemy's
  // side of the board; with two as near as each other, either one at random
  function faceEnemy(st, u) {
    const seen = st.units.filter(e => e.side !== u.side && e.x !== null && sight(st, u, e));
    if (!seen.length) {
      // Nobody in sight: towards the enemy's side (the Americans east, the Germans west)
      u.aim = u.side === 'us' ? 0 : Math.PI;
      return;
    }
    // The nearest; ties broken at random
    const far = e => Math.hypot(e.x - u.x, e.y - u.y);
    const nearest = Math.min(...seen.map(far));
    const closest = seen.filter(e => Math.abs(far(e) - nearest) < 0.01);
    const e = closest[Math.floor(st.rand() * closest.length)];
    u.aim = Math.atan2(-(e.y - u.y), e.x - u.x);
  }

  // ---------- Close assault ----------

  // Charge: step into the next field without shooting. If enemies hold it, fight for it hand to hand
  function charge(st, u, x, y) {
    const defenders = at(st, x, y, enemyOf(u.side));
    if (!defenders.length) {
      const how = step(st, u, x, y, true);
      return [how === 'cut' ? `${u.name} charges through the hedge, leaving a gap` : how === 'flattened' ? `${u.name} charges over the wire, flattening it` : `${u.name} charges forward`];
    }
    st.fx.push({ x, y, kind: 'assault' });
    // A tank can't fight hand to hand (Steve): it drives in and the men there fall back
    if (isTank(u)) return tankDrivesIn(st, u, defenders, x, y);
    return handToHand(st, u, defenders, x, y);
  }

  // A tank charging men (Steve): each piece in the field falls back to a field next to it, away from the tank, that it
  // can get into (no wire, room for it, no enemy there); one with nowhere to go is overrun. Then the tank takes the field
  function tankDrivesIn(st, u, defenders, x, y) {
    const from = { x: u.x, y: u.y };
    const out = [`🚜 ${u.name} drives in on ${defenders.map(d => d.name).join(' and ')}`];
    for (const d of defenders) {
      const spot = fallBackSpot(st, d, from);
      if (spot) {
        step(st, d, spot.x, spot.y);
        // (driven out by a tank it is up and running, no longer down in cover)
        d.down = false;
        d.ambush = false;
        out.push(`${d.name} falls back`);
        st.fx.push({ kind: 'rally', x: d.x, y: d.y, to: { id: d.id }, result: 'Falls back', ok: false });
      } else {
        out.push(`${d.name} is overrun`);
        remove(st, d);
      }
    }
    if (wire(st, u.x, u.y, x, y)) delete st.wire[edgeKey(u.x, u.y, x, y)];
    step(st, u, x, y);
    return out;
  }

  // Where a piece falls back to: the field next to it furthest from the attacker that it could move into
  function fallBackSpot(st, d, from) {
    let best = null, bestD = -1;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = d.x + dx, ny = d.y + dy;
      // Not back towards the attacker, and only where its own move could take it
      if (nx === from.x && ny === from.y) continue;
      if (stepCost(st, d, d.x, d.y, nx, ny) === null) continue;
      if (at(st, nx, ny, enemyOf(d.side)).length || !roomFor(st, d, nx, ny)) continue;
      const far = Math.abs(nx - from.x) + Math.abs(ny - from.y);
      if (far > bestD) { bestD = far; best = { x: nx, y: ny }; }
    }
    return best;
  }

  // Hand to hand (Steve): the two sides strike at each other in turn, the attacker first. Every base still standing rolls
  // a die and each hit takes a base off the other side; the survivors go on until only one side has anyone left.
  // Being shaken doesn't count in the fight, and it lasts past it: only a rally clears it (Steve)
  function handToHand(st, u, defenders, x, y) {
    const out = [`⚔️ ${u.name} charges ${defenders.map(d => d.name).join(' and ')}`];
    // The attacker's dice: 3+, one more against men behind the hedge it went over or in houses; elite one less
    const sheltered = hedge(st, u.x, u.y, x, y) || ['village', 'hamlet'].includes(tileType(x, y));
    const attackNeed = TO_HIT + (sheltered ? 1 : 0) - QUALITY[u.quality || 'standard'].shoot;
    const attackers = [u];
    const standing = list => list.filter(p => p.x !== null);
    // For the table (Steve: each exchange shown): the fight's field, where the attacker came from, everyone's bases at
    // the start, and each blow in turn. Every defender in the field fights, moved or taking cover (Steve)
    const fight = { kind: 'melee', x, y, from: { x: u.x, y: u.y }, attacker: u.id, defenders: defenders.map(d => d.id), side: u.side, before: {}, strikes: [] };
    for (const p of [...attackers, ...defenders]) fight.before[p.id] = p.platoons;
    for (let exchange = 1; exchange <= HAND_TO_HAND_LIMIT; exchange++) {
      // The attacker strikes first, then whoever is left of the defenders strikes back
      const a = strike(st, attackers, standing(defenders), () => attackNeed);
      out.push(...a.lines);
      if (a.able) fight.strikes.push(a.blow);
      if (!standing(defenders).length) break;
      const d = strike(st, standing(defenders), standing(attackers), s => TO_HIT - QUALITY[s.quality || 'standard'].shoot);
      out.push(...d.lines);
      if (d.able) fight.strikes.push(d.blow);
      if (!standing(attackers).length) break;
      // Neither side can hurt the other (men against tanks alone): the attacker gives up and stays where it was
      if (!a.able && !d.able) break;
    }
    fight.won = !standing(defenders).length && u.x !== null;
    st.fx.push(fight);
    if (!standing(defenders).length && u.x !== null) {
      // The field is the attacker's
      if (wire(st, u.x, u.y, x, y)) delete st.wire[edgeKey(u.x, u.y, x, y)];
      step(st, u, x, y);
      out.push(`⚔️ ${u.name} takes the field!`);
    } else if (u.x === null) out.push(`⚔️ The charge is wiped out.`);
    else out.push(`⚔️ ${u.name} can't get at them and stays back.`);
    return out;
  }

  // One side's blow in a hand-to-hand fight: each base of each striker rolls a die needing need(striker); every hit
  // takes a base off one of the victims it can hurt (rifle platoons and tanks first, the teams and the captain last).
  // Returns the lines to report, whether any striker could hurt anyone at all, and the blow for the table: who struck,
  // at whom, each die, and whose base each hit took
  function strike(st, strikers, victims, need) {
    const lines = [];
    let able = false;
    const blow = { side: strikers[0] ? strikers[0].side : null, strikers: strikers.filter(s => s.x !== null).map(s => s.id), victims: victims.map(v => v.id), faces: [], losses: [] };
    const canHurt = (s, v) => !isTank(v) || isTank(s) || PIECES[s.kind].hard > 0;
    for (const s of strikers) {
      if (s.x === null) continue;
      let hits = 0;
      for (let k = 0; k < s.platoons; k++) {
        // Who this base can hurt, still standing: the big pieces first
        const open = victims.filter(v => v.x !== null && canHurt(s, v)).sort((a, b) => (isSmall(a) ? 1 : 0) - (isSmall(b) ? 1 : 0));
        if (!open.length) break;
        able = true;
        const face = 1 + Math.floor(st.rand() * 6);
        const hit = face >= Math.min(6, need(s));
        blow.faces.push({ face, hit });
        if (!hit) continue;
        hits++;
        blow.losses.push(open[0].id);
        lines.push(...loseBase(st, open[0]));
      }
      if (able) lines.splice(lines.length - hits, 0, `${s.name}: ${hits} hit${hits === 1 ? '' : 's'}`);
    }
    return { lines, able, blow };
  }

  // One base lost in hand to hand: a section, a tank, or the whole of a team or the captain's HQ
  function loseBase(st, v) {
    v.platoons = Math.max(0, v.platoons - 1);
    if (v.platoons > 0) return [`${v.name} loses ${isTank(v) ? 'a tank' : 'a section'}`];
    remove(st, v);
    return [isTank(v) ? `${v.name} destroyed` : `${v.name} wiped out`];
  }

  // Has one side lost every piece? Then the game is over at once (Steve: don't finish the round)
  function wipedOut(st) {
    if (st.won || st.lost) return;
    const left = side => st.units.some(u => u.side === side && u.x !== null);
    if (!left('de')) {
      st.won = true;
      st.report = [`🏆 Every German on the field is destroyed in ${roundText(st.turn)}!`];
    } else if (!left('us')) {
      st.lost = true;
      st.report = ['💀 Nothing is left of the company. The attack has failed.'];
    }
  }

  // ---------- The player's actions ----------
  // Each returns { ok, lines } and spends a command point when it works. A piece acts once an hour

  function canAct(st, u) {
    return !!u && u.side === 'us' && u.x !== null && !st.won && !st.lost && !st.de && !u.acted && tokenAllows(st, u);
  }

  // The captain's rallies (Steve): two a round if he stays put or charges, in any order (two then the charge, one
  // either side of it, or the charge then two); one if he shoots or moves and shoots, before or after it. Not wanting
  // them all, he uses Skip turn. u.fired: he has shot (or moved and shot) this round
  const ralliesAllowed = cap => (cap.fired ? CAPTAIN_RALLIES.fired : CAPTAIN_RALLIES.still);
  function canRally(st, cap) {
    if (!cap || cap.kind !== 'captain' || cap.side !== 'us' || cap.x === null || st.won || st.lost || st.de || !tokenAllows(st, cap)) return false;
    if (cap.skipped) return false;
    return (cap.rallied || 0) < ralliesAllowed(cap);
  }
  // Can a piece shoot (or move and shoot) now? The captain not after two rallies: then only a charge is left (Steve)
  const mayFire = u => !(u.kind === 'captain' && (u.rallied || 0) >= CAPTAIN_RALLIES.still);

  function actShoot(st, u, target) {
    if (!canAct(st, u) || !mayFire(u) || !targets(st, u).includes(target)) return { ok: false };
    spend(st, u);
    u.fired = true;
    const lines = [`🔫 ${u.name} fires on ${target.name}: ` + fireAt(st, u, target, 1).join(', ')];
    // Shooting gives it away to any ambush that can see it (Steve)
    springAmbushes(st, u, lines);
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // The routes Move & shoot can take: up to MOVE_SHOOT_MOVES ending only where the piece will have someone to
  // shoot (Steve). Captains don't shoot, and machine guns can't fire on the move (Steve): they set up, then shoot
  function moveShootRoutes(st, u) {
    if (u.kind === 'mg' || u.kind === 'mg42' || PIECES[u.kind].fixed || !mayFire(u)) return [];
    const home = { x: u.x, y: u.y, at: u.at }, out = [];
    for (const route of routesFor(st, u, reach(u, MOVE_SHOOT_MOVES), false)) {
      // Try it: stand at the goal by each hedge in turn, or in the open; any place with a shot will do
      const goal = route[route.length - 1];
      u.x = goal.x; u.y = goal.y;
      for (const side of anchorsFor(u)) {
        // (only places it fits among the other pieces in that field)
        if (!fitsAt(st, u, goal.x, goal.y, side)) continue;
        u.at = side;
        if (targets(st, u, true).length) { out.push(route); break; }
      }
      u.x = home.x; u.y = home.y; u.at = home.at;
    }
    return out;
  }

  function moveShootSpots(st, u) {
    return moveShootRoutes(st, u).map(r => ({ x: r[r.length - 1].x, y: r[r.length - 1].y }));
  }

  // Of the nine areas of a field it could Move & shoot to, the ones a click on would leave it able to fire (Steve: only
  // those are hatched red): for each area, where it would stand (the nearest place it fits) and whether it has a shot
  function shootCells(st, u, x, y) {
    const home = { x: u.x, y: u.y, at: u.at }, out = [];
    u.x = x; u.y = y;
    for (const k of GRID) {
      u.at = freePlace(st, u, x, y, k === 'c' ? null : k);
      if (targets(st, u, true).length) out.push(k);
    }
    u.x = home.x; u.y = home.y; u.at = home.at;
    return out;
  }

  // Move and shoot: the piece moves a field, then it may fire once on the move, needing one more (actHalfShot), before doing anything else
  function actMoveShoot(st, u, x, y, side) {
    const route = canAct(st, u) && moveShootRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    u.fired = true;
    const lines = followRoute(st, u, route);
    // Snagged on wire on the way, or stopped by an ambush: it stays there, and fires from there if it can (Steve)
    if (u.snagged) { u.halfShot = u.x !== null && targets(st, u, true).length > 0; return { ok: true, lines: [lines.join(', ') + '.'] }; }
    const how = step(st, u, x, y);
    // Where it stands: where it was sent, or (none given) the first place in the field with a shot
    const place = side !== undefined ? side : [u.at, ...anchorsFor(u)].find(p => { if (!fitsAt(st, u, x, y, p)) return false; u.at = p; return targets(st, u, true).length; });
    standAt(st, u, place === undefined ? u.at : place);
    setTrail(st, u, route);
    lines.push(moveLine(u, how).replace(/\.$/, ''));
    // Arriving in sight of an ambush
    springAmbushes(st, u, lines);
    u.halfShot = u.x !== null && targets(st, u, true).length > 0;
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  function actHalfShot(st, u, target) {
    if (!u || !u.halfShot || u.x === null || !targets(st, u, true).includes(target)) return { ok: false };
    u.halfShot = false;
    const lines = [`🔫 ${u.name} moves and fires on ${target.name}: ` + fireAt(st, u, target, 1, false, true).join(', ')];
    springAmbushes(st, u, lines);
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  function moveLine(u, how) {
    if (how === 'cut') return `🚜 ${u.name} smashes through the hedge, leaving a gap.`;
    if (how === 'climbed') return `🧗 ${u.name} struggles over the hedge bank.`;
    if (how === 'flattened') return `🚜 ${u.name} flattens the barbed wire.`;
    if (how === 'snagged') return `🚜 ${u.name} flattens the barbed wire but gets snagged in it and stops.`;
    if (how === 'wirecut') return `✂️ ${u.name} cuts through the wire.`;
    return `➡️ ${u.name} moves up.`;
  }

  // Only rifle platoons charge into hand to hand (Steve: tanks can't fight hand to hand)
  const fightsHandToHand = u => u.kind === 'company';

  // What it costs to go from one field into the next (Steve): one move, and CLIMB more for men climbing a hedge bank (it
  // stays standing); barbed wire stops men; tanks drive straight through both. null where it can't go at all
  function stepCost(st, u, fx, fy, x, y) {
    if (!inside(x, y) || tileType(x, y) === 'river' || PIECES[u.kind].fixed) return null;
    if (isTank(u)) return hedge(st, fx, fy, x, y) && !cutter(u) ? null : 1;
    // Men: barbed wire stops them (only tanks get through it, Steve); a hedge bank they climb, for one more move
    if (wire(st, fx, fy, x, y)) return null;
    return hedge(st, fx, fy, x, y) ? 1 + CLIMB : 1;
  }

  // Every field a piece can reach with `budget` each with the cheapest way there: a list of the fields it passes
  // through, the last one its goal. It can pass through a field of friends (Steve) but not stop there, can end in a
  // village or hamlet but not go on through one (no charging through houses), and when charging, a field the enemy holds
  // ends the route in a hand-to-hand fight (rifle platoons and tanks only, and not against tanks alone unless it can hurt them)
  function routesFor(st, u, budget, charging) {
    const cheapest = {}, routeTo = {};
    cheapest[u.x + ',' + u.y] = 0;
    const open = [{ x: u.x, y: u.y, cost: 0, path: [] }];
    while (open.length) {
      // Take the cheapest place reached so far
      open.sort((a, b) => a.cost - b.cost);
      const here = open.shift();
      // Houses: a route can end in a village or hamlet but not go on through it
      if (here.path.length && ['village', 'hamlet'].includes(tileType(here.x, here.y))) continue;
      for (const [dx, dy] of NEIGHBOURS) {
        const x = here.x + dx, y = here.y + dy, key = x + ',' + y;
        const c = stepCost(st, u, here.x, here.y, x, y);
        if (c === null || here.cost + c > budget) continue;
        const cost = here.cost + c;
        if (cheapest[key] !== undefined && cheapest[key] <= cost) continue;
        const enemies = at(st, x, y, enemyOf(u.side));
        if (enemies.length) {
          // The enemy's field: only a charge goes in, to fight hand to hand, and it stops there
          // A rifle platoon fights hand to hand (not against tanks alone unless it can hurt them); a tank drives in on men
          // and they fall back (Steve), but not on other tanks or a dug-in gun
          const platoonFights = fightsHandToHand(u) && (enemies.some(e => !isTank(e)) || firepower(st, u).hard > 0);
          const tankDrivesIn = isTank(u) && enemies.every(e => !isTank(e) && !PIECES[e.kind].fixed);
          const canFight = charging && (platoonFights || tankDrivesIn);
          if (canFight) { cheapest[key] = cost; routeTo[key] = here.path.concat([{ x, y, assault: true }]); }
          continue;
        }
        cheapest[key] = cost;
        if (roomFor(st, u, x, y)) {
          // Room to stop: a goal, and maybe on from here
          const path = here.path.concat([{ x, y }]);
          routeTo[key] = path;
          open.push({ x, y, cost, path });
        } else if (at(st, x, y).length) {
          // Friends there: pass through, but not stop
          open.push({ x, y, cost, path: here.path.concat([{ x, y, pass: true }]) });
        }
      }
    }
    return Object.values(routeTo);
  }

  // A charge: up to CHARGE_MOVES without shooting, ending in a hand-to-hand fight if it reaches the enemy.
  // Every piece but a dug-in gun can charge; captains and teams only into empty fields. A shaken piece charges half as
  // far (Steve)
  function chargeRoutes(st, u) {
    if (PIECES[u.kind].fixed) return [];
    // (routesFor decides who can go into an enemy's field: a rifle platoon to fight, a tank to drive the men out)
    return routesFor(st, u, reach(u, CHARGE_MOVES), true);
  }

  // How far a piece can go (Steve): a shaken piece can always move or charge, but only half as far (at least one field)
  function reach(u, full) {
    // Bazooka and Panzerschreck teams go one field further (Steve)
    const extra = PIECES[u.kind].extraMove || 0;
    const far = full + extra;
    // Not shaken: the whole way
    if (!u.shocked) return far;
    // Shaken: half of that
    return Math.max(1, Math.floor(far * SHAKEN_MOVE));
  }

  // ---------- Ambush (Steve) ----------

  // Can this piece go into ambush now: on its token, with its move still to make, and able to fire
  function canAmbush(st, u) {
    return canAct(st, u) && mayFire(u);
  }

  // Go into ambush: it uses the piece's move and its token, and lasts until it fires or the round ends. A piece already
  // in sight isn't fired on until it moves or shoots
  function actAmbush(st, u) {
    if (!canAmbush(st, u)) return { ok: false };
    spend(st, u);
    u.ambush = true;
    // The captain gives up any rallies he has left too, as when he skips
    if (u.kind === 'captain') u.skipped = true;
    return { ok: true, lines: [`🪤 ${u.name} lies in ambush.`] };
  }

  // A piece has just moved or shot in the open: every enemy lying in ambush that can see it and hit it on 6 or less fires
  // now, once. Returns true if that stops it moving: wiped out, shaken, or losing men. passing: it is on its way through
  // this field, not lining any hedge in it
  function springAmbushes(st, mover, lines, passing = false) {
    let stopped = false;
    // (the Germans' moves are reported on their list)
    const report = mover.side === 'de' && st.de ? st.de.rep : lines;
    const place = mover.at;
    if (passing) mover.at = null;
    const waiting = st.units.filter(a => a.ambush && a.side !== mover.side && a.x !== null);
    for (const a of waiting) {
      // Already dead: nothing left to fire on
      if (mover.x === null) break;
      // Only what it can see, and hurt, and hit on 6 or less: otherwise it keeps waiting
      if (!targets(st, a).includes(mover) || shotNeed(st, a, mover) > MAX_NEED) continue;
      a.ambush = false;
      const wasShaken = mover.shocked, strength = mover.platoons, shotsBefore = st.fx.length;
      report.push(`🪤 ${a.name} springs its ambush on ${mover.name}: ${fireAt(st, a, mover, 1).join(', ')}`);
      // These shots land where it is now, not where it is going (the table)
      for (let k = shotsBefore; k < st.fx.length; k++) st.fx[k].midMove = true;
      if (mover.x === null || mover.platoons < strength || (mover.shocked && !wasShaken)) stopped = true;
    }
    if (passing && mover.x !== null) mover.at = place;
    return stopped;
  }

  // Go along a route's fields up to (not into) its goal, cutting, flattening or climbing on the way. Returns the lines to report
  // A tank that flattens barbed wire on the way can get snagged (Steve: WIRE_SNAG): it stops in that field (unless it
  // is a field of friends it can only pass through), u.snagged says so, and its move goes no further. An ambush that
  // shakes it stops it the same way (Steve), or kills it
  function followRoute(st, u, route) {
    const lines = [];
    u.snagged = false;
    // Setting off in sight of an ambush: it fires straight away (Steve: as soon as it can)
    let halted = springAmbushes(st, u, lines);
    if (halted) {
      u.snagged = true;
      setTrail(st, u, []);
      return lines;
    }
    const way = route.slice(0, -1);
    for (let i = 0; i < way.length; i++) {
      const p = way[i];
      let how = step(st, u, p.x, p.y);
      if (how === 'flattened' && !p.pass && st.rand() < WIRE_SNAG) { how = 'snagged'; u.snagged = true; }
      if (how) lines.push(moveLine(u, how).replace(/\.$/, ''));
      // Seen from here: any ambush fires
      if (springAmbushes(st, u, lines, true)) halted = true;
      // Dead: nothing more
      if (u.x === null) { u.snagged = true; break; }
      // Shaken in a field of friends it can only pass through: it stops at the first one it can
      if (halted && !p.pass) u.snagged = true;
      // Snagged or stopped: here it stays, and the table shows the way it came this far
      if (u.snagged) { setTrail(st, u, route.slice(0, i + 1)); break; }
    }
    return lines;
  }

  function chargeSpots(st, u) {
    return chargeRoutes(st, u).map(r => ({ x: r[r.length - 1].x, y: r[r.length - 1].y }));
  }

  // The fields a piece went through on its way (for the table to show it going round, not across houses)
  function setTrail(st, u, route) {
    const trail = route.slice(0, -1).map(p => ({ x: p.x, y: p.y }));
    u.trail = trail;
  }

  // Where in its field a piece stands after a move (Steve: where the click was, if no other piece is there); its teams
  // take the free places nearest it
  function standAt(st, u, side) {
    if (side === undefined) return;
    u.at = freePlace(st, u, u.x, u.y, side);
    // Where it stands decides what it can see past the hedges: a tank faces the nearest enemy from there (Steve)
    if (isTank(u)) faceEnemy(st, u);
  }

  function actCharge(st, u, x, y, side) {
    const route = canAct(st, u) && chargeRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    const lines = [];
    // The fields before the goal are crossed on the way
    const home = { x: u.x, y: u.y, at: u.at };
    lines.push(...followRoute(st, u, route));
    // Snagged on wire on the way, or stopped by an ambush: it gets no further
    if (u.snagged) return { ok: true, lines: [lines.join(', ') + '.'] };
    const empty = !at(st, x, y, enemyOf(u.side)).length;
    lines.push(...charge(st, u, x, y));
    // Arrived (not beaten back): it stands where it was sent, and the table shows the way it came
    if (u.x === x && u.y === y) { standAt(st, u, side); setTrail(st, u, route); }
    // Arriving in an empty field in sight of an ambush (a fight is its own business)
    if (empty && u.x === x && u.y === y) springAmbushes(st, u, lines);
    // Beaten back into a field of friends it passed through: it can't stay there, so it ends back where it started
    if (route.some(p => p.pass && p.x === u.x && p.y === u.y)) {
      u.x = home.x; u.y = home.y; u.at = home.at;
    }
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // The other places in its own field a piece could move to (not where it is; where it fits among the others)
  function lineSides(st, u) {
    if (PIECES[u.kind].fixed) return [];
    return anchorsFor(u).filter(p => p !== u.at && fitsAt(st, u, u.x, u.y, p));
  }

  // Move to another area of its own field (Steve: north hedge to south hedge, say): the piece's move for the round, and
  // like a Move & shoot it may fire after, one more needed for moving. The area clicked, or the nearest place it fits
  function actLine(st, u, side) {
    if (!canAct(st, u) || !lineSides(st, u).length) return { ok: false };
    const to = freePlace(st, u, u.x, u.y, side);
    if (to === u.at || !lineSides(st, u).includes(to)) return { ok: false };
    spend(st, u);
    // (a move that may fire after, like a Move & shoot: the captain can still fire only with a rally to spare)
    if (u.kind === 'captain' && mayFire(u)) u.fired = true;
    standAt(st, u, to);
    const lines = [`🌳 ${u.name} moves to ${placeName(u.at)}`];
    springAmbushes(st, u, lines);
    u.halfShot = u.x !== null && targets(st, u, true).length > 0;
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // Shocked friendly pieces a captain can reach
  function rallyTargets(st, cap) {
    // Shaken pieces, and pieces down in cover missing this hour, up to RALLY_RANGE fields away
    // (himself too)
    const needsHim = t => t.shocked || (t.down && t.acted);
    return st.units.filter(t => t.side === cap.side && t.x !== null && needsHim(t) && Math.abs(t.x - cap.x) + Math.abs(t.y - cap.y) <= RALLY_RANGE);
  }

  // A shaken piece uses its move to pull itself together (Steve: pieces can rally themselves; a rally always works)
  function canSelfRally(st, u) {
    return !!u && u.side === 'us' && u.x !== null && u.shocked && !u.acted && !st.won && !st.lost && !st.de && u.kind !== 'captain' && tokenAllows(st, u);
  }
  // Can the captain rally now and is there anyone in reach to rally, himself included (Steve: otherwise no Rally, no waiting)
  function captainCanRally(st, cap) {
    return canRally(st, cap) && rallyTargets(st, cap).length > 0;
  }

  function actSelfRally(st, u) {
    if (!canSelfRally(st, u)) return { ok: false };
    spend(st, u);
    u.shocked = false;
    rallyShown(st, u);
    return { ok: true, lines: [`📣 ${u.name} pulls itself together.`] };
  }

  // How a rally went, in words that float up off the piece on the table (Steve: it wasn't clear whether it worked)
  function rallyShown(st, t) {
    st.fx.push({ kind: 'rally', x: t.x, y: t.y, to: { id: t.id }, result: 'Rallied!', ok: true });
  }

  function actRally(st, cap, target) {
    if (!canRally(st, cap) || !rallyTargets(st, cap).includes(target)) return { ok: false };
    // A rally isn't his move: it counts against his rallies for the round (and with the bag, it is his token's piece)
    cap.rallied = (cap.rallied || 0) + 1;
    if (st.tokens) { st.activeId = cap.id; activated(st, { side: cap.side, id: cap.id }); }
    const lines = [];
    // Down in cover: he gets them up and moving, so they can act this round after all (Steve)
    if (target.down && target.acted) {
      target.down = false;
      target.acted = false;
      // It can act again, so its token goes back in the bag if taking cover took it out
      if (st.tokens && st.bag) st.bag[target.side] = Math.min(st.bag[target.side] + 1, movable(st, target.side));
      lines.push(`📣 ${cap.name} gets ${target.name} up and moving.`);
      if (!target.shocked) st.fx.push({ kind: 'rally', x: target.x, y: target.y, to: { id: target.id }, result: 'Up and moving', ok: true });
    }
    // Shaken: a rally always steadies them (Steve)
    if (target.shocked) {
      target.shocked = false;
      rallyShown(st, target);
      lines.push(`📣 ${cap.name} rallies ${target.name}.`);
    }
    return { ok: true, lines };
  }

  // Fields the battalion can call fire on: seen, with no Americans in them
  function canCallFire(st, x, y) {
    return inside(x, y) && sees(st, 'us', x, y) && at(st, x, y, 'us').length === 0;
  }

  // The fields a fire mission's shells fall on (Steve: shown round the target before firing): the target's field (main),
  // and for guns with splash the four fields next to it
  function shellFields(which, x, y, side = 'us') {
    const S = which === 'mortars' ? MORTARS : side === 'de' ? DE_ARTILLERY : ARTILLERY;
    // The target's field always
    const fields = [{ x, y, main: true }];
    // Mortars stop there; the guns' blast reaches the fields next to it
    if (!S.splash) return fields;
    for (const [dx, dy] of NEIGHBOURS) if (inside(x + dx, y + dy)) fields.push({ x: x + dx, y: y + dy, main: false });
    return fields;
  }

  // A fire mission from the mortars or the guns: dice on every piece in the field, and a few on the fields round it
  function fireMission(st, which, x, y, side = 'us') {
    const S = which === 'mortars' ? MORTARS : side === 'de' ? DE_ARTILLERY : ARTILLERY;
    const lines = [];
    // Round the target the shells fall on friend and foe alike (Steve): artillery can hit your own pieces there
    const hitField = (fx, fy, n, splash = false) => {
      const caught = splash ? at(st, fx, fy) : at(st, fx, fy, enemyOf(side));
      for (const t of caught) {
        if (t.x === null) continue;
        // Your shells on a German piece: it takes cover first if it is wise to (Steve); then what each die needs
        if (side === 'us' && t.side === 'de' && germanTakesCover(st, t, n, shellNeed(st, t))) { const pre = takeCover(st, t); lines.push(pre.line); }
        const need = shellNeed(st, t);
        const faces = [];
        // Against a tank only the anti-tank dice count (its armour is in need); against men every die
        const soft = isTank(t) ? 0 : roll(st, n, need, faces), hard = isTank(t) ? roll(st, S.hard || 0, need, faces) : 0;
        const before = t.platoons, wasShocked = t.shocked;
        const hurt = damage(st, t, soft, hard);
        lines.push(...(t.side === side ? hurt.map(l => `⚠️ friendly fire: ${l}`) : hurt));
        const lost = before - (t.x === null ? 0 : t.platoons);
        const result = t.x === null ? 'Wiped out' : lost ? (isTank(t) ? 'Tank knocked out' : 'Section lost') : t.shocked && !wasShocked ? 'Shaken' : soft + hard ? 'No effect' : 'Missed';
        st.fx.push({ x: fx, y: fy, kind: 'shell', faces, need, side, to: { id: t.id }, result, support: which });
      }
      // An empty field still gets its shell, flying from the side that fired (Steve: never from both sides' guns)
      if (!at(st, fx, fy, enemyOf(side)).length) st.fx.push({ x: fx, y: fy, kind: 'shell', support: which, side });
    };
    // The full dice on the target's field, the splash dice on each field round it
    for (const f of shellFields(which, x, y, side)) hitField(f.x, f.y, f.main ? S.dice : S.splash, !f.main);
    return lines;
  }

  function actFire(st, which, x, y) {
    // The bomber has its own way of going in
    if (which === 'bomber') return actBomb(st, x, y);
    if (st.won || st.lost || st.de || st.fired[which] || st.ammo[which] <= 0 || !canCallFire(st, x, y)) return { ok: false };
    // With the bag: on an American token not yet used by a piece; firing uses the token (Steve: the guns are in the bag)
    if (st.tokens && (st.drawn !== 'us' || st.activeId)) return { ok: false };
    if (st.tokens) { st.activeId = 'gun:' + which; activated(st, { side: 'us', gun: which }); }
    st.fired[which] = true;
    st.ammo[which]--;
    const S = which === 'mortars' ? MORTARS : ARTILLERY;
    const lines = fireMission(st, which, x, y);
    return { ok: true, lines: [`💥 ${S.name} fire on the field: ${lines.length ? lines.join(', ') : 'no hits'}.`] };
  }

  // ---------- The bomber (Steve) ----------

  // Which way a side's bomber flies this round: spun the first time it is picked, the same every time after that
  function bomberHeading(st, side) {
    // Not spun yet this round: spin now
    if (st.spin[side] === undefined) st.spin[side] = Math.floor(st.rand() * BOMBER.directions);
    return st.spin[side];
  }

  // Every field round the edge of the board: the bomber can be sent through any of them
  function bomberEdges() {
    const edges = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const onEdge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      if (onEdge) edges.push({ x, y });
    }
    return edges;
  }

  // How far along a straight line a field lies: where the line goes in and comes out, or null if it misses the field.
  // (px, py) is a point on the line, (dx, dy) its direction
  function lineThrough(fx, fy, px, py, dx, dy) {
    let enter = -Infinity, leave = Infinity;
    for (const [low, point, step] of [[fx, px, dx], [fy, py, dy]]) {
      // Flying level with this side: the line stays inside the field's width or never touches it
      if (Math.abs(step) < 1e-9) {
        if (point <= low || point >= low + 1) return null;
        continue;
      }
      const a = (low - point) / step, b = (low + 1 - point) / step;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
    }
    // Only touching a corner doesn't count; clipping a corner does (Steve: every field it passes over)
    return leave - enter > 1e-9 ? { enter, leave } : null;
  }

  // The fields under the bomber, in the order it flies over them: a straight line through the middle of the chosen field.
  // t: how far each one is along the line from the chosen field
  function bomberLine(x, y, heading) {
    // The compass: 0 is north (up the board), going clockwise
    const angle = heading * 2 * Math.PI / BOMBER.directions;
    const dx = Math.sin(angle), dy = -Math.cos(angle);
    const fields = [];
    for (let fy = 0; fy < ROWS; fy++) for (let fx = 0; fx < COLS; fx++) {
      const through = lineThrough(fx, fy, x + 0.5, y + 0.5, dx, dy);
      if (through) fields.push({ x: fx, y: fy, t: (through.enter + through.leave) / 2 });
    }
    fields.sort((a, b) => a.t - b.t);
    return fields;
  }

  // The score a bomb needs: the bomber's own, then the same cover and armour as against shells
  function bombNeed(st, t) {
    const place = placeCover(st, t, null, true);
    return BOMBER.need + place + armourOf(t) + (t.down ? TAKE_COVER : 0);
  }
  // Why it needs that, for the label on the piece
  function bombWhy(st, t) {
    const extras = shellWhy(st, t).slice(1);
    return [`${BOMBER.need}+`, ...extras];
  }

  // The bomber flies: one bomb on every piece in every field under it, friend or foe. Returns the lines to report
  function dropBombs(st, side, x, y) {
    const heading = bomberHeading(st, side);
    const line = bomberLine(x, y, heading);
    const lines = [];
    // The plane itself, for the table
    st.fx.push({ kind: 'flyover', side, x, y, heading, line });
    for (const field of line) {
      for (const t of at(st, field.x, field.y)) {
        // Your bomb on a German piece: it takes cover first if it is wise to, as under shells
        const ducks = side === 'us' && t.side === 'de' && germanTakesCover(st, t, BOMBER.dice, bombNeed(st, t));
        if (ducks) lines.push(takeCover(st, t).line);
        // The score it needs, after any taking cover
        const need = bombNeed(st, t);
        const faces = [];
        const hits = roll(st, BOMBER.dice, need, faces);
        // A hit works like a mortar's (Steve): it shakes, a coin toss says if it wounds; on a tank, as an anti-tank die
        const soft = isTank(t) ? 0 : hits;
        const hard = isTank(t) ? hits : 0;
        const before = t.platoons, wasShaken = t.shocked;
        const hurt = damage(st, t, soft, hard);
        lines.push(...(t.side === side ? hurt.map(l => `⚠️ friendly fire: ${l}`) : hurt));
        // What it did, for the words on the table
        const lost = before - (t.x === null ? 0 : t.platoons);
        const result = t.x === null ? 'Wiped out' : lost ? (isTank(t) ? 'Tank knocked out' : 'Section lost') : t.shocked && !wasShaken ? 'Shaken' : hits ? 'No effect' : 'Missed';
        st.fx.push({ kind: 'bomb', x: field.x, y: field.y, faces, need, side, to: { id: t.id }, result, support: 'bomber', along: field.t, tookCover: ducks });
      }
    }
    return lines;
  }

  // The best line for a side's bomber this round, by its compass: the chosen field and what the line is worth; null if
  // no line is worth flying (it would catch too few of the enemy, or too many of its own)
  function bestBomberRun(st, side) {
    const heading = bomberHeading(st, side);
    let best = null;
    for (const edge of bomberEdges()) {
      let worth = 0;
      for (const field of bomberLine(edge.x, edge.y, heading)) {
        for (const t of at(st, field.x, field.y)) worth += t.side === side ? -1.5 : 1;
      }
      if (!best || worth > best.worth) best = { x: edge.x, y: edge.y, worth };
    }
    return best && best.worth >= BOMBER.worth ? best : null;
  }

  // Your bomber sent through a field on the edge of the board
  function actBomb(st, x, y) {
    const onEdge = bomberEdges().some(f => f.x === x && f.y === y);
    if (st.won || st.lost || st.de || st.fired.bomber || st.ammo.bomber <= 0 || !onEdge) return { ok: false };
    // With the bag: on an American token not yet used by a piece; flying uses the token
    if (st.tokens && (st.drawn !== 'us' || st.activeId)) return { ok: false };
    if (st.tokens) { st.activeId = 'gun:bomber'; activated(st, { side: 'us', gun: 'bomber' }); }
    st.fired.bomber = true;
    st.ammo.bomber--;
    const lines = dropBombs(st, 'us', x, y);
    return { ok: true, lines: [`✈️ The ${BOMBER_NAMES.us} flies over: ${lines.length ? lines.join(', ') : 'no hits'}.`] };
  }

  // ---------- The Germans ----------

  // What a German piece would most like to shoot: tanks for anti-tank weapons, otherwise the weakest infantry
  // (only proper shots: a Hail Mary is for when it has nothing better to do, see germanAct)
  function bestTarget(st, u) {
    const ts = targets(st, u).filter(t => shotNeed(st, u, t) <= MAX_NEED);
    if (!ts.length) return null;
    const f = firepower(st, u);
    const score = t => (isTank(t) ? f.hard * 2 : menDice(f)) * (7 - TO_HIT - cover(st, u, t)) / 2 + (t.shocked ? 1 : 0) - t.platoons * 0.1;
    return ts.sort((a, b) => score(b) - score(a))[0];
  }

  // Where a German piece moves towards a goal (Steve: the same rules as yours): any route a Charge of yours could take,
  // as far, staying out of American fields; men climb hedge banks (the hedge stays) and are stopped by wire, tanks
  // drive through. The route that ends nearest the goal, if it gets any nearer
  function routeToward(st, u, goal) {
    const far = p => Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y);
    let best = null, bestD = far(u);
    for (const route of routesFor(st, u, reach(u, CHARGE_MOVES), false)) {
      const end = route[route.length - 1];
      if (far(end) < bestD) { bestD = far(end); best = route; }
    }
    return best;
  }

  // The German hour runs a piece at a time, so it can stop and ask the player whether a piece being fired on pulls back.
  // st.de holds the hour in progress: who still has to act, the report so far, and any question waiting for an answer
  function startGermanHour(st) {
    // Shaken Germans stay shaken until their captain rallies them (Steve: only a rally clears it)
    for (const u of st.units) u.halfShot = false;
    st.fx = [];
    st.de = { queue: st.units.filter(u => u.side === 'de' && u.x !== null).map(u => u.id), mortar: st.deMortarAmmo > 0, artillery: st.deArtilleryAmmo > 0, rep: [], ask: null };
  }

  // What one German piece does: throw Americans out of the hamlet, counterattack a shaken company, shoot, or (reserves) move up.
  // Returns a planned shot { shooter, target } instead of firing, so the target can be offered a chance to pull back
  function germanAct(st, u) {
    const rep = st.de.rep;
    // Until it does something else, it holds its ground (what the table's word bubble says, Steve)
    deSays(st, 'Holds its ground');
    // Their captain (Steve): first he rallies the nearest shaken German in reach, himself too
    if (u.kind === 'captain') {
      const far = t => Math.abs(t.x - u.x) + Math.abs(t.y - u.y);
      const shaken = st.units.filter(t => t.side === 'de' && t.x !== null && t.shocked && far(t) <= RALLY_RANGE).sort((a, b) => far(a) - far(b));
      if (shaken.length) {
        const t = shaken[0];
        // A rally always works (Steve)
        t.shocked = false;
        rallyShown(st, t);
        deSays(st, `Rallies ${t === u ? 'himself' : t.name}`);
        rep.push(`📣 ${u.name} rallies ${t.name}.`);
        return null;
      }
    }
    const inHamlet = at(st, st.objective.x, st.objective.y, 'us').length > 0;
    if (inHamlet && !u.shocked && fightsHandToHand(u) && adjacent(u, st.objective)) {
      deSays(st, `Charges into ${st.objective.name}`);
      // Setting off in sight of an ambush: stopped, it gets no further
      if (springAmbushes(st, u, [])) return null;
      rep.push('🔺 ' + charge(st, u, st.objective.x, st.objective.y).join(', ') + '.');
      return null;
    }
    const weak = st.units.find(t => t.side === 'us' && t.x !== null && t.kind === 'company' && adjacent(u, t) && t.shocked);
    if (u.kind === 'company' && !u.shocked && u.platoons >= 2 && weak && st.rand() < 0.5) {
      deSays(st, `Charges ${weak.name}`);
      if (springAmbushes(st, u, [])) return null;
      rep.push('🔺 ' + charge(st, u, weak.x, weak.y).join(', ') + '.');
      return null;
    }
    const t = bestTarget(st, u);
    if (t) { deSays(st, `Fires on ${t.name}`); return { shooter: u.id, target: t.id }; }
    // Americans just across a hedge it isn't lining: go to that hedge
    const across = st.units.find(o => o.side === 'us' && o.x !== null && acrossHedge(st, u, o) && !atHedge(u, o));
    if (across && !PIECES[u.kind].fixed) {
      deSays(st, `Lines the hedge facing ${across.name}`);
      u.at = freePlace(st, u, u.x, u.y, dirTo(u, across));
      springAmbushes(st, u, []);
      return null;
    }
    // On the way to its post: march there and dig in
    if (u.post && !u.reserve && (u.x !== u.post.x || u.y !== u.post.y)) {
      const route = routeToward(st, u, u.post);
      if (route) { deSays(st, 'Marches to its post'); germanMove(st, u, route); return null; }
    }
    // Reserves: a company goes to hold the hamlet if nobody does; the rest move up towards the nearest Americans
    if (u.reserve) {
      const holding = u.x === st.objective.x && u.y === st.objective.y && u.kind === 'company';
      if (holding) deSays(st, `Holds ${st.objective.name}`);
      const garrison = at(st, st.objective.x, st.objective.y, 'de').some(g => g.kind === 'company');
      const us = st.units.filter(o => o.side === 'us' && o.x !== null);
      const near = us.sort((a, b) => (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
      const goal = (!garrison && u.kind === 'company') || !near ? st.objective : near;
      const route = holding ? null : routeToward(st, u, goal);
      if (route) { deSays(st, goal === st.objective ? `Moves up to hold ${st.objective.name}` : `Moves up towards ${near.name}`); germanMove(st, u, route); return null; }
    }
    // Nothing better to do: a Hail Mary, if it has anyone in reach
    const longShot = targets(st, u)[0];
    if (longShot) { deSays(st, `Hail Mary at ${longShot.name}`); return { shooter: u.id, target: longShot.id }; }
    // No one in reach and nowhere to go: it lies in wait
    if (mayFire(u)) {
      u.ambush = true;
      deSays(st, 'Lies in ambush');
      rep.push(`🪤 ${u.name} lies in ambush.`);
    }
    return null;
  }

  // What the German piece or gun on this token is doing, in a few words, for its word bubble on the table (Steve)
  function deSays(st, what) {
    if (st.de && st.de.move) st.de.move.what = what;
  }

  // A German piece goes along its route, as yours do: climbing hedge banks on foot, a tank driving through and leaving
  // a gap; the table shows the way it went
  function germanMove(st, u, route) {
    followRoute(st, u, route);
    if (u.snagged) return;
    const goal = route[route.length - 1];
    step(st, u, goal.x, goal.y);
    setTrail(st, u, route);
    // Arriving in sight of an ambush
    springAmbushes(st, u, []);
  }

  // The German mortar picks the strongest American company next to a German field
  // The German artillery's target: the American piece in a field the Germans can see with the most Americans in and round
  // it, and no Germans in or next to it (they don't shell their own men)
  function germanArtilleryTarget(st) {
    const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
    const us = st.units.filter(t => t.side === 'us' && t.x !== null);
    const de = st.units.filter(g => g.side === 'de' && g.x !== null);
    const ts = us.filter(t => sees(st, 'de', t.x, t.y) && !de.some(g => near(g, t)));
    const score = t => us.filter(o => near(o, t)).reduce((n, o) => n + o.platoons, 0);
    return ts.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function germanMortarTarget(st) {
    const ts = st.units.filter(t => t.side === 'us' && t.x !== null && t.kind === 'company' && st.units.some(g => g.side === 'de' && g.x !== null && adjacent(g, t)));
    return ts.sort((a, b) => b.platoons - a.platoons)[0] || null;
  }

  // Carry out a planned German shot (or mortar mission), with or without the target pulling back
  function resolveShot(st, shot, withdraw) {
    const t = unitById(st, shot.target);
    if (t.x === null) return;
    // A piece under the German bomber's line: it only chooses whether to get down; the bombs fall once all have chosen
    if (shot.bombed) {
      if (withdraw) takeCover(st, t);
      return;
    }
    if (shot.artillery) {
      st.deArtilleryAmmo--;
      if (withdraw) takeCover(st, t);
      const lines = fireMission(st, 'artillery', t.x, t.y, 'de');
      st.de.rep.push(`🔺 German artillery on ${t.name}${withdraw ? ' (it takes cover)' : ''}: ${lines.length ? lines.join(', ') : 'no hits'}.`);
      return;
    }
    if (shot.mortar) {
      st.deMortarAmmo--;
      // (who it is at: the table keeps that piece on show until the bomb lands, Steve)
      const fx = { x: t.x, y: t.y, kind: 'shell', support: 'mortars', to: { id: t.id } };
      // Taking cover from the mortar: its men get down before the bombs land
      const pre = withdraw ? takeCover(st, t) : null;
      const need = shellNeed(st, t);
      const faces = [];
      const hits = roll(st, DE_MORTAR.dice, need, faces);
      fx.faces = faces; fx.need = need; fx.side = 'de'; fx.tookCover = !!pre;
      const before = t.platoons, wasShaken = t.shocked;
      const lines = (pre ? [pre.line] : []).concat(damage(st, t, hits, 0));
      const lost = before - (t.x === null ? 0 : t.platoons);
      fx.result = t.x === null ? 'Wiped out' : lost ? 'Section lost' : t.shocked && !wasShaken ? 'Shaken' : hits ? 'No effect' : 'Missed';
      st.fx.push(fx);
      st.de.rep.push(`🔺 German mortars on ${t.name}: ${lines.length ? lines.join(', ') : 'no hits'}.`);
      return;
    }
    const u = unitById(st, shot.shooter);
    if (u.x === null) return;
    st.de.rep.push(`🔺 ${u.name} fires on ${t.name}: ` + fireAt(st, u, t, 1, withdraw).join(', ') + '.');
    // Shooting gives it away to any ambush that can see it (Steve)
    springAmbushes(st, u, []);
  }

  // Run the German hour until it ends or a question needs the player. Returns { ask } or { done: true }
  // showAim (the page, Steve: the Germans show their targeting as yours do): each shot first comes back as { aim }, so
  // the table can show its targets and the score needed; the next call fires it (or asks its target first)
  function germanStep(st, showAim = false) {
    if (!st.de || st.won || st.lost) return { done: true };
    if (st.de.ask) return { ask: st.de.ask };
    // A shot shown on the table last step: now it fires, or its target is asked first
    if (st.de.aim) {
      const shot = st.de.aim;
      st.de.aim = null;
      // (the bomber's line has been shown: its run carries on below)
      if (!shot.bomber) {
        if (canReact(st, unitById(st, shot.target))) { st.de.ask = shot; return { ask: shot }; }
        resolveShot(st, shot, false);
      }
    }
    // Aim it (shown first on the page), or straight on to firing it
    const plan = shot => {
      if (showAim) { st.de.aim = shot; return { aim: shot }; }
      if (canReact(st, unitById(st, shot.target))) { st.de.ask = shot; return { ask: shot }; }
      resolveShot(st, shot, false);
      return null;
    };
    while (st.de.queue.length) {
      const u = unitById(st, st.de.queue.shift());
      if (u.x === null) continue;
      if (st.won || st.lost) break;
      const shot = germanAct(st, u);
      if (!shot) continue;
      const r = plan(shot);
      if (r) return r;
    }
    // A side wiped out: nothing more happens
    if (st.won || st.lost) return { done: true };
    if (st.de.artillery) {
      st.de.artillery = false;
      const t = germanArtilleryTarget(st);
      deSays(st, t ? `Shells ${t.name}` : 'Holds fire: no target');
      if (t) {
        const r = plan({ artillery: true, target: t.id });
        if (r) return r;
      }
    }
    if (st.de.mortar) {
      st.de.mortar = false;
      const t = germanMortarTarget(st);
      deSays(st, t ? `Mortars ${t.name}` : 'Holds fire: no target');
      if (t) {
        const r = plan({ mortar: true, target: t.id });
        if (r) return r;
      }
    }
    // Their bomber picked: the best line by its compass, or it stays away this round
    if (st.de.bomber) {
      st.de.bomber = false;
      const run = bestBomberRun(st, 'de');
      deSays(st, run ? 'Flies in' : 'Stays away: nothing worth bombing');
      if (run) {
        // Your pieces under the line are each asked before it arrives (Steve); its own men aren't, as under your bomber
        const under = bomberLine(run.x, run.y, bomberHeading(st, 'de')).flatMap(f => at(st, f.x, f.y, 'us'));
        st.de.run = { x: run.x, y: run.y, asks: under.map(u => u.id) };
        // On the page, the line shows first
        if (showAim) { st.de.aim = { bomber: true }; return { aim: st.de.aim }; }
      }
    }
    if (st.de.run) {
      const run = st.de.run;
      // Each piece of yours under the line that can still get down
      while (run.asks.length) {
        const id = run.asks.shift();
        if (canReact(st, unitById(st, id))) { st.de.ask = { bombed: true, target: id }; return { ask: st.de.ask }; }
      }
      // All have chosen: it flies
      st.de.run = null;
      st.deBomberAmmo--;
      const lines = dropBombs(st, 'de', run.x, run.y);
      st.de.rep.push(`🔺 The ${BOMBER_NAMES.de} flies over: ${lines.length ? lines.join(', ') : 'no hits'}.`);
    }
    return { done: true };
  }

  // The player's answer to "pull back?"
  function answer(st, withdraw) {
    if (!st.de || !st.de.ask) return;
    const shot = st.de.ask;
    st.de.ask = null;
    resolveShot(st, shot, withdraw);
  }

  // ---------- The blind bag (Steve) ----------
  // Each round the bag holds a token for every piece on the table that can still move: green for the Americans, grey for
  // the Germans. One is drawn at a time and that side moves one piece; then the next is drawn. A piece destroyed, or one
  // that loses its move (taking cover), takes a token out with it. When the bag is empty, the round (the hour) ends

  // Everything of a side's off the board, and what each has left
  const SUPPORT = ['artillery', 'mortars', 'bomber'];
  const ammoOf = (st, side) => (side === 'us' ? st.ammo : { mortars: st.deMortarAmmo, artillery: st.deArtilleryAmmo, bomber: st.deBomberAmmo });

  // Pieces of a side that can still move this round, and its mortars and artillery that still have rounds and haven't
  // fired (Steve: out of rounds, they come out of the bag)
  function movable(st, side) {
    const pieces = st.units.filter(u => u.side === side && u.x !== null && !u.acted).length;
    const ammo = ammoOf(st, side);
    const fired = side === 'us' ? st.fired : (st.deFired || {});
    const guns = SUPPORT.filter(w => ammo[w] > 0 && !fired[w]).length;
    return pieces + guns;
  }

  // Can your mortars or artillery fire now: rounds left, not fired this round, and (with the bag) on an unused token of yours
  function canFire(st, which) {
    return st.ammo[which] > 0 && !st.fired[which] && !st.won && !st.lost && !st.de && (!st.tokens || (st.drawn === 'us' && !st.activeId));
  }

  // Skip a turn (Steve: anyone can): the piece, or the gun, gives up its move this round and the token is used
  function actSkip(st, u) {
    const able = canAct(st, u) || (u.kind === 'captain' && canRally(st, u));
    if (!able) return { ok: false };
    spend(st, u);
    // The captain skipping gives up any rallies he has left too (Steve: that is how he stops)
    if (u.kind === 'captain') u.skipped = true;
    return { ok: true, lines: [`⏭️ ${u.name} holds its ground this round.`] };
  }
  // Moved with Move & shoot but not firing after all (Steve: no Pass button): the shot is given up and the token is done
  function actSkipShot(st, u) {
    if (!u || !u.halfShot) return { ok: false };
    u.halfShot = false;
    return { ok: true, lines: [`⏭️ ${u.name} holds its fire.`] };
  }

  function skipSupport(st, which) {
    if (!canFire(st, which)) return { ok: false };
    st.fired[which] = true;
    if (st.tokens) { st.activeId = 'gun:' + which; activated(st, { side: 'us', gun: which }); }
    if (which === 'bomber') return { ok: true, lines: [`⏭️ The ${BOMBER_NAMES.us} stays away this round.`] };
    return { ok: true, lines: [`⏭️ The ${which === 'mortars' ? 'mortars' : 'artillery'} hold fire this round.`] };
  }

  function startRound(st) {
    st.tokens = true;
    // What the last round left for the table (Steve: only the tokens that activated someone fly back into the bag; the
    // ones never drawn stayed in it). The first round: the whole bag flies in
    const left = st.leftInBag || (st.bag ? { us: st.bag.us, de: st.bag.de } : { us: 0, de: 0 });
    st.returning = { first: !st.bag, activated: st.activated || [], left, timerOut: !!st.timerDrawn };
    st.activated = [];
    st.leftInBag = null;
    st.timerDrawn = false;
    // Shaken Germans stay shaken until their captain rallies them (Steve: only a rally clears it)
    for (const u of st.units) u.halfShot = false;
    st.bag = { us: movable(st, 'us'), de: movable(st, 'de'), timer: ROUND_TIMER };
    // Tokens drawn so far this round (the timer can't be the first, Steve)
    st.drawnThisRound = 0;
    st.drawn = null;
    st.activeId = null;
    st.deFired = {};
    st.roundRep = [];
  }

  // The new round's tokens (Steve): one flies home from each piece or gun a token activated last round, and from nobody
  // else; the rest of the side's new bag is already in it. The first round, every token flies in. For each side:
  // { from: [{ id } or { gun }], kept }
  function tokensHome(st) {
    const back = st.returning || { first: true, activated: [] };
    const out = {};
    for (const side of ['us', 'de']) {
      const ammo = ammoOf(st, side);
      // Who has a token in the new bag at all
      const hasToken = w => (w.gun ? ammo[w.gun] > 0 : (u => !!u && u.x !== null && !u.acted)(unitById(st, w.id)));
      let from;
      if (back.first) {
        from = st.units.filter(u => u.side === side && u.x !== null && !u.acted).map(u => ({ id: u.id }));
        for (const gun of SUPPORT) if (ammo[gun] > 0) from.push({ gun });
      } else from = back.activated.filter(a => a.side === side && hasToken(a));
      from = from.slice(0, st.bag[side]);
      out[side] = { from, kept: st.bag[side] - from.length };
    }
    return out;
  }

  // No more tokens for a side than it has pieces still to move
  function trimBag(st) {
    st.bag.us = Math.min(st.bag.us, movable(st, 'us'));
    st.bag.de = Math.min(st.bag.de, movable(st, 'de'));
  }

  // Draw a token: 'us', 'de', 'timer' or null when the bag is empty. The timer (Steve) empties the bag: the round ends
  // there and then, so the next draw is null. On a German token the Germans' move is set up (see germanStep):
  // one of their pieces, or their mortar or artillery
  function drawToken(st) {
    if (st.won || st.lost) return null;
    trimBag(st);
    // The timer can't come out first (Steve): it is only in the draw once a piece's token has been drawn this round
    const pieceTokens = st.bag.us + st.bag.de;
    const timer = st.drawnThisRound || !pieceTokens ? st.bag.timer || 0 : 0;
    const total = pieceTokens + timer;
    if (!total) return null;
    st.drawnThisRound = (st.drawnThisRound || 0) + 1;
    // Which token comes out: one of the Americans', one of the Germans', or the timer
    const pick = st.rand() * total;
    const side = pick < st.bag.us ? 'us' : pick < st.bag.us + st.bag.de ? 'de' : 'timer';
    if (side === 'timer') {
      // Time's up: every token left in the bag goes unused (it stays in the bag on the table: st.leftInBag)
      st.leftInBag = { us: st.bag.us, de: st.bag.de };
      st.timerDrawn = true;
      st.bag = { us: 0, de: 0, timer: 0 };
      st.drawn = null;
      st.activeId = null;
      st.fx = [];
      return side;
    }
    st.bag[side]--;
    st.drawn = side;
    st.activeId = null;
    st.fx = [];
    for (const u of st.units) u.halfShot = false;
    if (side === 'de') {
      const pick = pickGerman(st);
      if (pick.gun) {
        st.deFired[pick.gun] = true;
        activated(st, { side: 'de', gun: pick.gun });
        st.de = { queue: [], mortar: pick.gun === 'mortars', artillery: pick.gun === 'artillery', bomber: pick.gun === 'bomber', rep: st.roundRep, ask: null, move: { gun: pick.gun, what: '' } };
      } else {
        pick.unit.acted = true;
        activated(st, { side: 'de', id: pick.unit.id });
        st.de = { queue: [pick.unit.id], mortar: false, artillery: false, bomber: false, rep: st.roundRep, ask: null, move: { id: pick.unit.id, what: '' } };
      }
    }
    return side;
  }

  // What moves on a German token: their guns if they have a target, then a piece with someone to shoot, then any
  function pickGerman(st) {
    const options = st.units.filter(u => u.side === 'de' && u.x !== null && !u.acted).map(u => ({ unit: u, score: (bestTarget(st, u) ? 2 : 0) + st.rand() }));
    if (st.deMortarAmmo > 0 && !st.deFired.mortars) options.push({ gun: 'mortars', score: (germanMortarTarget(st) ? 2.5 : -1) + st.rand() });
    if (st.deArtilleryAmmo > 0 && !st.deFired.artillery) options.push({ gun: 'artillery', score: (germanArtilleryTarget(st) ? 2.5 : -1) + st.rand() });
    if (st.deBomberAmmo > 0 && !st.deFired.bomber) options.push({ gun: 'bomber', score: (bestBomberRun(st, 'de') ? 2.5 : -1) + st.rand() });
    return options.sort((a, b) => b.score - a.score)[0];
  }

  // The German move is over (germanStep said done): back to the bag
  function endGermanToken(st) {
    st.de = null;
    st.drawn = null;
  }

  // Is the American token used up: its piece has moved and has nothing more it can do?
  function activationOver(st) {
    if (!st.tokens || st.drawn !== 'us' || !st.activeId) return false;
    // A gun has fired (or held fire): done
    if (st.activeId.startsWith('gun:')) return true;
    const u = unitById(st, st.activeId);
    if (u.x === null) return true;
    const rallyLeft = u.kind === 'captain' && captainCanRally(st, u);
    return !canAct(st, u) && !u.halfShot && !rallyLeft;
  }

  // Pass on an American token, or finish with it
  function passToken(st) {
    // The token's piece has had its go this round, whatever it did (Steve: a captain who only rallied looked as if he
    // could still act, and could take a second token): it is done, and shows so on the table
    const done = st.activeId && !st.activeId.startsWith('gun:') ? unitById(st, st.activeId) : null;
    if (done && done.x !== null) { done.acted = true; if (done.kind === 'captain') done.skipped = true; }
    st.drawn = null;
    st.activeId = null;
    for (const u of st.units) u.halfShot = false;
  }

  // Can any American piece move on this token?
  const usCanMove = st => SUPPORT.some(w => canFire(st, w)) || st.units.some(u => u.side === 'us' && u.x !== null && (canAct(st, u) || canSelfRally(st, u) || (u.kind === 'captain' && captainCanRally(st, u))));

  // The bag is empty: the round (the hour) ends: has the village fallen, are the Germans gone? Then the next round
  function endRound(st) {
    st.de = null;
    st.drawn = null;
    finishHour(st);
  }

  // ---------- Turns ----------

  function arrive(st, side, def, rep) {
    const edge = side === 'us' ? 0 : COLS - 1;
    const u = makeUnit(def, side);
    // The free field nearest the middle of the edge
    const rows = [...Array(ROWS).keys()].sort((a, b) => Math.abs(a - 4) - Math.abs(b - 4));
    for (const y of rows) {
      if (roomFor(st, u, edge, y)) { u.x = edge; u.y = y; st.units.push(u); return u; }
    }
    return null;
  }

  function reinforcements(st, rep) {
    for (const r of REINFORCEMENTS) {
      if (r.turn !== st.turn) continue;
      if (r.replacements) {
        const weak = st.units.filter(u => u.side === 'us' && u.kind === 'company' && u.x !== null && u.platoons < 3).sort((a, b) => a.platoons - b.platoons)[0];
        if (weak) { weak.platoons++; rep.push(`🪖 A replacement section joins ${weak.name}.`); }
        continue;
      }
      const u = arrive(st, r.side, r.unit, rep);
      if (!u) continue;
      rep.push(r.side === 'us' ? `🪖 ${u.name} arrives on the west edge.` : `⚠️ German reinforcements reported: ${u.name}.`);
    }
  }

  // Does the US hold the hamlet: an American company in it and no Germans left there
  function holdsObjective(st) {
    const here = at(st, st.objective.x, st.objective.y);
    return here.some(u => u.side === 'us' && u.kind === 'company') && !here.some(u => u.side === 'de');
  }

  // End the American hour and play the German one. decide(shot) answers each "pull back?" question (headless play);
  // the page instead calls startGermanHour, germanStep and answer itself, then finishHour
  function endTurn(st, decide = () => false) {
    if (st.won || st.lost) return;
    startGermanHour(st);
    for (let r = germanStep(st); !r.done; r = germanStep(st)) answer(st, decide(r.ask));
    finishHour(st);
  }

  // After the German hour: has the hamlet fallen, has the battalion gone, has time run out? Then a new hour
  function finishHour(st) {
    const rep = st.de ? st.de.rep : (st.roundRep || []);
    st.de = null;
    // Already over: one side was wiped out during the round
    if (st.won || st.lost) return;
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    if (holdsObjective(st)) {
      st.won = true;
      // Taken and held at the end of an hour wins at once
      rep.unshift(`🏆 ${st.objective.name} is taken and held at the end of ${roundText(st.turn)}!`);
    } else if (!germansLeft) {
      // Every German on the table destroyed wins too (Steve), even with no rifle platoons left to take the village
      st.won = true;
      rep.unshift(`🏆 Every German on the field is destroyed in ${roundText(st.turn)}!`);
    } else if (!st.units.some(u => u.side === 'us' && u.x !== null)) {
      st.lost = true;
      rep.unshift('💀 Nothing is left of the company. The attack has failed.');
    } else if (TURNS && st.turn >= TURNS) {
      st.lost = true;
      rep.unshift(`⌛ After ${TURNS} rounds the attack has run out of time short of ${st.objective.name}.`);
    }
    if (!st.won && !st.lost) newTurn(st, rep);
    st.report = rep.length ? rep : ['A quiet round.'];
  }

  // A new hour (shaken stays: only a rally clears it, Steve): a fresh move for every piece (except those that took cover), fire support (no more ammo: it never comes back, Steve) and reinforcements
  function newTurn(st, rep) {
    st.turn++;
    // Both sides alike (a German who took cover used to stay down for the rest of the game)
    for (const u of st.units) {
      if (u.x === null) continue;
      const missed = !!u.spentNext;
      u.acted = missed; u.spentNext = false; u.rallied = 0; u.fired = false; u.skipped = false;
      // An ambush doesn't carry over to the next round (Steve)
      u.ambush = false;
      // Down in cover: it stays down through the hour it misses, then gets up
      if (!missed) u.down = false;
    }
    st.fired = {};
    // A new round: the bombers' compasses spin afresh
    st.spin = {};
    reinforcements(st, rep);
  }

  return {
    canAmbush, actAmbush, bomberHeading, bomberEdges, bomberLine, bombNeed, bombWhy, bestBomberRun,
    newGame, roll, endTurn, inside, tileType, hedge, at, unitById, isTank, isTeam, adjacent, sees, targets, chargeSpots,
    rallyTargets, canAct, canReact, firepower, canCallFire, holdsObjective, roundText, roomFor,
    startGermanHour, germanStep, answer, finishHour, startRound, drawToken, endGermanToken, activationOver, passToken, usCanMove, endRound, canFire, actSkip, actSkipShot, skipSupport,
    smallTarget, menDice, armourOf, shotNeed, mayFire, shootCells, tokensHome, captainCanRally, fireAt, actShoot, actMoveShoot, moveShootSpots, chargeRoutes, DIRS, needWhy, shellNeed, shellWhy, shellFields, canRally, needFor, canSelfRally, actSelfRally, actHalfShot, actCharge, actRally, actFire, sight, isSmall, cover, wire, lineSides, actLine, atHedge, acrossHedge, SIDE_NAMES, PLACES, placeXY, placeName, lines, sizeOf, footprint, spotXY, occupant, fitsAt, freePlace,
    hasCutters: u => cutter(u),
  };
})();

if (typeof module !== 'undefined') module.exports = Sim;
