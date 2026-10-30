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

  // How many pieces a field holds for one side: one company, one tank platoon and three small pieces (captains, teams, guns)
  function roomFor(st, unit, x, y, leaving = []) {
    const here = at(st, x, y).filter(u => !leaving.includes(u));
    if (here.some(u => u.side !== unit.side)) return false;
    const company = here.filter(u => u.kind === 'company').length;
    const tanks = here.filter(isTank).length;
    const small = here.filter(isSmall).length;
    // A hamlet or the village has room in its yard for one company or one tank platoon, not both
    const built = tileType(x, y) === 'village' || tileType(x, y) === 'hamlet';
    if (unit.kind === 'company') return company === 0 && !(built && tanks);
    if (isTank(unit)) return tanks === 0 && !(built && company);
    return small < 3;
  }

  function newGame(seed) {
    seed = seed || (Date.now() % 1e9);
    const R = rng(seed);
    const st = {
      seed, turn: 1, hedges: {}, wire: {}, units: [], report: [], fx: [],
      points: {},
      ammo: { mortars: MORTARS.ammo, artillery: ARTILLERY.ammo },
      deMortarAmmo: DE_MORTAR.ammo, won: false, lost: false,
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
    for (const d of DE_START) if (d.attach) unitById(st, d.attach).attachedTo = d.id;
    st.rand = R;
    deploy(st, 'us'); deploy(st, 'de');
    earnPoints(st);
    st.report = [`${START_DATE}, 06:00. The company attacks into the bocage. Take ${st.objective.name} and hold it at ${hourText(TURNS + 1)}.`];
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
    if (side === 'de') for (const u of st.units.filter(u => u.side === 'de')) if (u.post) u.post = postField(st, u.post);
    for (const u of leaders.filter(u => u.garrison)) {
      u.x = u.post.x; u.y = u.post.y;
      for (const c of st.units) if (c.attachedTo === u.id || (c.garrison && c.post.x === u.x && c.post.y === u.y && c.side === side)) { c.x = u.x; c.y = u.y; }
    }
    for (const u of leaders) {
      if (u.garrison) continue;
      const options = fields.map(f => ({ f, w: worth(f) })).sort((a, b) => b.w - a.w);
      const spot = options.find(o => roomFor(st, u, o.f.x, o.f.y));
      u.x = spot.f.x; u.y = spot.f.y;
      // Its attached teams with it
      for (const c of st.units) if (c.attachedTo === u.id) { c.x = u.x; c.y = u.y; }
    }
  }

  // A post given from the objective: the field there, or the nearest one that isn't river
  function postField(st, [dx, dy]) {
    const want = { x: Math.max(0, Math.min(COLS - 1, st.objective.x + dx)), y: Math.max(0, Math.min(ROWS - 1, st.objective.y + dy)) };
    if (tileType(want.x, want.y) !== 'river') return want;
    for (let r = 1; r < COLS; r++) for (const [ex, ey] of NEIGHBOURS) { const x = want.x - r * Math.sign(dx || 1) * Math.abs(ex), y = want.y + r * ey; if (inside(x, y) && tileType(x, y) !== 'river') return { x, y }; }
    return want;
  }

  const hourText = turn => `${String(START_HOUR + turn - 1).padStart(2, '0')}:00`;

  // ---------- Command points ----------

  // The command group a piece belongs to: its company (with its attached teams), the tank company, or the battalion (the captain and lone teams)
  function groupOf(u) {
    if (u.side !== 'us') return null;
    if (u.kind === 'company') return u.id;
    if (u.kind === 'captain') return 'bn';
    if (isTank(u)) return 'T';
    if (isTeam(u)) return u.attachedTo || 'bn';
    return null;
  }

  const GROUP_NAMES = { T: 'Tanks', bn: 'Company HQ' };
  function groupName(st, g) { return GROUP_NAMES[g] || (unitById(st, g) || {}).name || g; }

  // The pieces in a group
  function members(st, g) { return st.units.filter(u => u.side === 'us' && u.x !== null && groupOf(u) === g); }

  // Points a group earns an hour, kept to its bank: a company one for itself and two thirds for each team with it;
  // the tank company two thirds for each platoon; the battalion a fixed number (the captain, fire missions, lone teams)
  function earnPoints(st) {
    const groups = new Set(st.units.filter(u => u.side === 'us' && u.x !== null).map(groupOf));
    for (const g of groups) {
      if (g === 'bn') continue;
      const n = members(st, g).length;
      const share = g === 'T' ? n * COMMAND_SHARE : 1 + (n - 1) * COMMAND_SHARE;
      st.points[g] = Math.min(COMMAND_BANK, (st.points[g] || 0) + share);
    }
    st.points.bn = Math.min(BN_BANK, (st.points.bn || 0) + BN_POINTS);
  }

  // Whole points a piece's group has to spend
  function pointsFor(st, u) {
    const g = groupOf(u);
    return g ? Math.floor((st.points[g] || 0) + 1e-9) : 0;
  }

  function spend(st, u) {
    st.points[groupOf(u)] -= 1;
    u.acted = true;
    for (const o of st.units) o.halfShot = false;
  }

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
  // Up to SIGHT_RANGE fields over open fields and lanes; villages, hamlets and orchards in between block the view.
  // Hedges (Steve): the hedge next to the shooter is seen through only if the shooter lines it; the hedge next to the target
  // only if the target lines it (it is then in cover, one more to hit); with one hedge between them either lining it will do,
  // and the target has cover if it lines it. Any other hedge in between blocks the view. Beyond the next field: one more to hit.
  // Returns null (can't see) or { cover } added to the score needed
  function sight(st, from, target) {
    const dist = Math.hypot(target.x - from.x, target.y - from.y);
    if (dist === 0 || dist > SIGHT_RANGE + 0.01) return null;
    const path = fieldsAlong(from, target);
    let c = dist > 1.5 ? LONG_RANGE : 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const p = path[i], q = path[i + 1];
      // A field in between that blocks the view
      if (i > 0 && ['village', 'hamlet', 'orchard'].includes(tileType(p.x, p.y))) return null;
      if (!hedge(st, p.x, p.y, q.x, q.y)) continue;
      const first = i === 0, last = i + 1 === path.length - 1;
      const shooterLines = first && from.at === dirTo(p, q);
      const targetLines = last && target.at === dirTo(q, p);
      if (!shooterLines && !targetLines) return null;
      if (targetLines) c += COVER.hedge;
    }
    return { cover: c };
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

  // Roll n six-sided dice needing `need` or more (a 6 always hits). The faces go into `faces` for the dice on the table
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
  const atHedge = (u, other) => !!u.at && u.at === dirTo(u, other);
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
    return c;
  }

  // What hits do to a piece. Soft hits shock infantry and kill platoons; only hard hits knock out tanks
  function damage(st, u, softHits, hardHits) {
    const name = u.name, out = [];
    u.hit = u.hit || softHits + hardHits > 0;
    if (isTank(u)) {
      if (hardHits > 0) {
        u.platoons = Math.max(0, u.platoons - hardHits);
        out.push(`${name}: ${hardHits} tank${hardHits > 1 ? 's' : ''} knocked out`);
      }
      if ((softHits >= 2 || hardHits > 0) && u.platoons > 0) { if (!u.shocked) out.push(`${name} shocked`); u.shocked = true; }
    } else if (isTeam(u) || u.kind === 'captain') {
      const hits = softHits + hardHits;
      if (hits >= 2 || (hits >= 1 && u.shocked)) { u.platoons = 0; out.push(`${name} wiped out`); }
      else if (hits >= 1) { u.shocked = true; out.push(`${name} shocked`); }
    } else {
      const hits = softHits + hardHits;
      if (hits > 0) {
        // Two hits cost a platoon; already shaken, every other hit rounds up
        const lost = Math.min(u.platoons, u.shocked ? Math.ceil(hits / 2) : Math.floor(hits / 2));
        u.platoons -= lost;
        u.shocked = true;
        out.push(lost ? `${name} loses ${lost} section${lost > 1 ? 's' : ''}` : `${name} shocked`);
      }
    }
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
  function fireAt(st, shooter, target, power, withdraw = false) {
    const f = firepower(st, shooter);
    const need = TO_HIT + cover(st, shooter, target) - QUALITY[shooter.quality || 'standard'].shoot;
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
    const pre = withdraw ? pullBack(st, target, shooter) : null;
    if (pre && pre.ok) { softHits = Math.floor(softHits * WITHDRAW.keep); hardHits = Math.floor(hardHits * WITHDRAW.keep); }
    const out = (pre ? [pre.line] : []).concat(damage(st, target, softHits, hardHits));
    st.fx.push({ x: target.x, y: target.y, kind: softHits + hardHits ? 'hit' : 'miss', faces, need: Math.min(6, need + (isTank(target) ? PIECES[target.kind].armour : 0)), side: shooter.side });
    return out.length ? out : [`${target.name}: no hits`];
  }

  // A piece fired on tries to pull back: one of its company's points, a chance on its quality, and a field away from the fire
  function pullBack(st, u, from) {
    st.points[groupOf(u)] -= 1;
    if (st.rand() >= WITHDRAW[u.quality || 'standard']) return { ok: false, line: `${u.name} tries to pull back but is pinned` };
    const spot = retreatSpot(st, u, from);
    if (spot) step(st, u, spot.x, spot.y);
    return { ok: true, line: `${u.name} pulls back${spot ? '' : ' into cover'}` };
  }

  // Can this piece react now: an American piece whose company has a whole point left
  function canReact(st, u) {
    return u.side === 'us' && u.x !== null && u.kind !== 'captain' && !PIECES[u.kind].fixed && pointsFor(st, u) > 0;
  }

  // Pieces a shooter could fire at: enemies next to it (across any hedge) or two fields away along a clear line, that its side can see
  function targets(st, shooter) {
    // Captains and anything without weapons shoot at nobody
    const f = firepower(st, shooter);
    if (shooter.kind === 'captain' || f.soft + f.hard <= 0) return [];
    return st.units.filter(t => t.side !== shooter.side && t.x !== null && t.kind !== 'captain'
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

  // Move a piece, and the teams attached to it. A tank with hedge cutters going through a hedge leaves a gap.
  // Returns what happened to the hedge: 'cut' (driven through), 'climbed' (men clambered over) or ''
  function step(st, u, x, y, assault = false) {
    let how = '';
    if (wire(st, u.x, u.y, x, y) && isTank(u)) { delete st.wire[edgeKey(u.x, u.y, x, y)]; how = 'flattened'; }
    if (hedge(st, u.x, u.y, x, y)) {
      if (cutter(u)) { delete st.hedges[edgeKey(u.x, u.y, x, y)]; how = 'cut'; } else how = 'climbed';
    }
    const teams = u.kind === 'company' ? teamsOf(st, u) : [];
    const heading = dirTo(u, { x, y });
    u.x = x; u.y = y; u.at = heading;
    for (const t of teams) { t.x = x; t.y = y; t.at = heading; }
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
    return !!u && u.side === 'us' && u.x !== null && !st.won && !st.lost && !st.de && !u.shocked && !u.acted && pointsFor(st, u) > 0;
  }

  function actShoot(st, u, target) {
    if (!canAct(st, u) || u.kind === 'captain' || !targets(st, u).includes(target)) return { ok: false };
    spend(st, u);
    return { ok: true, lines: [`🔫 ${u.name} fires on ${target.name}: ` + fireAt(st, u, target, 1).join(', ') + '.'] };
  }

  // Move and shoot: one point moves the piece a field, then it may fire once at half power (actHalfShot) before doing anything else
  function actMoveShoot(st, u, x, y) {
    if (!canAct(st, u) || u.kind === 'captain' || !canStep(st, u, x, y)) return { ok: false };
    spend(st, u);
    const how = step(st, u, x, y);
    u.halfShot = targets(st, u).length > 0;
    return { ok: true, lines: [moveLine(u, how)] };
  }

  function actHalfShot(st, u, target) {
    if (!u || !u.halfShot || u.shocked || u.x === null || !targets(st, u).includes(target)) return { ok: false };
    u.halfShot = false;
    return { ok: true, lines: [`🔫 ${u.name} fires on the move at ${target.name}: ` + fireAt(st, u, target, MOVE_SHOOT).join(', ') + '.'] };
  }

  function moveLine(u, how) {
    if (how === 'cut') return `🚜 ${u.name} smashes through the hedge, leaving a gap.`;
    if (how === 'climbed') return `🧗 ${u.name} struggles over the hedge bank.`;
    if (how === 'flattened') return `🚜 ${u.name} flattens the barbed wire.`;
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

  // The fields a charge can reach in one step from a field: empty ones it can enter, or ones the enemy holds to assault.
  // Men charge across a hedge only to assault the enemy behind it; into an empty field they must break through
  function chargeSteps(st, u, fx, fy) {
    const out = [];
    for (const [dx, dy] of NEIGHBOURS) {
      const x = fx + dx, y = fy + dy;
      if (!inside(x, y) || tileType(x, y) === 'river') continue;
      if (isTank(u) && !cutter(u) && hedge(st, fx, fy, x, y)) continue;
      if (!isTank(u) && wire(st, fx, fy, x, y)) continue;
      const enemies = at(st, x, y, enemyOf(u.side));
      const blocked = hedge(st, fx, fy, x, y) && !cutter(u);
      if (enemies.length) out.push({ x, y, assault: true });
      else if (!blocked && roomFor(st, u, x, y)) out.push({ x, y, assault: false });
    }
    return out;
  }

  // A charge goes twice as far as a move: up to two fields, the second can be an assault. Each route is the fields it passes
  function chargeRoutes(st, u) {
    if (u.kind !== 'company' && !isTank(u)) return [];
    const routes = [];
    for (const a of chargeSteps(st, u, u.x, u.y)) {
      routes.push([a]);
      if (a.assault) continue;
      for (const b of chargeSteps(st, u, a.x, a.y)) {
        if (b.x === u.x && b.y === u.y) continue;
        if (!routes.some(r => r[r.length - 1].x === b.x && r[r.length - 1].y === b.y)) routes.push([a, b]);
      }
    }
    return routes;
  }

  function chargeSpots(st, u) {
    return chargeRoutes(st, u).map(r => ({ x: r[r.length - 1].x, y: r[r.length - 1].y }));
  }

  function actCharge(st, u, x, y) {
    const route = canAct(st, u) && chargeRoutes(st, u).find(r => r[r.length - 1].x === x && r[r.length - 1].y === y);
    if (!route) return { ok: false };
    spend(st, u);
    const lines = [];
    // The first field of a two-field charge is crossed on the way
    if (route.length === 2) { const how = step(st, u, route[0].x, route[0].y); if (how) lines.push(moveLine(u, how).replace(/\.$/, '')); }
    lines.push(...charge(st, u, x, y));
    return { ok: true, lines: [lines.join(', ') + '.'] };
  }

  // Breaking through a hedge (or cutting barbed wire): any piece without hedge cutters can push through into the next
  // (empty) field, leaving a gap. It is its move for the hour, with no shooting. Tanks with cutters just drive through
  function breachSpots(st, u) {
    if (PIECES[u.kind].fixed || cutter(u)) return [];
    return NEIGHBOURS.map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy })).filter(p => inside(p.x, p.y) && tileType(p.x, p.y) !== 'river'
      && (hedge(st, u.x, u.y, p.x, p.y) || (!isTank(u) && wire(st, u.x, u.y, p.x, p.y))) && roomFor(st, u, p.x, p.y));
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

  // The hedges of its field a piece could go and line (not the one it already lines)
  function lineSides(st, u) {
    if (PIECES[u.kind].fixed || u.kind === 'captain') return [];
    return Object.keys(DIRS).filter(d => d !== u.at && inside(u.x + DIRS[d][0], u.y + DIRS[d][1]) && hedge(st, u.x, u.y, u.x + DIRS[d][0], u.y + DIRS[d][1]));
  }

  // Line a hedge of its own field: the piece's move for the hour, so it can fire through that hedge
  function actLine(st, u, side) {
    if (!canAct(st, u) || !lineSides(st, u).includes(side)) return { ok: false };
    spend(st, u);
    u.at = side;
    for (const t of u.kind === 'company' ? teamsOf(st, u) : []) t.at = side;
    return { ok: true, lines: [`🌳 ${u.name} lines the ${SIDE_NAMES[side]} hedge.`] };
  }

  // Shocked friendly pieces a captain can reach
  function rallyTargets(st, cap) {
    return st.units.filter(t => t.side === cap.side && t.x !== null && t.shocked && Math.abs(t.x - cap.x) + Math.abs(t.y - cap.y) <= RALLY_RANGE);
  }

  function actRally(st, cap, target) {
    if (!canAct(st, cap) || cap.kind !== 'captain' || !rallyTargets(st, cap).includes(target)) return { ok: false };
    spend(st, cap);
    const ok = st.rand() < QUALITY[target.quality || 'standard'].rally;
    if (ok) target.shocked = false;
    return { ok: true, lines: [ok ? `📣 ${cap.name} rallies ${target.name}.` : `📣 ${cap.name} can't get ${target.name} moving yet.`] };
  }

  // Attach a team to the company in its field (it moves with it and comes under its command), or detach it. Costs a battalion point
  function actAttach(st, team, company) {
    if (!isTeam(team) || team.side !== 'us' || (st.points.bn || 0) < 1 || PIECES[team.kind].fixed || st.de) return { ok: false };
    if (team.attachedTo) {
      team.attachedTo = null;
      st.points.bn -= 1;
      return { ok: true, lines: [`🔗 ${team.name} detached.`] };
    }
    if (!company || company.kind !== 'company' || company.side !== 'us' || company.x !== team.x || company.y !== team.y) return { ok: false };
    if (teamsOf(st, company).length >= 2) return { ok: false };
    team.attachedTo = company.id;
    st.points.bn -= 1;
    return { ok: true, lines: [`🔗 ${team.name} attached to ${company.name}.`] };
  }

  // Fields the battalion can call fire on: seen, with no Americans in them
  function canCallFire(st, x, y) {
    return inside(x, y) && sees(st, 'us', x, y) && at(st, x, y, 'us').length === 0;
  }

  // A fire mission from the mortars or the guns: dice on every piece in the field, and a few on the fields round it
  function fireMission(st, which, x, y, side = 'us') {
    const S = which === 'mortars' ? MORTARS : ARTILLERY;
    const lines = [];
    const hitField = (fx, fy, n) => {
      for (const t of at(st, fx, fy, enemyOf(side))) {
        if (t.x === null || t.kind === 'captain') continue;
        const need = TO_HIT + (tileType(fx, fy) === 'village' ? COVER.village : 0);
        const faces = [];
        const soft = roll(st, n, need, faces), hard = isTank(t) ? roll(st, S.hard || 0, need + PIECES[t.kind].armour, faces) : 0;
        lines.push(...damage(st, t, soft, hard));
        st.fx.push({ x: fx, y: fy, kind: 'shell', faces, need, side });
      }
      if (!at(st, fx, fy, enemyOf(side)).length) st.fx.push({ x: fx, y: fy, kind: 'shell' });
    };
    hitField(x, y, S.dice);
    if (S.splash) for (const [dx, dy] of NEIGHBOURS) if (inside(x + dx, y + dy)) hitField(x + dx, y + dy, S.splash);
    return lines;
  }

  function actFire(st, which, x, y) {
    if (st.won || st.lost || st.de || (st.points.bn || 0) < 1 || st.ammo[which] <= 0 || !canCallFire(st, x, y)) return { ok: false };
    st.points.bn -= 1;
    st.ammo[which]--;
    const S = which === 'mortars' ? MORTARS : ARTILLERY;
    const lines = fireMission(st, which, x, y);
    return { ok: true, lines: [`💥 ${S.name} fire on the field: ${lines.length ? lines.join(', ') : 'no hits'}.`] };
  }

  // ---------- The Germans ----------

  // What a German piece would most like to shoot: tanks for anti-tank weapons, otherwise the weakest infantry
  function bestTarget(st, u) {
    const ts = st.units.filter(t => t.side === 'us' && t.x !== null && t.kind !== 'captain' && !!sight(st, u, t));
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
    st.de = { queue: st.units.filter(u => u.side === 'de' && u.x !== null && !u.shocked).map(u => u.id), mortar: st.deMortarAmmo > 0, rep: [], ask: null };
  }

  // What one German piece does: throw Americans out of the hamlet, counterattack a shaken company, shoot, or (reserves) move up.
  // Returns a planned shot { shooter, target } instead of firing, so the target can be offered a chance to pull back
  function germanAct(st, u) {
    const rep = st.de.rep;
    const inHamlet = at(st, st.objective.x, st.objective.y, 'us').length > 0;
    if (inHamlet && (u.kind === 'company' || isTank(u)) && adjacent(u, st.objective) && !(isTank(u) && hedge(st, u.x, u.y, st.objective.x, st.objective.y))) {
      rep.push('🔺 ' + charge(st, u, st.objective.x, st.objective.y).join(', ') + '.');
      return null;
    }
    const weak = st.units.find(t => t.side === 'us' && t.x !== null && t.kind === 'company' && adjacent(u, t) && t.shocked);
    if (u.kind === 'company' && u.platoons >= 2 && weak && st.rand() < 0.5) {
      rep.push('🔺 ' + charge(st, u, weak.x, weak.y).join(', ') + '.');
      return null;
    }
    const t = bestTarget(st, u);
    if (t) return { shooter: u.id, target: t.id };
    // Americans just across a hedge it isn't lining: go to that hedge
    const across = st.units.find(o => o.side === 'us' && o.x !== null && acrossHedge(st, u, o) && !atHedge(u, o));
    if (across && !PIECES[u.kind].fixed && !(isTeam(u) && u.attachedTo)) {
      u.at = dirTo(u, across);
      for (const tm of u.kind === 'company' ? teamsOf(st, u) : []) tm.at = u.at;
      return null;
    }
    // On the way to its post: march there and dig in
    if (u.post && !u.reserve && (u.x !== u.post.x || u.y !== u.post.y) && !(isTeam(u) && u.attachedTo)) {
      const next = stepToward(st, u, u.post);
      if (next) germanMove(st, u, next);
      return null;
    }
    // Reserves: a company goes to hold the hamlet if nobody does; the rest move up towards the nearest Americans
    if (u.reserve) {
      if (u.x === st.objective.x && u.y === st.objective.y && u.kind === 'company') return null;
      const garrison = at(st, st.objective.x, st.objective.y, 'de').some(g => g.kind === 'company');
      const us = st.units.filter(o => o.side === 'us' && o.x !== null);
      const near = us.sort((a, b) => (Math.abs(a.x - u.x) + Math.abs(a.y - u.y)) - (Math.abs(b.x - u.x) + Math.abs(b.y - u.y)))[0];
      const goal = (!garrison && u.kind === 'company') || !near ? st.objective : near;
      const next = stepToward(st, u, goal);
      if (next) germanMove(st, u, next);
    }
    return null;
  }

  // A German piece moves a field, breaking through a hedge or wire on the way if it has to
  function germanMove(st, u, p) {
    const key = edgeKey(u.x, u.y, p.x, p.y);
    if (!canStep(st, u, p.x, p.y)) { delete st.hedges[key]; delete st.wire[key]; }
    step(st, u, p.x, p.y);
  }

  // The German mortar picks the strongest American company next to a German field
  function germanMortarTarget(st) {
    const ts = st.units.filter(t => t.side === 'us' && t.x !== null && t.kind === 'company' && st.units.some(g => g.side === 'de' && g.x !== null && adjacent(g, t)));
    return ts.sort((a, b) => b.platoons - a.platoons)[0] || null;
  }

  // Carry out a planned German shot (or mortar mission), with or without the target pulling back
  function resolveShot(st, shot, withdraw) {
    const t = unitById(st, shot.target);
    if (t.x === null) return;
    if (shot.mortar) {
      st.deMortarAmmo--;
      const fx = { x: t.x, y: t.y, kind: 'shell' };
      // Pulling back from a mortar: away from the Germans' side of the board
      const pre = withdraw ? pullBack(st, t, { x: t.x + 1, y: t.y }) : null;
      const need = TO_HIT + (t.x !== null && tileType(t.x, t.y) === 'village' ? COVER.village : 0);
      const faces = [];
      let hits = roll(st, DE_MORTAR.dice, need, faces);
      fx.faces = faces; fx.need = need; fx.side = 'de';
      if (pre && pre.ok) hits = Math.floor(hits * WITHDRAW.keep);
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
      if (u.x === null || u.shocked) continue;
      const shot = germanAct(st, u);
      if (!shot) continue;
      if (canReact(st, unitById(st, shot.target))) { st.de.ask = shot; return { ask: shot }; }
      resolveShot(st, shot, false);
    }
    if (st.de.mortar) {
      st.de.mortar = false;
      const t = germanMortarTarget(st);
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
    const rep = st.de ? st.de.rep : [];
    st.de = null;
    if (holdsObjective(st)) {
      st.won = true;
      // Taken and held at the end of an hour wins at once
      rep.unshift(`🏆 ${st.objective.name} is taken and held at ${hourText(st.turn + 1)}!`);
    } else if (!st.units.some(u => u.side === 'us' && u.kind === 'company' && u.x !== null)) {
      st.lost = true;
      rep.unshift('💀 The company has no rifle platoons left. The attack has failed.');
    } else if (st.turn >= TURNS) {
      st.lost = true;
      rep.unshift(`⌛ ${hourText(TURNS + 1)}: the attack has run out of time short of ${st.objective.name}.`);
    }
    if (!st.won && !st.lost) newTurn(st, rep);
    st.report = rep.length ? rep : ['A quiet hour.'];
  }

  // A new hour: rest the shaken, fresh command points (saving what was left), ammo and reinforcements
  function newTurn(st, rep) {
    st.turn++;
    for (const u of st.units) {
      if (u.side !== 'us' || u.x === null) continue;
      if (u.shocked && !u.hit) { u.shocked = false; rep.push(`😮‍💨 ${u.name} has rested and recovered.`); }
      u.hit = false; u.acted = false;
    }
    if ((st.turn - 1) % MORTARS.resupplyEvery === 0) st.ammo.mortars++;
    if ((st.turn - 1) % ARTILLERY.resupplyEvery === 0) st.ammo.artillery++;
    reinforcements(st, rep);
    earnPoints(st);
  }

  return {
    newGame, endTurn, inside, tileType, hedge, at, unitById, isTank, isTeam, adjacent, sees, targets, moves, chargeSpots,
    rallyTargets, canAct, pointsFor, groupOf, groupName, members, canReact, firepower, teamsOf, canCallFire, holdsObjective, hourText, roomFor,
    startGermanHour, germanStep, answer, finishHour,
    actShoot, actMoveShoot, actHalfShot, actMove, actCharge, actRally, actAttach, actFire, actBreach, breachSpots, sight, isSmall, cover, wire, lineSides, actLine, atHedge, acrossHedge, SIDE_NAMES,
    hasCutters: u => cutter(u),
  };
})();

if (typeof module !== 'undefined') module.exports = Sim;
