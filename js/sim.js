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

  const TYPES = { '.': 'field', o: 'orchard', v: 'village', h: 'hamlet', r: 'river', '#': 'bridge', '=': 'laneEW', '|': 'laneNS', '+': 'crossroads', s: 'street', q: 'square', k: 'court', t: 'yard', w: 'sea', b: 'beach' };
  const inside = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
  // The map being played (one game at a time, so a new game changes it for everyone asking)
  let currentMap = MAPS[0];
  const tileType = (x, y) => TYPES[currentMap.rows[y][x]];
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
    if (PIECES[u.kind].atGun || PIECES[u.kind].bunker) return 2;
    if (isTank(u) || PIECES[u.kind].big || (u.kind === 'company' && u.platoons >= 2)) return 4;
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
    // A wreck takes its three areas too, whoever's it was
    const wreck = wreckAt(st, x, y);
    if (wreck) for (const k of wreck.areas) taken.add(k);
    // And a café, a barn, a fountain or a pond
    for (const f of st.features) if (f.x === x && f.y === y) for (const k of f.areas) taken.add(k);
    return taken;
  }
  // The café, barn, fountain or pond standing in a field
  const featuresAt = (st, x, y) => st.features.filter(f => f.x === x && f.y === y);
  // The wreck in a field, if there is one (one to a field at most, see leaveWreck)
  const wreckAt = (st, x, y) => st.wrecks.find(w => w.x === x && w.y === y) || null;
  // A tank knocked out stays where it died, burnt out (Steve). It is shoved into a corner and takes that corner and the
  // two edges beside it, never the middle: every 2×2 block needs the middle, so a full platoon or a tank can still come
  // in at the opposite corner (the objective is one field, and must always be takeable). A second wreck in a field
  // clears away the older one, so there is always that room
  function leaveWreck(st, u) {
    // An older wreck in this field goes
    st.wrecks = st.wrecks.filter(w => !(w.x === u.x && w.y === u.y));
    // What the others in the field already stand on
    const taken = takenAreas(st, u, u.x, u.y);
    // A tank in a corner block stays in that corner; one in the middle rolls to a corner nobody stands in
    const corner = u.at && u.at !== 'c' ? footprint(u)[0] : CORNERS.find(k => !taken.has(k)) || CORNERS[0];
    // Its corner and the two edges beside it, less any square a piece is already on (only ever a tank that died in the middle)
    const areas = [corner, corner[0], corner[1]].filter(k => !taken.has(k));
    // turn: when it died, as the fire dies down after the next round
    st.wrecks.push({ id: u.id, kind: u.kind, side: u.side, x: u.x, y: u.y, corner, areas, turn: st.turn });
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
  // (kept once made: line of sight asks for these all the time)
  const edgeKeys = new Map();
  function edgeKey(ax, ay, bx, by) {
    const asked = (ax + 1) * 1000000 + (ay + 1) * 10000 + (bx + 1) * 100 + (by + 1);
    let key = edgeKeys.get(asked);
    if (key === undefined) {
      key = ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
      edgeKeys.set(asked, key);
    }
    return key;
  }

  // Does a hedge grow on this edge before any gaps are made? Villages, hamlets and orchards have none round them (Steve);
  // lanes run between hedges but not along themselves
  function hedgeWanted(ax, ay, bx, by) {
    const a = tileType(ax, ay), b = tileType(bx, by);
    // City blocks (Steve: Paris): a row of buildings wherever a courtyard meets a street or square, and nowhere else
    if (currentMap.blocks) return (a === 'court') !== (b === 'court');
    if (PLACE_COVER[a] || PLACE_COVER[b]) return false;
    // The river has open banks, and a bridge carries its lane straight on
    if (a === 'river' || b === 'river') return false;
    // The sea and the sand have none; where sand meets land, the sea wall
    if (a === 'sea' || b === 'sea' || (a === 'beach' && b === 'beach')) return false;
    // (Dunkirk, Steve: the lorries drive off the coast road onto the beach)
    if (currentMap.evacuate && (a === 'beach' || b === 'beach')) return false;
    const eastWest = ay === by;
    // Along a lane: open. A lane running east-west has open ends to the east and west, and so on
    const openAlong = (t, ew) => t === 'crossroads' || ((t === 'laneEW' || t === 'bridge') && ew) || (t === 'laneNS' && !ew);
    if (isLane(a) && isLane(b) && openAlong(a, eastWest) && openAlong(b, eastWest)) return false;
    return true;
  }

  // What a hedge is called on this map (Steve: at Stalingrad the hedges are ruins)
  // What a hedge is called on this map: Stalingrad's ruins, Paris's rows of buildings (Steve, 2026-11-13), else a hedge
  function hedgeWord() { return currentMap.ruins ? 'ruin' : currentMap.blocks ? 'building' : 'hedge'; }

  function hedge(st, ax, ay, bx, by) { return !!st.hedges[edgeKey(ax, ay, bx, by)]; }
  function wire(st, ax, ay, bx, by) { return !!st.wire[edgeKey(ax, ay, bx, by)]; }

  // ---------- Pieces ----------

  function makeUnit(def, side) {
    const kind = def.kind;
    // at: the hedge the piece lines (n, e, s or w), or null out in the open. Both sides start lining the hedge towards the enemy
    const u = Object.assign({ side, shocked: false, acted: false, at: side === 'us' ? 'e' : 'w' }, def);
    if (kind === 'company') u.platoons = def.arms === 'smg' ? SMG.bases : 3;
    // A team, the captain, a gun, or a tank (Steve: one tank to a unit, not a pair)
    else u.platoons = 1;
    if (!u.quality) u.quality = 'standard';
    return u;
  }

  const unitById = (st, id) => st.units.find(u => u.id === id);
  // (men aboard a boat at Dunkirk are in no field, Steve: they wait off the beach to sail)
  const at = (st, x, y, side) => st.units.filter(u => u.x === x && u.y === y && !u.aboard && (!side || u.side === side));
  const isTank = u => !!PIECES[u.kind].tank;
  const isTeam = u => !!PIECES[u.kind].team;
  const isBunker = u => !!PIECES[u.kind].bunker;
  const isSmall = u => isTeam(u) || u.kind === 'captain';
  // A small target (Steve): a piece of two men or fewer (the sniper, a bazooka team, the captain), one more to hit
  const smallTarget = u => !!u.kind && (PIECES[u.kind].men || 99) <= 2;
  const enemyOf = side => (side === 'us' ? 'de' : 'us');
  // Is a side played by the computer? (Steve: each side can be a human or a robot)
  const isRobot = (st, side) => st.players[side] === 'robot';
  // The side the computer is playing now: the one on its token; otherwise whichever the player isn't
  const computerSide = st => (st.computer && st.computer.side) || enemyOf(st.human);
  // How many fields apart two things are, going along the fields
  const fieldsApart = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const adjacent = (a, b) => fieldsApart(a, b) === 1;

  // Is there room for a unit in a field? (Steve: the nine areas decide, see footprint.) Never with the enemy, except in
  // a hand-to-hand fight
  function roomFor(st, unit, x, y, leaving = []) {
    const here = at(st, x, y).filter(u => !leaving.includes(u) && u !== unit);
    // (a building in the field may leave no room for a big piece)
    if (!here.length && !featuresAt(st, x, y).length) return true;
    if (here.some(u => u.side !== unit.side)) return false;
    return anchorsFor(unit).some(a => fitsAt(st, unit, x, y, a, leaving));
  }


  // mode: who plays (Steve: all four variations): 'us' a human as the Americans, 'de' a human as the Germans, 'both' two
  // humans, 'none' two robots. st.human is the side a person is commanding now: with two humans it changes with each
  // token; with two robots nobody acts on it. st.won means the Americans won and st.lost the Germans did, whoever plays
  // them: the page turns that into a win or a loss for the player
  // mapId: which of MAPS (Steve)
  function newGame(seed, mode = 'us', mapId = MAPS[0].id) {
    seed = seed || (Date.now() % 1e9);
    let map = MAPS.find(m => m.id === mapId) || MAPS[0];
    const human = mode === 'de' ? 'de' : 'us';
    const players = { us: mode === 'us' || mode === 'both' ? 'human' : 'robot', de: mode === 'de' || mode === 'both' ? 'human' : 'robot' };
    const R = rng(seed);
    // A map made new each game: from this game's dice, so the same seed gives the same streets
    if (map.generated === 'paris') map = Object.assign({}, map, parisMap(map, R));
    if (map.generated === 'yard') map = Object.assign({}, map, yardMap(map, R));
    if (map.generated === 'beach') map = Object.assign({}, map, beachMap(map, R));
    if (map.generated === 'ruins') map = Object.assign({}, map, ruinsMap(map, R));
    currentMap = map;
    walkTables.clear();
    const st = {
      seed, mode, human, players, map, features: (map.features || []).map(placedFeature), turn: 1, hedges: {}, wire: {}, openWire: {}, trampled: {}, units: [], wrecks: [], report: [], fx: [],
      // Each side's guns and bomber: what they have fired this round, and what they have left
      fired: { us: {}, de: {} },
      ammo: {
        us: Object.assign({ mortars: MORTARS.ammo, artillery: ARTILLERY.ammo, bomber: BOMBER.ammo }, map.ammo && map.ammo.us),
        de: Object.assign({ mortars: DE_MORTAR.ammo, artillery: DE_ARTILLERY.ammo, bomber: BOMBER.ammo }, map.ammo && map.ammo.de),
      },
      won: false, lost: false,
      spin: {},           // the bomber's compass this round, each side: picked again, it spins to the same direction (Steve)
    };
    // This game's objective: one of the villages
    st.objective = map.villages[Math.floor(R() * map.villages.length)];
    // A railway with its trains (Steve: Open farmland): the line takes its row of areas in every field along it, and the
    // first train starts coming on from the left
    st.trains = [];
    st.trainsMade = 0;
    st.trainLines = (map.trains || []).map(() => ({ since: 0, next: 0 }));
    (map.trains || []).forEach((line, i) => {
      for (let x = 0; x < COLS; x++) st.features.push(placedFeature({ x, y: line.row, kind: 'rail', side: line.side }));
      newTrain(st, i);
    });
    // No goal to take and hold on some maps (Steve: the beach): only destroying every German wins. The objective's field
    // still places the main bunker and is where the German reserves gather
    st.noGoal = !!map.noGoal;
    const gapChance = map.gap === undefined ? HEDGE_GAP : map.gap;
    const wireChance = map.wire === undefined ? WIRE : map.wire;
    const bunkerFields = !map.landing ? [] : [st.objective].concat(map.de.add.filter(d => d.place).map(d => ({ x: d.place[0], y: d.place[1] })));
    // Hedges on every edge that wants one, less the gaps; some gaps between fields are fenced with barbed wire
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const bx = x + dx, by = y + dy;
        if (!inside(bx, by) || !hedgeWanted(x, y, bx, by)) continue;
        // A courtyard (Steve: Stalingrad's Univermag): open inside, walled all round its outside
        const yardA = inCourtyard(map, x, y), yardB = inCourtyard(map, bx, by);
        if (yardA && yardB) continue;
        if (yardA || yardB) { st.hedges[edgeKey(x, y, bx, by)] = true; continue; }
        // On the beach, nothing grows round a bunker (Steve: its sides must be plain to get at); the sea wall stays
        if (bunkerFields.some(f => (f.x === x && f.y === y) || (f.x === bx && f.y === by)) && tileType(x, y) !== 'beach') continue;
        // Nor across the railway (Steve: the train never runs through a hedge), and no wire there either
        if (dx === 1 && (map.trains || []).some(l => l.row === y)) continue;
        if (R() >= gapChance) st.hedges[edgeKey(x, y, bx, by)] = true;
        else if (!isLane(tileType(x, y)) && !isLane(tileType(bx, by)) && R() < wireChance) st.wire[edgeKey(x, y, bx, by)] = true;
      }
    }
    for (const d of startingPieces(US_START, map.us)) st.units.push(makeUnit(d, 'us'));
    for (const d of startingPieces(DE_START, map.de)) st.units.push(makeUnit(d, 'de'));
    // German teams that start with a company
    st.rand = R;
    deploy(st, 'us'); deploy(st, 'de');
    // An airdrop (Steve), once a game, at the start of a round from AIRDROP.first to .last
    // (its round from the seed alone, so the game's own dice go on just as they would without it)
    const dropDice = rng(seed * 31 + 7);
    st.airdrop = map.airdrop ? { kind: map.airdrop, round: AIRDROP.first + Math.floor(dropDice() * (AIRDROP.last - AIRDROP.first + 1)), done: false } : null;
    st.crate = null;
    // An evacuation (Steve: Dunkirk): how many have got away, the boats in now and how many lorries have come
    st.evac = map.evacuate ? { saved: 0, boats: [], lorries: 0 } : null;
    if (st.evac) {
      newBoats(st);
      st.report = [`${map.date}. The ${sideName(st, 'us')} hold the line while the little ships come in. Get ${map.evacuate.need} sections away on the tugs and cabin cruisers within ${map.evacuate.rounds} rounds.`];
      return st;
    }
    st.report = [st.noGoal
      ? `${START_DATE}. The company attacks. Destroy every German on the table${TURNS ? ` within ${TURNS} rounds` : ''}.`
      : `${map.id === 'stalingrad' ? map.date : START_DATE}. The company attacks ${map.ruins ? 'through the ruins' : 'into the bocage'}. Take ${st.objective.name} and hold it for the whole of the next round${TURNS ? ` within ${TURNS} rounds` : ''}.`];
    return st;
  }

  // Who starts on a side on this map: the usual list, less those it takes away, and those it adds
  function startingPieces(usual, changes) {
    if (!changes) return usual;
    // (a map with its own armies, Steve: Dunkirk's British and Germans of 1940)
    if (changes.only) return changes.only;
    const kept = usual.filter(d => !(changes.remove || []).includes(d.id));
    return kept.concat(changes.add || []);
  }

  // Each side starts spread at random over its own end of the board (DEPLOY of the width, or the map's), in cover where it can be:
  // a field with a hedge facing the enemy, an orchard or the village. Captains and teams start with a platoon
  function deploy(st, side) {
    // (a landing: the Americans all start out in the sea, in the landing craft)
    const landing = st.map.landing && side === 'us';
    const cols = landing ? 1 : Math.max(1, Math.round(COLS * (st.map.deploy || DEPLOY)));
    // (the first column a side starts in: its own end, unless the map says, Steve: Dunkirk's British hold the front)
    const from = (st.map.from && st.map.from[side]) || 0;
    const xs = side === 'us' ? [...Array(cols).keys()].map(i => from + i) : [...Array(cols).keys()].map(i => COLS - 1 - i);
    const fields = [];
    for (const x of xs) for (let y = 0; y < ROWS; y++) if (tileType(x, y) !== 'river') fields.push({ x, y });
    // How good a field is to start in: cover towards the enemy, then a little luck
    const front = side === 'us' ? 1 : -1;
    const worth = f => {
      const t = tileType(f.x, f.y);
      const hedged = inside(f.x + front, f.y) && hedge(st, f.x, f.y, f.x + front, f.y);
      // (a strongpoint first of all, Steve: Dunkirk's British are defending)
      const strong = featuresAt(st, f.x, f.y).some(o => FEATURES[o.kind].cover) ? 4 : 0;
      return strong + (hedged ? 2 : 0) + (t === 'village' || t === 'hamlet' ? 2 : t === 'orchard' ? 1 : 0) + st.rand() * 2.5;
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
    // A bunker (Steve): where it is built, its back to the east and its front to the west
    const bunkers = leaders.filter(u => isBunker(u));
    for (const u of bunkers) {
      const spot = u.main ? st.objective : { x: u.place[0], y: u.place[1] };
      u.x = spot.x; u.y = spot.y; u.at = 'nw+w';
    }
    // A railway across the board (Steve): some pieces always start on each side of it, a rifle platoon and one more
    // on the far side from most (the line's own field counts as south of a line along its north row)
    // (a map with one railway: Open farmland)
    const train = st.map.trains && st.map.trains.length === 1 ? st.map.trains[0] : null;
    const southOfLine = f => f.y >= train.row;
    const movers = leaders.filter(u => !u.garrison && !isBunker(u));
    const southers = !train ? [] : [movers.find(u => u.kind === 'company'), movers.find(u => u.kind !== 'company' && !isTank(u))].filter(Boolean);
    for (const u of leaders) {
      if (u.garrison || isBunker(u)) continue;
      const options = fields.filter(f => !southers.includes(u) || southOfLine(f)).map(f => ({ f, w: worth(f) })).sort((a, b) => b.w - a.w);
      // Tanks start on a street (Steve: Paris), never in a courtyard behind the buildings they can't get through
      const street = o => !(st.map.blocks && isTank(u)) || tileType(o.f.x, o.f.y) !== 'court';
      const spot = options.find(o => street(o) && roomFor(st, u, o.f.x, o.f.y)) || options.find(o => roomFor(st, u, o.f.x, o.f.y));
      u.x = spot.f.x; u.y = spot.f.y;
      // (its place in the field straight away, so the next piece's room is judged by where this one really stands: by the
      // hedge towards the enemy as it starts, so a big piece takes a corner block and leaves room, never the whole middle)
      u.at = freePlace(st, u, u.x, u.y, u.at);
    }
    // Pieces sharing a field stand in different places in it
    // (a bunker has its place first: everyone else fits round it)
    const placing = st.units.filter(o => o.side === side && o.x !== null);
    for (const u of placing.filter(o => isBunker(o)).concat(placing.filter(o => !isBunker(o)))) u.at = freePlace(st, u, u.x, u.y, u.at);
  }

  // A post given from the objective: the field there, or the nearest one that isn't river and no other unit has
  function postField(st, [dx, dy], taken = []) {
    const want = { x: Math.max(0, Math.min(COLS - 1, st.objective.x + dx)), y: Math.max(0, Math.min(ROWS - 1, st.objective.y + dy)) };
    // (a building in the middle of a field leaves no room for a garrison's big pieces)
    const noRoom = (x, y) => st.features.some(f => f.x === x && f.y === y && f.areas.includes('c'));
    const free = (x, y) => inside(x, y) && tileType(x, y) !== 'river' && !noRoom(x, y) && !taken.some(t => t.x === x && t.y === y);
    let best = null, bestD = Infinity;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const d = Math.abs(x - want.x) + Math.abs(y - want.y) + (x < st.objective.x ? 0.1 : 0);
      if (free(x, y) && d < bestD) { bestD = d; best = { x, y }; }
    }
    return best || want;
  }

  // ---------- Airdrops (Steve) ----------
  // The airdrop comes at the start of its round: paratroopers, or a supply crate
  function airdropNow(st) {
    const drop = st.airdrop;
    if (!drop || drop.done || st.turn !== drop.round) return;
    drop.done = true;
    if (drop.kind === 'paras') dropParas(st);
    else dropCrate(st);
  }
  // Fields in the middle of the board something can come down in: land, not a village or an orchard, nobody of the
  // enemy's there (for the paratroopers, room for them; for the crate, nobody there at all)
  function dropFields(st, ok) {
    const out = [];
    for (let y = 0; y < ROWS; y++) for (let x = 3; x < COLS - 3; x++) {
      if (!['field', 'laneNS', 'laneEW', 'crossroads'].includes(tileType(x, y))) continue;
      if (ok(x, y)) out.push({ x, y });
    }
    return out;
  }
  // The paratroopers: a C-47 flies over the field they were meant for, and they come down there or (off target) next to it
  function dropParas(st) {
    const para = makeUnit({ id: 'para1', kind: 'company', name: 'Paratroopers (101st)', quality: 'elite' }, 'us');
    para.platoons = 1;
    const fields = dropFields(st, (x, y) => !at(st, x, y, 'de').length && roomFor(st, para, x, y));
    if (!fields.length) return;
    const aim = fields[Math.floor(st.rand() * fields.length)];
    const near = fields.filter(f => Math.abs(f.x - aim.x) + Math.abs(f.y - aim.y) === 1);
    const off = near.length && st.rand() < AIRDROP.offTarget;
    const land = off ? near[Math.floor(st.rand() * near.length)] : aim;
    para.x = land.x; para.y = land.y; para.at = freePlace(st, para, land.x, land.y, null);
    st.units.push(para);
    // The plane over the aimed field, west to east, and the parachutes coming down where they land
    st.fx.push({ kind: 'flyover', side: 'us', plane: 'c47', x: aim.x, y: aim.y, heading: 4, line: bomberLine(aim.x, aim.y, 4) });
    st.fx.push({ kind: 'paradrop', what: 'paras', x: land.x, y: land.y });
    st.news = [`🪂 A C-47 drops paratroopers of the 101st Airborne${off ? ', off target' : ''}. They can move this round.`];
  }
  // The supply crate: down on an empty field in the middle of the board
  function dropCrate(st) {
    const fields = dropFields(st, (x, y) => !at(st, x, y).length && !featuresAt(st, x, y).length);
    if (!fields.length) return;
    const spot = fields[Math.floor(st.rand() * fields.length)];
    st.crate = { x: spot.x, y: spot.y, taken: null };
    st.fx.push({ kind: 'flyover', side: 'us', plane: 'c47', x: spot.x, y: spot.y, heading: 4, line: bomberLine(spot.x, spot.y, 4) });
    st.fx.push({ kind: 'paradrop', what: 'crate', x: spot.x, y: spot.y });
    st.news = [`📦 A supply crate comes down by parachute: the first side to reach its field gets ${AIRDROP.crateRounds} more artillery round.`];
  }
  // A piece arriving in the crate's field: its side takes it, one more artillery round
  function takeCrate(st, u) {
    const c = st.crate;
    if (!c || c.taken || u.x !== c.x || u.y !== c.y || PIECES[u.kind].fixed) return;
    c.taken = u.side;
    st.ammo[u.side].artillery += AIRDROP.crateRounds;
    st.fx.push({ kind: 'crate', x: c.x, y: c.y, side: u.side, to: { id: u.id } });
  }

  // ---------- The evacuation (Steve: Dunkirk) ----------
  // Little ships come in off the beach each round, two or three of them, each lying off a different field of the
  // water's edge (the first column), and sail at the round's end with whoever is aboard. The British at the front don't
  // go: they fight (Steve). Lorries bring the men instead: from round trucks.first they come in at the top of the coast
  // road, drive on their own to the field off which a boat lies, and the men run out of the back into the boat (Steve).
  // A lorry is a piece of the British side with no weapons and no orders: the Germans can shoot it, and each hit loses
  // a section of the men in it. Getting enough sections away wins for the British

  // What each side is called on this map (the 'us' side is the British at Dunkirk)
  function sideName(st, side) {
    const names = st.map && st.map.names;
    if (names && names[side]) return names[side];
    return side === 'us' ? 'Americans' : 'Germans';
  }
  // Whose army the 'us' side is on this map: 'us' the Americans, 'uk' the British (Dunkirk), 'su' the Soviets (Stalingrad)
  function armyOf(st) {
    if (st.map && st.map.army) return st.map.army;
    if (st.map && st.map.evacuate) return 'uk';
    return 'us';
  }
  // A lorry-load of men: the only ones who go aboard
  const isLorry = u => !!PIECES[u.kind].lorry;
  // Aboard a boat: off the table in all but name, waiting to sail (u.x stays where they went aboard, for the table)
  const isAboard = (st, u) => !!st.evac && !!u.aboard && u.x !== null;
  // Is there a boat off this field of the water's edge
  const boatOff = (st, x, y) => !!st.evac && x === 0 && st.evac.boats.some(b => b.y === y);

  // The round's boats: two or three, each off a different field of the water's edge
  function newBoats(st) {
    const E = st.map.evacuate;
    // (not off any rows the map keeps clear)
    const rows = [...Array(ROWS).keys()].filter(y => !(E.noBoats || []).includes(y));
    const count = Math.min(rows.length, between(st.rand, E.boats));
    st.evac.boats = [];
    for (let i = 0; i < count; i++) {
      const y = rows.splice(Math.floor(st.rand() * rows.length), 1)[0];
      st.evac.boats.push({ x: 0, y });
    }
  }

  // What kind of boat lies off a row of the beach (Steve: call them by their type): a tug or a cabin cruiser, the same
  // one the table draws there (Models.littleShip with st.seed + y * 3)
  function boatKind(st, y) {
    return Math.abs(st.seed + y * 3) % 2 ? 'tug' : 'cabin cruiser';
  }

  // The end of the round: every boat sails with whoever is aboard, and they are safe
  function sailBoats(st, rep) {
    for (const u of st.units) {
      if (!isAboard(st, u)) continue;
      st.fx.push({ kind: 'sail', x: u.x, y: u.y, to: { id: u.id } });
      const boat = boatKind(st, u.y);
      u.x = null; u.y = null;
      u.saved = true;
      // (sections are what count, Steve 2026-11-12: a lorry shot up on the way brings fewer)
      st.evac.saved += u.platoons;
      rep.push(`⛵ ${u.name}'s ${u.platoons} section${u.platoons > 1 ? 's get' : ' gets'} away on a ${boat}.`);
    }
    st.evac.boats = [];
  }

  // How many more could still get away: lorries on the table (aboard or not), and the most the lorries still to come
  // could bring
  function stillToSave(st) {
    const E = st.map.evacuate, T = E.trucks;
    // The sections in the lorries still on the table, and the most the lorries still to come could bring
    const onTable = st.units.filter(u => u.side === 'us' && u.x !== null && isLorry(u)).reduce((n, u) => n + u.platoons, 0);
    // (lorries come at the start of each round from first to last; the next round is turn + 1)
    const roundsLeft = Math.max(0, Math.min(T.last, E.rounds) - Math.max(T.first, st.turn + 1) + 1);
    return onTable + roundsLeft * T.each[1] * T.sections[1];
  }

  // Won, lost, or on to the next round. germansLeft: any German still on the table
  function evacOutcome(st, rep, germansLeft) {
    const E = st.map.evacuate, saved = st.evac.saved, us = sideName(st, 'us');
    if (saved >= E.need) {
      st.won = true;
      rep.unshift(`🏆 ${saved} sections have got away on the tugs and cabin cruisers in ${roundText(st.turn)}! The ${us} are home.`);
    } else if (!germansLeft) {
      st.won = true;
      rep.unshift(`🏆 Every German on the field is destroyed in ${roundText(st.turn)}!`);
    } else if (germansOnTheRoad(st)) {
      // (Steve: the British must keep them back: a German on the coast road or the beach cuts the way to the boats)
      st.lost = true;
      rep.unshift(`💀 The Germans have reached the coast road in ${roundText(st.turn)}. The way to the boats is cut, with ${saved} of the ${E.need} sections away.`);
    } else if (saved + stillToSave(st) < E.need) {
      st.lost = true;
      rep.unshift(`💀 Only ${saved} sections got away, and too few are left to make ${E.need}. The ${us} are trapped.`);
    } else if (st.turn >= E.rounds) {
      st.lost = true;
      rep.unshift(`⌛ After ${E.rounds} rounds only ${saved} of the ${E.need} sections needed got away. The Germans have the beach.`);
    }
  }

  // Any German on the coast road or the beach behind it, at the end of a round
  function germansOnTheRoad(st) {
    const road = st.map.evacuate.trucks.road;
    return st.units.some(u => u.side === 'de' && u.x !== null && u.x <= road);
  }

  // Lorries in at the top of the coast road (Steve), at the start of the round: each with a few sections of men, in the
  // first field down the road with room and no Germans
  function lorriesArrive(st) {
    const T = st.map.evacuate.trucks;
    if (st.turn < T.first || st.turn > T.last) return;
    const count = between(st.rand, T.each);
    for (let i = 0; i < count; i++) {
      const lorry = makeUnit({ id: `lorry${st.evac.lorries + 1}`, kind: 'lorry', name: `Lorry ${st.evac.lorries + 1}`, auto: true }, 'us');
      lorry.platoons = between(st.rand, T.sections);
      const y = [...Array(ROWS).keys()].find(row => !at(st, T.road, row, 'de').length && roomFor(st, lorry, T.road, row));
      if (y === undefined) return;
      st.evac.lorries++;
      lorry.x = T.road; lorry.y = y; lorry.at = freePlace(st, lorry, T.road, y, null);
      // (it came in from the top: it faces down the road)
      lorry.aim = -Math.PI / 2;
      st.units.push(lorry);
      st.fx.push({ kind: 'lorry', x: T.road, y, to: { id: lorry.id } });
      st.news = st.news || [];
      st.news.push(`🚚 ${lorry.name} comes down the coast road with ${lorry.platoons} section${lorry.platoons > 1 ? 's' : ''} of men for the boats.`);
    }
  }

  // Every lorry drives on its own towards the nearest boat, at the start of the round: up to trucks.moves fields. Off a
  // boat, the men run out of the back and go aboard
  function lorriesDrive(st) {
    const T = st.map.evacuate.trucks;
    for (const u of st.units) {
      if (!isLorry(u) || u.x === null || u.aboard) continue;
      // Its go for the round: no token
      u.acted = true;
      const route = routeToBoat(st, u, T.moves);
      if (route) {
        followRoute(st, u, route);
        if (u.snagged || u.x === null) continue;
        const goal = route[route.length - 1];
        step(st, u, goal.x, goal.y);
        setTrail(st, u, route);
      }
      if (u.x === null || !boatOff(st, u.x, u.y)) continue;
      // The men run out of the back into the boat: the lorry is left on the beach (the table keeps it there)
      u.aboard = true;
      st.evac.left = st.evac.left || [];
      st.evac.left.push({ x: u.x, y: u.y, at: u.at, aim: u.aim, id: u.id });
      st.fx.push({ kind: 'embark', x: u.x, y: u.y, to: { id: u.id }, sections: u.platoons });
      st.news = st.news || [];
      st.news.push(`⛵ The men of ${u.name} run out of the back and into a boat.`);
    }
  }

  // The way to a boat for a lorry: to the field off which one lies, or the way that ends nearest one. null if no boat
  // or no way
  function routeToBoat(st, u, moves) {
    const boats = st.evac.boats;
    if (!boats.length) return null;
    const routes = routesFor(st, u, moves, false);
    const endOf = r => r[r.length - 1];
    const onBoat = routes.find(r => boatOff(st, endOf(r).x, endOf(r).y));
    if (onBoat) return onBoat;
    const nearest = p => Math.min(...boats.map(b => fieldsApart(b, p)));
    let best = null, bestD = nearest(u);
    for (const r of routes) {
      const d = nearest(endOf(r));
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }

  // What one British piece does on the computer's token (Steve: they don't go to the boats, they fight): rally; shoot
  // if it has a shot; line a hedge or Move & shoot to get one; the Matilda and the carriers go for the nearest German;
  // the men hold their strongpoints and wait in ambush
  function britishAct(st, u) {
    const rep = st.computer.rep;
    computerSays(st, 'Holds its ground');
    if (computerRallies(st, u)) return null;
    const t = bestTarget(st, u);
    if (t) { computerSays(st, `Fires on ${t.name}`); return { shooter: u.id, target: t.id }; }
    const moved = computerMovesToFire(st, u);
    if (moved) return moved.shot;
    if (isTank(u)) {
      const goal = computerGoal(st, u);
      const way = routeToward(st, u, goal);
      if (way) { computerSays(st, `Moves up towards ${goal.name}`); computerMove(st, u, way); return null; }
    }
    return computerLastResort(st, u);
  }

  // ---------- Trains (Steve: Open farmland, the Train station) ----------
  // Each map's lines (st.map.trains): the row and side of it, which way they run (dir: 1 left to right, -1 right to left),
  // how many cars behind the engine and how far apart they come
  const trainLines = st => (st.map && st.map.trains) || [];
  // A whole number from..to, from a dice
  const between = (R, [from, to]) => from + Math.floor(R() * (to - from + 1));
  // A new train coming on at the start of its line: its engine in the first field, its cars still off the board behind
  // it. What it is made up of, and how far the next one comes behind it, from the game and the train's number alone (the
  // game's own dice are left alone): cars a carriage or a goods wagon (a van, or open with coal, wheat, timber or a tank)
  function newTrain(st, i) {
    const line = trainLines(st)[i];
    st.trainsMade = (st.trainsMade || 0) + 1;
    const R = rng(st.seed * 131 + st.trainsMade * 17);
    const cars = between(R, line.cars);
    const consist = [...Array(cars)].map(() => (R() < TRAIN.wagon ? { kind: 'wagon', load: YARD_LOADS[Math.floor(R() * YARD_LOADS.length)] } : { kind: 'carriage' }));
    st.trains.push({ id: st.trainsMade, line: i, dir: line.dir, head: line.dir > 0 ? 0 : COLS - 1, cars, consist });
    // The next one: once this one has gone far enough for it to come on clear of its tail
    st.trainLines[i] = { since: 0, next: Math.max(cars + 2, between(R, line.spacing)) };
  }
  // After every piece's turn (Steve) every train moves one field along its line; a line whose last train has gone far
  // enough brings on the next; one right off the board is gone
  function moveTrains(st) {
    if (!trainLines(st).length || !st.trains) return;
    for (const t of st.trains) t.head += t.dir;
    trainLines(st).forEach((line, i) => {
      const state = st.trainLines[i];
      state.since++;
      if (state.since >= state.next) newTrain(st, i);
    });
    st.trains = st.trains.filter(t => (t.dir > 0 ? t.head - t.cars < COLS : t.head + t.cars >= 0));
  }
  // Does a step from one field to the next cross a train: over the edge of a field on a line's side of it (the line runs
  // along that side), with an engine or car of that line standing in that field
  function trainAcross(st, fx, fy, x, y) {
    if (fx !== x || !trainLines(st).length) return false;
    return trainLines(st).some((line, i) => {
      // The edge on the line's side of its field: north of it for a line along the north row
      const beyond = line.row + placeXY(line.side).y;
      const crossing = (fy === line.row && y === beyond) || (fy === beyond && y === line.row);
      return crossing && trainCars(st).some(c => c.line === i && c.x === x);
    });
  }
  // Is field x, y on a line, with the line along its side towards the field at row oy (where a snagged tank must not
  // straddle the edge, the train would run through it)
  function lineSideOf(st, y, oy) {
    return trainLines(st).some(line => line.row === y && oy !== y && placeXY(line.side).y === oy - y);
  }
  // Every engine and car on the board now: the field it is in, its row of areas, which line, which train and which car
  function trainCars(st) {
    if (!trainLines(st).length || !st.trains) return [];
    const out = [];
    for (const t of st.trains) {
      const line = trainLines(st)[t.line];
      for (let k = 0; k <= t.cars; k++) {
        const x = t.head - k * t.dir;
        if (x < 0 || x >= COLS) continue;
        out.push({ x, y: line.row, areas: SIDE_AREAS[line.side], kind: k === 0 ? 'engine' : t.consist[k - 1].kind, line: t.line, train: t.id, car: k });
      }
    }
    return out;
  }

  // A thing standing in a field, with the areas it takes (see FEATURES)
  const SIDE_AREAS = { n: ['nw', 'n', 'ne'], s: ['sw', 's', 'se'], e: ['ne', 'e', 'se'], w: ['nw', 'w', 'sw'] };
  function placedFeature(f) {
    const areas = f.areas || (f.side ? SIDE_AREAS[f.side] : [f.area]);
    return Object.assign({}, f, { areas, blocksView: FEATURES[f.kind].blocksView, name: FEATURES[f.kind].name });
  }

  // The city (Steve: Paris): streets between rows of buildings, new each game. Crossing points every two fields, joined by a
  // maze that reaches them all, then more streets as the map's design says (PARIS_DESIGNS): further ones between crossing
  // points, some running on off the board, whole boulevards. Every field not a street is a courtyard, and a row of
  // buildings stands on every edge between a courtyard and a street (map.blocks: see hedgeWanted), working as a hedge
  // (Steve, 2026-11-13: as Stalingrad's ruins). Some dead ends and corners become little squares, each with a café (in a dead
  // end or on a corner, along a closed side) and a fountain. The target is always the Eiffel Tower (Steve), in
  // the centre of the board, on a crossing point so streets reach it. Tanks can't go through the rows of buildings and
  // nobody sees through them (Steve, 2026-11-13): see cutter and lineOfSight
  const CITY_TOWER = { x: 6, y: 4, name: 'Eiffel Tower' };
  const CITY_SQUARES = 3;
  function parisMap(map, R) {
    const design = PARIS_DESIGNS[map.design] || PARIS_DESIGNS.maze;
    // Every field a courtyard to begin with; the streets are cut through them
    const tiles = [];
    for (let y = 0; y < ROWS; y++) tiles.push(Array(COLS).fill('k'));
    const xs = [], ys = [];
    for (let x = 0; x < COLS; x += 2) xs.push(x);
    for (let y = 0; y < ROWS; y += 2) ys.push(y);
    const shuffled = list => { const out = list.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
    const STEPS = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    const lastX = xs[xs.length - 1], lastY = ys[ys.length - 1];
    const isPoint = (x, y) => x >= 0 && y >= 0 && x <= lastX && y <= lastY;
    const carve = (x, y, dx, dy) => { tiles[y + dy / 2][x + dx / 2] = 's'; tiles[y + dy][x + dx] = 's'; };
    // The maze: from a corner, going on to any crossing point not yet reached
    const seen = new Set(['0,0']);
    tiles[0][0] = 's';
    const trail = [{ x: 0, y: 0 }];
    while (trail.length) {
      const here = trail[trail.length - 1];
      const next = shuffled(STEPS).find(([dx, dy]) => isPoint(here.x + dx, here.y + dy) && !seen.has(`${here.x + dx},${here.y + dy}`));
      if (!next) { trail.pop(); continue; }
      carve(here.x, here.y, next[0], next[1]);
      seen.add(`${here.x + next[0]},${here.y + next[1]}`);
      trail.push({ x: here.x + next[0], y: here.y + next[1] });
    }
    // More streets, between crossing points next to each other
    for (const y of ys) for (const x of xs) {
      if (isPoint(x + 2, y) && R() < design.extra) carve(x, y, 2, 0);
      if (isPoint(x, y + 2) && R() < design.extra) carve(x, y, 0, 2);
    }
    // Streets running on off the board, past the last crossing points on the east and south
    for (const y of ys) if (R() < design.out) for (let x = lastX + 1; x < COLS; x++) tiles[y][x] = 's';
    for (const x of xs) if (R() < design.out) for (let y = lastY + 1; y < ROWS; y++) tiles[y][x] = 's';
    // Boulevards: whole rows and columns of street, straight across the board
    for (const y of design.rows || []) for (let x = 0; x < COLS; x++) tiles[y][x] = 's';
    for (const x of design.cols || []) for (let y = 0; y < ROWS; y++) tiles[y][x] = 's';
    const features = [];
    // The tower stands on open paving, its legs round the field
    tiles[CITY_TOWER.y][CITY_TOWER.x] = 'q';
    features.push({ x: CITY_TOWER.x, y: CITY_TOWER.y, kind: 'eiffel', areas: [] });
    // Little squares (Steve, 2026-11-13: cafés never across a road, only in dead ends and on corners), away from where
    // the sides start and off the board's edge rows, each café against a side with a row of buildings behind it
    for (const p of shuffled(cafeSpots(tiles)).slice(0, CITY_SQUARES)) {
      tiles[p.y][p.x] = 'q';
      const areas = cafeAreas(p.closed, R);
      features.push({ x: p.x, y: p.y, kind: 'cafe', areas });
      features.push({ x: p.x, y: p.y, kind: 'fountain', area: fountainCorner(areas, R) });
    }
    return { rows: tiles.map(row => row.join('')), villages: [CITY_TOWER], features };
  }

  // Is a field inside the map's courtyard (Steve: Stalingrad's Univermag, open inside, walled round)
  function inCourtyard(map, x, y) {
    const c = map.courtyard;
    return !!c && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h;
  }

  // Stalingrad's ruins (Steve): piles of rubble here and there, each in one area of its field, and a few minefields in
  // the middle of the board, new each game; never in the objective, nor where either side starts
  const RUINS = { rubble: 10, mines: 3, minesFrom: 4, minesTo: 7, starts: 3 };
  function ruinsMap(map, R) {
    const features = [];
    const open = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = map.rows[y][x];
      // (not in the store's courtyard, nor on the streets: the rubble has been pushed off them)
      if (t === 'v' || t === '=' || t === '|' || t === '+' || inCourtyard(map, x, y)) continue;
      open.push({ x, y });
    }
    // One at a time from what is left, so no field gets two
    const pick = list => list.splice(Math.floor(R() * list.length), 1)[0];
    const middle = open.filter(f => f.x >= RUINS.minesFrom && f.x <= RUINS.minesTo);
    for (let i = 0; i < RUINS.mines && middle.length; i++) {
      const f = pick(middle);
      features.push({ x: f.x, y: f.y, kind: 'minefield', areas: [], seed: Math.floor(R() * 1000) });
    }
    const mined = f => features.some(m => m.x === f.x && m.y === f.y);
    // (away from where the sides start, so nobody begins on a pile)
    const piles = open.filter(f => !mined(f) && f.x >= RUINS.starts && f.x < COLS - RUINS.starts);
    for (let i = 0; i < RUINS.rubble && piles.length; i++) {
      const f = pick(piles);
      const area = RUBBLE_AREAS[Math.floor(R() * RUBBLE_AREAS.length)];
      features.push({ x: f.x, y: f.y, kind: 'rubble', area, seed: Math.floor(R() * 1000) });
    }
    return { features };
  }
  // (a pile goes in a corner or by an edge, never in the middle: a platoon still fits beside it)
  const RUBBLE_AREAS = ['ne', 'nw', 'se', 'sw', 'n', 'e', 's', 'w'];

  // The beach landing (Steve): tank traps across the top of the sand, burnt-out wrecks nearer the water, new each game. Traps
  // never close the lanes off the beach, and always leave more ways through
  const BEACH = { trapColumn: 3, landColumn: 5, wreckColumns: [1, 2, 3], traps: 0.55, wrecks: 4 };
  function beachMap(map, R) {
    const features = [];
    for (let y = 0; y < ROWS; y++) {
      if (map.rows[y][BEACH.landColumn] === '=' || R() >= BEACH.traps) continue;
      features.push({ x: BEACH.trapColumn, y, kind: 'tanktrap', areas: R() < 0.5 ? ['ne', 'sw'] : ['nw', 'se'] });
    }
    const rows = [...Array(ROWS).keys()];
    for (let i = 0; i < BEACH.wrecks; i++) {
      const y = rows.splice(Math.floor(R() * rows.length), 1)[0];
      const x = BEACH.wreckColumns[Math.floor(R() * BEACH.wreckColumns.length)];
      features.push({ x, y, kind: 'hulk', side: R() < 0.5 ? 'n' : 's', seed: Math.floor(R() * 1000) });
    }
    return { features };
  }

  // The railway yard (Steve: a train station): what stands on the tracks, new each game: one or two engines, mostly carriages
  // and goods wagons, some loaded, a few signal boxes and other things, each blocking the view like a tank, and signals, which
  // don't; and where the tracks join. Each field has a track along its
  // north row of areas and one along its south row. The tracks themselves change nothing
  const YARD = { truck: 0.42, other: 0.1, joinInField: 0.18, joinToNext: 0.1 };
  const YARD_THINGS = ['signal', 'signal', 'signalbox', 'coal', 'watertower'];
  // What a goods wagon is, or carries; a closed van twice as often as anything else
  const YARD_LOADS = ['van', 'van', 'coal', 'wheat', 'timber', 'tank'];
  const YARD_CARRIAGES = 0.35;   // the share of what stands on the tracks that is carriages
  function yardMap(map, R) {
    const features = [], joins = [];
    const isYard = (x, y) => map.rows[y] && map.rows[y][x] === 't';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isYard(x, y)) continue;
      const what = R();
      if (what < YARD.truck) {
        // On one of its two tracks, the full length of the field or two thirds of it; never on a line the trains run along
        // (Steve: those are clear right across)
        // (nor anywhere in a field a line runs through, so there is still room in it for a tank)
        const trackSide = R() < 0.5 ? 'n' : 's';
        if ((map.trains || []).some(l => l.row === y)) continue;
        const row = SIDE_AREAS[trackSide];
        const length = Math.floor(R() * 3);
        const areas = length === 0 ? row : length === 1 ? [row[0], row[1]] : [row[1], row[2]];
        const carriage = R() < YARD_CARRIAGES;
        const load = YARD_LOADS[Math.floor(R() * YARD_LOADS.length)];
        features.push({ x, y, kind: carriage ? 'carriage' : 'wagon', load: carriage ? undefined : load, areas, seed: Math.floor(R() * 1000) });
      } else if (what < YARD.truck + YARD.other) {
        // Between the tracks, to one side of the middle, so a big piece still has a block free
        const kind = YARD_THINGS[Math.floor(R() * YARD_THINGS.length)];
        features.push({ x, y, kind, area: R() < 0.5 ? 'w' : 'e', seed: Math.floor(R() * 1000) });
      }
      if (R() < YARD.joinInField) joins.push({ x, y, within: true, flip: R() < 0.5 });
      if (isYard(x, y + 1) && R() < YARD.joinToNext) joins.push({ x, y, within: false, flip: R() < 0.5 });
    }
    // One or two of the longest are engines
    const longest = features.filter(f => f.areas && f.areas.length === 3);
    const engines = 1 + Math.floor(R() * 2);
    for (let i = 0; i < engines && longest.length; i++) {
      const f = longest.splice(Math.floor(R() * longest.length), 1)[0];
      f.kind = 'engine';
      f.load = undefined;
    }
    return { features, joins };
  }

  // Where a café stands in its square (Steve): one way in three each, along a whole side, along part of a side, or in the middle
  // The street fields a café may go in: a dead end (one way out) or a corner (two ways out, at right angles), with the
  // sides that are closed by buildings. Never in the two columns where each side starts, nor on the board's edge rows
  const WAYS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  function cafeSpots(tiles) {
    const spots = [];
    for (let y = 1; y < ROWS - 1; y++) for (let x = 2; x < COLS - 2; x++) {
      if (tiles[y][x] !== 's') continue;
      const open = Object.keys(WAYS).filter(d => tiles[y + WAYS[d][1]][x + WAYS[d][0]] !== 'k');
      const straight = (open.includes('n') && open.includes('s')) || (open.includes('e') && open.includes('w'));
      const deadEnd = open.length === 1, corner = open.length === 2 && !straight;
      if (deadEnd || corner) spots.push({ x, y, closed: Object.keys(WAYS).filter(d => !open.includes(d)) });
    }
    return spots;
  }
  // Where the café stands: along one of the closed sides, the full length or its middle and one corner (never the middle
  // of the field, so the way through stays open)
  function cafeAreas(closed, R) {
    const side = closed[Math.floor(R() * closed.length)], full = R() < 0.5, end = Math.floor(R() * 2);
    const row = SIDE_AREAS[side];
    if (full) return row;
    return end ? [row[0], row[1]] : [row[1], row[2]];
  }

  // A corner for the fountain, clear of the café; and, if the café leaves the middle free, clear of a block for a big piece
  function fountainCorner(cafe, R) {
    const free = CORNERS.filter(k => !cafe.includes(k));
    const blockFree = k => ![k, k[0], k[1], 'c'].some(a => cafe.includes(a));
    const kept = free.find(blockFree);
    const choices = free.filter(k => k !== kept);
    return choices[Math.floor(R() * choices.length)];
  }

  // There are no hours, only rounds (Steve)
  const roundText = turn => `round ${turn}`;

  // ---------- Who commands whom ----------

  // A piece has used its move for the round
  function spend(st, u) {
    u.acted = true;
    if (st.tokens) { st.activeId = u.id; activated(st, { side: u.side, id: u.id }); }
    for (const o of st.units) { o.halfShot = false; o.mayAmbush = false; }
  }

  // Note who a token activated this round, once each: a piece ({ side, id }) or a gun ({ side, gun }). At the next round
  // only their tokens fly back into the bag (Steve: activated, moved or not)
  function activated(st, who) {
    st.activated = st.activated || [];
    const same = a => a.side === who.side && a.id === who.id && a.gun === who.gun;
    if (!st.activated.some(same)) st.activated.push(who);
  }

  // With the bag (the page plays this way): the player's piece moves only on the player's token, and only one piece a token
  const tokenAllows = (st, u) => !st.tokens || (st.drawn === st.human && (!st.activeId || st.activeId === u.id));

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
    // (the Universal Carrier's Bren reaches as far as a machine gun, Steve)
    if (u.kind === 'carrier') return RANGES.heavy;
    if (isTank(u)) return RANGES.tank;
    if (['mg', 'mg42'].includes(u.kind) || isAtGun(u) || isBunker(u)) return RANGES.heavy;
    if (u.kind === 'company' || u.kind === 'captain') return RANGES.rifle;
    return RANGES.short;
  }

  function isFar(from, target) {
    if (Math.hypot(target.x - from.x, target.y - from.y) <= rangeOf(from).long + 0.5) return false;
    // (a target at close range is never at long range, whatever the weapon)
    return !atCloseRange(from, target);
  }

  // Is a target at close range (Steve): the nearest of the two pieces' areas no more than CLOSE_RANGE apart?
  function atCloseRange(from, target) {
    if (from.x === null || target.x === null) return false;
    const fromPoints = areaPoints(from), toPoints = areaPoints(target);
    return fromPoints.some(a => toPoints.some(b => Math.hypot(b.x - a.x, b.y - a.y) <= CLOSE_RANGE + 1e-6));
  }
  // What close range takes off the score a shot needs
  const closeBonus = (from, target) => (atCloseRange(from, target) ? CLOSE_BONUS : 0);

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
    const inTheWay = blockersFor(st, from, target);
    let best = null;
    for (const a of fromPoints) {
      for (const b of toPoints) {
        const line = lineOfSight(st, from, target, a, b, inTheWay);
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
  function lineOfSight(st, from, target, a, b, inTheWay) {
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
      // (Paris's rows of buildings, Steve: nobody sees through or over them, from beside them or not)
      if (currentMap.blocks) return null;
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
    const tank = tankInWay(a, b, inTheWay);
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
  // Does a line pass a tank or a wreck (not the shooter or the target)? 'blocked' through one of its areas, or past its
  // corner with neither piece in an area touching that corner; 'cover' past its corner from such an area (both +1) unless
  // either piece is right beside that side of it there; null if nothing is in the way
  function tankInWay(a, b, inTheWay) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let cover = false;
    for (const thing of inTheWay.things) {
      const passing = lineByAreas(a, b, len, inTheWay.piecesCells, thing.field, thing.areas);
      if (passing === 'blocked') return 'blocked';
      if (passing === 'cover' && !thing.noCorner) cover = true;
    }
    return cover ? 'cover' : null;
  }

  // What can stand in the way of a look from one piece at another: tanks still running, and wrecks, which block the view
  // the same way, corners and all (Steve); with the areas the two pieces stand in
  function blockersFor(st, from, target) {
    const things = [];
    for (const t of st.units) {
      if (t === from || t === target || t.x === null || !(isTank(t) || isBunker(t))) continue;
      things.push({ field: t, areas: standsIn(t) });
    }
    for (const w of st.wrecks) things.push({ field: w, areas: w.areas });
    // A train blocks the view as the station's engines and carriages do (Steve)
    for (const c of trainCars(st)) things.push({ field: c, areas: c.areas });
    // A building blocks the view as a tank does (Steve)
    // (a wreck on the beach gives cover only to a piece right beside it, Steve, not past its corner)
    for (const f of st.features) if (f.blocksView) things.push({ field: f, areas: f.areas, noCorner: !!FEATURES[f.kind].coverBeside });
    const piecesCells = [from, target].map(u => (u.kind ? standsIn(u).map(k => cellOf(u, k)) : []));
    return { things, piecesCells };
  }
  // One line against the areas one tank or wreck stands in, in field f (see tankInWay)
  function lineByAreas(a, b, len, piecesCells, f, areas) {
    let cover = false;
    for (const k of areas) {
      const cell = cellOf(f, k);
      const hit = lineInCell(a, b, cell);
      if (!hit) continue;
      // Through the area itself: blocked
      if ((hit.s1 - hit.s0) * len > 1e-6) return 'blocked';
      // Only touching a corner of it: from an area at that very corner it sees past, in cover
      const p = { x: a.x + hit.s0 * (b.x - a.x), y: a.y + hit.s0 * (b.y - a.y) };
      const cornerOf = c => [[c.x0, c.y0], [c.x0 + THIRD, c.y0], [c.x0, c.y0 + THIRD], [c.x0 + THIRD, c.y0 + THIRD]].some(([x, y]) => Math.abs(x - p.x) < 1e-6 && Math.abs(y - p.y) < 1e-6);
      const atIt = piecesCells.map(cells => cells.some(cornerOf));
      if (!atIt[0] && !atIt[1]) return 'blocked';
      // Right beside that side of it (its area shares a side with this one, at that corner): no cover
      const beside = cells => cells.some(c => cornerOf(c) && (Math.abs(c.x0 - cell.x0) < 1e-6 || Math.abs(c.y0 - cell.y0) < 1e-6));
      if (!piecesCells.some(beside)) cover = true;
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
      // Only from that very corner can it see past a hedge ending there (never past a Paris building, Steve)
      if (currentMap.blocks) return 'blocked';
      if (!atPoint(from, vx, vy) && !atPoint(target, vx, vy)) return 'blocked';
      const near = u => touches(u, ax, ay, da, [third]) || touches(u, bx, by, db, [third]);
      if (!near(from) && !near(target)) cover = true;
    }
    return cover ? 'cover' : null;
  }


  // Can a side see this piece, to call fire on it? Any of its pieces with a line of sight to that very piece, however far
  // (Steve: the whole board), moved this round or not. (Steve: guns were firing on pieces nobody could see: it used to be
  // enough to see any corner of the field, or just to stand next to it across a hedge.) target: a piece, or a field with at: null
  function sees(st, side, target) {
    if (target.aboard) return false;
    return st.units.some(u => u.side === side && u.x !== null && !!sight(st, u, target, true));
  }

  // ---------- Fire ----------

  // Firepower of a piece. hard: against tanks. Attached teams shoot on their own
  function firepower(st, u) {
    const P = PIECES[u.kind];
    // A section of submachine gunners (Steve): SMG.dice a base, nothing against tanks
    if (u.arms === 'smg') return { soft: SMG.dice * u.platoons, hard: 0, men: SMG.dice * u.platoons, he: 0 };
    const soft = P.soft * u.platoons, hard = P.hard * u.platoons;
    // Against men: its own number if it has one, else its soft and half its anti-tank dice (whole dice in the data)
    const men = (P.vsMen !== undefined ? P.vsMen : P.soft + P.hard * 0.5) * u.platoons;
    // A tank's gun at men: its high explosive
    const he = (P.he || 0) * u.platoons;
    return { soft, hard, men, he };
  }

  // The dice a piece rolls against men: its own, and half its anti-tank weapons' (Steve asked why a bazooka showed 0:
  // it rolls one die at men, half its two anti-tank dice)
  function menDice(f) {
    return f.men !== undefined ? f.men : f.soft + f.hard * 0.5;
  }

  // The dice a firepower rolls, as the panel shows it (Steve: the Panzer II still showed 0.5): less than one is one,
  // anything else to a tenth (a fraction there is a chance of one more)
  function diceShown(f) {
    if (f <= 0) return 0;
    if (f < 1) return 1;
    return Math.round(f * 10) / 10;
  }
  // The dice a piece rolls against men, as shown: a tank rolls its machine guns and its gun's high explosive apart
  // (see fireAt), each at least one die; anyone else its own dice and half its anti-tank ones together
  function menDiceShown(u, f) {
    if (isTank(u)) return Math.round((diceShown(f.soft) + diceShown(f.he)) * 10) / 10;
    return diceShown(menDice(f));
  }

  // Whole dice from a firepower: the fraction is a chance of one more. Less than one die (half a die, say) is always one
  // (Steve, 2026-11-12: everyone who shoots should roll)
  function dice(st, f) {
    if (f > 0 && f < 1) return 1;
    return Math.floor(f) + (st.rand() < f - Math.floor(f) ? 1 : 0);
  }

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
    // A bunker takes no cover from hedges, the sea wall, houses or trees (Steve): its concrete is its cover, what its face
    // adds (3 from the front, 1 from a side, none from behind)
    if (isBunker(target)) return 0;
    let c = 0;
    if (from) { const s2 = sight(st, from, target); if (s2) c += s2.cover; }
    c += placeCover(st, target, from);
    c += shieldCover(target, from);
    return c;
  }

  // A gun shield (Steve: the 88): its cover against a shot from in front of the gun, within SHIELD_ARC of the way it
  // faces; nothing from the side or behind
  function shieldCover(target, from) {
    const shield = PIECES[target.kind].shield || 0;
    if (!shield || !from || from.x === null) return 0;
    const gun = boardPoint(target), shooter = boardPoint(from);
    const facing = target.aim === undefined ? (target.side === 'us' ? 0 : Math.PI) : target.aim;
    const toShooter = Math.atan2(-(shooter.y - gun.y), shooter.x - gun.x);
    let off = Math.abs(toShooter - facing) % (Math.PI * 2);
    if (off > Math.PI) off = Math.PI * 2 - off;
    return off <= SHIELD_ARC / 2 * Math.PI / 180 + 1e-9 ? shield : 0;
  }

  // What hits do to a piece (Steve): every hit shakes it, and each hit is a coin toss whether it wounds: a section
  // of a platoon, a whole team, or a tank lost. Only anti-tank (hard) hits count against tanks
  // shakeOnly (a mortar on a tank, Steve): no coin toss, so a hit only shakes it, unless it is already shaken
  // deadly: true when every hit on men kills outright, or how many of the hits do (a tank's gun, not its machine guns);
  // those come last, after the coin tosses
  function damage(st, u, softHits, hardHits, deadly = false, shakeOnly = false) {
    const name = u.name, out = [];
    // A bunker (Steve): rifles, machine guns and mortars only shake it
    if (isBunker(u) && softHits > 0 && hardHits <= 0) {
      const was = u.shocked;
      u.shocked = true;
      return [was ? `${name} still shaken` : `${name} shaken`];
    }
    const hits = isTank(u) || isBunker(u) ? hardHits : softHits + hardHits;
    if (hits <= 0) return out;
    // Each hit: on a piece already shaken it kills (Steve: shaken twice kills); otherwise it shakes it, and a coin toss says
    // whether it wounds as well
    let wounds = 0;
    const wasShocked = u.shocked;
    // How many of the hits kill outright: all of them, none, or the count given
    const killers = deadly === true ? hits : Math.min(hits, deadly || 0);
    for (let k = 0; k < hits; k++) {
      // A bazooka, Panzerschreck or tank gun hitting men kills outright (Steve: they're powerful)
      const killsOutright = k >= hits - killers;
      if (killsOutright && !isTank(u) && !isBunker(u)) wounds++;
      else if (u.shocked) wounds++;
      else if (!shakeOnly && st.rand() < WOUND_CHANCE) wounds++;
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
      // A rifle platoon loses at most one section to one attack, however many hits (Steve); only hand to hand takes more
      const lost = Math.min(u.platoons, wounds, MAX_SECTIONS_LOST);
      u.platoons -= lost;
      if (lost) out.push(`${name} loses ${lost} section${lost > 1 ? 's' : ''}`);
    }
    if (!out.length && u.platoons > 0) out.push(wasShocked ? `${name} still shaken` : `${name} shaken`);
    if (u.platoons <= 0) out.push(...remove(st, u));
    return out;
  }

  // A piece leaves the board
  // One mission or bomb wiped out the last of both sides: a draw, whoever it hit first (Steve)
  function checkDraw(st) {
    const left = side => st.units.some(u => u.side === side && u.x !== null);
    if (left('us') || left('de')) return;
    st.draw = true;
    st.won = false;
    st.lost = true;
    st.report = ['🤝 The last of both sides went down together. A draw.'];
  }

  // Can the company no longer win: no rifle platoon or captain left to take the village, and German tanks it has nothing left to
  // hurt with, so it can't destroy every German either (Steve)
  function cannotWin(st) {
    const us = st.units.filter(u => u.side === 'us' && u.x !== null);
    // No goal on this map: only destroying every German wins, so it is lost once a bunker or tank is left that nothing can hurt
    if (st.noGoal) return noGoalCannotWin(st, us);
    if (us.some(u => takesGoal(u))) return false;
    const tanksLeft = st.units.some(u => u.side === 'de' && u.x !== null && isTank(u));
    if (!tanksLeft) return false;
    // Anything still able to hurt a tank: a piece with anti-tank weapons, or fire support with rounds or a run left
    if (us.some(u => firepower(st, u).hard > 0)) return false;
    const left = st.ammo.us;
    return left.mortars <= 0 && left.artillery <= 0 && left.bomber <= 0;
  }

  // With no goal: is a German bunker or tank left that nothing American can knock out? Anti-tank weapons on the table,
  // artillery or a bomber run can; mortars can knock out a tank but only shake a bunker
  function noGoalCannotWin(st, us) {
    const hard = st.units.filter(u => u.side === 'de' && u.x !== null && (isTank(u) || isBunker(u)));
    if (!hard.length) return false;
    if (us.some(u => firepower(st, u).hard > 0)) return false;
    const left = st.ammo.us;
    if (left.artillery > 0 || left.bomber > 0) return false;
    // Only mortars left: they can still knock out tanks, never bunkers
    return left.mortars <= 0 || hard.some(u => isBunker(u));
  }

  function remove(st, u) {
    // A tank stays on the table as a burnt-out wreck (Steve)
    // (a bunker too: its burnt-out shell)
    if ((isTank(u) || isBunker(u)) && u.x !== null) leaveWreck(st, u);
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
  // A 1 always misses (Steve): with a tank's armour on top, the total is never under MIN_NEED
  function needFor(st, shooter, target, moving = false) {
    return Math.max(MIN_NEED - armourOf(target), sumOfNeed(st, shooter, target, moving));
  }

  // What a shot adds up to, before that
  function sumOfNeed(st, shooter, target, moving) {
    // The sniper: no cover, no long range (Steve)
    // A small target needs one more, whoever shoots (Steve)
    const small = smallTarget(target) ? SMALL_TARGET : 0;
    // Close range: one less, whoever shoots (Steve)
    const close = closeBonus(shooter, target) - bunkerExtra(shooter, target);
    // Taking cover: two more from every weapon (Steve), but not the sniper (no cover helps against him)
    const down = target.down ? TAKE_COVER : 0;
    if (PIECES[shooter.kind].sniper) return TO_HIT + small + (moving ? ON_THE_MOVE : 0) + (shooter.shocked ? SHAKEN_SHOOT : 0) - QUALITY[shooter.quality || 'standard'].shoot - close;
    return TO_HIT + cover(st, shooter, target) + small + down + smallGunAt(shooter, target) + (moving ? ON_THE_MOVE : 0) + (shooter.shocked ? SHAKEN_SHOOT : 0) - QUALITY[shooter.quality || 'standard'].shoot - close;
  }
  // A small gun at a tank (Steve: the 2 cm and 37 mm): one more needed
  function smallGunAt(shooter, target) {
    return PIECES[shooter.kind].smallGun && isTank(target) ? SMALL_GUN : 0;
  }

  // Where a piece (or a bare field) stands on the board, as one point in fields: the middle of the areas it is in
  function boardPoint(u) {
    const spot = spotXY(u);
    // (an area's middle is a third of a field from the field's middle)
    return { x: u.x + 0.5 + spot.x / 3, y: u.y + 0.5 + spot.y / 3 };
  }
  // Is a piece (or a field) in front of a bunker? Its front looks west: within 45° either side of straight out of it,
  // 90° in all (Steve). Measured from where the bunker stands in its field to where the other stands in theirs (Steve:
  // from field to field it fired wider than that, at pieces in the next field along the diagonal)
  // (the same arc for where it can fire and where its thick front faces)
  function inFrontOf(bunker, f) {
    const from = boardPoint(bunker), to = boardPoint(f);
    // How far out in front of it (west), and how far off to the side
    const ahead = from.x - to.x;
    const aside = Math.abs(to.y - from.y);
    // In front, and no wider than the arc
    return ahead > 0 && aside <= ahead * Math.tan(BUNKER_ARC / 2 * Math.PI / 180) + 1e-9;
  }
  // Which face of a bunker a piece (or a field) is at (Steve): its front, within 45° either side of straight out of its
  // slit (west); its back, the same arc straight behind it (east); otherwise one of its sides
  function bunkerFace(bunker, f) {
    if (inFrontOf(bunker, f)) return 'front';
    const from = boardPoint(bunker), to = boardPoint(f);
    // How far behind it (east), and how far off to the side
    const behind = to.x - from.x;
    const aside = Math.abs(to.y - from.y);
    if (behind > 0 && aside <= behind * Math.tan(BUNKER_ARC / 2 * Math.PI / 180) + 1e-9) return 'back';
    return 'side';
  }
  // What a bunker's face adds to a shot from there (Steve): 3 from the front, 1 from a side, none from behind
  const BUNKER_FACE_ADDS = { front: BUNKER_FRONT, side: BUNKER_SIDE, back: 0 };
  const bunkerExtra = (shooter, target) => (isBunker(target) ? BUNKER_FACE_ADDS[bunkerFace(target, shooter)] : 0);

  // The bunker's line on that label (Steve: it must be obvious which face is easier): what its face adds, and which face
  function bunkerWhy(shooter, target) {
    if (!isBunker(target)) return [];
    const face = bunkerFace(target, shooter);
    return [`+${BUNKER_FACE_ADDS[face]} bunker ${face}`];
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
      if (atCloseRange(shooter, target)) why.push(`−${CLOSE_BONUS} close range`);
      why.push(...bunkerWhy(shooter, target));
      why.push(...floorWhy(st, shooter, target, moving));
      return withStart(why);
    }
    const s = sight(st, shooter, target);
    const far = isFar(shooter, target);
    // The covers one by one: the hedge it lines, a tank in a field in between, the field it stands in, its own tank beside it
    // (none for a bunker, Steve: see cover)
    const covered = !isBunker(target);
    if (covered && s && s.hedge) why.push(`+${COVER.hedge} ${hedgeWord()}`);
    if (covered && s && s.tankCorner) why.push(`+${COVER.tankCorner} tank's corner`);
    if (covered && s && s.placeCorner) why.push(`+${COVER.placeCorner} cover`);
    if (covered && shieldCover(target, shooter)) why.push(`+${shieldCover(target, shooter)} gun shield`);
    if (covered) why.push(...placeWhy(st, target, shooter));
    if (target.down) why.push(`+${TAKE_COVER} take cover`);
    // Two men or fewer (Steve)
    if (smallTarget(target)) why.push(`+${SMALL_TARGET} small target`);
    if (far) why.push(`+${LONG_RANGE} long range`);
    if (moving) why.push(`+${ON_THE_MOVE} moving`);
    if (shooter.shocked) why.push(`+${SHAKEN_SHOOT} shaken`);
    if (armourOf(target)) why.push(`+${armourOf(target)} armour`);
    // (Steve: said in the red bubble as "+1 small gun")
    if (smallGunAt(shooter, target)) why.push(`+${smallGunAt(shooter, target)} small gun`);
    if (QUALITY[shooter.quality || 'standard'].shoot) why.push(`−${QUALITY[shooter.quality || 'standard'].shoot} elite`);
    if (atCloseRange(shooter, target)) why.push(`−${CLOSE_BONUS} close range`);
    why.push(...bunkerWhy(shooter, target));
    why.push(...floorWhy(st, shooter, target, moving));
    return withStart(why);
  }

  // Why a shot needs more than its sum (Steve: the label has to add up for a player doing the maths): the +1 that brings
  // it up to 2+, because a 1 always misses
  function floorWhy(st, shooter, target, moving) {
    const total = sumOfNeed(st, shooter, target, moving) + armourOf(target);
    return total < MIN_NEED ? [`+${MIN_NEED - total} a 1 always misses`] : [];
  }

  // Cover from the field a target stands in: a village, a hamlet or an orchard
  function placeWhy(st, target, from, shells = false) {
    const n = placeCover(st, target, from, shells);
    // Beside a wreck: says so, as a hedge does
    if (n && !PLACE_COVER[tileType(target.x, target.y)] && !shells && besideWreck(st, target)) return [`+${n} wreck`];
    // (Steve: just "cover", not which kind of place)
    return n ? [`+${n} cover`] : [];
  }

  // Where an area is on the board, counted in areas (three to a field each way), for telling which areas touch
  function areaCell(x, y, k) {
    const a = areaXY(k);
    return { i: x * 3 + a.x + 1, j: y * 3 + a.y + 1 };
  }

  // The wrecks giving cover to a piece standing in these areas of field x, y (Steve: like a hedge): each one with an area
  // touching one of its areas side to side, in its field or the next, and the way from the wreck to the piece
  function wrecksBeside(st, x, y, areas) {
    const cells = areas.map(k => areaCell(x, y, k));
    const out = [];
    for (const f of st.features) {
      if (!FEATURES[f.kind].coverBeside) continue;
      for (const k of f.areas) {
        const w = areaCell(f.x, f.y, k);
        const near = cells.find(c => Math.abs(c.i - w.i) + Math.abs(c.j - w.j) === 1);
        if (!near) continue;
        out.push({ feature: f, way: { x: near.i - w.i, y: near.j - w.j } });
        break;
      }
    }
    return out;
  }
  // Is a piece standing right beside a wreck?
  const besideWreck = (st, u) => wrecksBeside(st, u.x, u.y, standsIn(u)).length > 0;

  // The cover a village, hamlet or orchard gives a piece in it (see PLACE_COVER): men, a tank, or against shells; none
  // at all against an enemy inside the same one (Steve). Open fields and lanes give none
  function placeCover(st, target, from, shells = false) {
    const cover = PLACE_COVER[tileType(target.x, target.y)];
    if (!cover) {
      // Men under something that gives cover where they stand (the Eiffel Tower): one more to hit
      // (or a strongpoint's sandbags, Steve: Dunkirk, more against shots; one against shells, as everything is)
      const sheltering = isTank(target) ? [] : featuresAt(st, target.x, target.y).map(f => FEATURES[f.kind].cover || 0);
      const best = Math.max(0, ...sheltering);
      if (best) return shells ? Math.min(1, best) : best;
      // Right beside a burnt-out landing craft (Steve): cover as by a hedge, against shots (not shells or bombs)
      return !shells && besideWreck(st, target) ? COVER.hedge : 0;
    }
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
    return TO_HIT + SHELL_HARDER + place + armourOf(t) + (t.down ? TAKE_COVER : 0) + (isBunker(t) ? BUNKER_FRONT : 0);
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
    if (isBunker(t)) why.push(`+${BUNKER_FRONT} bunker`);
    // Men already down in cover: two more (Steve: they can't get down as the shells come in, but if already down it counts)
    if (t.down) why.push(`+${TAKE_COVER} take cover`);
    // Starting from the shells' own score, not a shot's
    return why.length ? [`${TO_HIT + SHELL_HARDER}+`, ...why] : why;
  }

  // `blast` is set for the other pieces caught in a tank's high-explosive burst (they don't spread it again)
  const weaponOf = u => (isTank(u) || isAtGun(u) || u.kind === 'bunker_gun' ? 'gun' : u.kind === 'mg' || u.kind === 'mg42' || u.kind === 'bunker_mg' ? 'mg' : u.kind === 'bazooka' || u.kind === 'schreck' ? 'rocket' : 'rifle');

  // The sound a shot makes as it is fired (Steve: a tank's is the bazooka's; the PaK keeps its cannon)
  function fireSound(shooter, weapon, side) {
    // Tanks, the PaK and the gun bunkers all fire with the bazooka's sound (Steve)
    if (weapon === 'gun') return 'rocket';
    if (weapon === 'mg' && side === 'de') return 'mg42';
    return weapon;
  }

  function fireAt(st, shooter, target, withdraw = false, moving = false, blast = false) {
    const f = firepower(st, shooter);
    // An anti-tank gun swings round onto what it fires at, and stays facing it (Steve: its shield faces that way)
    if (isAtGun(shooter)) shooter.aim = Math.atan2(-(target.y - shooter.y), target.x - shooter.x);
    // The computer's piece fired on takes cover when it is wise to (Steve), as you can
    if (!withdraw && isRobot(st, target.side) && computerTakesCover(st, target, menDice(f), needFor(st, shooter, target, moving))) withdraw = true;
    // Taking cover happens before the dice roll: its men are already down (and two more are needed)
    const pre = withdraw ? takeCover(st, target) : null;
    const need = needFor(st, shooter, target, moving);
    const faces = [];
    let softHits, hardHits;
    let gunHits = 0;            // a tank's gun hits on men, that kill outright
    if (isTank(target)) {
      // (at least one die with any anti-tank weapon, Steve: half a die often rolled none, and the shot was wasted)
      hardHits = roll(st, f.hard > 0 ? Math.max(1, dice(st, f.hard)) : 0, need + armourOf(target), faces);
      softHits = roll(st, dice(st, f.soft), need, []);
      // A machine gun on an armoured car (Steve): its dice count, as anti-tank hits do, and show on the table
      if (isCar(target) && hurtsCars(shooter)) hardHits += roll(st, dice(st, f.soft), need + armourOf(target), faces);
    } else if (isBunker(target)) {
      // Anti-tank weapons can knock it out; anything else only shakes it. The dice shown: the ones that matter most
      hardHits = roll(st, dice(st, f.hard), need, f.hard ? faces : []);
      softHits = roll(st, dice(st, f.soft), need, f.hard ? [] : faces);
    } else if (isTank(shooter)) {
      // A tank at men (Steve): its machine guns' dice are a coin toss like anyone's; its gun's high explosive (half its
      // anti-tank dice, as below) kills on every hit. One row of dice on the table, the machine guns' first
      const mgHits = roll(st, dice(st, f.soft), need, faces);
      gunHits = roll(st, dice(st, f.he), need, faces);
      softHits = mgHits + gunHits;
      hardHits = 0;
    } else {
      // Anti-tank weapons are poor against men in a hedge: half value
      const full = dice(st, menDice(f));
      softHits = roll(st, full, need, faces);
      hardHits = 0;
    }
    // Where the target stood, so its dice still land there if it is wiped out
    const stood = { x: target.x, y: target.y };
    const before = { strength: target.platoons, shocked: target.shocked };
    // Which hits kill outright: every one from a bazooka, Panzerschreck, PaK or gun bunker; only a tank's gun hits, not
    // its machine guns' (Steve: those are 50/50)
    const deadly = isTank(shooter) ? gunHits : ['bazooka', 'schreck', 'bunker_gun'].includes(shooter.kind) || isAtGun(shooter);
    // A crewed gun (Steve: the 88, the PaK) under small arms, rifles, machine guns, submachine guns or a sniper: a hit
    // only shakes it (its crew pinned, the gun still there), but one on a gun already shaken kills it, as everywhere
    const smallArms = isAtGun(target) && ['rifle', 'mg'].includes(weaponOf(shooter)) && !isTank(shooter);
    const out = (pre ? [pre.line] : []).concat(damage(st, target, softHits, hardHits, deadly, smallArms));
    // In a word, what the shot did, for the words that float up off the target
    const lost = before.strength - (target.x === null ? 0 : target.platoons);
    const result = target.x === null ? (isTank(target) ? 'Destroyed' : 'Wiped out')
      : lost ? (isTank(target) ? `Tank knocked out` : lost > 1 ? `${lost} sections lost` : 'Section lost')
      : target.shocked && !before.shocked ? 'Shaken' : softHits + hardHits ? 'No effect' : 'Missed';
    // What the table shows: the weapon's muzzle flash and tracers from the shooter, and what lands on the target
    st.fx.push({
      from: { id: shooter.id, x: shooter.x, y: shooter.y },
      to: { id: target.id },
      weapon: weaponOf(shooter),
      armour: isTank(target),
      x: target.x === null ? stood.x : target.x,
      y: target.x === null ? stood.y : target.y,
      kind: softHits + hardHits ? 'hit' : 'miss',
      faces,
      need: need + armourOf(target),
      side: shooter.side,
      result,
      tookCover: !!pre,
    });
    // A tank firing high explosive at men hits the whole field, like a mortar: every other piece on foot in it rolls too
    if (isTank(shooter) && !isTank(target) && !blast) {
      for (const other of at(st, stood.x, stood.y, target.side)) {
        if (other === target || isTank(other)) continue;
        out.push(...fireAt(st, shooter, other, false, moving, true));
      }
    }
    return out.length ? out : [`${target.name}: no hits`];
  }

  // A piece fired on takes cover (Steve): no moving back, its men get down where they are. One more is needed to hit it
  // for the rest of the round, and it uses up its move unless the captain gets it up
  // The chance of one die hitting, given the score it needs
  const hitChance = need => (need > MAX_NEED ? 1 / 36 : Math.max(0, 7 - need) / 6);

  // Does a German piece about to be fired on (dice at it, each needing `need`) take cover? When it is wise (Steve):
  // a shaken piece, where one more hit kills, as soon as a hit is likely; a weakened one against a fair volley; a
  // whole one only against a heavy one. Taking cover costs its move this round, so only a piece that still has it
  function computerTakesCover(st, t, diceAt, need) {
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
  // uses the move it still has). You are asked; the Germans decide for themselves (computerTakesCover)
  function canReact(st, u) {
    // Tanks can't take cover (Steve): they just take it
    // (nor men aboard a boat or running for one, Steve: Dunkirk)
    if (u.auto || isAboard(st, u)) return false;
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
    // A captain's submachine gun reaches close range only (Steve), and so do the submachine gunners'
    const closeOnly = closeRangeOnly(shooter);
    // A bunker only fires out of its front (Steve)
    const frontOnly = isBunker(shooter);
    // (a machine gun can fire on an armoured car, Steve: its armour is thin)
    return st.units.filter(t => t.side !== shooter.side && t.x !== null && !t.aboard && (!isTank(t) || f.hard > 0 || (isCar(t) && hurtsCars(shooter)))
      && (!closeOnly || atCloseRange(shooter, t)) && (!frontOnly || inFrontOf(shooter, t)) && !!sight(st, shooter, t));
  }

  // Can only shoot at close range: the captain, and a section of submachine gunners (Steve)
  function closeRangeOnly(u) { return !!PIECES[u.kind].closeOnly || u.arms === 'smg'; }
  // An anti-tank gun (the PaK, the 88): it swings round to fire, and its hits on men kill
  function isAtGun(u) { return !!PIECES[u.kind].atGun; }
  // In a fixed position (Steve: Stalingrad's 88): it never moves, not even within its field
  function isEmplaced(u) { return !!PIECES[u.kind].emplaced; }

  // ---------- Moving ----------

  // Can a piece step to a field next to it? Tanks can't climb the hedge banks: they need a gap or a lane,
  // unless they carry hedge cutters and drive straight through
  // (not through Paris's rows of buildings, Steve: map.blocks)
  const cutter = u => isTank(u) && !!PIECES[u.kind].cutter && !currentMap.blocks;
  // Move a piece. A tank with hedge cutters going through a hedge leaves a gap.
  // Returns what happened to the hedge: 'cut' (driven through), 'climbed' (men clambered over) or ''
  function step(st, u, x, y, assault = false) {
    let how = '';
    u.trail = null;
    // (moving on, a tank tears free of wire it was snagged in)
    u.snag = null;
    if (wire(st, u.x, u.y, x, y)) {
      const key = edgeKey(u.x, u.y, x, y);
      delete st.wire[key];
      // (only tanks ever get here: barbed wire stops men, Steve, see stepCost)
      how = isTank(u) ? 'flattened' : 'wirecut';
      // A tank tears it open (Steve): the wire stays on the table, dragged aside the way the tank went, a gap through it
      // that stops nobody from then on
      if (isTank(u)) {
        if (!st.openWire) st.openWire = {};
        st.openWire[key] = { from: { x: u.x, y: u.y }, to: { x, y }, by: u.id };
      }
    }
    if (hedge(st, u.x, u.y, x, y)) {
      if (cutter(u)) {
        const key = edgeKey(u.x, u.y, x, y);
        delete st.hedges[key];
        how = 'cut';
        // (Steve: the hedge stays on the table, its middle half trampled flat: a gap for everyone from then on)
        if (!st.trampled) st.trampled = {};
        st.trampled[key] = true;
      } else how = 'climbed';
    }
    const heading = dirTo(u, { x, y });
    u.x = x; u.y = y; u.at = freePlace(st, u, x, y, heading);
    // The first piece into the supply crate's field takes it for its side (Steve)
    takeCrate(st, u);
    // The way it is facing, for the table (tanks turn to fire, and turn again when they move)
    u.aim = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 }[heading];
    // A tank stops facing the nearest enemy it can see (Steve)
    if (isTank(u)) faceEnemy(st, u);
    // Into a minefield (Steve: Stalingrad): it may set off a mine
    mineCheck(st, u);
    return how;
  }

  // A piece going into a minefield rolls a die: MINES.need or more sets one off, a hit on it (anti-tank under a tank).
  // What happened waits in st.mineLines for whoever reports the move (takeMineLines)
  function mineCheck(st, u) {
    if (u.x === null || !featuresAt(st, u.x, u.y).some(f => FEATURES[f.kind].mines)) return;
    const faces = [];
    const hits = roll(st, 1, MINES.need, faces);
    st.fx.push({ kind: 'mine', x: u.x, y: u.y, faces, need: MINES.need, side: enemyOf(u.side), to: { id: u.id }, hit: hits > 0 });
    st.mineLines = st.mineLines || [];
    if (!hits) { st.mineLines.push(`💥 ${u.name} picks its way through the minefield.`); return; }
    const what = isTank(u) ? damage(st, u, 0, 1) : damage(st, u, 1, 0);
    st.mineLines.push(`💥 ${u.name} sets off a mine: ${what.join(', ')}.`);
  }
  // The mine lines waiting to be reported, emptied
  function takeMineLines(st) {
    const lines = st.mineLines || [];
    st.mineLines = [];
    return lines;
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
      const mined = takeMineLines(st);
      if (mined.length) return [how === 'cut' ? `${u.name} charges through the ${hedgeWord()}, leaving a gap` : `${u.name} charges forward`, ...mined.map(l => l.replace(/\.$/, ''))];
      return [how === 'cut' ? `${u.name} charges through the ${hedgeWord()}, leaving a gap` : how === 'flattened' ? `${u.name} charges over the wire, flattening it` : `${u.name} charges forward`];
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
    // (step tears any wire on the way open, and leaves it on the table)
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
  // A shaken piece needs one more to hit in the fight, as when shooting (Steve). Winning the fight clears it: whoever is
  // left on the winning side is no longer shaken (Steve); the loser is gone
  function handToHand(st, u, defenders, x, y) {
    const out = [`⚔️ ${u.name} charges ${defenders.map(d => d.name).join(' and ')}`];
    // The attacker's dice: 3+, one more against men behind the hedge it went over or in houses; elite one less
    const sheltered = hedge(st, u.x, u.y, x, y) || ['village', 'hamlet'].includes(tileType(x, y));
    // (shaken: one more, Steve)
    const attackNeed = TO_HIT + (sheltered ? 1 : 0) - QUALITY[u.quality || 'standard'].shoot + (u.shocked ? SHAKEN_SHOOT : 0);
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
      // Each defender: 3+, elite one less, shaken one more (Steve)
      const d = strike(st, standing(defenders), standing(attackers), s => TO_HIT - QUALITY[s.quality || 'standard'].shoot + (s.shocked ? SHAKEN_SHOOT : 0));
      out.push(...d.lines);
      if (d.able) fight.strikes.push(d.blow);
      if (!standing(attackers).length) break;
      // Neither side can hurt the other (men against tanks alone): the attacker gives up and stays where it was
      if (!a.able && !d.able) break;
    }
    fight.won = !standing(defenders).length && u.x !== null;
    // The winners shake it off (Steve): the attacker if the defenders are all gone, the defenders left if the attacker is
    const winners = fight.won ? [u] : u.x === null ? standing(defenders) : [];
    for (const w of winners) w.shocked = false;
    st.fx.push(fight);
    if (!standing(defenders).length && u.x !== null) {
      // The field is the attacker's
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
    } else if (!left('us') && !st.evac) {
      st.lost = true;
      st.report = ['💀 Nothing is left of the company. The attack has failed.'];
    }
  }

  // ---------- The player's actions ----------
  // Each returns { ok, lines }. A piece acts once a round

  function canAct(st, u) {
    // (aboard a boat, or a lorry driving itself to one, Steve: nobody gives them orders)
    if (u && (u.auto || isAboard(st, u))) return false;
    return !!u && u.side === st.human && u.x !== null && !st.won && !st.lost && !st.computer && !u.acted && tokenAllows(st, u);
  }

  // The captain's rallies (Steve): two a round if he stays put or charges, in any order (two then the charge, one
  // either side of it, or the charge then two); one if he shoots or moves and shoots, before or after it. Not wanting
  // them all, he uses Skip turn. u.fired: he has shot (or moved and shot) this round
  const ralliesAllowed = cap => (cap.fired ? CAPTAIN_RALLIES.fired : CAPTAIN_RALLIES.still);
  function canRally(st, cap) {
    if (!cap || cap.kind !== 'captain' || cap.side !== st.human || cap.x === null || st.won || st.lost || st.computer || !tokenAllows(st, cap)) return false;
    if (cap.skipped) return false;
    // In cover he can't rally anyone, himself included (Steve): it wears off next round
    if (cap.down) return false;
    return (cap.rallied || 0) < ralliesAllowed(cap);
  }
  // Can a piece shoot (or move and shoot) now? The captain not after two rallies: then only a charge is left (Steve)
  const mayFire = u => !(u.kind === 'captain' && (u.rallied || 0) >= CAPTAIN_RALLIES.still);

  function actShoot(st, u, target) {
    if (!canAct(st, u) || !mayFire(u) || !targets(st, u).includes(target)) return { ok: false };
    spend(st, u);
    u.fired = true;
    const lines = [`🔫 ${u.name} fires on ${target.name}: ` + fireAt(st, u, target).join(', ')];
    // Shooting gives it away to any ambush that can see it (Steve)
    springAmbushes(st, u, lines);
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // The routes Move & shoot can take: up to MOVE_SHOOT_MOVES ending only where the piece will have someone to
  // shoot (Steve). Captains don't shoot, and machine guns can't fire on the move (Steve): they set up, then shoot
  // Can it fire after moving: not a machine gun or a dug-in gun, nor a captain with no shot left (Steve)
  const firesOnTheMove = u => u.kind !== 'mg' && u.kind !== 'mg42' && !PIECES[u.kind].fixed && mayFire(u);

  function moveShootRoutes(st, u) {
    if (!firesOnTheMove(u)) return [];
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
    return areasWhere(st, u, x, y, () => targets(st, u, true).length > 0);
  }

  // Of those areas, the ones where it would have a shot at close range (Steve: hatched differently)
  function closeCells(st, u, x, y) {
    return areasWhere(st, u, x, y, () => targets(st, u, true).some(t => atCloseRange(u, t)));
  }

  // Of those areas, the ones where every shot it would have is a Hail Mary (Steve: hatched in weaker red). One decent shot
  // from there, and it is not
  function hailMaryCells(st, u, x, y) {
    return areasWhere(st, u, x, y, () => {
      const shots = targets(st, u, true);
      return shots.length > 0 && shots.every(t => shotNeed(st, u, t, true) > MAX_NEED);
    });
  }

  // The areas of a field where a piece, tried out standing there, passes a test
  function areasWhere(st, u, x, y, passes) {
    const home = { x: u.x, y: u.y, at: u.at }, out = [];
    u.x = x; u.y = y;
    for (const k of GRID) {
      u.at = freePlace(st, u, x, y, k === 'c' ? null : k);
      if (passes()) out.push(k);
    }
    // (only tried out: it goes back to where it stands)
    u.x = home.x; u.y = home.y; u.at = home.at;
    return out;
  }

  // Move and shoot: the piece moves a field, then it may fire once on the move, needing one more (actHalfShot), before doing anything else
  function actMoveShoot(st, u, x, y, side) {
    const route = canAct(st, u) && moveShootRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    // (out of its field: the shot after is on the move)
    u.stayedIn = false;
    const lines = moveToShoot(st, u, route, side);
    u.halfShot = u.x !== null && targets(st, u, true).length > 0;
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // The move of a Move & shoot, either side (Steve: the same rules for the Germans): along its route to where it will
  // stand. Returns the lines to report; the shot comes after, needing one more for moving
  function moveToShoot(st, u, route, side) {
    u.fired = true;
    const goal = route[route.length - 1];
    const lines = followRoute(st, u, route);
    // Snagged on wire on the way, or stopped by an ambush: it stays there, and fires from there if it can (Steve)
    if (u.snagged) return lines;
    const how = step(st, u, goal.x, goal.y);
    lines.push(...takeMineLines(st));
    // (blown up by a mine as it got there)
    if (u.x === null) { u.snagged = true; return lines; }
    // Where it stands: where it was sent, or (none given) the first place in the field with a shot
    const place = side !== undefined ? side : [u.at, ...anchorsFor(u)].find(p => { if (!fitsAt(st, u, goal.x, goal.y, p)) return false; u.at = p; return targets(st, u, true).length; });
    standAt(st, u, place === undefined ? u.at : place);
    setTrail(st, u, route);
    lines.push(moveLine(u, how).replace(/\.$/, ''));
    // Arriving in sight of an ambush
    springAmbushes(st, u, lines);
    return lines;
  }

  // Is the shot after a move on the move (one more needed)? Not after moving only within its own field (Steve)
  const shotOnTheMove = u => !u.stayedIn;

  function actHalfShot(st, u, target) {
    if (!u || !u.halfShot || u.x === null || !targets(st, u, true).includes(target)) return { ok: false };
    u.halfShot = false;
    // (firing instead of lying in ambush)
    u.mayAmbush = false;
    const moving = shotOnTheMove(u);
    const lines = [`🔫 ${u.name} ${moving ? 'moves and fires' : 'fires'} on ${target.name}: ` + fireAt(st, u, target, false, moving).join(', ')];
    springAmbushes(st, u, lines);
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  function moveLine(u, how) {
    if (how === 'cut') return `🚜 ${u.name} smashes through the ${hedgeWord()}, leaving a gap.`;
    if (how === 'climbed') return currentMap.ruins ? `🧗 ${u.name} climbs through the ruin.` : currentMap.blocks ? `🧗 ${u.name} climbs in through the windows of the building.` : `🧗 ${u.name} struggles over the hedge bank.`;
    if (how === 'flattened') return `🚜 ${u.name} flattens the barbed wire.`;
    if (how === 'snagged') return `🚜 ${u.name} flattens the barbed wire but gets snagged in it and stops.`;
    if (how === 'wirecut') return `✂️ ${u.name} cuts through the wire.`;
    return `➡️ ${u.name} moves up.`;
  }

  // Only rifle platoons charge into hand to hand (Steve: tanks can't fight hand to hand)
  const fightsHandToHand = u => u.kind === 'company';
  // An armoured car (Steve): a vehicle like a tank, but on wheels with thin armour
  const isCar = u => !!PIECES[u.kind].car;
  // What can hurt an armoured car besides anti-tank weapons: machine guns (Steve), not rifles
  const MACHINE_GUNS = ['mg', 'mg42', 'bunker_mg'];
  // (and a tank's own machine guns, Steve: a Panzer I at a carrier)
  const hurtsCars = u => MACHINE_GUNS.includes(u.kind) || (isTank(u) && PIECES[u.kind].soft > 0);

  // What it costs to go from one field into the next (Steve): one move, and CLIMB more for men climbing a hedge bank (it
  // stays standing); barbed wire stops men; tanks drive straight through both. null where it can't go at all
  function stepCost(st, u, fx, fy, x, y) {
    // (nobody goes into the sea: the Americans only leave it)
    if (!inside(x, y) || tileType(x, y) === 'river' || tileType(x, y) === 'sea' || PIECES[u.kind].fixed) return null;
    // Tank traps stop tanks (Steve)
    if (isTank(u) && featuresAt(st, x, y).some(f => FEATURES[f.kind].stopsTanks)) return null;
    // Nothing crosses a train (Steve): no going over the railway's side of a field an engine or carriage stands in
    if (trainAcross(st, fx, fy, x, y)) return null;
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
    const routes = routesWithin(st, u, budget, charging, false);
    // A tank on the road goes one further if it stays on it, road or lane or a mix of both (Steve). Not a shaken one: it goes
    // half as far
    if (!isTank(u) || u.shocked || !isRoad(u.x, u.y)) return routes;
    const reached = new Set(routes.map(r => `${r[r.length - 1].x},${r[r.length - 1].y}`));
    // (an armoured car two further, Steve)
    const further = routesWithin(st, u, budget + (isCar(u) ? CAR_ROAD_BONUS : TANK_ROAD_BONUS), charging, true);
    return routes.concat(further.filter(r => !reached.has(`${r[r.length - 1].x},${r[r.length - 1].y}`)));
  }

  // Is a field road or lane: a lane, a crossroads, a bridge, a street, or a square on the streets
  const ROADS = ['laneEW', 'laneNS', 'crossroads', 'bridge', 'street', 'square'];
  const isRoad = (x, y) => ROADS.includes(tileType(x, y));

  // The search itself. onRoadOnly: only by fields that are road or lane
  function routesWithin(st, u, budget, charging, onRoadOnly) {
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
        if (onRoadOnly && !isRoad(x, y)) continue;
        const cost = here.cost + c;
        if (cheapest[key] !== undefined && cheapest[key] <= cost) continue;
        const enemies = at(st, x, y, enemyOf(u.side));
        if (enemies.length) {
          // The enemy's field: only a charge goes in, to fight hand to hand, and it stops there
          // A rifle platoon fights hand to hand (not against tanks alone unless it can hurt them); a tank drives in on men
          // and they fall back (Steve), but not on other tanks or a dug-in gun
          // (a bunker can be stormed from the side or the back, never from in front of it, Steve)
          const facesBunker = enemies.some(e => isBunker(e) && inFrontOf(e, here));
          const platoonFights = !facesBunker && fightsHandToHand(u) && (enemies.some(e => !isTank(e)) || firepower(st, u).hard > 0);
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
        } else if (at(st, x, y).length || featuresAt(st, x, y).length) {
          // Friends there, or a building with no room left beside it: pass through, but not stop
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
    // A bunker never moves, nor a gun dug in for good
    if (isBunker(u) || isEmplaced(u)) return [];
    // The PaK: only to another field of the large village it stands in (Steve), straight there
    if (PIECES[u.kind].fixed) return villageFieldsFor(st, u).map(f => [{ x: f.x, y: f.y }]);
    // (routesFor decides who can go into an enemy's field: a rifle platoon to fight, a tank to drive the men out)
    return routesFor(st, u, reach(u, CHARGE_MOVES), true);
  }

  // The fields of the village a field belongs to, joined side by side (a lane between two villages parts them)
  function villageBlock(x, y) {
    if (tileType(x, y) !== 'village') return [];
    const block = [{ x, y }];
    for (let i = 0; i < block.length; i++) {
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = block[i].x + dx, ny = block[i].y + dy;
        if (!inside(nx, ny) || tileType(nx, ny) !== 'village' || block.some(f => f.x === nx && f.y === ny)) continue;
        block.push({ x: nx, y: ny });
      }
    }
    return block;
  }

  // The other fields a PaK can move to (Steve): only in a village of two fields or more (the whole block of houses it is
  // in), and only those with room for it and no enemy in them
  function villageFieldsFor(st, u) {
    const block = villageBlock(u.x, u.y);
    if (block.length < PAK_VILLAGE_FIELDS) return [];
    return block.filter(f => (f.x !== u.x || f.y !== u.y) && roomFor(st, u, f.x, f.y));
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

  // Can this piece go into ambush now: on its token, with its move still to make, and able to fire. The PaK also straight
  // after moving within its field, on the same token (Steve)
  function canAmbush(st, u) {
    if (u.mayAmbush && !st.computer && st.activeId === u.id) return true;
    return canAct(st, u) && mayFire(u);
  }

  // Go into ambush: it uses the piece's move and its token, and lasts until it fires or the round ends. A piece already
  // in sight isn't fired on until it moves or shoots
  function actAmbush(st, u) {
    if (!canAmbush(st, u)) return { ok: false };
    spend(st, u);
    u.ambush = true;
    // (lying in ambush instead of the shot it could have taken after moving within its field)
    u.halfShot = false;
    u.mayAmbush = false;
    // The captain gives up any rallies he has left too, as when he skips
    if (u.kind === 'captain') u.skipped = true;
    return { ok: true, lines: [`🪤 ${u.name} lies in ambush.`] };
  }

  // A piece has just moved or shot in the open: every enemy lying in ambush that can see it and hit it on 6 or less fires
  // now, once. Returns true if that stops it moving: wiped out, shaken, or losing men. passing: it is on its way through
  // this field, not lining any hedge in it
  function springAmbushes(st, mover, lines, passing = false) {
    let stopped = false;
    // (the computer's moves are reported on its list)
    const report = isRobot(st, mover.side) && st.computer ? st.computer.rep : lines;
    const place = mover.at;
    if (passing) mover.at = null;
    const waiting = st.units.filter(a => a.ambush && a.side !== mover.side && a.x !== null);
    for (const a of waiting) {
      // Already dead: nothing left to fire on
      if (mover.x === null) break;
      // Fired or killed already, in a chain of ambushes
      if (!a.ambush || a.x === null) continue;
      // Only what it can see, and hurt, and hit on 6 or less: otherwise it keeps waiting
      if (!targets(st, a).includes(mover) || shotNeed(st, a, mover) > MAX_NEED) continue;
      a.ambush = false;
      const wasShaken = mover.shocked, strength = mover.platoons, shotsBefore = st.fx.length;
      report.push(`🪤 ${a.name} springs its ambush on ${mover.name}: ${fireAt(st, a, mover).join(', ')}`);
      // These shots land where it is now, not where it is going (the table)
      for (let k = shotsBefore; k < st.fx.length; k++) st.fx[k].midMove = true;
      if (mover.x === null || mover.platoons < strength || (mover.shocked && !wasShaken)) stopped = true;
      // Firing gives it away in turn, to any ambush of the other side that can see it (Steve: shooting sets one off).
      // Each fires once, so the chain ends
      if (a.x !== null) springAmbushes(st, a, report);
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
      const from = { x: u.x, y: u.y };
      let how = step(st, u, p.x, p.y);
      // (an armoured car, on wheels, gets snagged more often, Steve)
      if (how === 'flattened' && !p.pass && st.rand() < (isCar(u) ? CAR_WIRE_SNAG : WIRE_SNAG)) {
        how = 'snagged';
        u.snagged = true;
        // Caught half way through (Steve): the table shows it across the edge, facing on, the wire dragged round it
        u.snag = from;
        u.aim = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 }[dirTo(from, p)];
      }
      if (how) lines.push(moveLine(u, how).replace(/\.$/, ''));
      lines.push(...takeMineLines(st));
      // Blown up by a mine on the way: nothing more
      if (u.x === null) { u.snagged = true; break; }
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
    if (side === undefined || u.x === null) return;
    u.at = freePlace(st, u, u.x, u.y, side);
    // Where it stands decides what it can see past the hedges: a tank faces the nearest enemy from there (Steve)
    if (isTank(u)) faceEnemy(st, u);
  }

  function actCharge(st, u, x, y, side) {
    const route = canAct(st, u) && chargeRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    const from = { x: u.x, y: u.y };
    const lines = chargeAlong(st, u, route, side);
    // The PaK moved to another field of its village: it faces as it does moving within a field, and can lie in ambush
    if (PIECES[u.kind].fixed && u.x !== null) {
      const toMiddle = !side || side === 'c';
      u.aim = toMiddle ? faceBackTo(u, from) : faceOut(u.at, side);
      u.mayAmbush = true;
    }
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // A charge along its route, either side: it stands where it was sent (side), if it gets there. Returns the lines to report
  function chargeAlong(st, u, route, side) {
    const goal = route[route.length - 1], x = goal.x, y = goal.y;
    const lines = [];
    // The fields before the goal are crossed on the way
    const home = { x: u.x, y: u.y, at: u.at };
    lines.push(...followRoute(st, u, route));
    // Snagged on wire on the way, or stopped by an ambush: it gets no further
    if (u.snagged) return lines;
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
    return lines;
  }

  // The other places in its own field a piece could move to (not where it is; where it fits among the others). The PaK
  // too (Steve): it never leaves its field, but it can be moved about in it
  function lineSides(st, u) {
    if (isBunker(u)) return [];
    // A gun in a fixed position can't move, but it can turn (Steve): any pair of areas round it, to face out that way
    if (isEmplaced(u)) return anchorsFor(u).filter(p => p !== u.at);
    return anchorsFor(u).filter(p => p !== u.at && fitsAt(st, u, u.x, u.y, p));
  }

  // The eight ways out of a field, as angles on the table (Steve: the PaK faces out of its square)
  const FACING = { e: 0, ne: Math.PI / 4, n: Math.PI / 2, nw: 3 * Math.PI / 4, w: Math.PI, sw: -3 * Math.PI / 4, s: -Math.PI / 2, se: -Math.PI / 4 };

  // Which way out of its field the PaK faces, standing in a pair of areas: the area clicked, if that is one of them and
  // not the middle; otherwise the pair's corner, or its edge
  function faceOut(place, clicked) {
    const areas = place.split('+');
    if (clicked && clicked !== 'c' && areas.includes(clicked)) return FACING[clicked];
    const corner = areas.find(k => CORNERS.includes(k));
    return FACING[corner || areas.find(k => k !== 'c')];
  }

  // The PaK sent to the middle of its field faces the way it came from (Steve), to the nearest of the eight ways
  function faceWayItCame(u, from) {
    const was = spotXY(u, from);
    const angle = Math.atan2(0 - was.y, was.x);
    return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  }

  // The same from another field: the way it came, to the nearest of the eight ways
  function faceBackTo(u, from) {
    const angle = Math.atan2(u.y - from.y, from.x - u.x);
    return Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  }

  // Where the PaK goes for an area clicked: a free pair with that area in it, so every click on its field moves it and
  // every way out can be faced; if none is free, the nearest place it fits. For the middle, the pair nearest where it was
  function pakPlaceFor(st, u, side) {
    const wanted = side || 'c';
    const was = spotXY(u);
    const farFromHere = p => { const q = spotXY(u, p); return Math.hypot(q.x - was.x, q.y - was.y); };
    const pairs = lineSides(st, u).filter(p => p.split('+').includes(wanted));
    if (wanted === 'c') pairs.sort((a, b) => farFromHere(a) - farFromHere(b));
    return pairs[0] || freePlace(st, u, u.x, u.y, side);
  }

  // Move to another area of its own field (Steve: north hedge to south hedge, say): the piece's move for the round, and
  // it may fire after with nothing more needed for moving (Steve: moving within its square has no Move & shoot penalty).
  // Machine guns still can't fire after moving, and the PaK can only lie in ambush. The area clicked, or the nearest place it fits
  function actLine(st, u, side) {
    if (!canAct(st, u) || !lineSides(st, u).length) return { ok: false };
    const isPak = !!PIECES[u.kind].fixed;
    // The 88 (Steve: it can turn): it stays where it is, facing out of its field the way clicked
    if (isEmplaced(u)) {
      const way = side && side !== 'c' ? side : null;
      if (!way) return { ok: false };
      spend(st, u);
      u.aim = FACING[way];
      u.mayAmbush = true;
      return { ok: true, lines: [`↪️ ${u.name} turns to face ${SIDE_NAMES[way[0]] || way}${way.length > 1 ? (way[1] === 'e' ? '-east' : '-west') : ''}.`] };
    }
    const to = isPak ? pakPlaceFor(st, u, side) : freePlace(st, u, u.x, u.y, side);
    if (to === u.at || !lineSides(st, u).includes(to)) return { ok: false };
    spend(st, u);
    // The PaK faces out of its square, one of eight ways, until it next fires (Steve); sent to the middle, the way it came
    const toMiddle = !side || side === 'c';
    if (isPak) u.aim = toMiddle ? faceWayItCame(u, u.at) : faceOut(to, side);
    // (a snagged tank tears free)
    u.snag = null;
    // (a move that may fire after, like a Move & shoot: the captain can still fire only with a rally to spare)
    if (u.kind === 'captain' && mayFire(u)) u.fired = true;
    standAt(st, u, to);
    const lines = [`🌳 ${u.name} moves to ${placeName(u.at)}`];
    springAmbushes(st, u, lines);
    // The shot after: no moving penalty (Steve); still only for pieces that can fire after moving at all
    u.stayedIn = true;
    u.halfShot = u.x !== null && firesOnTheMove(u) && targets(st, u, true).length > 0;
    // Or it can lie in ambush on the same go instead (Steve: the PaK first, then every piece moving within its square)
    u.mayAmbush = u.x !== null && (!!PIECES[u.kind].fixed || mayFire(u));
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // Shocked friendly pieces a captain can reach
  function rallyTargets(st, cap) {
    // Shaken pieces, and pieces down in cover, up to RALLY_RANGE fields away
    // (himself too)
    const needsHim = t => t.shocked || (t.down && t.acted);
    return st.units.filter(t => t.side === cap.side && t.x !== null && needsHim(t) && fieldsApart(t, cap) <= RALLY_RANGE);
  }

  // A shaken piece uses its move to pull itself together (Steve: pieces can rally themselves; a rally always works)
  function canSelfRally(st, u) {
    return !!u && u.side === st.human && u.x !== null && u.shocked && !u.acted && !st.won && !st.lost && !st.computer && u.kind !== 'captain' && tokenAllows(st, u);
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

  // Fields the player can call fire on: an enemy piece there that their pieces can see, and none of their own there
  function canCallFire(st, x, y) {
    if (!inside(x, y) || at(st, x, y, st.human).length) return false;
    return at(st, x, y, enemyOf(st.human)).some(t => sees(st, st.human, t));
  }

  // A side's mortars or artillery: their numbers (Steve: the differences between the sides stay)
  function gunStats(which, side) {
    const usual = which === 'mortars' ? (side === 'de' ? DE_MORTAR : MORTARS) : (side === 'de' ? DE_ARTILLERY : ARTILLERY);
    // A map can give a side's guns another name (Steve: Dunkirk's destroyers), with the same numbers
    const renamed = currentMap.guns && currentMap.guns[side] && currentMap.guns[side][which];
    if (!renamed) return usual;
    return Object.assign({}, usual, { name: renamed });
  }

  // A side's bomber by name: the map can name its own (Steve: the RAF's Blenheim at Dunkirk)
  function bomberName(side) {
    const renamed = currentMap.guns && currentMap.guns[side] && currentMap.guns[side].bomber;
    return renamed || BOMBER_NAMES[side];
  }

  // The fields a fire mission's shells fall on (Steve: shown round the target before firing): the target's field (main),
  // and for guns with splash the four fields next to it
  function shellFields(which, x, y, side = 'us') {
    const S = gunStats(which, side);
    // The target's field always
    const fields = [{ x, y, main: true }];
    // Mortars stop there; the guns' blast reaches the fields next to it
    if (!S.splash) return fields;
    for (const [dx, dy] of NEIGHBOURS) if (inside(x + dx, y + dy)) fields.push({ x: x + dx, y: y + dy, main: false });
    return fields;
  }

  // A fire mission from the mortars or the guns: dice on every piece in the field, and a few on the fields round it
  function fireMission(st, which, x, y, side = 'us') {
    const S = gunStats(which, side);
    const lines = [];
    // Round the target the shells fall on friend and foe alike (Steve): artillery can hit your own pieces there
    const hitField = (fx, fy, n, splash = false) => {
      const caught = splash ? at(st, fx, fy) : at(st, fx, fy, enemyOf(side));
      for (const t of caught) {
        if (t.x === null) continue;
        // What each die needs (nobody gets down as the shells come in, Steve)
        const need = shellNeed(st, t);
        const faces = [];
        // Against a tank only the anti-tank dice count (its armour is in need); against men every die
        // (a bunker: one die, like a tank; from mortars it only shakes)
        const heavy = isTank(t) || isBunker(t);
        const rolled = heavy ? roll(st, S.hard || 0, need, faces) : roll(st, n, need, faces);
        const onlyShakes = isBunker(t) && which === 'mortars';
        const soft = !heavy || onlyShakes ? rolled : 0, hard = heavy && !onlyShakes ? rolled : 0;
        const before = t.platoons, wasShocked = t.shocked;
        const shakeOnly = which === 'mortars' && isTank(t);
        const hurt = damage(st, t, soft, hard, false, shakeOnly);
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
    checkDraw(st);
    return lines;
  }

  // Two humans (Steve): the other player's pieces a shot or a gun is about to fall on, to be asked Stand fast or Take cover
  // before it does. which: 'shot', 'artillery', 'mortars' or 'bomber'. None when the other side is a robot: it decides
  // for itself as the dice are thrown
  function piecesToAsk(st, which, x, y, target) {
    const foe = enemyOf(st.human);
    if (isRobot(st, foe)) return [];
    let pieces = [];
    // Nobody takes cover from mortars, artillery or bombs (Steve): only a shot from a piece is asked about
    if (which === 'shot') pieces = target ? [target] : [];
    return pieces.filter(p => canReact(st, p));
  }

  // The player's mortars or artillery. target: the piece clicked, for German mortars, which drop on one piece only
  function actFire(st, which, x, y, target) {
    // The bomber has its own way of going in
    if (which === 'bomber') return actBomb(st, x, y);
    const side = st.human;
    if (st.won || st.lost || st.computer || st.fired[side][which] || st.ammo[side][which] <= 0 || !canCallFire(st, x, y)) return { ok: false };
    // German mortars need a piece to drop on, one they can see: the one clicked, or the first in the field
    const onOnePiece = which === 'mortars' && side === 'de';
    const seen = onOnePiece ? at(st, x, y, enemyOf(side)).filter(t => sees(st, side, t)) : [];
    const piece = onOnePiece ? (seen.includes(target) ? target : seen[0]) : null;
    if (onOnePiece && !piece) return { ok: false };
    // With the bag: on the player's token not yet used by a piece; firing uses the token (Steve: the guns are in the bag)
    if (st.tokens && (st.drawn !== side || st.activeId)) return { ok: false };
    if (st.tokens) { st.activeId = 'gun:' + which; activated(st, { side, gun: which }); }
    st.fired[side][which] = true;
    st.ammo[side][which]--;
    const S = gunStats(which, side);
    const lines = onOnePiece ? mortarOnOnePiece(st, piece, false) : fireMission(st, which, x, y, side);
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
  function bomberAims() {
    const fields = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) fields.push({ x, y });
    return fields;
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
    return BOMBER.need + place + armourOf(t) + (t.down ? TAKE_COVER : 0) + (isBunker(t) ? BUNKER_FRONT : 0);
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
        // The score it needs (nobody gets down as the bomber comes over, Steve)
        const need = bombNeed(st, t);
        const faces = [];
        const hits = roll(st, BOMBER.dice, need, faces);
        // A hit works like a mortar's (Steve): it shakes, a coin toss says if it wounds; on a tank, as an anti-tank die
        const soft = isTank(t) || isBunker(t) ? 0 : hits;
        const hard = isTank(t) || isBunker(t) ? hits : 0;
        const before = t.platoons, wasShaken = t.shocked;
        const hurt = damage(st, t, soft, hard);
        lines.push(...(t.side === side ? hurt.map(l => `⚠️ friendly fire: ${l}`) : hurt));
        // What it did, for the words on the table
        const lost = before - (t.x === null ? 0 : t.platoons);
        const result = t.x === null ? 'Wiped out' : lost ? (isTank(t) ? 'Tank knocked out' : 'Section lost') : t.shocked && !wasShaken ? 'Shaken' : hits ? 'No effect' : 'Missed';
        st.fx.push({ kind: 'bomb', x: field.x, y: field.y, faces, need, side, to: { id: t.id }, result, support: 'bomber', along: field.t, tookCover: false });
      }
    }
    checkDraw(st);
    return lines;
  }

  // The best line for a side's bomber this round, by its compass: the chosen field and what the line is worth; null if
  // no line is worth flying (it would catch too few of the enemy, or too many of its own)
  function bestBomberRun(st, side) {
    const heading = bomberHeading(st, side);
    let best = null;
    for (const aim of bomberAims()) {
      let worth = 0;
      for (const field of bomberLine(aim.x, aim.y, heading)) {
        for (const t of at(st, field.x, field.y)) worth += t.side === side ? -1.5 : 1;
      }
      if (!best || worth > best.worth) best = { x: aim.x, y: aim.y, worth };
    }
    return best && best.worth >= BOMBER.worth ? best : null;
  }

  // Your bomber sent through a field, anywhere on the board
  function actBomb(st, x, y) {
    const side = st.human;
    if (st.won || st.lost || st.computer || st.fired[side].bomber || st.ammo[side].bomber <= 0 || !inside(x, y)) return { ok: false };
    // With the bag: on the player's token not yet used by a piece; flying uses the token
    if (st.tokens && (st.drawn !== side || st.activeId)) return { ok: false };
    if (st.tokens) { st.activeId = 'gun:bomber'; activated(st, { side, gun: 'bomber' }); }
    st.fired[side].bomber = true;
    st.ammo[side].bomber--;
    const lines = dropBombs(st, side, x, y);
    return { ok: true, lines: [`✈️ The ${bomberName(side)} flies over: ${lines.length ? lines.join(', ') : 'no hits'}.`] };
  }

  // ---------- The Germans ----------

  // What a German piece would most like to shoot: tanks for anti-tank weapons, otherwise the weakest infantry
  // (only proper shots: a Hail Mary is for when it has nothing better to do, see germanAct)
  function bestTarget(st, u, moving = false) {
    const ts = targets(st, u).filter(t => shotNeed(st, u, t, moving) <= MAX_NEED);
    if (!ts.length) return null;
    return ts.sort((a, b) => targetScore(st, u, b) - targetScore(st, u, a))[0];
  }

  // How much a German piece wants to shoot this target from where it stands
  function targetScore(st, u, t) {
    const f = firepower(st, u);
    // (a machine gun on an armoured car: its own dice)
    const diceAt = isTank(t) ? (isCar(t) && hurtsCars(u) ? f.soft : f.hard * 2) : menDice(f);
    return diceAt * (7 - TO_HIT - cover(st, u, t) + closeBonus(u, t) - bunkerExtra(u, t)) / 2 + (t.shocked ? 1 : 0) - t.platoons * 0.1;
  }

  // Where a German piece is heading: its post, or (reserves) the objective if nobody holds it, else the nearest American
  function computerGoal(st, u) {
    if (u.side === 'us') return americanGoal(st, u);
    // On the way to its post, or back to it
    if (u.post && !u.reserve) return u.post;
    // A reserve rifle platoon goes to hold the objective if no platoon does
    const garrison = at(st, st.objective.x, st.objective.y, 'de').some(g => g.kind === 'company');
    if (!garrison && u.kind === 'company') return st.objective;
    // The rest make for the nearest American
    const far = o => fieldsApart(o, u);
    const us = st.units.filter(o => o.side === 'us' && o.x !== null).sort((a, b) => far(a) - far(b));
    return us[0] || st.objective;
  }

  // A German piece's Move & shoot (Steve): the route and place with the shot it most wants, needing 6 or less after the
  // +1 for moving, the nearer its goal the better. null if it has none, or if it stands in the objective: it holds that
  function bestMoveShoot(st, u) {
    if (u.x === st.objective.x && u.y === st.objective.y) return null;
    // (the American computer keeps the village's yard free for its rifle platoons)
    const routes = moveShootRoutes(st, u).filter(route => !blocksTheVillage(st, u, route[route.length - 1]));
    if (!routes.length) return null;
    const goal = computerGoal(st, u);
    const home = { x: u.x, y: u.y, at: u.at };
    let best = null;
    // For each field it could reach
    for (const route of routes) {
      const end = route[route.length - 1];
      u.x = end.x; u.y = end.y;
      const away = fieldsApart(end, goal);
      // For each place it fits in that field: what it could fire on from there
      for (const place of anchorsFor(u)) {
        if (!fitsAt(st, u, end.x, end.y, place)) continue;
        u.at = place;
        const t = bestTarget(st, u, true);
        if (!t) continue;
        const score = targetScore(st, u, t) - away * 0.1;
        if (!best || score > best.score) best = { route, place, score };
      }
    }
    // (only tried out: it goes back to where it stands)
    u.x = home.x; u.y = home.y; u.at = home.at;
    return best;
  }

  // A German piece has just moved: the shot it now takes, needing one more for moving, if it has a proper one
  function shotAfterMove(st, u, moved) {
    // Killed on the way by an ambush: nothing more
    if (u.x === null) return null;
    const t = bestTarget(st, u, true);
    // Stopped short with nothing it can hit
    if (!t) { computerSays(st, moved); return null; }
    computerSays(st, `${moved}, fires on ${t.name}`);
    return { shooter: u.id, target: t.id, moving: true };
  }

  // A place from which the PaK would have a proper shot, { x, y, place }: in its own field, or another of its large village
  // (Steve); null if there is none
  function placeWithAShot(st, u) {
    const home = { x: u.x, y: u.y, at: u.at };
    let found = null;
    const fields = [{ x: u.x, y: u.y }, ...villageFieldsFor(st, u)];
    for (const f of fields) {
      u.x = f.x; u.y = f.y;
      for (const place of anchorsFor(u)) {
        const samePlace = f.x === home.x && f.y === home.y && place === home.at;
        if (samePlace || !fitsAt(st, u, f.x, f.y, place)) continue;
        u.at = place;
        if (bestTarget(st, u)) { found = { x: f.x, y: f.y, place }; break; }
      }
      if (found) break;
    }
    // (only tried out: it goes back to where it stands)
    u.x = home.x; u.y = home.y; u.at = home.at;
    return found;
  }

  // How many fields apart two places are for someone walking: round a river by the bridges, otherwise the same as fieldsApart.
  // Worked out once for each place on each map
  const walkTables = new Map();
  function walkDistance(from, to) {
    const key = to.x + ',' + to.y;
    if (!walkTables.has(key)) walkTables.set(key, walkTableTo(to));
    return walkTables.get(key)[from.y][from.x];
  }
  function walkTableTo(to) {
    const table = MAPS[0].rows.map(row => [...row].map(() => Infinity));
    table[to.y][to.x] = 0;
    const open = [{ x: to.x, y: to.y }];
    for (let i = 0; i < open.length; i++) {
      const here = open[i];
      for (const [dx, dy] of NEIGHBOURS) {
        const x = here.x + dx, y = here.y + dy;
        if (!inside(x, y) || tileType(x, y) === 'river' || table[y][x] !== Infinity) continue;
        table[y][x] = table[here.y][here.x] + 1;
        open.push({ x, y });
      }
    }
    return table;
  }

  // Where a German piece moves towards a goal (Steve: the same rules as yours): any route a Charge of yours could take,
  // as far, staying out of American fields; men climb hedge banks (the hedge stays) and are stopped by wire, tanks
  // drive through. The route that ends nearest the goal, if it gets any nearer
  function routeToward(st, u, goal) {
    // (as men walk it: a river has to be crossed by a bridge)
    const far = p => walkDistance(p, goal);
    let best = null, bestD = far(u);
    for (const route of routesFor(st, u, reach(u, CHARGE_MOVES), false)) {
      const end = route[route.length - 1];
      if (blocksTheVillage(st, u, end)) continue;
      if (far(end) < bestD) { bestD = far(end); best = route; }
    }
    return best;
  }

  // The rallying on the computer's token, either side. Returns true if that was the piece's go
  function computerRallies(st, u) {
    const rep = st.computer.rep;
    const far = t => fieldsApart(t, u);
    // The captain (Steve): first he rallies the nearest shaken piece of his in reach, himself too. Not from cover
    if (u.kind === 'captain' && !u.down) {
      const shaken = st.units.filter(t => t.side === u.side && t.x !== null && t.shocked && far(t) <= RALLY_RANGE).sort((a, b) => far(a) - far(b));
      if (shaken.length) {
        const t = shaken[0];
        // A rally always works (Steve)
        t.shocked = false;
        rallyShown(st, t);
        computerSays(st, `Rallies ${t === u ? 'himself' : t.name}`);
        rep.push(`📣 ${u.name} rallies ${t.name}.`);
        return true;
      }
    }
    // A shaken piece can use its move to rally itself, as yours can (Steve: the same rules). It does, unless it has a shot
    // and its captain is near enough to rally it for it
    if (!u.shocked || u.kind === 'captain') return false;
    const captain = st.units.find(c => c.side === u.side && c.kind === 'captain' && c.x !== null);
    const captainNear = captain && far(captain) <= RALLY_RANGE;
    if (captainNear && bestTarget(st, u)) return false;
    u.shocked = false;
    rallyShown(st, u);
    computerSays(st, 'Pulls itself together');
    rep.push(`📣 ${u.name} pulls itself together.`);
    return true;
  }

  // What one German piece does: throw Americans out of the hamlet, counterattack a shaken company, shoot, or (reserves) move up.
  // Returns a planned shot { shooter, target } instead of firing, so the target can be offered a chance to pull back
  function germanAct(st, u) {
    const rep = st.computer.rep;
    // Until it does something else, it holds its ground (what the table's word bubble says, Steve)
    computerSays(st, 'Holds its ground');
    if (computerRallies(st, u)) return null;
    const inHamlet = at(st, st.objective.x, st.objective.y, 'us').length > 0;
    // (wire stops their men as it stops yours, Steve)
    const noWire = o => !wire(st, u.x, u.y, o.x, o.y);
    if (inHamlet && !u.shocked && fightsHandToHand(u) && adjacent(u, st.objective) && noWire(st.objective)) {
      computerSays(st, `Charges into ${st.objective.name}`);
      // Setting off in sight of an ambush: stopped, it gets no further
      if (springAmbushes(st, u, [])) return null;
      rep.push('🔺 ' + charge(st, u, st.objective.x, st.objective.y).join(', ') + '.');
      return null;
    }
    const weak = st.units.find(t => t.side === 'us' && t.x !== null && t.kind === 'company' && adjacent(u, t) && noWire(t) && t.shocked);
    if (u.kind === 'company' && !u.shocked && u.platoons >= 2 && weak && st.rand() < 0.5) {
      computerSays(st, `Charges ${weak.name}`);
      if (springAmbushes(st, u, [])) return null;
      rep.push('🔺 ' + charge(st, u, weak.x, weak.y).join(', ') + '.');
      return null;
    }
    // Dunkirk (Steve): the Germans are attacking, so they push on for the beach, firing as they go, rather than stand and shoot
    if (st.evac && !PIECES[u.kind].fixed) {
      const pushed = computerMovesToFire(st, u);
      if (pushed) return pushed.shot;
    }
    const t = bestTarget(st, u);
    if (t) { computerSays(st, `Fires on ${t.name}`); return { shooter: u.id, target: t.id }; }
    // The PaK with no shot from here (Steve: it can move within its field): to a place in the field that has one. It
    // can't fire after moving, but it lies in ambush there on the same go
    // The 88 with no shot (Steve: it can turn): its shield round to the nearest enemy it can see, and it waits for them
    if (isEmplaced(u)) {
      const seen = st.units.filter(e => e.side !== u.side && e.x !== null && sight(st, u, e));
      if (seen.length) {
        const far = e => Math.hypot(e.x - u.x, e.y - u.y);
        const e = seen.sort((a, b) => far(a) - far(b))[0];
        const way = Math.round(Math.atan2(-(e.y - u.y), e.x - u.x) / (Math.PI / 4)) * (Math.PI / 4);
        if (Math.abs(way - (u.aim === undefined ? Math.PI : u.aim)) > 1e-6) {
          u.aim = way;
          computerSays(st, `Turns to face ${e.name}`);
          rep.push(`↪️ ${u.name} turns to face ${e.name} and lies in ambush.`);
          u.ambush = true;
          return null;
        }
      }
    }
    if (isAtGun(u) && !isEmplaced(u)) {
      const spot = placeWithAShot(st, u);
      if (spot) {
        // (to another field of its village, if that is where the shot is)
        if (spot.x !== u.x || spot.y !== u.y) step(st, u, spot.x, spot.y);
        u.at = spot.place;
        u.aim = faceOut(spot.place);
        computerSays(st, 'Moves its gun and lies in ambush');
        rep.push(`🌳 ${u.name} moves to ${placeName(u.at)} and lies in ambush.`);
        springAmbushes(st, u, []);
        if (u.x !== null) u.ambush = true;
        return null;
      }
    }
    const moved = computerMovesToFire(st, u);
    if (moved) return moved.shot;
    // On the way to its post: march there and dig in
    if (u.post && !u.reserve && (u.x !== u.post.x || u.y !== u.post.y)) {
      const route = routeToward(st, u, u.post);
      if (route) { computerSays(st, 'Marches to its post'); computerMove(st, u, route); return null; }
    }
    // Reserves: a company goes to hold the hamlet if nobody does; the rest move up towards the nearest Americans
    if (u.reserve) {
      const holding = u.x === st.objective.x && u.y === st.objective.y && u.kind === 'company';
      if (holding) computerSays(st, `Holds ${st.objective.name}`);
      const garrison = at(st, st.objective.x, st.objective.y, 'de').some(g => g.kind === 'company');
      const us = st.units.filter(o => o.side === 'us' && o.x !== null);
      const near = us.sort((a, b) => (fieldsApart(a, u)) - (fieldsApart(b, u)))[0];
      const goal = (!garrison && u.kind === 'company') || !near ? st.objective : near;
      const route = holding ? null : routeToward(st, u, goal);
      if (route) { computerSays(st, goal === st.objective ? `Moves up to hold ${st.objective.name}` : `Moves up towards ${near.name}`); computerMove(st, u, route); return null; }
    }
    return computerLastResort(st, u);
  }

  // No shot from where it stands: either computer player moves to get one. Enemies just across a hedge it isn't lining: to
  // that hedge. Otherwise a Move & shoot, if that would give it one (Steve: it does that rather than just marching). As with
  // yours, it may fire after, one more needed for moving. Returns { shot }, with any shot it plans, or null if it didn't move
  function computerMovesToFire(st, u) {
    const across = st.units.find(o => o.side !== u.side && o.x !== null && acrossHedge(st, u, o) && !atHedge(u, o));
    if (across && !PIECES[u.kind].fixed) {
      computerSays(st, `Lines the ${hedgeWord()} facing ${across.name}`);
      u.at = freePlace(st, u, u.x, u.y, dirTo(u, across));
      springAmbushes(st, u, []);
      return { shot: shotAfterMove(st, u, `Lines the ${hedgeWord()} facing ${across.name}`) };
    }
    const plan = bestMoveShoot(st, u);
    if (!plan) return null;
    const lines = moveToShoot(st, u, plan.route, plan.place);
    st.computer.rep.push('🔺 ' + lines.join(', ') + '.');
    return { shot: shotAfterMove(st, u, 'Moves up') };
  }

  // Nothing better to do: a Hail Mary, if it has anyone in reach. No one in reach and nowhere to go: it lies in wait.
  // Returns any shot it plans
  function computerLastResort(st, u) {
    const longShot = targets(st, u)[0];
    if (longShot) { computerSays(st, `Hail Mary at ${longShot.name}`); return { shooter: u.id, target: longShot.id }; }
    if (mayFire(u)) {
      u.ambush = true;
      computerSays(st, 'Lies in ambush');
      st.computer.rep.push(`🪤 ${u.name} lies in ambush.`);
    }
    return null;
  }

  // ---------- The American computer (Steve: the player can be the Germans) ----------

  // Where an American piece is heading: a rifle platoon to the village, the captain after his strongest platoon, the
  // rest at the nearest German
  function americanGoal(st, u) {
    if (u.kind === 'company') return st.objective;
    const far = o => fieldsApart(o, u);
    if (u.kind === 'captain') {
      const platoons = st.units.filter(o => o.side === 'us' && o.x !== null && o.kind === 'company').sort((a, b) => b.platoons - a.platoons);
      if (platoons.length) return platoons[0];
    }
    const germans = st.units.filter(o => o.side === 'de' && o.x !== null).sort((a, b) => far(a) - far(b));
    return germans[0] || st.objective;
  }

  // Would this field shut the American computer's rifle platoons out of the village? Only a platoon or the captain takes it
  // (Steve), so nothing else stops there
  function blocksTheVillage(st, u, field) {
    return u.side === 'us' && !st.evac && !takesGoal(u) && field.x === st.objective.x && field.y === st.objective.y;
  }

  // The charge a rifle platoon of the American computer would make: into the village if nobody is there or it has more
  // bases than they have, or at any field it outnumbers. Standing in the village, it stays and holds it. null if none
  function americanCharge(st, u) {
    if (u.kind !== 'company' || st.evac) return null;
    const inVillage = u.x === st.objective.x && u.y === st.objective.y;
    if (inVillage) return null;
    const endOf = route => route[route.length - 1];
    const basesAt = field => at(st, field.x, field.y, 'de').reduce((n, g) => n + g.platoons, 0);
    const routes = chargeRoutes(st, u);
    const intoVillage = routes.find(r => endOf(r).x === st.objective.x && endOf(r).y === st.objective.y);
    if (intoVillage) {
      const held = basesAt(endOf(intoVillage));
      if (!held) return { route: intoVillage, what: `Charges into ${st.objective.name}` };
      if (!u.shocked && u.platoons > held) return { route: intoVillage, what: `Storms ${st.objective.name}` };
    }
    if (u.shocked) return null;
    const weak = routes.find(r => basesAt(endOf(r)) > 0 && basesAt(endOf(r)) < u.platoons);
    if (!weak) return null;
    const names = at(st, endOf(weak).x, endOf(weak).y, 'de').map(g => g.name).join(' and ');
    return { route: weak, what: `Charges ${names}` };
  }

  // What one American piece does on the computer's token: rally, charge, shoot from here, line a hedge, Move & shoot,
  // march on its goal; a Hail Mary or an ambush with nothing better. Returns a planned shot, as germanAct does
  function americanAct(st, u) {
    // (Dunkirk: the British computer, Steve)
    if (st.evac) return britishAct(st, u);
    const rep = st.computer.rep;
    computerSays(st, 'Holds its ground');
    if (computerRallies(st, u)) return null;
    const attack = americanCharge(st, u);
    if (attack) {
      computerSays(st, attack.what);
      rep.push('🔺 ' + chargeAlong(st, u, attack.route).join(', ') + '.');
      return null;
    }
    const t = bestTarget(st, u);
    if (t) { computerSays(st, `Fires on ${t.name}`); return { shooter: u.id, target: t.id }; }
    const moved = computerMovesToFire(st, u);
    if (moved) return moved.shot;
    // On towards its goal
    const goal = computerGoal(st, u);
    const route = routeToward(st, u, goal);
    if (route) {
      computerSays(st, goal === st.objective ? `Moves up towards ${st.objective.name}` : `Moves up towards ${goal.name}`);
      computerMove(st, u, route);
      return null;
    }
    return computerLastResort(st, u);
  }

  // What the computer's piece or gun on this token is doing, in a few words, for its word bubble on the table (Steve)
  function computerSays(st, what) {
    if (st.computer && st.computer.move) st.computer.move.what = what;
  }

  // A German piece goes along its route, as yours do: climbing hedge banks on foot, a tank driving through and leaving
  // a gap; the table shows the way it went
  function computerMove(st, u, route) {
    followRoute(st, u, route);
    if (u.snagged) return;
    const goal = route[route.length - 1];
    step(st, u, goal.x, goal.y);
    // (what a mine did goes in the computer's report)
    const mined = takeMineLines(st);
    if (st.computer && st.computer.rep) st.computer.rep.push(...mined);
    if (u.x === null) return;
    setTrail(st, u, route);
    // Arriving in sight of an ambush
    springAmbushes(st, u, []);
  }

  // The German mortar picks the strongest American company next to a German field
  // The German artillery's target: the American piece in a field the Germans can see with the most Americans in and round
  // it, and no Germans in or next to it (they don't shell their own men)
  // (either side: the American computer's artillery chooses the same way)
  function artilleryTarget(st, side) {
    const near = (a, b) => fieldsApart(a, b) <= 1;
    const enemies = st.units.filter(t => t.side === enemyOf(side) && t.x !== null);
    const friends = st.units.filter(g => g.side === side && g.x !== null);
    const ts = enemies.filter(t => sees(st, side, t) && !friends.some(g => near(g, t)));
    const score = t => enemies.filter(o => near(o, t)).reduce((n, o) => n + o.platoons, 0);
    return ts.sort((a, b) => score(b) - score(a))[0] || null;
  }

  // A tank too (Steve: all mortars have an anti-tank die): first of all one already shaken, as a hit kills it; otherwise
  // only when there is no platoon to fire on
  // The American computer's mortars aren't tied to a piece next to the target (they fire as a player's do): any German
  // it can see, in a field with no Americans
  function mortarTarget(st, side) {
    const inReach = side === 'de'
      ? t => sees(st, 'de', t) && st.units.some(g => g.side === 'de' && g.x !== null && adjacent(g, t))
      : t => sees(st, 'us', t) && !at(st, t.x, t.y, 'us').length;
    const ts = st.units.filter(t => t.side === enemyOf(side) && t.x !== null && (t.kind === 'company' || isTank(t)) && inReach(t));
    const worth = t => (isTank(t) ? (t.shocked ? 9 : 0) : t.platoons);
    return ts.sort((a, b) => worth(b) - worth(a))[0] || null;
  }

  // German mortars drop on one piece (Steve: the differences between the sides stay), with or without its men getting
  // down first. Returns the lines to report
  function mortarOnOnePiece(st, t, withdraw) {
    // (who it is at: the table keeps that piece on show until the bomb lands, Steve)
    const fx = { x: t.x, y: t.y, kind: 'shell', support: 'mortars', to: { id: t.id } };
    // Taking cover from the mortar: its men get down before the bombs land
    const pre = withdraw ? takeCover(st, t) : null;
    const need = shellNeed(st, t);
    const faces = [];
    // One anti-tank die on a tank, which it can only shake (or kill if already shaken); all the dice on men
    const onTank = isTank(t);
    const hits = roll(st, onTank ? DE_MORTAR.hard : DE_MORTAR.dice, need, faces);
    fx.faces = faces; fx.need = need; fx.side = 'de'; fx.tookCover = !!pre;
    const before = t.platoons, wasShaken = t.shocked;
    const hurt = onTank ? damage(st, t, 0, hits, false, true) : damage(st, t, hits, 0);
    const lost = before - (t.x === null ? 0 : t.platoons);
    fx.result = t.x === null ? 'Wiped out' : lost ? 'Section lost' : t.shocked && !wasShaken ? 'Shaken' : hits ? 'No effect' : 'Missed';
    st.fx.push(fx);
    return (pre ? [pre.line] : []).concat(hurt);
  }

  // Carry out a planned German shot (or mortar mission), with or without the target pulling back
  function resolveShot(st, shot, withdraw) {
    const t = unitById(st, shot.target);
    if (t.x === null) return;
    if (shot.mortar) {
      st.ammo.de.mortars--;
      // (nobody gets down as the bombs come in, Steve)
      const lines = mortarOnOnePiece(st, t, false);
      st.computer.rep.push(`🔺 ${DE_MORTAR.name} on ${t.name}: ${lines.length ? lines.join(', ') : 'no hits'}.`);
      return;
    }
    const u = unitById(st, shot.shooter);
    if (u.x === null) return;
    const fired = shot.moving ? 'moves and fires on' : 'fires on';
    st.computer.rep.push(`🔺 ${u.name} ${fired} ${t.name}: ` + fireAt(st, u, t, withdraw, !!shot.moving).join(', ') + '.');
    // Shooting gives it away to any ambush that can see it (Steve)
    springAmbushes(st, u, []);
  }

  // Is a person to be asked about this piece? It can still take cover, and a human commands it (a robot's decides for itself)
  const askable = (st, u) => !isRobot(st, u.side) && canReact(st, u);

  // Run the computer's token until it ends or a question needs a person. Returns { ask } or { done: true }
  // showAim (the page, Steve: the Germans show their targeting as yours do): each shot first comes back as { aim }, so
  // the table can show its targets and the score needed; the next call fires it (or asks its target first)
  function computerStep(st, showAim = false) {
    if (!st.computer || st.won || st.lost) return { done: true };
    if (st.computer.ask) return { ask: st.computer.ask };
    // A shot shown on the table last step: now it fires, or its target is asked first
    if (st.computer.aim) {
      const shot = st.computer.aim;
      st.computer.aim = null;
      // (the bomber's line, or the target of shells on a whole field, has been shown: they carry on below)
      if (!shot.bomber && !shot.fieldMission) {
        if (!shot.mortar && askable(st, unitById(st, shot.target))) { st.computer.ask = shot; return { ask: shot }; }
        resolveShot(st, shot, false);
      }
    }
    // Aim it (shown first on the page), or straight on to firing it
    const plan = shot => {
      if (showAim) { st.computer.aim = shot; return { aim: shot }; }
      if (!shot.mortar && askable(st, unitById(st, shot.target))) { st.computer.ask = shot; return { ask: shot }; }
      resolveShot(st, shot, false);
      return null;
    };
    while (st.computer.queue.length) {
      const u = unitById(st, st.computer.queue.shift());
      if (u.x === null) continue;
      if (st.won || st.lost) break;
      const shot = u.side === 'us' ? americanAct(st, u) : germanAct(st, u);
      if (!shot) continue;
      const r = plan(shot);
      if (r) return r;
    }
    // A side wiped out: nothing more happens
    if (st.won || st.lost) return { done: true };
    const side = computerSide(st);
    // Shells on a whole field: the artillery, and the American mortars (German mortars drop on one piece, further down)
    const fieldGun = st.computer.artillery ? 'artillery' : st.computer.mortar && side === 'us' ? 'mortars' : null;
    if (fieldGun) {
      st.computer.artillery = false;
      if (side === 'us') st.computer.mortar = false;
      const t = fieldGun === 'artillery' ? artilleryTarget(st, side) : mortarTarget(st, side);
      computerSays(st, t ? `Shells ${t.name}` : 'Holds fire: no target');
      if (t) {
        // (nobody of yours is asked: no taking cover from shells, Steve)
        st.computer.shelling = { which: fieldGun, x: t.x, y: t.y, target: t.id };
        // On the page, the target shows first
        if (showAim) { st.computer.aim = { fieldMission: true, artillery: fieldGun === 'artillery', target: t.id }; return { aim: st.computer.aim }; }
      }
    }
    if (st.computer.shelling) {
      const shelling = st.computer.shelling;
      // The shells land
      st.computer.shelling = null;
      st.ammo[side][shelling.which]--;
      const lines = fireMission(st, shelling.which, shelling.x, shelling.y, side);
      st.computer.rep.push(`🔺 ${side === 'de' ? 'German' : 'American'} ${shelling.which} on ${unitById(st, shelling.target).name}: ${lines.length ? lines.join(', ') : 'no hits'}.`);
      if (st.won || st.lost) return { done: true };
    }
    if (st.computer.mortar) {
      st.computer.mortar = false;
      const t = mortarTarget(st, 'de');
      computerSays(st, t ? `Mortars ${t.name}` : 'Holds fire: no target');
      if (t) {
        const r = plan({ mortar: true, target: t.id });
        if (r) return r;
      }
    }
    // Their bomber picked: the best line by its compass, or it stays away this round
    if (st.computer.bomber) {
      st.computer.bomber = false;
      const run = bestBomberRun(st, side);
      computerSays(st, run ? 'Flies in' : 'Stays away: nothing worth bombing');
      if (run) {
        // (nobody of yours is asked: no taking cover from bombs, Steve)
        st.computer.run = { x: run.x, y: run.y };
        // On the page, the line shows first
        if (showAim) { st.computer.aim = { bomber: true }; return { aim: st.computer.aim }; }
      }
    }
    if (st.computer.run) {
      const run = st.computer.run;
      // It flies
      st.computer.run = null;
      st.ammo[side].bomber--;
      const lines = dropBombs(st, side, run.x, run.y);
      st.computer.rep.push(`🔺 The ${bomberName(side)} flies over: ${lines.length ? lines.join(', ') : 'no hits'}.`);
    }
    return { done: true };
  }

  // The player's answer to "pull back?"
  function answer(st, withdraw) {
    if (!st.computer || !st.computer.ask) return;
    const shot = st.computer.ask;
    st.computer.ask = null;
    resolveShot(st, shot, withdraw);
  }

  // ---------- The blind bag (Steve) ----------
  // Each round the bag holds a token for every piece on the table that can still move: green for the Americans, grey for
  // the Germans. One is drawn at a time and that side moves one piece; then the next is drawn. A piece destroyed, or one
  // that loses its move (taking cover), takes a token out with it. When the bag is empty, the round ends

  // Everything of a side's off the board, and what each has left
  const SUPPORT = ['artillery', 'mortars', 'bomber'];

  // Pieces of a side that can still move this round, and its mortars and artillery that still have rounds and haven't
  // fired (Steve: out of rounds, they come out of the bag)
  function movable(st, side) {
    const pieces = st.units.filter(u => u.side === side && u.x !== null && !u.acted).length;
    const guns = SUPPORT.filter(w => st.ammo[side][w] > 0 && !st.fired[side][w]).length;
    return pieces + guns;
  }

  // Can your mortars or artillery fire now: rounds left, not fired this round, and (with the bag) on an unused token of yours
  function canFire(st, which) {
    const side = st.human;
    return st.ammo[side][which] > 0 && !st.fired[side][which] && !st.won && !st.lost && !st.computer && (!st.tokens || (st.drawn === side && !st.activeId));
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
    if (!u || (!u.halfShot && !u.mayAmbush)) return { ok: false };
    u.halfShot = false;
    u.mayAmbush = false;
    return { ok: true, lines: [`⏭️ ${u.name} holds its fire.`] };
  }

  function skipSupport(st, which) {
    if (!canFire(st, which)) return { ok: false };
    st.fired[st.human][which] = true;
    if (st.tokens) { st.activeId = 'gun:' + which; activated(st, { side: st.human, gun: which }); }
    if (which === 'bomber') return { ok: true, lines: [`⏭️ The ${bomberName(st.human)} stays away this round.`] };
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
    for (const u of st.units) { u.halfShot = false; u.mayAmbush = false; }
    // Every gun with rounds left can fire again, either side, and has its token (Steve: a German gun that fired used to miss
    // the next bag)
    st.fired = { us: {}, de: {} };
    st.bag = { us: movable(st, 'us'), de: movable(st, 'de'), timer: ROUND_TIMER };
    // Tokens drawn so far this round (the timer can't be the first, Steve)
    st.drawnThisRound = 0;
    st.drawn = null;
    st.activeId = null;
    st.roundRep = [];
  }

  // The new round's tokens (Steve): one flies home from each piece or gun a token activated last round, and from nobody
  // else; the rest of the side's new bag is already in it. The first round, every token flies in. For each side:
  // { from: [{ id } or { gun }], kept }
  function tokensHome(st) {
    const back = st.returning || { first: true, activated: [] };
    const out = {};
    for (const side of ['us', 'de']) {
      const ammo = st.ammo[side];
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
  // there and then, so the next draw is null. On a German token the Germans' move is set up (see computerStep):
  // one of their pieces, or their mortar or artillery
  function drawToken(st) {
    if (st.won || st.lost) return null;
    checkHold(st);
    trimBag(st);
    // The timer can't come out first (Steve): it is only in the draw once a piece's token has been drawn this round
    const pieceTokens = st.bag.us + st.bag.de;
    const timer = st.drawnThisRound || !pieceTokens ? st.bag.timer || 0 : 0;
    const total = pieceTokens + timer;
    if (!total) return null;
    st.drawnThisRound = (st.drawnThisRound || 0) + 1;
    // The trains move on one field after every piece's turn (Steve): each token drawn after the very first
    if (st.tokensDrawn) moveTrains(st);
    st.tokensDrawn = (st.tokensDrawn || 0) + 1;
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
    for (const u of st.units) { u.halfShot = false; u.mayAmbush = false; }
    // A human's token: that side is the one being commanded now (with two humans it changes token by token)
    if (!isRobot(st, side)) st.human = side;
    if (isRobot(st, side)) {
      const pick = pickComputer(st, side);
      if (pick.gun) {
        st.fired[side][pick.gun] = true;
        activated(st, { side, gun: pick.gun });
        st.computer = { queue: [], mortar: pick.gun === 'mortars', artillery: pick.gun === 'artillery', bomber: pick.gun === 'bomber', rep: st.roundRep, ask: null, side, move: { gun: pick.gun, what: '', side } };
      } else {
        pick.unit.acted = true;
        activated(st, { side, id: pick.unit.id });
        st.computer = { queue: [pick.unit.id], mortar: false, artillery: false, bomber: false, rep: st.roundRep, ask: null, side, move: { id: pick.unit.id, what: '', side } };
      }
    }
    return side;
  }

  // What moves on the computer's token: its guns if they have a target, then a piece with someone to shoot, then one that
  // could move and shoot, then any
  function pickComputer(st, side) {
    const ammo = st.ammo[side], fired = st.fired[side];
    const options = st.units.filter(u => u.side === side && u.x !== null && !u.acted).map(u => ({ unit: u, score: eagerness(st, u) + st.rand() }));
    if (ammo.mortars > 0 && !fired.mortars) options.push({ gun: 'mortars', score: (mortarTarget(st, side) ? 2.5 : -1) + st.rand() });
    if (ammo.artillery > 0 && !fired.artillery) options.push({ gun: 'artillery', score: (artilleryTarget(st, side) ? 2.5 : -1) + st.rand() });
    if (ammo.bomber > 0 && !fired.bomber) options.push({ gun: 'bomber', score: (bestBomberRun(st, side) ? 2.5 : -1) + st.rand() });
    return options.sort((a, b) => b.score - a.score)[0];
  }

  // How keen the computer's piece is to go on this token: 2 with a shot from where it stands, 1 with one after a move;
  // an American platoon with a charge to make goes first of all
  function eagerness(st, u) {
    if (u.side === 'us' && americanCharge(st, u)) return 3;
    if (bestTarget(st, u)) return 2;
    return bestMoveShoot(st, u) ? 1 : 0;
  }

  // The computer's move is over (computerStep said done): back to the bag
  function endComputerToken(st) {
    st.computer = null;
    st.drawn = null;
  }

  // Is the player's token used up: its piece has moved and has nothing more it can do?
  function activationOver(st) {
    if (!st.tokens || st.drawn !== st.human || !st.activeId) return false;
    // A gun has fired (or held fire): done
    if (st.activeId.startsWith('gun:')) return true;
    const u = unitById(st, st.activeId);
    if (u.x === null) return true;
    const rallyLeft = u.kind === 'captain' && captainCanRally(st, u);
    return !canAct(st, u) && !u.halfShot && !u.mayAmbush && !rallyLeft;
  }

  // Pass on the player's token, or finish with it
  function passToken(st) {
    // The token's piece has had its go this round, whatever it did (Steve: a captain who only rallied looked as if he
    // could still act, and could take a second token): it is done, and shows so on the table
    const done = st.activeId && !st.activeId.startsWith('gun:') ? unitById(st, st.activeId) : null;
    if (done && done.x !== null) { done.acted = true; if (done.kind === 'captain') done.skipped = true; }
    st.drawn = null;
    st.activeId = null;
    for (const u of st.units) { u.halfShot = false; u.mayAmbush = false; }
  }

  // Can any of the player's pieces move on this token?
  const humanCanMove = st => SUPPORT.some(w => canFire(st, w)) || st.units.some(u => u.side === st.human && u.x !== null && (canAct(st, u) || canSelfRally(st, u) || (u.kind === 'captain' && captainCanRally(st, u))));

  // The bag is empty: the round ends: has the village fallen, are the Germans gone? Then the next round
  function endRound(st) {
    st.computer = null;
    st.drawn = null;
    finishRound(st);
  }

  // ---------- Turns ----------

  // Who can take the goal: a rifle platoon, or the captain (Steve)
  const takesGoal = u => u.kind === 'company' || u.kind === 'captain';

  // Does the US hold the hamlet: a rifle platoon or the captain in it and no Germans left there
  function holdsObjective(st) {
    // No goal on this map: nothing to hold
    if (st.noGoal) return false;
    const here = at(st, st.objective.x, st.objective.y);
    return here.some(u => u.side === 'us' && takesGoal(u)) && !here.some(u => u.side === 'de');
  }

  // Taken at the end of a round, the goal must be held for the whole of the next one (Steve: a platoon that went in on the last
  // move of a round won on the spot). st.holdUntil: the round it must be held through. Looked at before every token and at the
  // end of the round: lost at any of those, the count stops, and it has to be taken again
  function checkHold(st) {
    if (!st.holdUntil || holdsObjective(st)) return;
    st.holdUntil = null;
    (st.roundRep || st.report).unshift(`⚔️ ${st.objective.name} is no longer held. It must be taken and held all over again.`);
  }

  // The end of a round: has the village fallen, has a side gone, has time run out? Then a new round
  function finishRound(st) {
    const rep = st.computer ? st.computer.rep : (st.roundRep || []);
    st.computer = null;
    // Already over: one side was wiped out during the round
    if (st.won || st.lost) return;
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    checkHold(st);
    const held = holdsObjective(st);
    // Dunkirk (Steve): the boats sail with whoever is aboard, then the count decides
    if (st.evac) {
      sailBoats(st, rep);
      evacOutcome(st, rep, germansLeft);
    } else if (held && st.holdUntil === st.turn) {
      st.won = true;
      // Held for the whole of this round
      rep.unshift(`🏆 ${st.objective.name} is held for the whole of ${roundText(st.turn)}!`);
    } else if (!germansLeft) {
      // Every German on the table destroyed wins too (Steve), even with no rifle platoons left to take the village
      st.won = true;
      rep.unshift(`🏆 Every German on the field is destroyed in ${roundText(st.turn)}!`);
    } else if (!st.units.some(u => u.side === 'us' && u.x !== null)) {
      st.lost = true;
      rep.unshift('💀 Nothing is left of the company. The attack has failed.');
    } else if (isRobot(st, 'de') && cannotWin(st)) {
      // (a human playing the Germans wins only by destroying every American piece, Steve; guns off the table don't count)
      st.lost = true;
      rep.unshift(st.noGoal
        ? '⌛ Nothing is left that can knock out the last German bunkers or tanks. The attack has failed.'
        : '⌛ No rifle platoon or captain is left to take the village, and nothing is left that can hurt the German tanks. The attack has failed.');
    } else if (TURNS && st.turn >= TURNS) {
      st.lost = true;
      rep.unshift(st.noGoal ? `⌛ After ${TURNS} rounds the attack has run out of time.` : `⌛ After ${TURNS} rounds the attack has run out of time short of ${st.objective.name}.`);
    }
    // Just taken: the count starts
    if (held && !st.holdUntil && !st.won && !st.lost) {
      st.holdUntil = st.turn + 1;
      rep.unshift(`🚩 ${st.objective.name} is taken! Hold it for the whole of round ${st.holdUntil} to win.`);
    }
    // Robot against robot: neither finished it in time, a draw
    if (!st.won && !st.lost && st.mode === 'none' && st.turn >= ROBOT_ROUNDS) {
      st.lost = true;
      st.draw = true;
      rep.unshift(`🤝 Neither side could finish it in ${ROBOT_ROUNDS} rounds. A draw.`);
    }
    if (!st.won && !st.lost) {
      newRound(st);
      // (what came out of the sky at the start of it, for the report)
      if (st.news) { rep.push(...st.news); st.news = null; }
    }
    st.report = rep.length ? rep : ['A quiet round.'];
  }

  // A new hour (shaken stays: only a rally clears it, Steve): a fresh move for every piece (except those that took cover), fire support (no more ammo: it never comes back, Steve) and reinforcements
  function newRound(st) {
    st.turn++;
    // Both sides alike (a German who took cover used to stay down for the rest of the game)
    for (const u of st.units) {
      if (u.x === null) continue;
      const missed = !!u.spentNext;
      u.acted = missed; u.spentNext = false; u.rallied = 0; u.fired = false; u.skipped = false;
      // An ambush doesn't carry over to the next round (Steve)
      u.ambush = false;
      // Down in cover: it stays down through a round it misses, then gets up
      if (!missed) u.down = false;
    }
    // A new round: the bombers' compasses spin afresh
    st.spin = {};
    // An airdrop, if this is its round
    airdropNow(st);
    // Dunkirk (Steve): new boats come in, lorries come down the coast road, and every lorry drives for a boat
    if (st.evac) {
      newBoats(st);
      lorriesArrive(st);
      lorriesDrive(st);
    }
  }

  return {
    firesOnTheMove, canAmbush, actAmbush, bestMoveShoot, bomberHeading, bomberAims, bomberLine, bombNeed, bombWhy, bestBomberRun,
    isBunker, isCar, hurtsCars, trainCars, lineSideOf, moveTrains, inFrontOf, bunkerFace, shotOnTheMove, wrecksBeside, isRoad, featuresAt, walkDistance, fireSound, wreckAt, remove, computerSide, isRobot, piecesToAsk, takeCover, enemyOf, gunStats, diceShown, menDiceShown, bomberName, boatKind, armyOf, hedgeWord, inCourtyard, closeRangeOnly, isAtGun, isEmplaced, edgeKey, atCloseRange, closeCells, hailMaryCells,
    newGame, roll, inside, tileType, hedge, at, unitById, isTank, isTeam, adjacent, sees, targets, chargeSpots,
    rallyTargets, canAct, canReact, firepower, canCallFire, takesGoal, cannotWin, artilleryTarget, mortarTarget, holdsObjective, roundText, roomFor,
    computerStep, answer, finishRound, startRound, drawToken, endComputerToken, activationOver, passToken, humanCanMove, endRound, canFire, actSkip, actSkipShot, skipSupport,
    smallTarget, menDice, armourOf, shotNeed, mayFire, shootCells, tokensHome, captainCanRally, fireAt, wholeDice: dice,
    actShoot, actMoveShoot, moveShootSpots, chargeRoutes, DIRS, needWhy, shellNeed, shellWhy, shellFields,
    canRally, needFor, canSelfRally, actSelfRally, actHalfShot, actCharge, actRally, actFire, sight, isSmall,
    cover, wire, lineSides, actLine, atHedge, acrossHedge, SIDE_NAMES, PLACES, placeXY, placeName, lines,
    sizeOf, footprint, spotXY, occupant, fitsAt, freePlace,
    hasCutters: u => cutter(u),
    sideName, isAboard, isLorry, boatOff, routeToBoat, stillToSave,
  };
})();

if (typeof module !== 'undefined') module.exports = Sim;
