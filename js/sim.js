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
  // Where in its field a piece stands (Steve): one of nine places. u.at names the edges it is against: 'n', 'e', 's',
  // 'w', a corner ('ne', 'nw', 'se', 'sw'), or null in the middle. A piece lines every hedge on an edge it is against
  const PLACES = [null, 'n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];
  const lines = (u, d) => !!u.at && u.at.includes(d);
  const placeXY = at => ({ x: at && at.includes('e') ? 1 : at && at.includes('w') ? -1 : 0, y: at && at.includes('s') ? 1 : at && at.includes('n') ? -1 : 0 });
  const placeName = at => !at ? 'the middle of the field' : at.length === 2 ? `the ${SIDE_NAMES[at[0]]}-${SIDE_NAMES[at[1]]} corner` : `the ${SIDE_NAMES[at]} side`;
  // The place nearest the one wanted that no other piece in the field already has (Steve: where other pieces allow it)
  function freePlace(st, u, x, y, want) {
    const taken = st.units.filter(o => o !== u && o.x === x && o.y === y).map(o => o.at);
    if (!taken.includes(want)) return want;
    const w = placeXY(want);
    const free = PLACES.filter(p => !taken.includes(p));
    free.sort((a, b) => { const pa = placeXY(a), pb = placeXY(b); return Math.hypot(pa.x - w.x, pa.y - w.y) - Math.hypot(pb.x - w.x, pb.y - w.y); });
    return free.length ? free[0] : want;
  }
  // Which side of a's field faces b (b next to a)
  const dirTo = (a, b) => Object.keys(DIRS).find(d => DIRS[d][0] === b.x - a.x && DIRS[d][1] === b.y - a.y);

  // The same key for an edge whichever side it is looked at from
  function edgeKey(ax, ay, bx, by) {
    return ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;
  }

  // Does a hedge grow on this edge before any gaps are made? Villages have none; lanes run between hedges but not along themselves
  function hedgeWanted(ax, ay, bx, by) {
    const a = tileType(ax, ay), b = tileType(bx, by);
    if (a === 'village' || b === 'village') return false;
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
    const u = Object.assign({ side, shocked: false, hit: false, acted: false, attachedTo: null, at: side === 'us' ? 'e' : 'w' }, def);
    if (kind === 'company') u.platoons = 3;
    else if (PIECES[kind].tank) u.platoons = 2;
    else u.platoons = 1;
    if (!u.quality) u.quality = 'standard';
    return u;
  }

  const unitById = (st, id) => st.units.find(u => u.id === id);
  const alive = st => st.units.filter(u => u.x !== null);
  const at = (st, x, y, side) => st.units.filter(u => u.x === x && u.y === y && (!side || u.side === side));
  const isTank = u => !!PIECES[u.kind].tank;
  const isTeam = u => !!PIECES[u.kind].team;
  const isSmall = u => isTeam(u) || u.kind === 'captain';
  const enemyOf = side => (side === 'us' ? 'de' : 'us');
  const adjacent = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  const teamsOf = (st, company) => st.units.filter(t => t.attachedTo === company.id && t.x !== null);

  // Is there room for a unit in a field?
  function roomFor(st, unit, x, y, leaving = []) {
    // Your own pieces can share a field (Steve): at most one rifle platoon and one tank pair in it, and four pieces in
    // all (a field has nine places). Never with the enemy, except in a hand-to-hand fight. A dug-in gun stands alone
    const here = at(st, x, y).filter(u => !leaving.includes(u) && u !== unit && u.attachedTo !== unit.id);
    if (!here.length) return true;
    if (here.some(u => u.side !== unit.side)) return false;
    if (PIECES[unit.kind].fixed || here.some(u => PIECES[u.kind].fixed)) return false;
    const platoons = here.filter(u => u.kind === 'company').length + (unit.kind === 'company' ? 1 : 0);
    const tanks = here.filter(u => isTank(u)).length + (isTank(unit) ? 1 : 0);
    return platoons <= 1 && tanks <= 1 && here.length + 1 <= 4;
  }


  function newGame(seed) {
    seed = seed || (Date.now() % 1e9);
    const R = rng(seed);
    const st = {
      seed, turn: 1, hedges: {}, wire: {}, units: [], report: [], fx: [],
      fired: {},          // fire support used this hour (the mortars and the guns each fire once an hour)
      ammo: { mortars: MORTARS.ammo, artillery: ARTILLERY.ammo },
      deMortarAmmo: DE_MORTAR.ammo, deArtilleryAmmo: DE_ARTILLERY.ammo, won: false, lost: false,
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
    st.report = [`${START_DATE}, 06:00. The company attacks into the bocage. Take ${st.objective.name} and hold it at the end of an hour${TURNS ? ` by ${hourText(TURNS + 1)}` : ''}.`];
    return st;
  }

  // Each side starts spread at random over its own end of the board (DEPLOY of the width), in cover where it can be:
  // a field with a hedge facing the enemy, an orchard or the village. Captains and attached teams start with their company
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
    const leaders = st.units.filter(u => u.side === side && !u.attachedTo);
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

  const hourText = turn => { const h = START_HOUR + turn - 1; return `${h >= 24 ? `day ${Math.floor(h / 24) + 1}, ` : ''}${String(h % 24).padStart(2, '0')}:00`; };

  // ---------- Who commands whom ----------

  // The group a piece is listed under: its rifle platoon, the tanks, or company HQ (the captain and the teams)
  function groupOf(u) {
    if (u.side !== 'us') return null;
    if (u.kind === 'company') return u.id;
    if (u.kind === 'captain') return 'bn';
    if (isTank(u)) return 'T';
    if (isTeam(u)) return 'bn';
    return null;
  }

  const GROUP_NAMES = { T: 'Tanks', bn: 'Company HQ' };
  function groupName(st, g) { return GROUP_NAMES[g] || (unitById(st, g) || {}).name || g; }

  // The pieces in a group
  function members(st, g) { return st.units.filter(u => u.side === 'us' && u.x !== null && groupOf(u) === g); }

  // A piece has used its move for the hour
  function spend(st, u) {
    u.acted = true;
    if (st.tokens) st.activeId = u.id;
    for (const o of st.units) o.halfShot = false;
  }

  // With the bag (the page plays this way): an American piece moves only on an American token, and only one piece a token
  const tokenAllows = (st, u) => !st.tokens || (st.drawn === 'us' && (!st.activeId || st.activeId === u.id));

  // ---------- Seeing ----------

  // The fields a line from the middle of one field to the middle of another passes through, in order
  function fieldsAlong(a, b) {
    const out = [{ x: a.x, y: a.y }];
    let x = a.x, y = a.y;
    const dx = b.x - a.x, dy = b.y - a.y, sx = Math.sign(dx), sy = Math.sign(dy);
    // Distance along the line to the next vertical and horizontal field edges
    let tx = dx ? 0.5 / Math.abs(dx) : Infinity, ty = dy ? 0.5 / Math.abs(dy) : Infinity;
    const stepX = dx ? 1 / Math.abs(dx) : Infinity, stepY = dy ? 1 / Math.abs(dy) : Infinity;
    while (x !== b.x || y !== b.y) {
      if (tx <= ty) { x += sx; tx += stepX; } else { y += sy; ty += stepY; }
      out.push({ x, y });
    }
    return out;
  }

  // Can one piece see another to shoot it, and how hard is the target to hit?
  // As far as its weapon reaches (RANGES) over open fields and lanes; villages, hamlets and orchards in between block the view.
  // Hedges (Steve): the hedge next to the shooter is seen through only if the shooter lines it; the hedge next to the target
  // only if the target lines it (it is then in cover, one more to hit); with one hedge between them either lining it will do,
  // and the target has cover if it lines it. Any other hedge in between blocks the view. Beyond the next field: one more to hit.
  // Returns null (can't see) or { cover } added to the score needed, with what it is made of (hedge, behindTank) for the label
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

  function sight(st, from, target) {
    const dist = Math.hypot(target.x - from.x, target.y - from.y);
    if (dist === 0 || dist > rangeOf(from).sight + 0.01) return null;
    const path = fieldsAlong(from, target);
    let c = isFar(from, target) ? LONG_RANGE : 0;
    let behindTank = false, behindHedge = false;
    for (let i = 0; i + 1 < path.length; i++) {
      const p = path[i], q = path[i + 1];
      // A field in between that blocks the view
      if (i > 0 && ['village', 'hamlet', 'orchard'].includes(tileType(p.x, p.y))) return null;
      // A tank in a field in between: men beyond it shelter behind it (Steve: tanks are cover for infantry)
      if (i > 0 && target.kind && !isTank(target) && at(st, p.x, p.y).some(isTank)) behindTank = true;
      if (!hedge(st, p.x, p.y, q.x, q.y)) continue;
      const first = i === 0, last = i + 1 === path.length - 1;
      const shooterLines = first && lines(from, dirTo(p, q));
      const targetLines = last && lines(target, dirTo(q, p));
      if (!shooterLines && !targetLines) return null;
      if (targetLines) { c += COVER.hedge; behindHedge = true; }
    }
    if (behindTank) c += COVER.tank;
    return { cover: c, hedge: behindHedge, behindTank };
  }

  // Can a side see this field (to call fire on it)? Any of its pieces next to it, or with a line of sight to it
  function sees(st, side, x, y) {
    return st.units.some(u => u.side === side && u.x !== null && (Math.abs(u.x - x) + Math.abs(u.y - y) <= 1 || sight(st, u, { x, y, at: null })));
  }

  // ---------- Fire ----------

  // Firepower of a piece. hard: against tanks. Attached teams shoot on their own
  function firepower(st, u) {
    const P = PIECES[u.kind];
    let soft = P.soft * u.platoons, hard = P.hard * u.platoons;
    return { soft, hard };
  }

  // Whole dice from a firepower: the fraction is a chance of one more
  const dice = (st, f) => Math.floor(f) + (st.rand() < f - Math.floor(f) ? 1 : 0);

  // Roll n six-sided dice needing `need` or more (shots needing 7+ aren't allowed, see targets). The faces go into `faces` for the dice on the table
  function roll(st, n, need, faces = []) {
    let hits = 0;
    const score = Math.min(6, need);
    for (let i = 0; i < n; i++) {
      const face = 1 + Math.floor(st.rand() * 6);
      const hit = face >= score;
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
    const t = tileType(target.x, target.y);
    if (t === 'village') c += COVER.village;
    if (t === 'hamlet') c += COVER.hamlet;
    if (t === 'orchard') c += COVER.orchard;
    if (!isTank(target) && target.side && at(st, target.x, target.y, target.side).some(isTank)) c += COVER.tank;
    return c;
  }

  // What hits do to a piece (Steve): every hit pins it (shaken), and each hit is a coin toss whether it wounds: a section
  // of a platoon, a whole team, or a tank lost. Only anti-tank (hard) hits count against tanks
  function damage(st, u, softHits, hardHits, deadly = false) {
    const name = u.name, out = [];
    u.hit = u.hit || softHits + hardHits > 0;
    const hits = isTank(u) ? hardHits : softHits + hardHits;
    if (hits <= 0) return out;
    // Each hit: on a piece already pinned it kills (Steve: two pins kill); otherwise it pins it, and a coin toss says
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
    if (!out.length && u.platoons > 0) out.push(wasShocked ? `${name} still pinned` : `${name} pinned`);
    if (u.platoons <= 0) out.push(...remove(st, u));
    return out;
  }

  // A piece leaves the board. A company's attached teams carry on alone
  function remove(st, u) {
    u.x = null; u.y = null; u.shocked = false;
    if (u.kind === 'company') {
      for (const t of st.units) {
        if (t.attachedTo === u.id) t.attachedTo = null;
      }
      return [`💀 ${u.name} destroyed`];
    }
    return [];
  }

  // Shoot at one piece. Hard dice go against tanks; soft dice against everything else (and only shake tanks).
  // withdraw: the target spends a point to try to pull back: if it works it takes half the hits and falls back a field
  // The score each die needs: TO_HIT, plus cover and range, plus one on the move, less one for elite troops
  function needFor(st, shooter, target, moving = false) {
    // The sniper: no cover, no long range (Steve)
    if (PIECES[shooter.kind].sniper) return TO_HIT + (moving ? ON_THE_MOVE : 0) + (shooter.shocked ? SHAKEN_SHOOT : 0) - QUALITY[shooter.quality || 'standard'].shoot;
    return TO_HIT + cover(st, shooter, target) + (moving ? ON_THE_MOVE : 0) + (shooter.shocked ? SHAKEN_SHOOT : 0) + (target.down ? TAKE_COVER : 0) - QUALITY[shooter.quality || 'standard'].shoot;
  }

  // Why a shot needs what it needs, for the label on the target (Steve): each thing that makes it harder (−) or easier (+),
  // each cover named on its own, after the score every shot starts from
  function needWhy(st, shooter, target, moving = false) {
    const why = [];
    if (PIECES[shooter.kind].sniper) {
      why.push('sniper: no cover or range');
      if (moving) why.push(`−${ON_THE_MOVE} moving`);
      if (shooter.shocked) why.push(`−${SHAKEN_SHOOT} shaken`);
      return withStart(why);
    }
    const s = sight(st, shooter, target);
    const far = isFar(shooter, target);
    // The covers one by one: the hedge it lines, a tank in a field in between, the field it stands in, its own tank beside it
    if (s && s.hedge) why.push(`−${COVER.hedge} hedge`);
    if (s && s.behindTank) why.push(`−${COVER.tank} behind a tank`);
    why.push(...placeWhy(target));
    if (!isTank(target) && at(st, target.x, target.y, target.side).some(isTank)) why.push(`−${COVER.tank} beside a tank`);
    if (target.down) why.push(`−${TAKE_COVER} taking cover`);
    if (far) why.push(`−${LONG_RANGE} long range`);
    if (moving) why.push(`−${ON_THE_MOVE} moving`);
    if (shooter.shocked) why.push(`−${SHAKEN_SHOOT} shaken`);
    if (isTank(target) && PIECES[target.kind].armour) why.push(`−${PIECES[target.kind].armour} armour`);
    if (QUALITY[shooter.quality || 'standard'].shoot) why.push(`+${QUALITY[shooter.quality || 'standard'].shoot} elite`);
    return withStart(why);
  }

  // Cover from the field a target stands in: a village, a hamlet or an orchard
  function placeWhy(target) {
    // What the target's field is
    const t = tileType(target.x, target.y);
    // Open fields and lanes give no cover
    if (!['village', 'hamlet', 'orchard'].includes(t)) return [];
    return [`−${COVER[t]} ${t}`];
  }

  // Put the score every shot starts from first, so the sum adds up on the label; a plain 3+ shot needs no reasons at all
  function withStart(why) {
    if (!why.length) return why;
    return [`${TO_HIT}+ start`, ...why];
  }

  // The score mortar and artillery dice need against a piece: only a village gives cover from shells, and men down in cover
  function shellNeed(st, t) {
    // Cover from shells: the village's houses
    const village = tileType(t.x, t.y) === 'village' ? COVER.village : 0;
    // Men already down are harder to hit
    const down = t.down ? TAKE_COVER : 0;
    return TO_HIT + village + down;
  }

  // Why mortar and artillery dice need what they need, for the label on the target
  function shellWhy(st, t) {
    const why = [];
    // Only the village counts against shells
    if (tileType(t.x, t.y) === 'village') why.push(`−${COVER.village} village`);
    // Men already down in cover
    if (t.down) why.push(`−${TAKE_COVER} taking cover`);
    return withStart(why);
  }

  // `blast` is set for the other pieces caught in a tank's high-explosive burst (they don't spread it again)
  function fireAt(st, shooter, target, power, withdraw = false, moving = false, blast = false) {
    const f = firepower(st, shooter);
    // Taking cover happens before the dice roll: its men are already down
    const pre = withdraw ? takeCover(st, target) : null;
    const need = needFor(st, shooter, target, moving);
    const faces = [];
    let softHits, hardHits;
    if (isTank(target)) {
      hardHits = roll(st, dice(st, f.hard * power), need + PIECES[target.kind].armour, faces);
      softHits = roll(st, dice(st, f.soft * power), need, []);
    } else {
      // Anti-tank weapons are poor against men in a hedge: half value
      softHits = roll(st, dice(st, (f.soft + f.hard * 0.5) * power), need, faces);
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
      : target.shocked && !before.shocked ? 'Pinned' : softHits + hardHits ? 'No effect' : 'Missed';
    // What the table shows: the weapon's muzzle flash and tracers from the shooter, and what lands on the target
    const weapon = isTank(shooter) || shooter.kind === 'pak' ? 'gun' : shooter.kind === 'mg' || shooter.kind === 'mg42' ? 'mg' : shooter.kind === 'bazooka' || shooter.kind === 'schreck' ? 'rocket' : 'rifle';
    st.fx.push({ from: { id: shooter.id, x: shooter.x, y: shooter.y }, to: { id: target.id }, weapon, armour: isTank(target), x: target.x === null ? stood.x : target.x, y: target.x === null ? stood.y : target.y, kind: softHits + hardHits ? 'hit' : 'miss', faces, need: Math.min(6, need + (isTank(target) ? PIECES[target.kind].armour : 0)), side: shooter.side, result, tookCover: !!pre });
    // A tank firing high explosive at men hits the whole field, like a mortar: every other piece on foot in it rolls too
    if (isTank(shooter) && !isTank(target) && !blast) {
      for (const other of at(st, stood.x, stood.y, target.side)) {
        if (other === target || isTank(other) || other.kind === 'captain' || shotNeed(st, shooter, other, moving) > MAX_NEED) continue;
        out.push(...fireAt(st, shooter, other, power, false, moving, true));
      }
    }
    return out.length ? out : [`${target.name}: no hits`];
  }

  // A piece fired on takes cover (Steve): no moving back, its men get down where they are. One more is needed to hit it
  // for the rest of the German hour, and it misses its move next hour unless the captain gets it up
  function takeCover(st, u) {
    if (st.tokens && !u.acted) u.acted = true;
    else u.spentNext = true;
    u.down = true;
    return { line: `${u.name} takes cover` };
  }

  // Can this piece react now: an American piece not already down in cover, that hasn't moved this round (Steve: taking
  // cover uses the move it still has)
  function canReact(st, u) {
    return u.side === 'us' && u.x !== null && u.kind !== 'captain' && !PIECES[u.kind].fixed && !u.spentNext && !u.down && !u.acted;
  }

  // The score a shot needs, the Panther's armour included
  function shotNeed(st, shooter, target, moving = false) {
    return needFor(st, shooter, target, moving) + (isTank(target) ? PIECES[target.kind].armour : 0);
  }

  // Pieces a shooter could fire at (moving: firing on the move): enemies it can see, that its weapons can hurt, and
  // that need 6 or less on the dice. A shot that would need 7 or more can't be taken (Steve)
  function targets(st, shooter, moving = false) {
    // Anything without weapons shoots at nobody
    const f = firepower(st, shooter);
    if (f.soft + f.hard <= 0) return [];
    // Tanks only to those with anti-tank weapons: rifles and machine guns can't hurt them
    return st.units.filter(t => t.side !== shooter.side && t.x !== null && t.kind !== 'captain' && (!isTank(t) || f.hard > 0)
      && !!sight(st, shooter, t) && shotNeed(st, shooter, t, moving) <= MAX_NEED);
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

  // Move a piece, and the teams attached to it. A tank with hedge cutters going through a hedge leaves a gap.
  // Returns what happened to the hedge: 'cut' (driven through), 'climbed' (men clambered over) or ''
  function step(st, u, x, y, assault = false) {
    let how = '';
    u.trail = null;
    if (wire(st, u.x, u.y, x, y)) { delete st.wire[edgeKey(u.x, u.y, x, y)]; how = isTank(u) ? 'flattened' : 'wirecut'; }
    if (hedge(st, u.x, u.y, x, y)) {
      if (cutter(u)) { delete st.hedges[edgeKey(u.x, u.y, x, y)]; how = 'cut'; } else how = 'climbed';
    }
    const teams = u.kind === 'company' ? teamsOf(st, u) : [];
    const heading = dirTo(u, { x, y });
    u.x = x; u.y = y; u.at = freePlace(st, u, x, y, heading);
    // The way it is facing, for the table (tanks turn to fire, and turn again when they move)
    u.aim = { e: 0, n: Math.PI / 2, w: Math.PI, s: -Math.PI / 2 }[heading];
    for (const t of teams) { t.x = x; t.y = y; t.at = freePlace(st, t, x, y, heading); }
    return how;
  }

  // Fields a piece could move into (plain move or move and shoot)
  function moves(st, u) {
    const out = [];
    for (const [dx, dy] of NEIGHBOURS) {
      const x = u.x + dx, y = u.y + dy;
      if (canStep(st, u, x, y)) out.push({ x, y });
    }
    return out;
  }

  // ---------- Close assault ----------

  // A side's strength in a fight for a field
  function assaultStrength(st, pieces, defending, x, y, from) {
    let s = 0;
    for (const u of pieces) {
      if (u.kind === 'company') s += u.platoons * ASSAULT.platoon * QUALITY[u.quality].assault * (u.shocked ? ASSAULT.shocked : 1);
      else if (isTank(u)) s += u.platoons * ASSAULT.tank * (u.shocked ? ASSAULT.shocked : 1);
      else if (u.kind === 'mg' || u.kind === 'mg42') s += ASSAULT.mgTeam * (u.shocked ? ASSAULT.shocked : 1);
      else if (isTeam(u)) s += ASSAULT.otherTeam;
    }
    if (defending) {
      if (hedge(st, from.x, from.y, x, y)) s *= ASSAULT.hedgeDefence;
      if (tileType(x, y) === 'village' || tileType(x, y) === 'hamlet') s *= ASSAULT.villageDefence;
    }
    return s;
  }

  // Where a beaten piece can fall back to: a field next to it, away from the attacker, with room
  function retreatSpot(st, u, from) {
    let best = null, far = -1;
    for (const [dx, dy] of NEIGHBOURS) {
      const x = u.x + dx, y = u.y + dy;
      if (!canStep(st, u, x, y)) continue;
      const d = Math.abs(x - from.x) + Math.abs(y - from.y);
      if (d > far) { far = d; best = { x, y }; }
    }
    return best;
  }

  // Charge: step into the next field without shooting. If enemies hold it, fight for it hand to hand
  function charge(st, u, x, y) {
    const defenders = at(st, x, y, enemyOf(u.side));
    const out = [];
    if (!defenders.length) {
      const how = step(st, u, x, y, true);
      return [how === 'cut' ? `${u.name} charges through the hedge, leaving a gap` : how === 'flattened' ? `${u.name} charges over the wire, flattening it` : `${u.name} charges forward`];
    }
    // Attackers: the charging piece with its teams, plus tanks with it or next to the field
    const supporters = st.units.filter(t => t.side === u.side && t.x !== null && isTank(t) && !t.shocked && t !== u && (Math.abs(t.x - x) + Math.abs(t.y - y) <= 1));
    const attack = assaultStrength(st, [u, ...teamsOf(st, u)], false) + (supporters.length ? ASSAULT.tankSupport : 0);
    const defence = assaultStrength(st, defenders, true, x, y, u);
    const a = attack * (0.7 + st.rand() * 0.6), d = defence * (0.7 + st.rand() * 0.6);
    st.fx.push({ x, y, kind: 'assault' });
    if (a > d) {
      // The defenders lose a platoon each and fall back; anything that can't get away is lost.
      // Companies and tanks first: their attached teams go with them
      const order = defenders.filter(d => d.kind !== 'captain').sort((a, b) => (isSmall(a) ? 1 : 0) - (isSmall(b) ? 1 : 0));
      for (const def of order) {
        if (def.x === null || def.x !== x || def.y !== y) continue;
        if (def.attachedTo && defenders.some(d => d.id === def.attachedTo && d.x !== null)) continue;
        if (def.kind === 'company' || isTank(def)) out.push(...lose(st, def, 1));
        if (def.x === null) continue;
        const spot = retreatSpot(st, def, u);
        if (spot && !PIECES[def.kind].fixed) { step(st, def, spot.x, spot.y); def.shocked = true; def.hit = true; out.push(`${def.name} falls back`); }
        else { remove(st, def); out.push(`${def.name} is overrun`); }
      }
      // Captains caught in the field go back with their companies, or are lost
      for (const c of defenders.filter(d => d.kind === 'captain' && d.x !== null)) {
        const spot = retreatSpot(st, c, u);
        if (spot) { step(st, c, spot.x, spot.y); out.push(`${c.name} gets away`); } else { remove(st, c); out.push(`${c.name} is captured`); }
      }
      if (wire(st, u.x, u.y, x, y)) delete st.wire[edgeKey(u.x, u.y, x, y)];
      step(st, u, x, y);
      // Winning a hedge fight still costs: a chance of losing a platoon
      if (st.rand() < 0.3) out.push(...lose(st, u, 1));
      out.unshift(`⚔️ ${u.name} storms the field!`);
    } else {
      out.push(`⚔️ ${u.name}'s charge is beaten back.`, ...lose(st, u, 1));
      if (u.x !== null) { u.shocked = true; u.hit = true; }
    }
    return out;
  }

  // Lose platoons (or tanks) outright
  function lose(st, u, n) {
    if (u.x === null) return [];
    u.platoons = Math.max(0, u.platoons - n);
    const out = [`${u.name} loses ${n} ${isTank(u) ? 'tank' : 'section'}${n > 1 ? 's' : ''}`];
    if (u.platoons <= 0) out.push(...remove(st, u));
    return out;
  }

  // ---------- The player's actions ----------
  // Each returns { ok, lines } and spends a command point when it works. A piece acts once an hour

  function canAct(st, u) {
    // The captain can't move or shoot once he has used both his rallies
    if (u && u.kind === 'captain' && (u.rallied || 0) >= CAPTAIN_RALLIES.still) return false;
    return !!u && u.side === 'us' && u.x !== null && !st.won && !st.lost && !st.de && !u.acted && tokenAllows(st, u);
  }

  // Can the captain rally now (Steve): twice an hour if he doesn't move or shoot, once if he does, before or after
  function canRally(st, cap) {
    if (!cap || cap.kind !== 'captain' || cap.side !== 'us' || cap.x === null || st.won || st.lost || st.de || !tokenAllows(st, cap)) return false;
    const allowed = cap.acted ? CAPTAIN_RALLIES.moved : CAPTAIN_RALLIES.still;
    return (cap.rallied || 0) < allowed;
  }

  function actShoot(st, u, target) {
    if (!canAct(st, u) || !targets(st, u).includes(target)) return { ok: false };
    spend(st, u);
    return { ok: true, lines: [`🔫 ${u.name} fires on ${target.name}: ` + fireAt(st, u, target, 1).join(', ') + '.'] };
  }

  // The routes Move & shoot can take: up to MOVE_SHOOT_MOVES moves, ending only where the piece will have someone to
  // shoot (Steve). Captains don't shoot, and machine guns can't fire on the move (Steve): they set up, then shoot
  function moveShootRoutes(st, u) {
    if (u.kind === 'mg' || u.kind === 'mg42' || PIECES[u.kind].fixed) return [];
    const home = { x: u.x, y: u.y, at: u.at }, out = [];
    for (const route of routesFor(st, u, MOVE_SHOOT_MOVES, false)) {
      // Try it: stand at the goal by each hedge in turn, or in the open; any place with a shot will do
      const goal = route[route.length - 1];
      u.x = goal.x; u.y = goal.y;
      for (const side of PLACES) {
        // (only places no other piece in that field has)
        if (freePlace(st, u, goal.x, goal.y, side) !== side) continue;
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

  // Move and shoot: the piece moves a field, then it may fire once on the move, needing one more (actHalfShot), before doing anything else
  function actMoveShoot(st, u, x, y, side) {
    const route = canAct(st, u) && moveShootRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    const lines = followRoute(st, u, route);
    const how = step(st, u, x, y);
    // Where it stands: where it was sent, or (none given) the first place in the field with a shot
    const place = side !== undefined ? side : [u.at, ...PLACES].find(p => { if (freePlace(st, u, x, y, p) !== p) return false; u.at = p; return targets(st, u, true).length; });
    standAt(st, u, place === undefined ? u.at : place);
    setTrail(st, u, route);
    lines.push(moveLine(u, how).replace(/\.$/, ''));
    u.halfShot = targets(st, u, true).length > 0;
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  function actHalfShot(st, u, target) {
    if (!u || !u.halfShot || u.x === null || !targets(st, u, true).includes(target)) return { ok: false };
    u.halfShot = false;
    return { ok: true, lines: [`🔫 ${u.name} moves and fires on ${target.name}: ` + fireAt(st, u, target, 1, false, true).join(', ') + '.'] };
  }

  function moveLine(u, how) {
    if (how === 'cut') return `🚜 ${u.name} smashes through the hedge, leaving a gap.`;
    if (how === 'climbed') return `🧗 ${u.name} struggles over the hedge bank.`;
    if (how === 'flattened') return `🚜 ${u.name} flattens the barbed wire.`;
    if (how === 'wirecut') return `✂️ ${u.name} cuts through the wire.`;
    return `➡️ ${u.name} moves up.`;
  }

  // Captains and teams just move. A team that walks away from its company leaves it
  function actMove(st, u, x, y) {
    if (!canAct(st, u) || !canStep(st, u, x, y)) return { ok: false };
    spend(st, u);
    const how = step(st, u, x, y);
    if (isTeam(u) && u.attachedTo) u.attachedTo = null;
    return { ok: true, lines: [moveLine(u, how)] };
  }

  const fightsHandToHand = u => u.kind === 'company' || isTank(u);

  // What it costs to go from one field into the next (Steve): one move, and CLIMB more for men climbing a hedge bank (it
  // stays standing); barbed wire stops men; tanks drive straight through both. null where it can't go at all
  function stepCost(st, u, fx, fy, x, y) {
    if (!inside(x, y) || tileType(x, y) === 'river' || PIECES[u.kind].fixed) return null;
    if (isTank(u)) return hedge(st, fx, fy, x, y) && !cutter(u) ? null : 1;
    // Men: barbed wire stops them (only tanks get through it, Steve); a hedge bank they climb, for one more move
    if (wire(st, fx, fy, x, y)) return null;
    return hedge(st, fx, fy, x, y) ? 1 + CLIMB : 1;
  }

  // Every field a piece can reach with `budget` moves, each with the cheapest way there: a list of the fields it passes
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
          const canFight = charging && fightsHandToHand(u) && (enemies.some(e => !isTank(e)) || firepower(st, u).hard > 0);
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

  // A charge: up to CHARGE_MOVES moves, without shooting, ending in a hand-to-hand fight if it reaches the enemy.
  // Every piece but a dug-in gun can charge; captains and teams only into empty fields. A shaken (pinned) piece can't
  // charge until it rallies (Steve)
  function chargeRoutes(st, u) {
    if (PIECES[u.kind].fixed || u.shocked) return [];
    const canFight = fightsHandToHand(u);
    return routesFor(st, u, CHARGE_MOVES, canFight);
  }

  // Go along a route's fields up to (not into) its goal, cutting, flattening or climbing on the way. Returns the lines to report
  function followRoute(st, u, route) {
    const lines = [];
    for (const p of route.slice(0, -1)) {
      const how = step(st, u, p.x, p.y);
      if (how) lines.push(moveLine(u, how).replace(/\.$/, ''));
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
    for (const t of u.kind === 'company' ? teamsOf(st, u) : []) t.trail = trail;
  }

  // Where in its field a piece stands after a move (Steve: where the click was, if no other piece is there); its teams
  // take the free places nearest it
  function standAt(st, u, side) {
    if (side === undefined) return;
    u.at = freePlace(st, u, u.x, u.y, side);
    for (const t of u.kind === 'company' ? teamsOf(st, u) : []) t.at = freePlace(st, t, t.x, t.y, u.at);
  }

  function actCharge(st, u, x, y, side) {
    const route = canAct(st, u) && chargeRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    const lines = [];
    // The fields before the goal are crossed on the way
    const home = { x: u.x, y: u.y, at: u.at };
    lines.push(...followRoute(st, u, route));
    lines.push(...charge(st, u, x, y));
    // Arrived (not beaten back): it stands where it was sent, and the table shows the way it came
    if (u.x === x && u.y === y) { standAt(st, u, side); setTrail(st, u, route); }
    // Beaten back into a field of friends it passed through: it can't stay there, so it ends back where it started
    if (route.some(p => p.pass && p.x === u.x && p.y === u.y)) {
      u.x = home.x; u.y = home.y; u.at = home.at;
      for (const t of u.kind === 'company' ? teamsOf(st, u) : []) { t.x = home.x; t.y = home.y; t.at = home.at; }
    }
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // Breaking through a hedge (or cutting barbed wire): any piece without hedge cutters can push through into the next
  // (empty) field, leaving a gap. It is its move for the hour, with no shooting. Tanks with cutters just drive through
  function breachSpots(st, u) {
    if (PIECES[u.kind].fixed || cutter(u)) return [];
    return NEIGHBOURS.map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy })).filter(p => inside(p.x, p.y) && tileType(p.x, p.y) !== 'river'
      && hedge(st, u.x, u.y, p.x, p.y) && !wire(st, u.x, u.y, p.x, p.y) && roomFor(st, u, p.x, p.y));
  }

  function actBreach(st, u, x, y) {
    if (!canAct(st, u) || !breachSpots(st, u).some(p => p.x === x && p.y === y)) return { ok: false };
    spend(st, u);
    const key = edgeKey(u.x, u.y, x, y), wasWire = !st.hedges[key];
    delete st.hedges[key]; delete st.wire[key];
    st.fx.push({ x: u.x, y: u.y, kind: 'miss' });
    step(st, u, x, y);
    if (isTeam(u) && u.attachedTo && !(unitById(st, u.attachedTo).x === x && unitById(st, u.attachedTo).y === y)) u.attachedTo = null;
    return { ok: true, lines: [wasWire ? `✂️ ${u.name} cuts through the wire and pushes on.` : `⛏️ ${u.name} breaks through the hedge into the next field.`] };
  }

  // The other places in its own field a piece could move to (not where it is, nor where another piece stands)
  function lineSides(st, u) {
    if (PIECES[u.kind].fixed) return [];
    const taken = st.units.filter(o => o !== u && o.x === u.x && o.y === u.y).map(o => o.at);
    return PLACES.filter(p => p !== u.at && !taken.includes(p));
  }

  // Move to another place in its own field (to line another hedge, or a corner): the piece's move for the hour
  function actLine(st, u, side) {
    if (!canAct(st, u) || !lineSides(st, u).includes(side)) return { ok: false };
    spend(st, u);
    standAt(st, u, side);
    return { ok: true, lines: [`🌳 ${u.name} moves to ${placeName(u.at)}.`] };
  }

  // Shocked friendly pieces a captain can reach
  function rallyTargets(st, cap) {
    // Shaken pieces, and pieces down in cover missing this hour, up to RALLY_RANGE fields away
    // (himself too)
    const needsHim = t => t.shocked || (t.down && t.acted);
    return st.units.filter(t => t.side === cap.side && t.x !== null && needsHim(t) && Math.abs(t.x - cap.x) + Math.abs(t.y - cap.y) <= RALLY_RANGE);
  }

  // A shaken piece uses its move to try to pull itself together (Steve: pieces can rally themselves)
  function canSelfRally(st, u) {
    return !!u && u.side === 'us' && u.x !== null && u.shocked && !u.acted && !st.won && !st.lost && !st.de && u.kind !== 'captain' && tokenAllows(st, u);
  }
  function actSelfRally(st, u) {
    if (!canSelfRally(st, u)) return { ok: false };
    spend(st, u);
    const ok = st.rand() < SELF_RALLY[u.quality || 'standard'];
    if (ok) u.shocked = false;
    return { ok: true, lines: [ok ? `📣 ${u.name} pulls itself together.` : `📣 ${u.name} stays pinned down.`] };
  }

  function actRally(st, cap, target) {
    if (!canRally(st, cap) || !rallyTargets(st, cap).includes(target)) return { ok: false };
    // A rally isn't his move: it counts against his rallies for the hour (and with the bag, it is his token's piece)
    cap.rallied = (cap.rallied || 0) + 1;
    if (st.tokens) st.activeId = cap.id;
    const lines = [];
    // Down in cover: he gets them up and moving, so they can act this hour after all (Steve)
    if (target.down && target.acted) {
      target.down = false;
      target.acted = false;
      lines.push(`📣 ${cap.name} gets ${target.name} up and moving.`);
    }
    if (target.shocked) {
      const ok = st.rand() < QUALITY[target.quality || 'standard'].rally;
      if (ok) target.shocked = false;
      lines.push(ok ? `📣 ${cap.name} rallies ${target.name}.` : `📣 ${cap.name} can't steady ${target.name} yet.`);
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
        if (t.x === null || t.kind === 'captain') continue;
        const need = shellNeed(st, t);
        const faces = [];
        const soft = roll(st, n, need, faces), hard = isTank(t) ? roll(st, S.hard || 0, need + PIECES[t.kind].armour, faces) : 0;
        const before = t.platoons, wasShocked = t.shocked;
        const hurt = damage(st, t, soft, hard);
        lines.push(...(t.side === side ? hurt.map(l => `⚠️ friendly fire: ${l}`) : hurt));
        const lost = before - (t.x === null ? 0 : t.platoons);
        const result = t.x === null ? 'Wiped out' : lost ? (isTank(t) ? 'Tank knocked out' : 'Section lost') : t.shocked && !wasShocked ? 'Pinned' : soft + hard ? 'No effect' : 'Missed';
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
    if (st.won || st.lost || st.de || st.fired[which] || st.ammo[which] <= 0 || !canCallFire(st, x, y)) return { ok: false };
    // With the bag: on an American token not yet used by a piece; firing uses the token (Steve: the guns are in the bag)
    if (st.tokens && (st.drawn !== 'us' || st.activeId)) return { ok: false };
    if (st.tokens) st.activeId = 'gun:' + which;
    st.fired[which] = true;
    st.ammo[which]--;
    const S = which === 'mortars' ? MORTARS : ARTILLERY;
    const lines = fireMission(st, which, x, y);
    return { ok: true, lines: [`💥 ${S.name} fire on the field: ${lines.length ? lines.join(', ') : 'no hits'}.`] };
  }

  // ---------- The Germans ----------

  // What a German piece would most like to shoot: tanks for anti-tank weapons, otherwise the weakest infantry
  function bestTarget(st, u) {
    const ts = targets(st, u);
    if (!ts.length) return null;
    const f = firepower(st, u);
    const score = t => (isTank(t) ? f.hard * 2 : f.soft + f.hard * 0.5) * (7 - TO_HIT - cover(st, u, t)) / 2 + (t.shocked ? 1 : 0) - t.platoons * 0.1;
    return ts.sort((a, b) => score(b) - score(a))[0];
  }

  // A step towards a goal for a German piece, staying out of American fields; through a hedge or wire if it must
  function stepToward(st, u, goal) {
    let best = null, bestD = Math.abs(u.x - goal.x) + Math.abs(u.y - goal.y);
    for (const [dx, dy] of NEIGHBOURS) {
      const x = u.x + dx, y = u.y + dy;
      if (!canStep(st, u, x, y) && !breachSpots(st, u).some(p => p.x === x && p.y === y)) continue;
      const d = Math.abs(x - goal.x) + Math.abs(y - goal.y);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }

  // The German hour runs a piece at a time, so it can stop and ask the player whether a piece being fired on pulls back.
  // st.de holds the hour in progress: who still has to act, the report so far, and any question waiting for an answer
  function startGermanHour(st) {
    // Shocked Germans who weren't hit this hour come round; some rally anyway
    for (const u of st.units) if (u.side === 'de' && u.x !== null && u.shocked && (!u.hit || st.rand() < 0.3)) u.shocked = false;
    for (const u of st.units) if (u.side === 'de') u.hit = false;
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
    const inHamlet = at(st, st.objective.x, st.objective.y, 'us').length > 0;
    if (inHamlet && !u.shocked && (u.kind === 'company' || isTank(u)) && adjacent(u, st.objective) && !(isTank(u) && hedge(st, u.x, u.y, st.objective.x, st.objective.y))) {
      deSays(st, `Charges into ${st.objective.name}`);
      rep.push('🔺 ' + charge(st, u, st.objective.x, st.objective.y).join(', ') + '.');
      return null;
    }
    const weak = st.units.find(t => t.side === 'us' && t.x !== null && t.kind === 'company' && adjacent(u, t) && t.shocked);
    if (u.kind === 'company' && !u.shocked && u.platoons >= 2 && weak && st.rand() < 0.5) {
      deSays(st, `Charges ${weak.name}`);
      rep.push('🔺 ' + charge(st, u, weak.x, weak.y).join(', ') + '.');
      return null;
    }
    const t = bestTarget(st, u);
    if (t) { deSays(st, `Fires on ${t.name}`); return { shooter: u.id, target: t.id }; }
    // Americans just across a hedge it isn't lining: go to that hedge
    const across = st.units.find(o => o.side === 'us' && o.x !== null && acrossHedge(st, u, o) && !atHedge(u, o));
    if (across && !PIECES[u.kind].fixed && !(isTeam(u) && u.attachedTo)) {
      deSays(st, `Lines the hedge facing ${across.name}`);
      u.at = dirTo(u, across);
      for (const tm of u.kind === 'company' ? teamsOf(st, u) : []) tm.at = u.at;
      return null;
    }
    // On the way to its post: march there and dig in
    if (u.post && !u.reserve && (u.x !== u.post.x || u.y !== u.post.y) && !(isTeam(u) && u.attachedTo)) {
      const next = stepToward(st, u, u.post);
      if (next) { deSays(st, 'Marches to its post'); germanMove(st, u, next); }
      return null;
    }
    // Reserves: a company goes to hold the hamlet if nobody does; the rest move up towards the nearest Americans
    if (u.reserve) {
      if (u.x === st.objective.x && u.y === st.objective.y && u.kind === 'company') { deSays(st, `Holds ${st.objective.name}`); return null; }
      const garrison = at(st, st.objective.x, st.objective.y, 'de').some(g => g.kind === 'company');
      const us = st.units.filter(o => o.side === 'us' && o.x !== null);
      const near = us.sort((a, b) => (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
      const goal = (!garrison && u.kind === 'company') || !near ? st.objective : near;
      const next = stepToward(st, u, goal);
      if (next) { deSays(st, goal === st.objective ? `Moves up to hold ${st.objective.name}` : `Moves up towards ${near.name}`); germanMove(st, u, next); }
    }
    return null;
  }

  // What the German piece or gun on this token is doing, in a few words, for its word bubble on the table (Steve)
  function deSays(st, what) {
    if (st.de && st.de.move) st.de.move.what = what;
  }

  // A German piece moves a field, breaking through a hedge or wire on the way if it has to
  function germanMove(st, u, p) {
    const key = edgeKey(u.x, u.y, p.x, p.y);
    if (!canStep(st, u, p.x, p.y)) { delete st.hedges[key]; delete st.wire[key]; }
    step(st, u, p.x, p.y);
  }

  // The German mortar picks the strongest American company next to a German field
  // The German artillery's target: the American piece in a field the Germans can see with the most Americans in and round
  // it, and no Germans in or next to it (they don't shell their own men)
  function germanArtilleryTarget(st) {
    const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
    const us = st.units.filter(t => t.side === 'us' && t.x !== null && t.kind !== 'captain');
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
    if (shot.artillery) {
      st.deArtilleryAmmo--;
      if (withdraw) takeCover(st, t);
      const lines = fireMission(st, 'artillery', t.x, t.y, 'de');
      st.de.rep.push(`🔺 German artillery on ${t.name}${withdraw ? ' (it takes cover)' : ''}: ${lines.length ? lines.join(', ') : 'no hits'}.`);
      return;
    }
    if (shot.mortar) {
      st.deMortarAmmo--;
      const fx = { x: t.x, y: t.y, kind: 'shell', support: 'mortars' };
      // Taking cover from the mortar: its men get down before the bombs land
      const pre = withdraw ? takeCover(st, t) : null;
      const need = shellNeed(st, t);
      const faces = [];
      const hits = roll(st, DE_MORTAR.dice, need, faces);
      fx.faces = faces; fx.need = need; fx.side = 'de'; fx.tookCover = !!pre;
      const lines = (pre ? [pre.line] : []).concat(damage(st, t, hits, 0));
      st.fx.push(fx);
      st.de.rep.push(`🔺 German mortars on ${t.name}: ${lines.length ? lines.join(', ') : 'no hits'}.`);
      return;
    }
    const u = unitById(st, shot.shooter);
    if (u.x === null) return;
    st.de.rep.push(`🔺 ${u.name} fires on ${t.name}: ` + fireAt(st, u, t, 1, withdraw).join(', ') + '.');
  }

  // Run the German hour until it ends or a question needs the player. Returns { ask } or { done: true }
  function germanStep(st) {
    if (!st.de) return { done: true };
    if (st.de.ask) return { ask: st.de.ask };
    while (st.de.queue.length) {
      const u = unitById(st, st.de.queue.shift());
      if (u.x === null) continue;
      const shot = germanAct(st, u);
      if (!shot) continue;
      if (canReact(st, unitById(st, shot.target))) { st.de.ask = shot; return { ask: shot }; }
      resolveShot(st, shot, false);
    }
    if (st.de.artillery) {
      st.de.artillery = false;
      const t = germanArtilleryTarget(st);
      deSays(st, t ? `Shells ${t.name}` : 'Holds fire: no target');
      if (t) {
        const shot = { artillery: true, target: t.id };
        if (canReact(st, t)) { st.de.ask = shot; return { ask: shot }; }
        resolveShot(st, shot, false);
      }
    }
    if (st.de.mortar) {
      st.de.mortar = false;
      const t = germanMortarTarget(st);
      deSays(st, t ? `Mortars ${t.name}` : 'Holds fire: no target');
      if (t) {
        const shot = { mortar: true, target: t.id };
        if (canReact(st, t)) { st.de.ask = shot; return { ask: shot }; }
        resolveShot(st, shot, false);
      }
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

  // Pieces of a side that can still move this round, and its mortars and artillery that still have rounds and haven't
  // fired (Steve: out of rounds, they come out of the bag)
  function movable(st, side) {
    const pieces = st.units.filter(u => u.side === side && u.x !== null && !u.acted).length;
    const ammo = side === 'us' ? st.ammo : { mortars: st.deMortarAmmo, artillery: st.deArtilleryAmmo };
    const fired = side === 'us' ? st.fired : (st.deFired || {});
    const guns = ['mortars', 'artillery'].filter(w => ammo[w] > 0 && !fired[w]).length;
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
    if (u.kind === 'captain') u.rallied = CAPTAIN_RALLIES.still;
    return { ok: true, lines: [`⏭️ ${u.name} holds its ground this round.`] };
  }
  function skipSupport(st, which) {
    if (!canFire(st, which)) return { ok: false };
    st.fired[which] = true;
    if (st.tokens) st.activeId = 'gun:' + which;
    return { ok: true, lines: [`⏭️ The ${which === 'mortars' ? 'mortars' : 'artillery'} hold fire this round.`] };
  }

  function startRound(st) {
    st.tokens = true;
    // Shocked Germans who weren't hit last round come round; some rally anyway
    for (const u of st.units) if (u.side === 'de' && u.x !== null && u.shocked && (!u.hit || st.rand() < 0.3)) u.shocked = false;
    for (const u of st.units) { if (u.side === 'de') u.hit = false; u.halfShot = false; }
    st.bag = { us: movable(st, 'us'), de: movable(st, 'de') };
    st.drawn = null;
    st.activeId = null;
    st.deFired = {};
    st.roundRep = [];
  }

  // No more tokens for a side than it has pieces still to move
  function trimBag(st) {
    st.bag.us = Math.min(st.bag.us, movable(st, 'us'));
    st.bag.de = Math.min(st.bag.de, movable(st, 'de'));
  }

  // Draw a token: 'us', 'de', or null when the bag is empty. On a German token the Germans' move is set up (see germanStep):
  // one of their pieces, or their mortar or artillery
  function drawToken(st) {
    trimBag(st);
    const total = st.bag.us + st.bag.de;
    if (!total) return null;
    const side = st.rand() * total < st.bag.us ? 'us' : 'de';
    st.bag[side]--;
    st.drawn = side;
    st.activeId = null;
    st.fx = [];
    for (const u of st.units) u.halfShot = false;
    if (side === 'de') {
      const pick = pickGerman(st);
      if (pick.gun) {
        st.deFired[pick.gun] = true;
        st.de = { queue: [], mortar: pick.gun === 'mortars', artillery: pick.gun === 'artillery', rep: st.roundRep, ask: null, move: { gun: pick.gun, what: '' } };
      } else {
        pick.unit.acted = true;
        st.de = { queue: [pick.unit.id], mortar: false, artillery: false, rep: st.roundRep, ask: null, move: { id: pick.unit.id, what: '' } };
      }
    }
    return side;
  }

  // What moves on a German token: their guns if they have a target, then a piece with someone to shoot, then any
  function pickGerman(st) {
    const options = st.units.filter(u => u.side === 'de' && u.x !== null && !u.acted).map(u => ({ unit: u, score: (bestTarget(st, u) ? 2 : 0) + st.rand() }));
    if (st.deMortarAmmo > 0 && !st.deFired.mortars) options.push({ gun: 'mortars', score: (germanMortarTarget(st) ? 2.5 : -1) + st.rand() });
    if (st.deArtilleryAmmo > 0 && !st.deFired.artillery) options.push({ gun: 'artillery', score: (germanArtilleryTarget(st) ? 2.5 : -1) + st.rand() });
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
    const captainCanRally = u.kind === 'captain' && canRally(st, u) && rallyTargets(st, u).length > 0;
    return !canAct(st, u) && !u.halfShot && !captainCanRally;
  }

  // Pass on an American token, or finish with it
  function passToken(st) {
    st.drawn = null;
    st.activeId = null;
    for (const u of st.units) u.halfShot = false;
  }

  // Can any American piece move on this token?
  const usCanMove = st => canFire(st, 'mortars') || canFire(st, 'artillery') || st.units.some(u => u.side === 'us' && u.x !== null && (canAct(st, u) || canSelfRally(st, u) || (u.kind === 'captain' && canRally(st, u))));

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
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    if (holdsObjective(st)) {
      st.won = true;
      // Taken and held at the end of an hour wins at once
      rep.unshift(`🏆 ${st.objective.name} is taken and held at ${hourText(st.turn + 1)}!`);
    } else if (!germansLeft) {
      // Every German on the table destroyed wins too (Steve), even with no rifle platoons left to take the village
      st.won = true;
      rep.unshift(`🏆 Every German on the field is destroyed by ${hourText(st.turn + 1)}!`);
    } else if (!st.units.some(u => u.side === 'us' && u.x !== null)) {
      st.lost = true;
      rep.unshift('💀 Nothing is left of the company. The attack has failed.');
    } else if (TURNS && st.turn >= TURNS) {
      st.lost = true;
      rep.unshift(`⌛ ${hourText(TURNS + 1)}: the attack has run out of time short of ${st.objective.name}.`);
    }
    if (!st.won && !st.lost) newTurn(st, rep);
    st.report = rep.length ? rep : ['A quiet hour.'];
  }

  // A new hour: rest the shaken, a fresh move for every piece (except those that took cover), fire support, ammo and reinforcements
  function newTurn(st, rep) {
    st.turn++;
    for (const u of st.units) {
      if (u.side !== 'us' || u.x === null) continue;
      if (u.shocked && !u.hit) { u.shocked = false; rep.push(`😮‍💨 ${u.name} has rested and recovered.`); }
      const missed = !!u.spentNext;
      u.hit = false; u.acted = missed; u.spentNext = false; u.rallied = 0;
      // Down in cover: it stays down through the hour it misses, then gets up
      if (!missed) u.down = false;
    }
    for (const u of st.units) if (u.side === 'de') u.acted = false;
    if ((st.turn - 1) % MORTARS.resupplyEvery === 0) st.ammo.mortars++;
    if ((st.turn - 1) % ARTILLERY.resupplyEvery === 0) st.ammo.artillery++;
    if ((st.turn - 1) % DE_ARTILLERY.resupplyEvery === 0) st.deArtilleryAmmo++;
    st.fired = {};
    reinforcements(st, rep);
  }

  return {
    newGame, endTurn, inside, tileType, hedge, at, unitById, isTank, isTeam, adjacent, sees, targets, moves, chargeSpots,
    rallyTargets, canAct, groupOf, groupName, members, canReact, firepower, teamsOf, canCallFire, holdsObjective, hourText, roomFor,
    startGermanHour, germanStep, answer, finishHour, startRound, drawToken, endGermanToken, activationOver, passToken, usCanMove, endRound, canFire, actSkip, skipSupport,
    actShoot, actMoveShoot, moveShootSpots, chargeRoutes, DIRS, needWhy, shellNeed, shellWhy, shellFields, canRally, needFor, canSelfRally, actSelfRally, actHalfShot, actMove, actCharge, actRally, actFire, actBreach, breachSpots, sight, isSmall, cover, wire, lineSides, actLine, atHedge, acrossHedge, SIDE_NAMES, PLACES, placeXY, placeName, lines,
    hasCutters: u => cutter(u),
  };
})();

if (typeof module !== 'undefined') module.exports = Sim;
