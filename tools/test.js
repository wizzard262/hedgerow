// Headless checks of the rules in js/sim.js: node tools/test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
load('data.js'); load('sim.js'); load('scenery.js');
const { play, playAsGermans, playRobots } = require('./bot.js');

let failed = 0;
// node tools/test.js <words>: only the checks whose names contain those words (Steve, 2026-11-21: just the ones for a fix)
const only = process.argv[2] || '';
function check(name, fn) {
  if (only && !name.includes(only)) return;
  try { fn(); console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n      ', e.message); }
}
function assert(ok, message) { if (!ok) throw new Error(message); }
const live = st => st.units.filter(u => u.x !== null);
// A field's units are allowed (Steve): each field is nine areas, and no two pieces of a side take the same one
function fieldOk(st, x, y) {
  for (const side of ['us', 'de']) {
    const taken = [];
    for (const u of live(st).filter(o => o.x === x && o.y === y && o.side === side)) taken.push(...Sim.footprint(u));
    if (new Set(taken).size !== taken.length) return false;
  }
  return true;
}

// The whole of the Germans' side moves, for checks of how they behave: every piece, then their mortars and artillery
function startGermanRound(st) {
  for (const u of st.units) u.halfShot = false;
  st.fx = [];
  st.computer = { queue: st.units.filter(u => u.side === 'de' && u.x !== null).map(u => u.id), mortar: st.ammo.de.mortars > 0, artillery: st.ammo.de.artillery > 0, rep: [], ask: null };
}
// All of that, then the end of the round. decide(shot) answers each question
function endTurn(st, decide = () => false) {
  if (st.won || st.lost) return;
  startGermanRound(st);
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, decide(r.ask));
  Sim.finishRound(st);
}

check('every script on the page parses (a slip in one stops the whole game loading)', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js')).filter(n => n.endsWith('.js'))) {
    try { new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f }); }
    catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
});

check('the bonus battles in date order (Steve, 2026-11-16): the Winter War, Dunkirk, Stalingrad, the Bulge, outside the campaign, each with a picture, and stamped while they have no map', () => {
  assert(BONUS.map(b => b.id).join() === 'winterwar,dunkirk,stalingrad,kursk,bulge', `the bonus battles are ${BONUS.map(b => b.id).join()}`);
  // (Stalingrad is built now, Steve 2026-11-12: no stamp, it can be played)
  assert(!BONUS.find(b => b.id === 'stalingrad').stamp && MAPS.some(m => m.id === 'stalingrad'), 'Stalingrad is still stamped, or has no map');
  for (const b of BONUS) {
    assert(!CAMPAIGN.includes(b.id), `${b.name} is in the campaign`);
    // (a table picture once its map is built, Steve; a drawing until then)
    const picture = MAPS.some(m => m.id === b.id) ? b.id + '.jpg' : b.id + '.svg';
    assert(fs.existsSync(path.join(__dirname, '..', 'assets', 'maps', picture)), `${b.name} has no picture ${picture}`);
    // One with no map can't be started: it must carry a stamp, which stops it being picked
    if (!MAPS.some(m => m.id === b.id)) assert(b.stamp, `${b.name} has no map but no stamp either`);
  }
});

check('the same seed plays the same game', () => {
  const a = play(7, true), b = play(7, true);
  assert(JSON.stringify(a.units) === JSON.stringify(b.units) && a.turn === b.turn, 'two games with seed 7 ended differently');
});

check('both sides start in their own fifth of the board (the German garrison round the objective), never in the river', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed), cols = Math.round(COLS * DEPLOY);
    for (const u of live(st)) {
      assert(Sim.tileType(u.x, u.y) !== 'river', `${u.name} starts in the river`);
      if (u.garrison) { assert(Math.abs(u.x - st.objective.x) + Math.abs(u.y - st.objective.y) <= 2, `seed ${seed}: garrison ${u.name} far from the objective`); continue; }
      assert(u.side === 'us' ? u.x < cols : u.x >= COLS - cols, `seed ${seed}: ${u.name} starts at ${u.x},${u.y}`);
    }
  }
});

check('nothing goes negative, out of range or into the river in 100 games', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const st = play(seed, seed % 2 === 0);
    for (const u of live(st)) {
      assert(u.platoons > 0 && Sim.inside(u.x, u.y), `seed ${seed}: ${u.name} at ${u.x},${u.y} with ${u.platoons}`);
      assert(Sim.tileType(u.x, u.y) !== 'river', `seed ${seed}: ${u.name} in the river`);
    }
    assert(st.ammo.us.mortars >= 0 && st.ammo.us.artillery >= 0, `seed ${seed}: negative ammunition`);
    assert(!TURNS || st.won || st.lost, `seed ${seed}: game did not end`);
    assert(!TURNS || st.turn <= TURNS, `seed ${seed}: ran past the last hour`);
    // One unit to a field, except teams and the captain with a rifle platoon
    for (const u of live(st)) assert(fieldOk(st, u.x, u.y), `seed ${seed}: too many units share ${u.x},${u.y}`);
  }
});

check('every piece can move each hour', () => {
  const st = Sim.newGame(3);
  assert(st.units.filter(u => u.side === 'us' && u.x !== null).every(u => !u.acted), 'a piece starts the game having moved');
});

check('a piece acts once an hour', () => {
  const st = Sim.newGame(3);
  const able = Sim.unitById(st, 'A');
  st.hedges = {}; st.wire = {};
  const m = Sim.chargeSpots(st, able)[0];
  assert(Sim.actCharge(st, able, m.x, m.y).ok, 'first move refused');
  const m2 = Sim.chargeSpots(st, able)[0];
  assert(!m2 || !Sim.actCharge(st, able, m2.x, m2.y).ok, 'a second action in the same hour was allowed');
});

check('a charge can pass through a field of friends but not stop in it', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  // (A field holds one tank pair: the other pair's field can be passed through, not stopped in)
  const tank = Sim.unitById(st, 'T1'), able = Sim.unitById(st, 'T2');
  for (const u of st.units) if (u !== tank && u !== able) u.x = u.y = null;
  tank.x = 0; tank.y = 6; able.x = 1; able.y = 6;
  const spots = Sim.chargeSpots(st, tank);
  assert(spots.some(p => p.x === 2 && p.y === 6), 'the tank could not charge through the other pair');
  assert(!spots.some(p => p.x === 1 && p.y === 6), "the tank could stop in the other pair's field");
  assert(Sim.actCharge(st, tank, 2, 6).ok && tank.x === 2, 'the charge through the other pair did not arrive');
});

check('no charging through a house', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    for (const u of st.units.filter(u => u.side === 'us' && u.x !== null)) {
      // No charge route passes through a village or hamlet: houses can only be the end of one
      for (const route of Sim.chargeRoutes(st, u)) {
        const through = route.slice(0, -1).find(m => ['village', 'hamlet'].includes(Sim.tileType(m.x, m.y)));
        const goal = route[route.length - 1];
        assert(!through, `seed ${seed}: ${u.name} charges through houses at ${through && through.x},${through && through.y} to ${goal.x},${goal.y}`);
      }
    }
  }
});

check('Move & shoot only goes where the piece will have someone to shoot', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const st = Sim.newGame(seed);
    for (const u of st.units.filter(u => u.side === 'us' && u.x !== null)) {
      for (const p of Sim.moveShootSpots(st, u)) {
        const home = { x: u.x, y: u.y, at: u.at, acted: u.acted };
        Sim.actMoveShoot(st, u, p.x, p.y);
        assert(Sim.targets(st, u, true).length > 0, `seed ${seed}: ${u.name} moved to ${p.x},${p.y} with nobody to shoot`);
        Object.assign(u, home); u.halfShot = false;
        break;
      }
    }
  }
});

check('a charge reaches three fields, Move & shoot two', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const able = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== able) u.x = u.y = null;
  able.x = 0; able.y = 6;
  const far = p => Math.abs(p.x - able.x) + Math.abs(p.y - able.y);
  assert(Sim.chargeSpots(st, able).some(p => far(p) === 3), 'no charge reaches three fields');
  assert(Sim.chargeSpots(st, able).every(p => far(p) <= 3), 'a charge went further than three fields');
  assert(Sim.actCharge(st, able, 3, 6).ok && able.x === 3, 'the three-field charge did not arrive');
  // Move & shoot: put a German where it can be seen from two fields on, and none nearer
  const st2 = Sim.newGame(3);
  st2.hedges = {}; st2.wire = {};
  const b = Sim.unitById(st2, 'A'), de = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st2.units) if (u !== b && u !== de) u.x = u.y = null;
  b.x = 0; b.y = 6; de.x = 3; de.y = 6;
  const spots = Sim.moveShootSpots(st2, b);
  assert(spots.every(p => Math.abs(p.x - 0) + Math.abs(p.y - 6) <= 2), 'Move & shoot went further than two fields');
  assert(spots.some(p => p.x === 2 && p.y === 6), 'Move & shoot could not go two fields');
  assert(Sim.actMoveShoot(st2, b, 2, 6).ok && b.x === 2, 'the two-field Move & shoot did not arrive');
});

check('every tank drives through hedges; only tanks get through wire; men climb hedges', () => {
  const st = Sim.newGame(5);
  const sher = Sim.unitById(st, 'T1'), ff = Sim.unitById(st, 'T2'), co = Sim.unitById(st, 'B');
  // Clear the board of everyone else, and put each piece in an empty field with a field to its east
  for (const u of st.units) if (![sher, ff, co].includes(u)) u.x = u.y = null;
  const key = Sim.edgeKey;
  const setUp = (u, y) => { u.x = 0; u.y = y; const k = key(0, y, 1, y); delete st.hedges[k]; delete st.wire[k]; return k; };
  const k1 = setUp(sher, 0); st.hedges[k1] = true;
  assert(Sim.actCharge(st, sher, 1, 0).ok && sher.x === 1, 'the Sherman could not drive through the hedge');
  assert(!st.hedges[k1], 'the Sherman left the hedge standing');
  // (Steve: the hedge stays on the table with its middle trampled, a gap from then on)
  assert(st.trampled[k1], 'the hedge the Sherman drove through was not marked trampled');
  const k2 = setUp(ff, 6); st.hedges[k2] = true;
  assert(Sim.chargeSpots(st, ff).some(p => p.x === 1 && p.y === 6) && 'the Firefly should drive through hedges with no separate Break through');
  const k3 = setUp(co, 3); st.wire[k3] = true;
  assert(!Sim.chargeSpots(st, co).some(p => p.x === 1 && p.y === 3), 'men got through barbed wire');
  // Men climb a hedge as part of a charge, using one more move: the hedge stays, and they get one field less far
  const k4 = setUp(co, 5); co.acted = false; st.hedges[k4] = true;
  assert(Sim.chargeSpots(st, co).some(p => p.x === 1 && p.y === 5), 'men could not climb the hedge in a charge');
  assert(Sim.chargeSpots(st, co).some(p => p.x === 2 && p.y === 5), 'men could not go on a field after climbing');
  assert(!Sim.chargeSpots(st, co).some(p => p.x === 3 && p.y === 5), 'climbing the hedge cost nothing');
  assert(Sim.actCharge(st, co, 2, 5).ok && co.x === 2 && st.hedges[k4], 'the climb did not arrive, or the men knocked the hedge down');
});

check('your pieces share a field by its nine areas: one area most pieces, two the PaK, four a tank or a platoon of 2-3', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s2 = Sim.newGame(seed);
    for (const u of live(s2)) assert(fieldOk(s2, u.x, u.y), `seed ${seed}: ${u.name} starts on another piece's area`);
  }
  const st = Sim.newGame(2);
  for (const u of st.units) u.x = u.y = null;
  const get = id => Sim.unitById(st, id);
  // Put a piece in the field where it fits, as a move does
  const put = (id, x, y, want = null) => { const u = get(id); u.x = x; u.y = y; u.at = null; u.at = Sim.freePlace(st, u, x, y, want); return u; };
  assert(Sim.sizeOf(get('A')) === 4 && Sim.sizeOf(get('T1')) === 4 && Sim.sizeOf(get('mg1')) === 1, 'a platoon or tank is not four areas, a team not one');
  // A tank in a corner block: a second big piece can't fit, five small ones can
  const T1 = put('T1', 0, 6, 'nw');
  assert(T1.at === 'nw' && Sim.lines(T1, 'n') && Sim.lines(T1, 'w') && !Sim.lines(T1, 'e'), 'the tank block in the north-west corner does not line north and west');
  assert(!Sim.roomFor(st, get('A'), 0, 6), 'a platoon fitted in beside a tank');
  for (const id of ['mg1', 'cap', 'bz1', 'sn1']) { assert(Sim.roomFor(st, get(id), 0, 6), `${id} could not join the tank`); put(id, 0, 6); }
  assert(fieldOk(st, 0, 6), 'two pieces on one area');
  // A big piece in the middle (Steve: to hide): the centre, the four edges kept clear, touching no hedge
  const s3 = Sim.newGame(2);
  for (const u of s3.units) u.x = u.y = null;
  const T2 = Sim.unitById(s3, 'T2'); T2.x = 4; T2.y = 6; T2.at = null;
  assert(Sim.footprint(T2).length === 5 && !['n', 'e', 's', 'w'].some(d => Sim.lines(T2, d)), 'a tank in the middle lines a hedge or does not keep the edges clear');
  const tm = Sim.unitById(s3, 'mg1'); tm.x = 4; tm.y = 6; tm.at = null;
  assert(['ne', 'nw', 'se', 'sw'].includes(Sim.freePlace(s3, tm, 4, 6, 'n')), 'a team beside a tank in the middle was not sent to a corner');
  // A platoon down to one section takes one area
  const B = get('B'); B.platoons = 1;
  assert(Sim.sizeOf(B) === 1 && Sim.roomFor(st, B, 0, 6), 'a one-section platoon could not take the last free area');
  put('B', 0, 6);
  assert(!Sim.roomFor(st, get('C'), 0, 6) || Sim.sizeOf(get('C')) === 1, 'a full platoon fitted into a full field');
  // The PaK takes two areas side by side
  const pak = get('pak1');
  assert(Sim.sizeOf(pak) === 2 && Sim.footprint(pak, 'n+ne').length === 2, 'the PaK is not two areas');
});

check('dice: every face is 1 to 6 and hits are the ones at or over the score needed', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed);
    for (let h = 0; h < 6 && !st.won && !st.lost; h++) {
      endTurn(st);
      for (const f of st.fx) for (const r of f.faces || []) {
        assert(r.face >= 1 && r.face <= 6, `face ${r.face}`);
        // (a Hail Mary: only a 6 thrown after a first 6 hits)
        if (f.need > MAX_NEED) assert(!r.hit || r.face === 6, `a Hail Mary die ${r.face} marked as a hit`);
        else assert(r.hit === (r.face >= f.need), `face ${r.face} needing ${f.need} marked ${r.hit ? 'hit' : 'miss'}`);
      }
    }
  }
});

check('taking cover: no moving, +2 to hit, misses the next move unless the captain gets it up', () => {
  const st = Sim.newGame(9);
  let checked = 0;
  for (let h = 0; h < 8 && !st.won && !st.lost; h++) {
    startGermanRound(st);
    const down = [];
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) {
      const t = Sim.unitById(st, r.ask.target), where = [t.x, t.y];
      Sim.answer(st, true);
      if (t.x !== null) { assert(t.x === where[0] && t.y === where[1], `${t.name} moved when taking cover`); assert(t.down, `${t.name} is not down in cover`); down.push(t); }
    }
    Sim.finishRound(st);
    for (const t of down) if (t.x !== null && !st.won && !st.lost) { assert(t.acted && t.down, `${t.name} took cover but can still move`); checked++; }
  }
  assert(checked > 0, 'nobody took cover in 8 hours');
  // The captain gets one up
  const st2 = Sim.newGame(3);
  const cap = Sim.unitById(st2, 'cap'), A = Sim.unitById(st2, 'A');
  A.down = true; A.acted = true; cap.x = A.x; cap.y = A.y === 0 ? 1 : A.y - 1;
  assert(Sim.rallyTargets(st2, cap).includes(A), 'the captain could not reach a piece down in cover');
  assert(Sim.actRally(st2, cap, A).ok && !A.acted && !A.down, 'the captain did not get it up and moving');
  // Down in cover: two more needed, and the label says so (Steve)
  const de = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  const before = Sim.needFor(st2, de, A); A.down = true;
  assert(Sim.needFor(st2, de, A) === before + TAKE_COVER, 'taking cover did not add two to the score needed');
  assert(Sim.needWhy(st2, de, A).includes('+2 take cover'), 'the label did not say +2 take cover');
});

check('the mortars and the guns fire once an hour each', () => {
  const st = Sim.newGame(6);
  st.units.find(u => u.id === 'A').x = st.objective.x - 1; st.units.find(u => u.id === 'A').y = st.objective.y;
  const o = st.objective;
  const first = Sim.actFire(st, 'mortars', o.x, o.y), second = Sim.actFire(st, 'mortars', o.x, o.y);
  assert(first.ok && !second.ok, 'the mortars fired twice in an hour, or not at all');
});

check('across a hedge: lining it you fire through; in the open you need them lining it (and one more); both in the open, no shot', () => {
  const st = Sim.newGame(4);
  const us = Sim.unitById(st, 'A'), de = Sim.unitById(st, 'd2');
  for (const u of st.units) if (u !== us && u !== de) u.x = u.y = null;
  us.x = 1; us.y = 6; de.x = 2; de.y = 6;
  // (one section each: one area, so either can stand clear of the hedge in the middle)
  us.platoons = 1; de.platoons = 1;
  st.hedges = { '1,6|2,6': true }; st.wire = {};
  const need = (a, b) => TO_HIT + Sim.cover(st, a, b) - QUALITY[a.quality].shoot;
  us.at = 'e'; de.at = null;
  assert(Sim.targets(st, us).includes(de) && Sim.cover(st, us, de) === 0, 'lining the hedge, the Americans could not fire freely at Germans in the open');
  us.at = null; de.at = 'w';
  assert(Sim.targets(st, us).includes(de) && Sim.cover(st, us, de) === COVER.hedge, 'in the open, firing at Germans lining the hedge should need one more');
  us.at = null; de.at = null;
  assert(!Sim.targets(st, us).includes(de) && !Sim.targets(st, de).includes(us), 'both in the open could see each other through the hedge');
  us.at = 'e'; de.at = 'w';
  assert(Sim.cover(st, us, de) === COVER.hedge && Sim.cover(st, de, us) === COVER.hedge, 'both lining the hedge should both need one more');
  assert(need(us, de) > 0, 'score needed');
});

check('line of sight: rifles see four fields over open ground, blocked by a hedge in between, one more beyond two', () => {
  const st = Sim.newGame(4);
  const us = Sim.unitById(st, 'A'), de = Sim.unitById(st, 'd2');
  for (const u of st.units) if (u !== us && u !== de) u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  // Along the lane in row 2
  us.x = 0; us.y = 2; de.x = 3; de.y = 2; us.at = null; de.at = null;
  const s3 = Sim.sight(st, us, de);
  assert(s3 && s3.cover === LONG_RANGE, 'three open fields away should be seen, one more to hit');
  de.x = 2;
  assert(Sim.sight(st, us, de).cover === 0, 'two fields away was long range for rifles');
  de.x = 4;
  assert(Sim.sight(st, us, de), 'four fields away was not seen');
  de.x = 5;
  assert(!Sim.sight(st, us, de), 'five fields away was seen');
  de.x = 3; st.hedges['1,2|2,2'] = true;
  assert(!Sim.sight(st, us, de), 'a hedge in between did not block the view');
});

check('long range, cover and firing on the move each need one more on the dice', () => {
  const st = Sim.newGame(4);
  const us = Sim.unitById(st, 'B'), de = Sim.unitById(st, 'd2');
  for (const u of st.units) if (u !== us && u !== de) u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  us.x = 0; us.y = 6; de.x = 2; de.y = 6; us.at = null; de.at = null;
  // (two fields off: past close range, not yet long range)
  const near = Sim.needFor(st, us, de);
  de.x = 3;
  assert(Sim.needFor(st, us, de) === near + LONG_RANGE, 'long range did not add one');
  assert(Sim.needFor(st, us, de, true) === near + LONG_RANGE + ON_THE_MOVE, 'firing on the move did not add one');
});

check('a shaken piece can try to rally itself once; the captain rallies up to three fields away', () => {
  const st = Sim.newGame(5);
  const B = Sim.unitById(st, 'B'), cap = Sim.unitById(st, 'cap');
  B.shocked = true;
  assert(Sim.canSelfRally(st, B) && Sim.actSelfRally(st, B).ok && !Sim.canSelfRally(st, B), 'self rally did not use the move');
  B.shocked = true; B.acted = false;
  cap.x = B.x; cap.y = Math.max(0, B.y - 3) === B.y - 3 ? B.y - 3 : B.y + 3;
  assert(Sim.rallyTargets(st, cap).includes(B), 'the captain could not reach three fields');
});

check('every tank unit is one tank, both sides (Steve: not a pair)', () => {
  const st = Sim.newGame(2);
  const tanks = st.units.filter(u => Sim.isTank(u));
  assert(tanks.length === 4 && tanks.every(u => u.platoons === 1), `tank units start with ${tanks.map(u => u.platoons).join(', ')} tanks`);
  assert(tanks.every(u => !/pair/i.test(u.name)), 'a tank unit is still called a pair');
});

check('a new round knows who a token activated and what stayed in the bag (Steve: only those fly back)', () => {
  const st = Sim.newGame(5);
  Sim.startRound(st);
  assert(st.returning.first, 'the first round did not fly the whole bag in');
  // Two tokens out, then the timer
  let draws = 0, side;
  while ((side = Sim.drawToken(st)) && side !== 'timer') {
    draws++;
    if (side === 'us') { const u = st.units.find(o => o.side === 'us' && o.x !== null && Sim.canAct(st, o) && o.kind !== 'captain'); Sim.actSkip(st, u); }
    else { let r = Sim.computerStep(st); while (r && r.ask) { Sim.answer(st, false); r = Sim.computerStep(st); } Sim.endComputerToken(st); }
    Sim.passToken(st);
    if (draws >= 2 && side) break;
  }
  const activated = (st.activated || []).length;
  const left = { us: st.bag.us, de: st.bag.de };
  Sim.endRound(st);
  Sim.startRound(st);
  assert(!st.returning.first, 'the second round flew the whole bag in again');
  assert(st.returning.activated.length === activated && activated > 0, `the round forgot who was activated (${st.returning.activated.length} of ${activated})`);
  assert(st.returning.left.us === left.us && st.returning.left.de === left.de, 'the round forgot what stayed in the bag');
});

check('on the page, each German shot is aimed (shown) first, then fired; headless it fires at once', () => {
  let aimed = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed);
    startGermanRound(st);
    for (let r = Sim.computerStep(st, true), n = 0; !r.done && n < 200; r = Sim.computerStep(st, true), n++) {
      if (r.aim) { aimed++; assert(st.computer.aim === r.aim, `seed ${seed}: the aimed shot was not kept`); continue; }
      if (r.ask) Sim.answer(st, false);
    }
    assert(!st.computer || !st.computer.aim, `seed ${seed}: a shot was left aimed but never fired`);
  }
  assert(aimed > 0, 'no German shot was ever aimed');
});

check('seeing reaches the whole board (to call fire); shooting only the weapon\'s reach', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const B = Sim.unitById(st, 'B');
  for (const u of st.units) if (u !== B) u.x = u.y = null;
  // Down the lane at the bottom of the open row: from one end of the board to the other
  B.x = 0; B.y = 5; B.at = null; B.acted = true;
  const far = { x: COLS - 1, y: 5, at: null };
  assert(Sim.sees(st, 'us', far), 'a piece could not see the far end of an open lane (moved this round, too)');
  assert(!Sim.sight(st, B, far), 'a rifle platoon could shoot the whole length of the board');
});

check('a German piece has moves to show, as yours do (Move & shoot and Charge fields)', () => {
  let shown = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const st = Sim.newGame(seed);
    const de = st.units.find(u => u.side === 'de' && u.kind === 'company' && !u.garrison);
    if (Sim.chargeSpots(st, de).length) shown++;
  }
  assert(shown >= 8, `only ${shown} of 10 German platoons had anywhere to go`);
});

check('a tank over barbed wire on its way gets snagged a third of the time and stops there; the wire is gone', () => {
  let snagged = 0, runs = 0;
  for (let seed = 1; seed <= 90; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const T1 = Sim.unitById(st, 'T1');
    for (const u of st.units) if (u !== T1) u.x = u.y = null;
    T1.x = 3; T1.y = 6; T1.at = null; T1.acted = false;
    // Wire between the first and second field of its way east
    st.wire['4,6|5,6'] = true; st.wire['5,6|4,6'] = true;
    const r = Sim.actCharge(st, T1, 6, 6);
    if (!r.ok) continue;
    runs++;
    assert(!Sim.wire(st, 4, 6, 5, 6), `seed ${seed}: the wire is still there`);
    // Torn open, not gone from the table (Steve): kept as open wire, the way the tank went
    const open = st.openWire['4,6|5,6'];
    assert(open && open.from.x === 4 && open.to.x === 5, `seed ${seed}: the torn wire was not kept: ${JSON.stringify(open)}`);
    if (T1.x === 5) {
      snagged++;
      // Caught half way through (Steve): it remembers the field it came from, and faces on, east
      assert(T1.snag && T1.snag.x === 4 && T1.snag.y === 6 && T1.aim === 0, `seed ${seed}: the snag was not kept: ${JSON.stringify(T1.snag)} facing ${T1.aim}`);
      // Moving on, it tears free
      T1.acted = false; Sim.startRound(st); st.drawn = 'us'; st.activeId = null;
      if (Sim.actCharge(st, T1, 6, 6).ok) assert(!T1.snag, `seed ${seed}: still snagged after moving on`);
    } else assert(T1.x === 6 && !T1.snag, `seed ${seed}: the tank stopped at ${T1.x}, or counts as snagged`);
  }
  assert(runs > 50 && snagged > runs * 0.2 && snagged < runs * 0.47, `snagged ${snagged} of ${runs}`);
});

check('armoured cars (Steve): no hedges, through wire but snagged half the time, two further on the road, machine guns can hurt them, rifles cannot', () => {
  const st = Sim.newGame(3, 'us', 'farmland');
  st.hedges = {}; st.wire = {};
  const car = Sim.unitById(st, 'AC1'), mg = st.units.find(u => u.side === 'de' && u.kind === 'mg42'), rifles = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (![car, mg, rifles].includes(u)) u.x = u.y = null;
  car.x = 1; car.y = 6; car.at = null; car.acted = false;
  mg.x = 11; mg.y = 0; rifles.x = 11; rifles.y = 1;
  // Hedges all round its field stop it (no cutters); so does barbed wire all round
  const round = [[0, 6], [2, 6], [1, 5], [1, 7]].map(([x, y]) => Sim.edgeKey(1, 6, x, y));
  for (const k of round) st.hedges[k] = true;
  assert(!Sim.chargeSpots(st, car).length, 'an armoured car drove through a hedge');
  st.hedges = {};
  // Barbed wire all round: it gets through (Steve), snagged half the time
  for (const k of round) st.wire[k] = true;
  assert(Sim.chargeSpots(st, car).length, 'an armoured car could not get through barbed wire');
  let snags = 0, runs = 0;
  for (let k = 0; k < 200; k++) {
    const g = Sim.newGame(3, 'us', 'farmland');
    g.hedges = {}; g.wire = {};
    const c = Sim.unitById(g, 'AC1');
    for (const u of g.units) if (u !== c) u.x = u.y = null;
    c.x = 1; c.y = 6; c.at = null; c.acted = false;
    g.wire[Sim.edgeKey(2, 6, 3, 6)] = true;
    let seed = k * 7919 + 3;
    g.rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    Sim.startRound(g); g.drawn = 'us'; g.human = 'us'; g.activeId = null;
    if (!Sim.actCharge(g, c, 4, 6).ok) continue;
    runs++;
    if (c.x === 3) snags++;
  }
  assert(runs > 100 && snags > runs * 0.38 && snags < runs * 0.62, `snagged ${snags} of ${runs}`);
  st.wire = {};
  // Machine guns can fire on it, rifles cannot
  mg.x = 1; mg.y = 5; mg.at = null; rifles.x = 0; rifles.y = 6; rifles.at = null;
  assert(Sim.targets(st, mg).includes(car), 'a machine gun could not fire on an armoured car');
  assert(!Sim.targets(st, rifles).includes(car), 'rifles could fire on an armoured car');
  // Every die a 6, the coin tosses tails: the machine gun's hits count against it
  st.rand = () => 0.99;
  Sim.startRound(st); st.drawn = 'de'; st.activeId = null; mg.acted = false;
  st.fx = [];
  Sim.fireAt(st, mg, car);
  assert(car.shocked || car.x === null, 'machine-gun hits did nothing to an armoured car');
  Sim.newGame(1);
});

check('the train on Open farmland (Steve): an engine and three or four carriages and wagons, one field a turn left to right, another every nine fields; it blocks the view and nobody stands on the line', () => {
  const st = Sim.newGame(3, 'us', 'farmland');
  // The line: the north row of areas of every field of the second row up from the bottom
  assert(st.map.trains[0].row === ROWS - 2, 'the line is not on the second row up');
  for (let x = 0; x < COLS; x++) assert(Sim.featuresAt(st, x, ROWS - 2).some(f => f.kind === 'rail'), `no line at ${x}`);
  // Never through a hedge, wire, an orchard or a village (Steve): open fields and the lane only
  for (let seed = 1; seed <= 10; seed++) {
    const g = Sim.newGame(seed, 'us', 'farmland');
    for (let x = 0; x < COLS; x++) {
      assert(['field', 'laneNS', 'laneEW', 'crossroads'].includes(Sim.tileType(x, ROWS - 2)), `the line runs over a ${Sim.tileType(x, ROWS - 2)} at ${x}`);
      if (x + 1 < COLS) assert(!Sim.hedge(g, x, ROWS - 2, x + 1, ROWS - 2) && !Sim.wire(g, x, ROWS - 2, x + 1, ROWS - 2), `seed ${seed}: a hedge or wire across the line at ${x}`);
    }
  }
  assert(!st.units.some(u => u.x !== null && u.y === ROWS - 2 && Sim.footprint(u).some(k => k.includes('n'))), 'a piece stands on the line');
  // It comes on from the left, then three fields a round
  const heads = () => st.trains.map(t => t.head).join(',');
  assert(heads() === '0' && Sim.trainCars(st).length === 1 && Sim.trainCars(st)[0].kind === 'engine', `at the start: ${heads()}`);
  const seen = [];
  for (let r = 0; r < 6; r++) { st.turn++; Sim.startRound(st); seen.push(heads()); }
  // (startRound alone does not move them: only a new round does)
  // One field after every piece's turn (Steve), the next coming on when the last has gone nine fields
  const st2 = Sim.newGame(3, 'us', 'farmland');
  const after = [];
  for (let k = 1; k <= 12; k++) { Sim.moveTrains(st2); after.push(st2.trains.map(t => t.head).join(',')); }
  assert(after[2] === '3' && after[8] === '9,0' && after[11] === '12,3', `the trains went ${after.join(' ')}`);
  // Moving them: each token drawn after the first
  const st3 = Sim.newGame(3, 'us', 'farmland');
  Sim.startRound(st3);
  Sim.drawToken(st3);
  assert(st3.trains[0].head === 0, 'the first token moved the train');
  st3.drawn = null; st3.activeId = null; st3.computer = null;
  Sim.drawToken(st3);
  assert(st3.trains[0].head === 1, 'the next token did not move it one field');
  // Five cars on the board when it is all on
  const cars = Sim.trainCars(st2);
  // An engine, and three or four behind it, carriages and goods wagons mixed (Steve)
  const first = st2.trains[0];
  assert(cars.filter(c => c.kind === 'engine').length >= 1 && [3, 4].includes(first.cars) && first.consist.length === first.cars, 'not an engine and three or four behind it');
  let short = 0, wagons = 0, carriages = 0;
  for (let seed = 1; seed <= 30; seed++) for (const t of Sim.newGame(seed, 'us', 'farmland').trains) {
    if (t.cars === 3) short++;
    wagons += t.consist.filter(c => c.kind === 'wagon').length; carriages += t.consist.filter(c => c.kind === 'carriage').length;
  }
  assert(short > 3 && short < 27 && wagons > 10 && carriages > 10, `trains not mixed: ${short} short of 30, ${wagons} wagons, ${carriages} carriages`);
  // It blocks the view along its row
  const a = st2.units.find(u => u.side === 'us' && u.kind === 'company'), b = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st2.units) if (u !== a && u !== b) u.x = u.y = null;
  st2.hedges = {};
  const car = cars.find(c => c.x > 1 && c.x < COLS - 2);
  a.x = car.x - 1; a.y = ROWS - 2; a.at = 'ne'; b.x = car.x + 1; b.y = ROWS - 2; b.at = 'nw';
  a.platoons = 1; b.platoons = 1;
  assert(!Sim.sight(st2, a, b), 'a line along the train was not blocked');
  // Other maps have none
  assert(!Sim.newGame(3, 'us', 'hedges').trains.length, 'a train on Hedge country');
  Sim.newGame(1);
});

check('airdrops (Steve): paratroopers on the bocage maps, a supply crate on the open ones, once a game in round 2 to 4', () => {
  const kinds = { hedges: 'paras', deep: 'paras', farmland: 'crate', town: 'crate', river: 'crate' };
  for (const [map, kind] of Object.entries(kinds)) assert(Sim.newGame(3, 'us', map).airdrop.kind === kind, `${map}: not ${kind}`);
  for (const map of ['beach', 'station', 'paris']) assert(!Sim.newGame(3, 'us', map).airdrop, `${map}: an airdrop`);
  let off = 0, paras = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed, 'us', 'hedges');
    const round = st.airdrop.round;
    assert(round >= 2 && round <= 4, `seed ${seed}: the drop comes in round ${round}`);
    // Play the rounds by: nothing until its round, then a section of the 101st, elite, in the middle of the board
    while (st.turn < round && !st.won && !st.lost) {
      assert(!Sim.unitById(st, 'para1'), `seed ${seed}: the paratroopers came early`);
      Sim.finishRound(st);
    }
    if (st.won || st.lost) continue;
    const p = Sim.unitById(st, 'para1');
    assert(p && p.side === 'us' && p.kind === 'company' && p.platoons === 1 && p.quality === 'elite', `seed ${seed}: no paratroopers`);
    assert(p.x >= 3 && p.x <= COLS - 4 && !Sim.at(st, p.x, p.y, 'de').length, `seed ${seed}: they came down at ${p.x},${p.y}`);
    assert(st.report.some(l => l.includes('101st')), `seed ${seed}: nothing in the report`);
    // The parachutes on the board name the piece, so it stays hidden until they are down (Steve)
    assert(st.fx.some(f => f.kind === 'paradrop' && f.id === 'para1' && f.x === p.x && f.y === p.y), `seed ${seed}: the drop doesn't name its piece`);
    paras++;
    if (st.report.some(l => l.includes('off target'))) off++;
    // Only once
    Sim.finishRound(st);
    assert(st.units.filter(u => u.id === 'para1').length === 1, `seed ${seed}: they came twice`);
  }
  assert(paras > 20 && off > 3 && off < paras - 3, `${off} of ${paras} drops off target`);
  // The crate: the first piece into its field takes one more artillery round for its side
  const st = Sim.newGame(5, 'us', 'farmland');
  while (st.turn < st.airdrop.round) Sim.finishRound(st);
  assert(st.crate && !st.crate.taken && !Sim.at(st, st.crate.x, st.crate.y).length, 'no crate on an empty field');
  const tank = Sim.unitById(st, 'T2');
  for (const u of st.units) if (u !== tank) u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  tank.x = st.crate.x - 1; tank.y = st.crate.y; tank.at = null; tank.acted = false;
  const before = st.ammo.us.artillery;
  Sim.startRound(st); st.drawn = 'us'; st.activeId = null;
  assert(Sim.actCharge(st, tank, st.crate.x, st.crate.y).ok, 'it could not go to the crate');
  assert(st.crate.taken === 'us' && st.ammo.us.artillery === before + AIRDROP.crateRounds, 'the crate gave nothing');
  Sim.newGame(1);
});

check('on Open farmland each side starts with pieces both sides of the railway (Steve)', () => {
  for (let seed = 1; seed <= 25; seed++) for (const mode of ['us', 'de', 'none']) {
    const st = Sim.newGame(seed, mode, 'farmland');
    const row = st.map.trains[0].row;
    for (const side of ['us', 'de']) {
      const mine = st.units.filter(u => u.side === side && u.x !== null);
      const south = mine.filter(u => u.y >= row), north = mine.filter(u => u.y < row);
      assert(south.length >= 2 && north.length >= 2, `seed ${seed}, ${side}: ${north.length} north of the line, ${south.length} south`);
      assert(south.some(u => u.kind === 'company'), `seed ${seed}, ${side}: no rifle platoon south of the line`);
    }
  }
  Sim.newGame(1);
});

check('the Train station (Steve): three lines clear right across, two running left to right and one right to left, trains of any length coming at no fixed times', () => {
  const st = Sim.newGame(4, 'us', 'station');
  const lines = st.map.trains;
  assert(lines.length === 3 && lines.filter(l => l.dir > 0).length === 2 && lines.filter(l => l.dir < 0).length === 1, 'not three lines, two one way and one the other');
  for (const l of lines) for (let x = 0; x < COLS; x++) {
    assert(Sim.tileType(x, l.row) === 'yard', `the line at row ${l.row} runs over a ${Sim.tileType(x, l.row)}`);
    const lineAreas = l.side === 'n' ? ['nw', 'n', 'ne'] : ['sw', 's', 'se'];
    assert(!Sim.featuresAt(st, x, l.row).some(f => f.kind !== 'rail' && f.areas.some(k => lineAreas.includes(k))), `something stands on the line at ${x},${l.row}`);
  }
  // One train on each to start, the right-to-left one at the right-hand end
  assert(st.trains.length === 3 && st.trains.find(t => t.dir < 0).head === COLS - 1, 'not one train on each line at the start');
  // Lengths and gaps vary
  const lengths = new Set(), gaps = new Set();
  for (let k = 0; k < 120; k++) { Sim.moveTrains(st); for (const t of st.trains) lengths.add(t.cars); for (const l of st.trainLines) gaps.add(l.next); }
  assert(lengths.size >= 3 && gaps.size >= 3, `trains all alike: lengths ${[...lengths]}, gaps ${[...gaps]}`);
  // The right-to-left train goes right to left
  const back = Sim.newGame(4, 'us', 'station');
  const before = back.trains.find(t => t.dir < 0).head;
  Sim.moveTrains(back);
  assert(back.trains.find(t => t.dir < 0).head === before - 1, 'the middle train did not go right to left');
  Sim.newGame(1);
});

check('nothing crosses a train (Steve): no going over the line where an engine or carriage stands; elsewhere you can', () => {
  const st = Sim.newGame(3, 'us', 'farmland');
  st.hedges = {}; st.wire = {};
  const row = st.map.trains[0].row;
  const A = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== A) u.x = u.y = null;
  // A train with its engine at 6: cars at 2 to 6
  st.trains = [{ id: 9, line: 0, dir: 1, head: 6, cars: 4, consist: [...Array(4)].map(() => ({ kind: 'carriage' })) }];
  // From the field north of a carriage: it can't go south into the line's field, nor over it to the next row
  A.x = 4; A.y = row - 1; A.at = null; A.acted = false; A.shocked = false;
  const spots = Sim.chargeSpots(st, A).map(p => `${p.x},${p.y}`);
  assert(!spots.includes(`4,${row}`) && !spots.includes(`4,${row + 1}`), `it crossed the train: ${spots.join(' ')}`);
  // Where no car stands it can cross the line
  A.x = 9; A.y = row - 1;
  const clear = Sim.chargeSpots(st, A).map(p => `${p.x},${p.y}`);
  assert(clear.includes(`9,${row}`) && clear.includes(`9,${row + 1}`), `it could not cross where there is no train: ${clear.join(' ')}`);
  // From the south it can come into the line's field (it stays on the near side of the train)
  A.x = 4; A.y = row + 1;
  assert(Sim.chargeSpots(st, A).some(p => p.x === 4 && p.y === row), 'it could not come up to the train from the south');
  Sim.newGame(1);
});

check('nothing ever stops on the railway, so the train never meets anything (Steve): two robots, token by token', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const st = Sim.newGame(seed, 'none', 'farmland');
    const row = st.map.trains[0].row, line = ['nw', 'n', 'ne'];
    const clear = when => {
      for (const u of st.units) if (u.x !== null && u.y === row) assert(!Sim.footprint(u).some(k => line.includes(k)), `seed ${seed}, ${when}: ${u.name} stands on the line`);
      for (const w of st.wrecks) if (w.y === row) assert(!w.areas.some(k => line.includes(k)), `seed ${seed}, ${when}: a wreck lies on the line`);
      if (st.crate && st.crate.y === row) throw new Error(`seed ${seed}: the crate came down on the line`);
    };
    while (!st.won && !st.lost && st.turn <= 12) {
      Sim.startRound(st);
      for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
        if (side === 'timer') break;
        for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) { /* robots answer for themselves */ }
        Sim.endComputerToken(st);
        clear(`round ${st.turn}`);
      }
      Sim.endRound(st);
    }
  }
  Sim.newGame(1);
});

check('every map sets up without fail, seed after seed, everyone with room (the beach crashed on some seeds in v155)', () => {
  for (const map of MAPS.map(m => m.id)) for (let seed = 1; seed <= 120; seed++) {
    let st;
    try { st = Sim.newGame(seed, 'us', map); } catch (e) { throw new Error(`${map}, seed ${seed}: ${e.message}`); }
    for (const u of live(st)) assert(fieldOk(st, u.x, u.y), `${map}, seed ${seed}: too many in ${u.x},${u.y}`);
  }
  Sim.newGame(1);
});

check('an armoured car on the road goes two fields further, a tank one', () => {
  // A long straight road: find one on some map and drive along it
  for (const map of ['farmland', 'town', 'river']) for (let seed = 1; seed <= 6; seed++) {
    const st = Sim.newGame(seed, 'us', map);
    const car = Sim.unitById(st, 'AC1');
    for (const u of st.units) if (u !== car) u.x = u.y = null;
    st.wire = {};
    let road = null;
    for (let y = 0; y < ROWS && !road; y++) for (let x = 0; x + 5 < COLS && !road; x++) {
      if ([0, 1, 2, 3, 4, 5].every(k => Sim.isRoad(x + k, y))) road = { x, y };
    }
    if (!road) continue;
    car.x = road.x; car.y = road.y; car.at = null; car.acted = false; car.shocked = false;
    const far = Math.max(...Sim.chargeSpots(st, car).filter(p => p.y === road.y).map(p => p.x - road.x));
    assert(far === CHARGE_MOVES + CAR_ROAD_BONUS, `${map}: an armoured car went ${far} fields along the road`);
    Sim.newGame(1);
    return;
  }
  throw new Error('no straight road found to try it on');
});

check('a bazooka rolls one die at men (half its two anti-tank dice); a rifle platoon three', () => {
  const st = Sim.newGame(2);
  assert(Sim.menDice(Sim.firepower(st, Sim.unitById(st, 'bz1'))) === 1, 'a bazooka does not roll one die at men');
  assert(Sim.menDice(Sim.firepower(st, Sim.unitById(st, 'A'))) === 3, 'a rifle platoon does not roll three dice at men');
});

check("a tank's armour is on its label and in its score, for shots and shells", () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const T2 = Sim.unitById(st, 'T2'), pan = Sim.unitById(st, 'dt2');
  for (const u of st.units) if (u !== T2 && u !== pan) u.x = u.y = null;
  T2.x = 2; T2.y = 5; T2.at = null; pan.x = 4; pan.y = 5; pan.at = null;
  assert(Sim.armourOf(pan) === 1 && Sim.armourOf(T2) === 0, 'the Panther is not armour +1, the Firefly +0');
  assert(Sim.needWhy(st, T2, pan).includes('+1 armour'), 'the label does not say +1 armour');
  assert(Sim.shellWhy(st, pan).includes('+1 armour') && Sim.shellNeed(st, pan) === TO_HIT + SHELL_HARDER + 1, 'shells on the Panther ignore its armour');
});

check('no hedges or wire round villages, hamlets or orchards', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const st = Sim.newGame(seed);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const bx = x + dx, by = y + dy;
      if (bx >= COLS || by >= ROWS) continue;
      const placed = PLACE_COVER[Sim.tileType(x, y)] || PLACE_COVER[Sim.tileType(bx, by)];
      if (placed) assert(!Sim.hedge(st, x, y, bx, by) && !Sim.wire(st, x, y, bx, by), `seed ${seed}: a hedge or wire at ${x},${y}|${bx},${by}`);
    }
  }
});

check('a piece moves to another area of its own field: its move, and it may still fire after', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const mg = Sim.unitById(st, 'mg1');
  for (const u of st.units) if (u !== mg) u.x = u.y = null;
  mg.x = 2; mg.y = 6; mg.at = 'n'; mg.acted = false;
  const r = Sim.actLine(st, mg, 's');
  assert(r.ok && mg.at === 's' && mg.acted, 'the move from north to south in the field did not happen');
});

check('seeing round the end of a hedge (Steve): from a corner, along the 45° line and below it, not above', () => {
  const st = Sim.newGame(3);
  st.wire = {};
  // X (9,6) and Y (10,6) side by side, W (10,7) below Y; the only hedge is Z, between Y and W
  st.hedges = { '10,6|10,7': true };
  const M = Sim.unitById(st, 'mg1'), t = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== M && u !== t) u.x = u.y = null;
  M.x = 9; M.y = 6; M.at = 'se';
  t.x = 10; t.y = 7;
  const look = at => { t.at = at; return Sim.sight(st, M, t); };
  const back = at => { t.at = at; return Sim.sight(st, t, M); };
  // W's top-left area, touching Z: they see each other, no cover either way
  assert(look('nw') && look('nw').cover === 0 && back('nw') && back('nw').cover === 0, 'M and the piece touching Z at the corner did not see each other freely');
  // On the 45° line: seen both ways, Z gives both +1
  assert(look(null) && look(null).cover === 1 && back(null) && back(null).cover === 1, 'on the 45° line the hedge end did not give cover');
  assert(look('se') && look('se').cover === 1, 'the far end of the 45° line was not seen with cover');
  // Below the line: seen, no cover from Z
  for (const at of ['w', 'sw', 's']) assert(look(at) && look(at).cover === 0, `W's ${at} area was not seen in the open`);
  // Above the line (the top right three): hidden behind Z
  for (const at of ['n', 'ne', 'e']) assert(!look(at), `W's ${at} area was seen through hedge Z`);
});

check('a tank in the middle of a hedged field is hidden from pieces not at the hedge; in a corner it is seen', () => {
  const st = Sim.newGame(3);
  st.wire = {};
  st.hedges = { '9,6|10,6': true };
  const T1 = Sim.unitById(st, 'T1'), t = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== T1 && u !== t) u.x = u.y = null;
  T1.x = 9; T1.y = 6; T1.at = null;
  t.x = 10; t.y = 6; t.at = null;
  assert(!Sim.sight(st, t, T1) && !Sim.sight(st, T1, t), 'a tank in the middle was seen through the hedge');
  T1.at = 'ne';
  assert(Sim.sight(st, t, T1) && Sim.sight(st, t, T1).cover >= 1, 'a tank in a corner block at the hedge was not seen, in cover');
  t.at = 'w'; T1.at = null;
  assert(Sim.sight(st, t, T1), 'a piece at the hedge could not see the tank in the middle');
});

check('a German piece takes cover when it is wise: shaken and fired on, if it still has its move', () => {
  const st = Sim.newGame(4);
  st.hedges = {}; st.wire = {};
  const mg = Sim.unitById(st, 'mg1'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== mg && u !== de) u.x = u.y = null;
  mg.x = 0; mg.y = 6; mg.at = null; de.x = 1; de.y = 6; de.at = null;
  de.shocked = true; de.acted = false;
  Sim.fireAt(st, mg, de);
  assert(de.x === null || de.down, 'a shaken German under machine-gun fire did not take cover');
  // One that has moved can't
  const st2 = Sim.newGame(4);
  st2.hedges = {}; st2.wire = {};
  const mg2 = Sim.unitById(st2, 'mg1'), de2 = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st2.units) if (u !== mg2 && u !== de2) u.x = u.y = null;
  mg2.x = 0; mg2.y = 6; mg2.at = null; de2.x = 1; de2.y = 6; de2.at = null; de2.shocked = true; de2.acted = true;
  Sim.fireAt(st2, mg2, de2);
  assert(!de2.down, 'a German that had moved took cover');
});

check('two fields corner to corner see each other along the 45° line, but past a hedge ending there only from that corner', () => {
  const st = Sim.newGame(3);
  st.wire = {}; st.hedges = {};
  const a = Sim.unitById(st, 'mg1'), b = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== a && u !== b) u.x = u.y = null;
  // (9,6) and (10,7): corner to corner
  a.x = 9; a.y = 6; a.at = null; b.x = 10; b.y = 7; b.at = null;
  assert(Sim.sight(st, a, b), 'two fields corner to corner with no hedges could not see each other along the 45° line');
  // A hedge ending at the shared corner: blocked from the middles, seen from that corner
  st.hedges = { '10,6|10,7': true };
  assert(!Sim.sight(st, a, b), 'a line past the end of a hedge was not blocked when neither piece is at that corner');
  a.at = 'se';
  assert(Sim.sight(st, a, b), 'from the corner the piece could not see past the end of the hedge');
});

check('Move & shoot: only the areas of a field it could fire from are offered (Steve)', () => {
  let checked = 0;
  for (let seed = 1; seed <= 15 && checked < 5; seed++) {
    const st = Sim.newGame(seed);
    for (const u of st.units.filter(o => o.side === 'us' && o.x !== null)) {
      for (const p of Sim.moveShootSpots(st, u)) {
        const cells = Sim.shootCells(st, u, p.x, p.y);
        assert(cells.length > 0, `seed ${seed}: a Move & shoot field with no area to fire from`);
        checked++;
      }
    }
  }
  assert(checked > 0, 'no Move & shoot fields to check');
});

check('a captain who only rallies is done once his token passes: no second token, shown as moved', () => {
  const st = Sim.newGame(3);
  Sim.startRound(st);
  st.drawn = 'us'; st.activeId = null;
  const cap = Sim.unitById(st, 'cap'), A = Sim.unitById(st, 'A');
  A.x = cap.x; A.y = cap.y === 0 ? 1 : cap.y - 1; A.shocked = true;
  assert(Sim.actRally(st, cap, A).ok, 'the rally failed');
  Sim.passToken(st);
  st.drawn = 'us';
  assert(!Sim.canAct(st, cap) && !Sim.canRally(st, cap) && cap.acted, 'the captain could act again on a second token');
});

check('past the corner of a village, hamlet or orchard: only from a corner area at that point, +1 both', () => {
  const st = Sim.newGame(3);
  st.wire = {}; st.hedges = {};
  const a = Sim.unitById(st, 'mg1'), b = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== a && u !== b) u.x = u.y = null;
  // (8,0) and (9,1) corner to corner; the line touches the orchard (9,0) and the village (8,1) beside it
  assert(Sim.tileType(9, 0) === 'orchard' && Sim.tileType(8, 1) === 'village', 'the test needs an orchard at 9,0 and a village at 8,1');
  a.x = 8; a.y = 0; a.at = null; b.x = 9; b.y = 1; b.at = null;
  assert(!Sim.sight(st, a, b), 'a line past their corner from the middle was not blocked');
  a.at = 'se';
  const s = Sim.sight(st, a, b);
  assert(s && s.placeCorner && s.cover === 1, 'from the corner it did not see past them, with +1');
});

check('a piece\'s menu covers no lit field, target or piece to rally when there is room anywhere on the table (Steve)', () => {
  const Labels = require('../js/labels.js');
  const box = { width: 1600, height: 800 };
  // Lit fields all round the piece out to 400 pixels: the menu goes further out, clear of them
  const blocked = [{ x: 400, y: 0, w: 800, h: 800 }];
  const spot = Labels.menuSpot({ w: 160, h: 90 }, { x: 800, y: 400 }, blocked, box);
  assert(spot.covered === 0 && (spot.x + spot.w <= 400 || spot.x >= 1200), `the menu covers ${spot.covered} at ${spot.x},${spot.y}`);
  // No room at all: it covers a field to move to rather than a target
  const crowded = [{ x: 0, y: 0, w: 1600, h: 400, weight: 1 }, { x: 0, y: 400, w: 1600, h: 400, weight: 4 }];
  const pick = Labels.menuSpot({ w: 160, h: 90 }, { x: 800, y: 400 }, crowded, box);
  assert(pick.y + pick.h <= 400, `it covered the target, at ${pick.y}`);
});

check('red bubbles: neither a box nor an arrow covers another target, and arrows do not cross', () => {
  const Labels = require('../js/labels.js');
  const bounds = { x: 0, y: 0, w: 1600, h: 820 };
  // Targets clustered as in a village, with a ring of spots round each, boxes 90 by 70
  const spots = [[700, 400], [760, 410], [720, 460], [800, 470], [660, 470], [900, 300], [500, 520]];
  const items = spots.map(([x, y], n) => {
    const options = [];
    for (const ring of [90, 140, 200, 260, 320]) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, mx = x + ring * Math.cos(a), my = y + ring * Math.sin(a);
      options.push({ mid: { x: mx, y: my }, box: { x: mx - 45, y: my - 35, w: 90, h: 70 } });
    }
    return { id: n, aim: { x, y }, circles: [{ x, y, r: 22 }, { x, y: y + 30, r: 22 }], options };
  });
  const chosen = Labels.place(items, bounds);
  const left = Labels.problems(items, chosen);
  assert(left.boxOnTarget === 0, `${left.boxOnTarget} boxes on other targets`);
  assert(left.boxOnBox === 0, `${left.boxOnBox} boxes on each other`);
  assert(left.arrowCross === 0, `${left.arrowCross} arrows crossing`);
  assert(left.arrowOnTarget === 0, `${left.arrowOnTarget} arrows over other targets`);
  // Two cross-hairs overlapping: no bubble can keep that arrow's point off the other, and it is counted as that
  const close = [[700, 400], [712, 400]].map(([x, y], n) => ({ id: n, aim: { x, y }, circles: [{ x, y, r: 22 }], options: [{ mid: { x, y: y - 120 }, box: { x: x - 45, y: y - 155, w: 90, h: 70 } }] }));
  assert(Labels.problems(close, [0, 0]).tipInside === 2, 'overlapping cross-hairs were not counted as such');
  // Cross-hairs that close are nudged apart: none ends up on another's cross-hair or base
  const near = [[700, 400], [712, 400], [700, 400], [730, 420]].map(([x, y]) => ({ x, y, r: 25, base: { x, y: y + 40, r: 25 } }));
  const nudged = Labels.spread(near).map((m, i) => ({ x: near[i].x + m.dx, y: near[i].y + m.dy }));
  nudged.forEach((p, i) => near.forEach((q, j) => {
    if (i === j) return;
    assert(Math.hypot(p.x - nudged[j].x, p.y - nudged[j].y) >= 25, `cross-hairs ${i} and ${j} still overlap`);
    assert(Math.hypot(p.x - q.base.x, p.y - q.base.y) >= 25, `cross-hair ${i} still on the base of ${j}`);
  }));
  // On its own, a bubble takes a near spot
  const one = [Object.assign({}, items[5])];
  const pick = one[0].options[Labels.place(one, bounds)[0]];
  assert(Math.hypot(pick.mid.x - 900, pick.mid.y - 300) <= 140, 'a lone bubble went a long way from its target');
});

check('the timer ends the round: tokens fly home only from the pieces a token activated, the rest stay in the bag', () => {
  const st = Sim.newGame(5);
  Sim.startRound(st);
  // Three American pieces activated, then the round ends with the timer; another piece took cover without a token
  const pieces = st.units.filter(u => u.side === 'us' && u.x !== null && u.kind !== 'captain').slice(0, 4);
  for (const u of pieces.slice(0, 3)) {
    st.drawn = 'us'; st.activeId = null; st.bag.us--;
    assert(Sim.actSkip(st, u).ok, `${u.name} could not skip`);
    Sim.passToken(st);
  }
  pieces[3].acted = true; pieces[3].down = true;
  st.bag.timer = 1; st.drawnThisRound = 3;
  // The timer comes out next
  st.rand = () => 0.999999;
  assert(Sim.drawToken(st) === 'timer', 'the timer did not come out');
  Sim.endRound(st);
  Sim.startRound(st);
  const home = Sim.tokensHome(st);
  const ids = home.us.from.map(w => w.id).sort();
  assert(ids.join() === pieces.slice(0, 3).map(u => u.id).sort().join(), `tokens flew home from ${ids.join()}`);
  assert(home.us.kept === st.bag.us - 3, `${home.us.kept} American tokens stayed in a bag of ${st.bag.us}`);
  assert(home.de.from.length === 0 && home.de.kept === st.bag.de, 'German tokens flew home with no German activated');
});

check('a village field is seen into and out of at any angle or distance, never through; a village beside the line hides what lies behind it', () => {
  const st = Sim.newGame(3);
  st.wire = {}; st.hedges = {};
  const M = Sim.unitById(st, 'mg1'), t = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== M && u !== t) u.x = u.y = null;
  assert(Sim.tileType(7, 4) === 'village' && Sim.tileType(8, 4) === 'village' && Sim.tileType(5, 4) === 'field' && Sim.tileType(6, 4) === 'field' && Sim.tileType(8, 5) === 'laneEW', 'the test needs this part of the map');
  // From two fields off, not at any corner: every area of the village field, both ways
  M.x = 5; M.y = 4; M.at = null; t.x = 7; t.y = 4;
  for (const at of ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se']) {
    t.at = at;
    assert(Sim.sight(st, M, t) && Sim.sight(st, t, M), `the piece at ${at} in the village field was not seen, or could not see out`);
  }
  // It keeps its cover from the houses
  t.at = 'w';
  assert(Sim.cover(st, M, t) === PLACE_COVER.village.men, 'the piece in the village lost its cover');
  // Never through it, to the next field
  t.x = 8; t.y = 4; t.at = 'w';
  assert(!Sim.sight(st, M, t) && !Sim.sight(st, t, M), 'a piece saw through a village field to the far side');
  // Steve: at 45 degrees to village X (7,4) with village Y (8,4) next to it: from M at the corner they share, lines that
  // would pass through Y are hidden; on the 45 degree line and on the open side are seen
  M.x = 8; M.y = 5; M.at = 'nw'; t.x = 7; t.y = 4;
  for (const at of ['se', null, 'nw']) { t.at = at; assert(Sim.sight(st, M, t), `on the 45 degree line ${at} was not seen`); }
  for (const at of ['s', 'sw', 'w']) { t.at = at; assert(Sim.sight(st, M, t), `on the open side ${at} was not seen`); }
  for (const at of ['e', 'ne', 'n']) { t.at = at; assert(!Sim.sight(st, M, t), `through the village next door ${at} was seen`); }
});

check('a German who took cover gets up the next round, as yours do', () => {
  const st = Sim.newGame(4);
  Sim.startRound(st);
  const de = st.units.find(u => u.side === 'de' && u.kind === 'company'), A = Sim.unitById(st, 'A');
  de.down = true; de.acted = true; A.down = true; A.acted = true;
  Sim.endRound(st);
  Sim.startRound(st);
  assert(!de.down && !de.acted, 'the German stayed down, or could not act');
  assert(!A.down && !A.acted, 'your piece stayed down, or could not act');
});

check('a piece the captain gets up has its token back, so nobody else loses theirs', () => {
  const st = Sim.newGame(3);
  Sim.startRound(st);
  const cap = Sim.unitById(st, 'cap'), A = Sim.unitById(st, 'A');
  A.x = cap.x; A.y = cap.y === 0 ? 1 : cap.y - 1;
  st.bag.us = 2; st.drawn = 'us'; st.activeId = null;
  A.down = true; A.acted = true;
  assert(Sim.actRally(st, cap, A).ok && !A.acted, 'the captain did not get it up');
  assert(st.bag.us === 3, `the bag holds ${st.bag.us} tokens, not 3`);
});

check('a target ducking after the shot is committed makes it a Hail Mary: the shot still happens', () => {
  const st = Sim.newGame(4);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), mg = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== A && u !== mg) u.x = u.y = null;
  // A German MG at long range on a platoon lining a hedge: 3 + 1 long + 1 hedge = 5; taking cover makes it 7
  mg.x = 7; mg.y = 5; mg.at = null; mg.quality = 'standard';
  A.x = 2; A.y = 5; A.at = 'e'; A.quality = 'standard';
  st.hedges['2,5|3,5'] = true;
  const need = Sim.needFor(st, mg, A);
  assert(need === 5, `the shot needs ${need}, not 5`);
  // No 6s: nothing happens to it
  st.rand = () => 0.5;
  const before = A.platoons;
  st.fx = [];
  Sim.fireAt(st, mg, A, true);
  assert(A.down, 'it did not take cover');
  assert(st.fx[0].need === 7 && st.fx[0].faces.length === 5, `the shot did not roll at 7: ${st.fx[0].need}, ${st.fx[0].faces.length} dice`);
  assert(A.platoons === before && !A.shocked, 'it was hurt without a 6 then a 6');
  // Standing fast, the same shot rolls
  const st2 = Sim.newGame(4);
  st2.hedges = { '2,5|3,5': true }; st2.wire = {};
  const A2 = Sim.unitById(st2, 'A'), mg2 = st2.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st2.units) if (u !== A2 && u !== mg2) u.x = u.y = null;
  mg2.x = 7; mg2.y = 5; mg2.at = null; A2.x = 2; A2.y = 5; A2.at = 'e'; A2.quality = 'standard';
  st2.fx = [];
  Sim.fireAt(st2, mg2, A2, false);
  assert(st2.fx[0].faces.length === 5, 'standing fast, the MG did not roll five dice');
});

check('a piece that took cover cannot act this round, and the cover wears off next round, on a token or not', () => {
  const st = Sim.newGame(3);
  Sim.startRound(st);
  const A = Sim.unitById(st, 'A'), mg = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  st.drawn = 'us'; st.activeId = null;
  Sim.fireAt(st, mg, A, true);
  st.drawn = 'us'; st.activeId = null;
  assert(A.x === null || (A.down && !Sim.canAct(st, A)), 'a piece in cover could still act');
  Sim.endRound(st);
  Sim.startRound(st);
  st.drawn = 'us'; st.activeId = null;
  assert(A.x === null || (!A.down && Sim.canAct(st, A)), 'the cover did not wear off, or the piece could not act next round');
});

check('a German mortar bomb says who it is at, so the piece stays on the table until it lands', () => {
  const st = Sim.newGame(3);
  st.drawn = 'de'; st.activeId = null;
  const A = Sim.unitById(st, 'A');
  st.computer = { queue: [], mortar: true, artillery: false, rep: [], ask: null, move: { gun: 'mortars', what: '' } };
  st.rand = () => 0.999;
  A.platoons = 1; A.shocked = true;
  st.fx = [];
  st.computer.ask = { mortar: true, target: A.id };
  Sim.answer(st, false);
  const f = st.fx.find(o => o.kind === 'shell');
  assert(f && f.to && f.to.id === A.id && f.result === 'Wiped out', 'the bomb did not name its target and what it did');
  assert(f.x !== null && f.faces.length > 0, 'the bomb has no dice, or no place on the table');
});

check('nobody down in cover moves on their own, either side, in whole games', () => {
  const { playRound } = require('./bot.js');
  let downSeen = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const st = Sim.newGame(seed);
    // Watch every German move: a piece down in cover before its go must not have one
    const drawToken = Sim.drawToken;
    Sim.drawToken = s => {
      const down = s.units.filter(u => u.side === 'de' && u.x !== null && u.down);
      downSeen += down.length;
      const side = drawToken(s);
      if (side === 'de' && s.computer.move && s.computer.move.id) assert(!down.some(u => u.id === s.computer.move.id), `seed ${seed}: ${s.computer.move.id} was given a move while down in cover`);
      return side;
    };
    try { while (!st.won && !st.lost && st.turn <= 12) playRound(st, true); } finally { Sim.drawToken = drawToken; }
  }
  assert(downSeen > 0, 'no German took cover in 8 games');
});

check('the label says +2 cover in a village, +1 in an orchard, not the kind of place', () => {
  const st = Sim.newGame(3);
  st.wire = {}; st.hedges = {};
  const M = Sim.unitById(st, 'mg1'), t = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (u !== M && u !== t) u.x = u.y = null;
  M.x = 5; M.y = 4; M.at = null; t.x = 7; t.y = 4; t.at = 'w';
  assert(Sim.needWhy(st, M, t).includes('+2 cover'), `the label says ${Sim.needWhy(st, M, t).join(', ')}`);
  assert(Sim.shellWhy(st, t).includes('+1 cover'), `the shell label says ${Sim.shellWhy(st, t).join(', ')}`);
  assert(!Sim.needWhy(st, M, t).some(w => /village|hamlet|orchard/.test(w)), 'the label names the place');
});

check('bazooka and Panzerschreck teams go one field further on a Move & shoot and a Charge; others do not', () => {
  // Set up: an empty table but for one team on the lane, and a German tank down the lane
  const setUp = kind => {
    const st = Sim.newGame(3);
    st.wire = {}; st.hedges = {};
    const team = Sim.unitById(st, 'bz1');
    const tank = st.units.find(u => u.side === 'de' && Sim.isTank(u));
    for (const u of st.units) if (u !== team && u !== tank) u.x = u.y = null;
    team.kind = kind; team.x = 0; team.y = 5; team.at = null;
    tank.x = 6; tank.y = 5; tank.at = null;
    return { st, team };
  };
  const reaches = (list, x, y) => list.some(p => p.x === x && p.y === y);
  // Both anti-tank teams: four fields charging, three moving to fire (the tank is in reach from three fields along)
  for (const kind of ['bazooka', 'schreck']) {
    const { st, team } = setUp(kind);
    assert(reaches(Sim.chargeSpots(st, team), 4, 5), `${kind} cannot charge four fields`);
    assert(!reaches(Sim.chargeSpots(st, team), 5, 5), `${kind} charges five fields`);
    assert(reaches(Sim.moveShootSpots(st, team), 3, 5), `${kind} cannot move three fields and shoot`);
    // Shaken: half of that, rounded down
    team.shocked = true;
    assert(reaches(Sim.chargeSpots(st, team), 2, 5) && !reaches(Sim.chargeSpots(st, team), 3, 5), `shaken ${kind} does not charge two fields`);
  }
  // Anyone else stays at three and two
  const { st, team } = setUp('sniper');
  assert(reaches(Sim.chargeSpots(st, team), 3, 5) && !reaches(Sim.chargeSpots(st, team), 4, 5), 'a sniper charges further than three fields');
  team.kind = 'captain';
  assert(!reaches(Sim.moveShootSpots(st, team), 3, 5), 'a captain moves three fields and shoots');
});

// The table with only these pieces on it: { id: [x, y] }
function tableWith(places, seed = 3) {
  const st = Sim.newGame(seed);
  st.wire = {}; st.hedges = {};
  // (a table set up for one check: nothing drops in from the sky)
  st.airdrop = null;
  for (const u of st.units) if (!(u.id in places)) u.x = u.y = null;
  for (const id in places) { const u = Sim.unitById(st, id); u.x = places[id][0]; u.y = places[id][1]; u.at = null; }
  return st;
}

check('the bomber flies a straight line: every field it crosses, in order, through the chosen field', () => {
  // All the way up one column, along one row, and corner to corner on a 45° line (touching a corner is not crossing)
  const north = Sim.bomberLine(3, 7, 0), east = Sim.bomberLine(0, 2, 4), slant = Sim.bomberLine(0, 7, 2);
  assert(north.length === ROWS && north.every(f => f.x === 3), 'north did not fly up one column');
  assert(north[0].y === 7 && north[ROWS - 1].y === 0, 'north did not fly in order');
  assert(east.length === COLS && east.every(f => f.y === 2), 'east did not fly along one row');
  assert(slant.length === 8 && slant.every(f => f.x + f.y === 7), `the 45° line crossed ${slant.length} fields`);
  // Every one of the sixteen headings through every edge field: unbroken, and through the chosen field
  for (let heading = 0; heading < BOMBER.directions; heading++) for (const e of Sim.bomberAims()) {
    const line = Sim.bomberLine(e.x, e.y, heading);
    assert(line.some(f => f.x === e.x && f.y === e.y), `heading ${heading} missed its field`);
    for (let k = 1; k < line.length; k++) {
      const step = Math.abs(line[k].x - line[k - 1].x) + Math.abs(line[k].y - line[k - 1].y);
      assert(step >= 1 && step <= 2, `heading ${heading} from ${e.x},${e.y} jumped ${step}`);
    }
  }
  assert(Sim.bomberAims().length === COLS * ROWS, 'not every field can be aimed through');
  assert(COMPASS_POINTS.length === BOMBER.directions, 'the compass does not have sixteen names');
});

check('the bomber: picked again it spins to the same direction; a new round spins afresh; a side spins its own', () => {
  const st = Sim.newGame(5);
  const first = Sim.bomberHeading(st, 'us');
  for (let k = 0; k < 20; k++) assert(Sim.bomberHeading(st, 'us') === first, 'the compass changed in the round');
  assert(st.spin.us === first && st.spin.de === undefined, 'one side spinning spun the other');
  let changed = false;
  for (let k = 0; k < 30 && !changed; k++) { Sim.endRound(st); changed = Sim.bomberHeading(st, 'us') !== first; }
  assert(changed, 'the compass never spun again in a new round');
});

check('the bomber: a bomb at 5+ on every piece under the line, either side, plus cover; one run only', () => {
  const st = tableWith({ A: [3, 7], T1: [3, 6], d1: [3, 1], mg1: [6, 6] });
  st.spin.us = 0;
  const r = Sim.actFire(st, 'bomber', 3, 7);
  assert(r.ok, 'the bomber could not fly');
  const bombs = st.fx.filter(f => f.kind === 'bomb');
  assert(st.fx[0].kind === 'flyover' && st.fx[0].side === 'us', 'the plane is not on the table');
  // One die each for the three under the line, none for the MG off it
  assert(bombs.length === 3 && bombs.every(f => f.faces.length === 1), `${bombs.length} bombs fell`);
  assert(!bombs.some(f => f.to.id === 'mg1'), 'a piece off the line was bombed');
  assert(st.ammo.us.bomber === 0, 'the run was not used');
  assert(!Sim.actFire(st, 'bomber', 3, 7).ok, 'it flew twice');
  // Out of runs: no token next round
  const pieces = st.units.filter(u => u.side === 'us' && u.x !== null && !u.acted).length;
  st.fired.us = {};
  Sim.startRound(st);
  assert(st.bag.us === pieces + 2, 'a bomber with no run left still has a token');
});

check('the bomber flies on your token; the score adds cover and take cover', () => {
  const st = tableWith({ A: [7, 4] });
  const men = Sim.unitById(st, 'A');
  // Saint-Jean's fields are houses: +1 against bombs as against shells
  assert(Sim.bombNeed(st, men) === BOMBER.need + 1, `men in a village need ${Sim.bombNeed(st, men)}`);
  assert(Sim.bombWhy(st, men)[0] === '5+' && Sim.bombWhy(st, men).includes('+1 cover'), Sim.bombWhy(st, men).join(', '));
  men.x = 0; men.y = 6;
  assert(Sim.bombNeed(st, men) === BOMBER.need, 'men in the open do not need 5+');
  men.down = true;
  assert(Sim.bombNeed(st, men) === BOMBER.need + TAKE_COVER, 'taking cover does not add two');
  // With the bag: not on a German token
  const bag = tableWith({ A: [0, 6] });
  Sim.startRound(bag);
  bag.drawn = 'de';
  assert(!Sim.actFire(bag, 'bomber', 0, 6).ok, 'it flew on a German token');
});

check('the bomber can stay away: the token is used, the run is kept, and it is back in the bag', () => {
  const st = tableWith({ A: [0, 6], d1: [9, 1] });
  Sim.startRound(st);
  st.drawn = 'us'; st.activeId = null;
  assert(Sim.skipSupport(st, 'bomber').ok, 'it could not stay away');
  assert(st.ammo.us.bomber === 1 && st.fired.us.bomber && st.activeId === 'gun:bomber', 'staying away used the run or kept the token');
  Sim.endRound(st);
  Sim.startRound(st);
  assert(Sim.tokensHome(st).us.from.some(w => w.gun === 'bomber') && st.bag.us === 1 + 3, 'it did not get a token next round');
});

check('the German bomber: nobody is asked, it flies once; its line is worth flying', () => {
  const st = tableWith({ A: [3, 7], B: [3, 5], C: [3, 3], d1: [9, 1] });
  Sim.startRound(st);
  st.spin.de = 0;
  st.fired.de = {};
  st.drawn = 'de';
  st.computer = { queue: [], mortar: false, artillery: false, bomber: true, rep: [], ask: null, move: { gun: 'bomber', what: '' } };
  // B was already down from an earlier shot: that still counts
  Sim.unitById(st, 'B').down = true;
  const r = Sim.computerStep(st);
  assert(r.done && !r.ask, 'it asked someone to take cover');
  assert(st.ammo.de.bomber === 0, 'the run was not used');
  const bombs = st.fx.filter(f => f.kind === 'bomb' && f.side === 'de');
  assert(bombs.length === 3, `${bombs.length} bombs fell`);
  assert(bombs.find(f => f.to.id === 'B').need === BOMBER.need + TAKE_COVER, 'being down already did not count');
  assert(bombs.find(f => f.to.id === 'A').need === BOMBER.need && !Sim.unitById(st, 'A').down, 'A got down');
  // Nothing worth bombing: it stays away and keeps its run
  const quiet = tableWith({ A: [3, 7], d1: [9, 1] });
  Sim.startRound(quiet);
  quiet.spin.de = 0;
  quiet.computer = { queue: [], mortar: false, artillery: false, bomber: true, rep: [], ask: null, move: { gun: 'bomber', what: '' } };
  assert(Sim.computerStep(quiet).done && quiet.ammo.de.bomber === 1, 'it flew for one piece');
});

check('the computer never flies a line that catches more of its own than the enemy', () => {
  const st = tableWith({ A: [3, 7], B: [3, 5], C: [3, 3], d1: [3, 6], d2: [3, 4], d3: [3, 1] });
  st.spin.de = 0;
  const run = Sim.bestBomberRun(st, 'de');
  assert(!run || run.x !== 3, 'it flew up the column with its own men in');
});

// For the ambush checks: one German platoon waiting on the lane, and every die a 6 (shakes) or a 1
function ambushOnLane(places, x = 8) {
  const st = tableWith(Object.assign({ d1: [x, 5] }, places));
  const d1 = Sim.unitById(st, 'd1');
  d1.ambush = true; d1.acted = true;
  return { st, d1 };
}
const HIGH = () => 0.99, LOW = () => 0;

check('ambush: any piece can go into it, not after moving; it uses the token; a piece already in sight is not fired on', () => {
  const st = tableWith({ mg1: [0, 5], d1: [3, 5] });
  const mg = Sim.unitById(st, 'mg1');
  const r = Sim.actAmbush(st, mg);
  assert(r.ok && mg.ambush && mg.acted, 'it did not go into ambush');
  assert(st.fx.length === 0, 'it fired on a piece already in sight');
  assert(!Sim.canAmbush(st, mg) && !Sim.actAmbush(st, mg).ok, 'it went into ambush twice');
  // Not on the other side's token
  const bag = tableWith({ A: [0, 5], d1: [9, 1] });
  Sim.startRound(bag);
  bag.drawn = 'de';
  assert(!Sim.canAmbush(bag, Sim.unitById(bag, 'A')), 'it went into ambush on a German token');
});

check('ambush: fires as soon as an enemy comes into sight along its move; a shaken piece carries on and can still shoot (Steve, 2026-11-24)', () => {
  const { st, d1 } = ambushOnLane({ A: [2, 5] }, 7);
  const A = Sim.unitById(st, 'A');
  st.rand = HIGH;
  // Two fields along the lane: seen from the first (four fields from the ambush), shaken, and goes on
  const r = Sim.actMoveShoot(st, A, 4, 5);
  assert(r.ok, 'the move was refused');
  assert(A.x === 4 && A.shocked, `it ended at ${A.x} (shaken: ${A.shocked})`);
  assert(!d1.ambush && d1.acted, 'the ambush did not end, or the piece could act again');
  const shot = st.fx.find(f => f.from && f.from.id === 'd1');
  assert(shot && shot.midMove && shot.x === 3, 'the shot was not at the field it was seen in');
  // Not charging: it still has its shot
  assert(A.halfShot && Sim.actHalfShot(st, A, d1).ok, 'it lost its shot');
});

check('ambush: a miss and it carries on; it fires only once', () => {
  const { st, d1 } = ambushOnLane({ A: [2, 5] }, 7);
  const A = Sim.unitById(st, 'A');
  st.rand = LOW;
  assert(Sim.actCharge(st, A, 5, 5).ok, 'the charge was refused');
  assert(A.x === 5 && !A.shocked, `it ended at ${A.x}`);
  assert(st.fx.filter(f => f.from && f.from.id === 'd1').length === 1, 'it fired more than once');
  assert(!d1.ambush, 'the ambush went on');
});

check('ambush: a charge shot at still goes in to fight; a piece killed on the way stays dead (Steve, 2026-11-24)', () => {
  const { st } = ambushOnLane({ A: [4, 5] }, 7);
  const A = Sim.unitById(st, 'A');
  st.rand = HIGH;
  // Charging the ambusher itself: shaken as it sets off, already in sight
  assert(Sim.actCharge(st, A, 7, 5).ok, 'the charge was refused');
  assert(st.fx.some(f => f.from && f.from.id === 'd1') && st.fx.some(f => f.kind === 'melee'), `it got no fight, at ${A.x}`);
  assert(!A.halfShot, 'a charge got a shot');
  // A team already shaken: this hit kills it, and it doesn't come back at the goal
  const two = ambushOnLane({ bz1: [3, 5] }, 7);
  const bz = Sim.unitById(two.st, 'bz1');
  bz.shocked = true;
  two.st.rand = HIGH;
  assert(Sim.actCharge(two.st, bz, 5, 5).ok, 'the second charge was refused');
  assert(bz.x === null, `the team is at ${bz.x}`);
});

check('ambush: shaken in a field of friends it can only pass through, it goes on to where it was sent', () => {
  // A tank fills the field, so the platoon can only pass through
  const { st } = ambushOnLane({ A: [2, 5], T1: [3, 4] }, 7);
  const A = Sim.unitById(st, 'A'), T1 = Sim.unitById(st, 'T1');
  T1.y = 5;
  st.rand = HIGH;
  assert(!Sim.roomFor(st, A, 3, 5), 'there is room beside the tank');
  assert(Sim.actMoveShoot(st, A, 4, 5).ok, 'the move was refused');
  assert(A.x === 4 && A.shocked, `it ended at ${A.x} (shaken: ${A.shocked})`);
});

check('ambush: losing a section on the way, it still gets where it was sent (Steve, 2026-11-24)', () => {
  const { st } = ambushOnLane({ A: [2, 5] }, 7);
  const A = Sim.unitById(st, 'A');
  // Already shaken, so the hit costs a section (and it goes only one field)
  A.shocked = true;
  st.rand = HIGH;
  const before = A.platoons;
  const spot = A.x + 1;
  assert(Sim.actCharge(st, A, spot, 5).ok, 'the charge was refused');
  assert(A.x === spot, `it ended at ${A.x}`);
  assert(A.platoons < before, 'it lost nobody: the check is set up wrong');
});

check('ambush: it waits rather than fire at 7 or more, or at what it cannot hurt', () => {
  // Long range, a small target, down in cover, and the ambusher shaken (its elite one less): 7
  const hard = ambushOnLane({ bz1: [3, 5] }, 7);
  const bz = Sim.unitById(hard.st, 'bz1');
  bz.down = true;
  hard.d1.shocked = true;
  assert(Sim.shotNeed(hard.st, hard.d1, bz) === 7, `the shot needs ${Sim.shotNeed(hard.st, hard.d1, bz)}`);
  assert(Sim.actCharge(hard.st, bz, 4, 5).ok, 'the charge was refused');
  assert(hard.d1.ambush, 'it fired at 7 or more');
  // Rifles can't hurt a tank
  const tank = ambushOnLane({ T1: [3, 5] }, 7);
  assert(Sim.actCharge(tank.st, Sim.unitById(tank.st, 'T1'), 6, 5).ok, 'the tank was refused');
  assert(tank.d1.ambush, 'rifles fired at a tank');
});

check('ambush: an enemy shooting in its sight sets it off, and its token is over for the round', () => {
  const st = tableWith({ mg1: [0, 5], d1: [3, 5] });
  const mg = Sim.unitById(st, 'mg1'), d1 = Sim.unitById(st, 'd1');
  Sim.actAmbush(st, mg);
  d1.acted = true;
  d1.post = { x: 3, y: 5 };
  st.computer = { queue: ['d1'], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: 'd1', what: '' } };
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(st.fx.some(f => f.from && f.from.id === 'd1'), 'the German did not fire');
  assert(st.fx.some(f => f.from && f.from.id === 'mg1'), 'the ambush did not answer');
  assert(!mg.ambush && mg.acted, 'it is still waiting, or could act again');
});

check('ambush: it ends with the round; the Germans lie in wait with nothing better to do', () => {
  const st = tableWith({ A: [0, 7], d1: [11, 0] });
  const d1 = Sim.unitById(st, 'd1');
  d1.post = { x: 11, y: 0 }; d1.reserve = false; d1.acted = true;
  st.computer = { queue: ['d1'], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: 'd1', what: '' } };
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(d1.ambush && st.computer.move.what === 'Lies in ambush', `the German ${st.computer.move.what}`);
  st.computer = null;
  Sim.endRound(st);
  assert(!d1.ambush && !d1.acted, 'the ambush carried over to the next round');
});

check('the Germans: their men do not charge across barbed wire', () => {
  // A wired edge between two fields on a real board
  const board = Sim.newGame(3);
  let edge = null;
  for (let y = 0; y < ROWS && !edge; y++) for (let x = 0; x < COLS - 1 && !edge; x++) if (Sim.wire(board, x, y, x + 1, y)) edge = [x, y];
  assert(edge, 'no wire on this board');
  for (let seed = 1; seed <= 40; seed++) {
    const st = Sim.newGame(3);
    for (const u of st.units) u.x = u.y = null;
    const A = Sim.unitById(st, 'A'), d2 = Sim.unitById(st, 'd2');
    A.x = edge[0]; A.y = edge[1]; A.at = null; A.shocked = true;
    d2.x = edge[0] + 1; d2.y = edge[1]; d2.at = null; d2.post = { x: d2.x, y: d2.y }; d2.acted = true;
    st.objective = { x: edge[0], y: edge[1], name: 'Here' };
    st.rand = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(seed * 7919 + 1);
    st.computer = { queue: ['d2'], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: 'd2', what: '' } };
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
    assert(!st.fx.some(f => f.kind === 'melee'), `seed ${seed}: they charged across the wire`);
  }
});

check('the Germans: their artillery fires once without asking anyone; a piece already down keeps its +2', () => {
  const st = tableWith({ A: [3, 5], B: [3, 4], C: [0, 0], d2: [9, 5], dcap: [11, 7] });
  const before = st.ammo.de.artillery;
  Sim.unitById(st, 'B').down = true;
  st.computer = { queue: [], mortar: false, artillery: true, bomber: false, rep: [], ask: null, move: { gun: 'artillery', what: '' } };
  const r = Sim.computerStep(st);
  assert(r.done && !r.ask, 'it asked someone to take cover');
  assert(st.ammo.de.artillery === before - 1, 'it did not fire once');
  const need = id => st.fx.find(f => f.kind === 'shell' && f.to && f.to.id === id).need;
  assert(need('B') === need('A') + TAKE_COVER && !Sim.unitById(st, 'A').down, 'being down already did not count, or A got down');
});

check('the Germans: a shaken piece rallies itself, unless it has a shot and its captain is near', () => {
  const run = (st, id) => {
    Sim.unitById(st, id).acted = true;
    st.computer = { queue: [id], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id, what: '' } };
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  };
  // No captain: it rallies, even with a shot
  const alone = tableWith({ A: [5, 5], d2: [7, 5] });
  const d = Sim.unitById(alone, 'd2');
  d.post = { x: 7, y: 5 }; d.shocked = true;
  run(alone, 'd2');
  assert(!d.shocked && !alone.fx.some(f => f.from && f.from.id === 'd2'), 'with no captain it did not rally instead of firing');
  // Captain near and a shot: it fires, and he can rally it
  const near = tableWith({ A: [5, 5], d2: [7, 5], dcap: [8, 5] });
  const e = Sim.unitById(near, 'd2');
  e.post = { x: 7, y: 5 }; e.shocked = true;
  run(near, 'd2');
  assert(e.shocked && near.fx.some(f => f.from && f.from.id === 'd2'), 'with its captain near it did not fire');
  // Captain near and no shot: it rallies
  const quiet = tableWith({ A: [0, 0], d2: [11, 5], dcap: [10, 5] });
  const q = Sim.unitById(quiet, 'd2');
  q.post = { x: 11, y: 5 }; q.shocked = true;
  run(quiet, 'd2');
  assert(!q.shocked, 'with no shot it did not rally');
});

check('moving inside its field: a machine gun or a captain with no shot left cannot fire after; a rifle platoon can', () => {
  const st = tableWith({ mg1: [5, 5], d2: [7, 5] });
  const mg = Sim.unitById(st, 'mg1');
  assert(Sim.actLine(st, mg, Sim.lineSides(st, mg)[0]).ok && !mg.halfShot, 'the machine gun can fire after moving');
  const capped = tableWith({ cap: [5, 5], A: [5, 4], B: [4, 5], d2: [7, 5] });
  const cap = Sim.unitById(capped, 'cap');
  Sim.unitById(capped, 'A').shocked = true; Sim.unitById(capped, 'B').shocked = true;
  Sim.actRally(capped, cap, Sim.unitById(capped, 'A')); Sim.actRally(capped, cap, Sim.unitById(capped, 'B'));
  assert(Sim.actLine(capped, cap, Sim.lineSides(capped, cap)[0]).ok && !cap.halfShot, 'the captain has a shot after two rallies');
  const rifles = tableWith({ A: [5, 5], d2: [7, 5] });
  const A = Sim.unitById(rifles, 'A');
  assert(Sim.actLine(rifles, A, Sim.lineSides(rifles, A)[0]).ok && A.halfShot, 'a rifle platoon lost its shot');
});

check('ambush: one firing sets off an enemy ambush that can see it, each once', () => {
  const { st, d1 } = ambushOnLane({ A: [2, 5], mg1: [1, 5] }, 6);
  const mg = Sim.unitById(st, 'mg1');
  mg.ambush = true; mg.acted = true;
  assert(Sim.targets(st, mg).includes(d1), 'the machine gun cannot see the ambusher');
  st.rand = LOW;
  assert(Sim.actCharge(st, Sim.unitById(st, 'A'), 3, 5).ok, 'the charge was refused');
  const from = id => st.fx.filter(f => f.from && f.from.id === id).length;
  assert(from('d1') === 1 && from('mg1') === 1, `shots: ${from('d1')} and ${from('mg1')}`);
  assert(!d1.ambush && !mg.ambush, 'an ambush is still waiting');
});

check('endings: one bomb on the last of both sides is a draw, whoever it hits first', () => {
  for (const [us, de] of [[[3, 7], [3, 5]], [[3, 5], [3, 7]]]) {
    const st = tableWith({ A: us, d1: de });
    Sim.unitById(st, 'A').platoons = 1; Sim.unitById(st, 'A').shocked = true;
    Sim.unitById(st, 'd1').platoons = 1; Sim.unitById(st, 'd1').shocked = true;
    st.spin.us = 0; st.rand = HIGH;
    assert(Sim.actFire(st, 'bomber', 3, 7).ok, 'the bomber could not fly');
    assert(st.draw && !st.won, `won ${st.won}, draw ${st.draw}`);
  }
});

check('endings: no rifle platoon and nothing to hurt the German tanks loses; otherwise it goes on', () => {
  const noAmmo = st => { st.ammo.us.mortars = 0; st.ammo.us.artillery = 0; st.ammo.us.bomber = 0; };
  // A sniper against a tank, nothing left off the board: lost
  const lost = tableWith({ sn1: [0, 0], dt1: [11, 7] });
  noAmmo(lost);
  Sim.endRound(lost);
  assert(lost.lost && !lost.draw, 'it played on with no way to win');
  // Two rounds of mortars left (one only shakes a tank, Steve 2026-11-23), a bazooka, a rifle platoon, or no German tanks: it goes on
  const rounds = tableWith({ sn1: [0, 0], dt1: [11, 7] });
  noAmmo(rounds); rounds.ammo.us.mortars = 2;
  Sim.endRound(rounds);
  assert(!rounds.lost, 'lost with two mortar rounds left');
  const zook = tableWith({ bz1: [0, 0], dt1: [11, 7] });
  noAmmo(zook);
  Sim.endRound(zook);
  assert(!zook.lost, 'lost with a bazooka left');
  const rifles = tableWith({ A: [0, 0], dt1: [11, 7] });
  noAmmo(rifles);
  Sim.endRound(rifles);
  assert(!rifles.lost, 'lost with a rifle platoon left');
  const men = tableWith({ sn1: [0, 0], d2: [11, 7] });
  noAmmo(men);
  Sim.endRound(men);
  assert(!men.lost, 'lost with only German men left, whom a sniper can kill');
});

check('machine guns fire five dice', () => {
  assert(PIECES.mg.soft === 5 && PIECES.mg42.soft === 5, 'an MG team does not fire five dice');
});

check('machine guns cannot move and fire', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const st = Sim.newGame(seed);
    for (const u of st.units.filter(u => (u.kind === 'mg' || u.kind === 'mg42') && u.x !== null)) assert(!Sim.moveShootSpots(st, u).length, `seed ${seed}: ${u.name} could move and fire`);
  }
});

check('tanks are impervious to rifles and machine guns', () => {
  const st = Sim.newGame(2);
  st.hedges = {}; st.wire = {};
  const mg = Sim.unitById(st, 'mg1'), A = Sim.unitById(st, 'A'), pz = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (![mg, A, pz].includes(u)) u.x = u.y = null;
  pz.kind = 'pz4'; pz.platoons = 2;
  mg.x = 0; mg.y = 6; A.x = 0; A.y = 7; pz.x = 1; pz.y = 6; mg.at = 'e'; A.at = 'e';
  assert(!Sim.targets(st, mg).includes(pz) && !Sim.targets(st, A).includes(pz), 'a rifle platoon or MG could fire on a tank');
  assert(!Sim.chargeSpots(st, A).some(p => p.x === 1 && p.y === 6), 'a rifle platoon could charge a field of tanks');
});

check("a tank's high explosive hits every piece on foot in the field, like a mortar", () => {
  const st = Sim.newGame(5);
  st.hedges = {}; st.wire = {};
  const T1 = Sim.unitById(st, 'T1'), A = Sim.unitById(st, 'A');
  const platoon = st.units.find(u => u.side === 'de' && u.kind === 'company'), team = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  for (const u of st.units) if (![T1, A, platoon, team].includes(u)) u.x = u.y = null;
  T1.x = 0; T1.y = 6; A.x = 0; A.y = 5; A.at = null; platoon.x = 1; platoon.y = 6; team.x = 1; team.y = 6;
  st.fx = [];
  Sim.actShoot(st, T1, platoon);
  const hitIds = st.fx.filter(f => f.faces).map(f => f.to.id);
  assert(hitIds.includes(platoon.id) && hitIds.includes(team.id), 'only the target rolled: ' + hitIds.join(','));
  // Rifles stay one target at a time
  // (the tank's shot may have killed it: set it up again)
  st.fx = []; A.acted = false; platoon.x = 1; platoon.y = 6; platoon.platoons = 3; platoon.shocked = false; st.won = false;
  assert(Sim.actShoot(st, A, platoon).ok, 'the rifle platoon could not shoot');
  assert(st.fx.filter(f => f.faces).length === 1, 'a rifle platoon hit more than one piece');
});

check('no one shoots through a village, hamlet or orchard', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed);
    const all = st.units.filter(u => u.x !== null);
    // Put pieces all over the board and check every shot anyone could take
    for (const a of all) for (const b of all) {
      if (a.side === b.side || !Sim.sight(st, a, b)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, n = Math.max(Math.abs(dx), Math.abs(dy));
      for (let k = 1; k < n; k++) {
        const fx = Math.round(a.x + dx * k / n), fy = Math.round(a.y + dy * k / n);
        if (fx === a.x && fy === a.y) continue;
        if (fx === b.x && fy === b.y) continue;
        assert(!['village', 'hamlet', 'orchard'].includes(Sim.tileType(fx, fy)), `seed ${seed}: ${a.name} sees ${b.name} through ${Sim.tileType(fx, fy)} at ${fx},${fy}`);
      }
    }
  }
});

check('a piece arriving by a hedge lines it, in the middle stands in the open', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const able = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== able) u.x = u.y = null;
  able.x = 0; able.y = 6;
  st.hedges['2,6|3,6'] = true;
  // One section: one area
  able.platoons = 1;
  assert(Sim.actCharge(st, able, 2, 6, 'e').ok && able.at === 'e', 'it did not line the hedge it was sent to');
  able.acted = false;
  assert(Sim.actCharge(st, able, 1, 6, null).ok && able.at === null, 'it did not stand in the open');
  // A full platoon (a 2×2 block) sent to the east edge takes a corner block on that side, lining it
  const st2 = Sim.newGame(3);
  st2.hedges = { '2,6|3,6': true }; st2.wire = {};
  const A2 = Sim.unitById(st2, 'A');
  for (const u of st2.units) if (u !== A2) u.x = u.y = null;
  A2.x = 0; A2.y = 6;
  assert(Sim.actCharge(st2, A2, 2, 6, 'e').ok && ['ne', 'se'].includes(A2.at) && Sim.lines(A2, 'e'), `a full platoon sent east stands at ${A2.at}`);
});

check('the captain can shoot, and be shot like anyone else (a small target): one wound and he is gone', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const cap = Sim.unitById(st, 'cap'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== cap && u !== de) u.x = u.y = null;
  cap.x = 0; cap.y = 6; de.x = 1; de.y = 6;
  assert(Sim.targets(st, cap).includes(de), 'the captain had no target next to him');
  assert(Sim.actShoot(st, cap, de).ok, 'the captain could not shoot');
  assert(Sim.targets(st, de).includes(cap), 'a German could not target the captain');
  assert(Sim.needWhy(st, de, cap).some(w => /small target/.test(w)), 'the captain was not a small target');
  // Each hit: a coin toss to wound; one wound and his HQ is gone
  for (let k = 0; k < 30 && cap.x !== null; k++) Sim.fireAt(st, de, cap);
  assert(cap.x === null, 'the captain could not be killed');
});

check('shaken twice kills; bazookas and tanks kill men outright; MGs and tanks reach further; tanks give cover', () => {
  const setUp = () => {
    const st = Sim.newGame(4);
    st.hedges = {}; st.wire = {};
    const A = Sim.unitById(st, 'A'), bz = Sim.unitById(st, 'bz1'), mg = Sim.unitById(st, 'mg1'), T1 = Sim.unitById(st, 'T1');
    const de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (![A, bz, mg, T1, de].includes(u)) u.x = u.y = null;
    A.x = 0; A.y = 6; de.x = 1; de.y = 6; de.platoons = 3; de.at = null; A.at = 'e'; A.quality = 'standard';
    // (it has moved this round, so it can't take cover: every die rolls)
    de.acted = true;
    bz.x = 0; bz.y = 7; mg.x = 9; mg.y = 0; T1.x = 9; T1.y = 2;
    // Every die a 6, every coin toss tails: only the rules themselves kill
    st.rand = () => 0.99;
    return { st, A, bz, mg, T1, de };
  };
  let g = setUp();
  Sim.actShoot(g.st, g.A, g.de);
  // (one shot takes at most one section from a rifle platoon, Steve)
  assert(g.de.platoons === 2, `three rifle hits on a fresh platoon should shake it with the first and take one section with the next (it has ${g.de.platoons})`);
  g = setUp(); g.de.shocked = true;
  Sim.actShoot(g.st, g.A, g.de);
  assert(g.de.platoons === 2, `three hits on a shaken platoon took more than one section (it has ${g.de.platoons})`);
  g = setUp(); g.de.shocked = true; g.de.platoons = 1;
  Sim.actShoot(g.st, g.A, g.de);
  assert(g.de.x === null, 'hits on a shaken platoon down to its last section did not wipe it out');
  g = setUp();
  g.bz.at = null; g.bz.x = 1; g.bz.y = 7;
  Sim.actShoot(g.st, g.bz, g.de);
  assert(g.de.platoons < 3 || g.de.x === null, 'a bazooka hit on men did not kill');
  // Range: three fields away is long range for riflemen, not for a machine gun (four is)
  const r = setUp();
  const near = { x: 2, y: 6, kind: 'company', side: 'de', at: null }, far = { x: 3, y: 6, kind: 'company', side: 'de', at: null };
  assert(!Sim.needWhy(r.st, r.A, near).some(w => w.includes('long range')), 'two fields away was long range for a rifle platoon');
  assert(Sim.needWhy(r.st, r.A, far).some(w => w.includes('long range')), 'three fields away was not long range for a rifle platoon');
  r.mg.x = 0; r.mg.y = 5; r.mg.at = null;
  const far2 = { x: 4, y: 5, kind: 'company', side: 'de', at: null };
  assert(!Sim.needWhy(r.st, r.mg, far2).some(w => w.includes('long range')), 'four fields away was long range for a machine gun');
});

check('a tank at men: its machine guns are a coin toss, only its gun kills outright', () => {
  const setUp = kind => {
    const st = Sim.newGame(4);
    st.hedges = {}; st.wire = {};
    const T1 = Sim.unitById(st, 'T1');
    const de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (![T1, de].includes(u)) u.x = u.y = null;
    T1.kind = kind; T1.x = 0; T1.y = 6; T1.at = null;
    de.x = 1; de.y = 6; de.platoons = 3; de.at = null; de.shocked = false; de.quality = 'standard';
    // (it has moved this round, so it can't take cover: every die rolls)
    de.acted = true;
    // Every die a 6, no fraction of a die past one taken, every coin toss tails: only the rules themselves kill
    st.rand = () => 0.99;
    return { st, T1, de };
  };
  // A tank with machine guns only: one machine-gun die. The hit shakes, and tails means no section lost
  PIECES.mgTestTank = { name: 'Test tank', soft: 1.5, hard: 0, tank: true, armour: 0 };
  let g = setUp('mgTestTank');
  Sim.actShoot(g.st, g.T1, g.de);
  assert(g.de.platoons === 3 && g.de.shocked, `a machine-gun hit from a tank killed outright (sections ${g.de.platoons})`);
  delete PIECES.mgTestTank;
  // A Sherman 75mm: its gun's half die at men is rounded up to one (Steve, 2026-11-12), which kills a section
  g = setUp('sherman');
  Sim.actShoot(g.st, g.T1, g.de);
  assert(g.de.platoons === 2, `a Sherman's rounded-up gun die did not kill a section (sections ${g.de.platoons})`);
  // A Panther: one machine-gun die (shakes, tails) then one gun die, which kills a section
  g = setUp('panther');
  Sim.actShoot(g.st, g.T1, g.de);
  assert(g.de.platoons === 2, `a Panther's gun hit did not kill a section, or its machine gun did (sections ${g.de.platoons})`);
  // With real dice, a tank with only a machine gun: about half its hits on a fresh platoon take a section
  PIECES.mgOnlyTank = { name: 'Test tank', soft: 1, hard: 0, tank: true, armour: 0 };
  let hits = 0, wounded = 0;
  for (let k = 0; k < 600; k++) {
    g = setUp('mgOnlyTank');
    let seed = k * 7919 + 1;
    g.st.rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    Sim.actShoot(g.st, g.T1, g.de);
    if (g.de.shocked) hits++;
    if (g.de.platoons < 3) wounded++;
  }
  delete PIECES.mgOnlyTank;
  const share = wounded / hits;
  assert(hits > 100 && share > 0.35 && share < 0.65, `a tank's machine-gun hits wounded ${wounded} of ${hits}, not about half`);
});

check('tanks block sight through the areas they stand in; past a tank corner only from that corner, +1 both', () => {
  const st = Sim.newGame(3);
  st.wire = {}; st.hedges = {};
  const a = Sim.unitById(st, 'mg1'), b = st.units.find(u => u.side === 'de' && u.kind === 'mg42'), T1 = Sim.unitById(st, 'T1');
  for (const u of st.units) if (![a, b, T1].includes(u)) u.x = u.y = null;
  // In a row: a at (8,6) east edge, b at (10,6) west edge; the tank in the middle of (9,6) between them
  a.x = 8; a.y = 6; a.at = 'e'; b.x = 10; b.y = 6; b.at = 'w';
  T1.x = 9; T1.y = 6; T1.at = null;
  assert(!Sim.sight(st, a, b), 'a line straight through the tank was not blocked');
  // Tank out of the way: seen in the open
  T1.x = 9; T1.y = 4;
  assert(Sim.sight(st, a, b) && Sim.sight(st, a, b).cover === 0, 'with the tank gone the line was not clear');
  // Past the tank's corner: the tank in the north-east block of (10,7); p beside it in the south area looks up-left along
  // the 45° line past the tank's south-west corner to q in (9,6): seen, and p is right beside the tank, so no cover
  const st2 = Sim.newGame(3);
  st2.wire = {}; st2.hedges = {};
  const p = Sim.unitById(st2, 'mg1'), q = st2.units.find(u => u.side === 'de' && u.kind === 'mg42'), T = Sim.unitById(st2, 'T1');
  for (const u of st2.units) if (![p, q, T].includes(u)) u.x = u.y = null;
  T.x = 10; T.y = 7; T.at = 'ne';
  p.x = 10; p.y = 7; p.at = 's';
  q.x = 9; q.y = 6; q.at = 'w';
  const s = Sim.sight(st2, p, q);
  assert(s && !s.tankCorner, 'past the tank corner from beside it: not seen, or in cover');
  // The tank in the north-west block instead: the line runs through it
  T.at = 'nw';
  assert(!Sim.sight(st2, p, q), 'a line through the tank was not blocked');
});

check('the captain: two rallies if he stays put or charges, in any order; one if he shoots or moves and shoots; Skip to stop', () => {
  const st = Sim.newGame(3);
  const cap = Sim.unitById(st, 'cap'), A = Sim.unitById(st, 'A'), B = Sim.unitById(st, 'B');
  for (const u of st.units) if (![cap, A, B].includes(u) && u.side === 'us') u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  cap.x = 0; cap.y = 6; A.x = 0; A.y = 5; B.x = 1; B.y = 6;
  A.down = true; A.acted = true; B.down = true; B.acted = true;
  assert(Sim.actRally(st, cap, A).ok && Sim.actRally(st, cap, B).ok, 'two rallies refused');
  // After two rallies he can still charge, but not shoot or move and shoot (Steve)
  assert(Sim.canAct(st, cap) && Sim.chargeSpots(st, cap).length && !Sim.mayFire(cap) && !Sim.moveShootSpots(st, cap).length, 'after two rallies he could not charge, or could still fire');
  assert(!Sim.canRally(st, cap), 'a third rally');
  // He charges, then rallies twice (one either side works the same way)
  const st2 = Sim.newGame(3);
  const c2 = Sim.unitById(st2, 'cap'), A2 = Sim.unitById(st2, 'A'), B2 = Sim.unitById(st2, 'B');
  for (const u of st2.units) if (![c2, A2, B2].includes(u) && u.side === 'us') u.x = u.y = null;
  st2.hedges = {}; st2.wire = {};
  c2.x = 0; c2.y = 6; A2.x = 0; A2.y = 4; B2.x = 2; B2.y = 4;
  A2.shocked = true; B2.shocked = true;
  const spot = Sim.chargeSpots(st2, c2).find(p => p.x === 1 && p.y === 6) || Sim.chargeSpots(st2, c2)[0];
  assert(Sim.actCharge(st2, c2, spot.x, spot.y).ok, 'the captain could not charge');
  assert(Sim.canRally(st2, c2) && Sim.actRally(st2, c2, Sim.rallyTargets(st2, c2)[0]).ok, 'no rally after the charge');
  assert(Sim.canRally(st2, c2) && Sim.actRally(st2, c2, Sim.rallyTargets(st2, c2)[0]).ok, 'no second rally after the charge');
  assert(!Sim.canRally(st2, c2), 'a third rally after the charge');
  // Shooting: one rally only
  const st3 = Sim.newGame(3);
  const c3 = Sim.unitById(st3, 'cap'), A3 = Sim.unitById(st3, 'A'), B3 = Sim.unitById(st3, 'B');
  for (const u of st3.units) if (![c3, A3, B3].includes(u) && u.side === 'us') u.x = u.y = null;
  c3.x = 0; c3.y = 6; A3.x = 0; A3.y = 5; B3.x = 1; B3.y = 6; A3.shocked = true; B3.shocked = true;
  c3.fired = true; c3.acted = true;
  assert(Sim.actRally(st3, c3, A3).ok && !Sim.canRally(st3, c3), 'after shooting he rallied more than once');
  // Skip turn ends his rallies too
  const st4 = Sim.newGame(3);
  const c4 = Sim.unitById(st4, 'cap'), A4 = Sim.unitById(st4, 'A');
  c4.x = 0; c4.y = 6; A4.x = 0; A4.y = 5; A4.shocked = true;
  assert(Sim.actSkip(st4, c4).ok && !Sim.canRally(st4, c4), 'he could still rally after Skip turn');
});

check('destroying every German wins, even with no rifle platoons; losing everything loses', () => {
  const st = Sim.newGame(6);
  for (const u of st.units) if (u.side === 'de' || u.kind === 'company') { u.x = null; u.y = null; }
  startGermanRound(st);
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  Sim.finishRound(st);
  assert(st.won, 'wiping out the Germans did not win');
  const st2 = Sim.newGame(6);
  for (const u of st2.units) if (u.kind === 'company' && u.side === 'us') { u.x = null; u.y = null; }
  startGermanRound(st2);
  for (let r = Sim.computerStep(st2); !r.done; r = Sim.computerStep(st2)) Sim.answer(st2, false);
  Sim.finishRound(st2);
  assert(!st2.lost || !st2.units.some(u => u.side === 'us' && u.x !== null), 'the game was lost with pieces still on the table');
});

check('artillery can hit your own pieces round the target', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (![A, B, de].includes(u)) u.x = u.y = null;
  A.x = 2; A.y = 6; de.x = 3; de.y = 6; B.x = 4; B.y = 6;
  st.rand = () => 0.99;
  const r = Sim.actFire(st, 'artillery', 3, 6);
  assert(r.ok, 'the artillery could not fire');
  assert(st.fx.some(f => f.to && f.to.id === 'B'), 'the shells round the target missed your own platoon');
  // Every shell, even on an empty field, flies from our own guns
  assert(st.fx.filter(f => f.kind === 'shell').every(f => f.side === 'us'), 'a shell from our artillery came from the German guns');
});

check('a shot that would need 7 or more is a Hail Mary: it can be taken, and needs a 6 then a 6', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== B && u !== de) u.x = u.y = null;
  // A German in the orchard three fields off (cover and long range), the shooter shaken: 3 + 1 + 1 + 1 = 6
  B.x = 6; B.y = 0; B.at = null; B.quality = 'standard'; B.shocked = true;
  de.x = 9; de.y = 0; de.at = 'w';
  assert(Sim.tileType(9, 0) === 'orchard', 'the test needs an orchard at 9,0');
  assert(Sim.targets(st, B).includes(de) && Sim.needFor(st, B, de) === 6, 'a 6+ shot was refused');
  // A small target (two men or fewer) makes it 7: still a target
  de.kind = 'schreck';
  assert(Sim.targets(st, B).includes(de) && Sim.needFor(st, B, de) === 7, 'a 7+ shot was refused');
  // A 6, then a 6, about one die in 36; a plain 6+ one in 6
  const count = need => {
    const s = Sim.newGame(1);
    let hits = 0;
    for (let k = 0; k < 40000; k++) hits += Sim.roll(s, 1, need, []);
    return hits / 40000;
  };
  const six = count(6), hail = count(7), eight = count(8);
  assert(Math.abs(six - 1 / 6) < 0.01, `6+ hit ${six}`);
  assert(Math.abs(hail - 1 / 36) < 0.005 && Math.abs(eight - 1 / 36) < 0.005, `Hail Marys hit ${hail} and ${eight}`);
  // The dice show both throws
  const s2 = Sim.newGame(2), faces = [];
  s2.rand = () => 0.999;
  assert(Sim.roll(s2, 1, 7, faces) === 1 && faces.length === 2 && faces[0].lead && !faces[0].hit && faces[1].hit, 'a Hail Mary did not show a 6 then a 6');
});

check('the Germans take a Hail Mary only when they have nothing better to do', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const mg = st.units.find(u => u.side === 'de' && u.kind === 'mg42'), A = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== mg && u !== A) u.x = u.y = null;
  // A piece in a village, taking cover: 3 + 2 + 2 = 7. The MG has no post, and nothing else to do
  mg.post = null; mg.reserve = false; mg.x = 5; mg.y = 4; mg.at = null;
  A.x = 7; A.y = 4; A.at = 'w'; A.down = true; A.acted = true;
  startGermanRound(st);
  st.computer.queue = [mg.id]; st.computer.mortar = false; st.computer.artillery = false;
  const r = Sim.computerStep(st);
  assert(A.x === null || st.fx.some(f => f.need > MAX_NEED), `the MG did not fire its Hail Mary: ${JSON.stringify(r)}`);
});

check('ranges: rifles 4, machine guns and tanks 6; the sniper the whole board, ignoring cover and range', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), mg = Sim.unitById(st, 'mg1'), sn = Sim.unitById(st, 'sn1');
  const open = (x, y) => ({ x, y, kind: 'company', side: 'de', at: null });
  // Along the lane row (no houses or trees in the way)
  const row = [...Array(ROWS).keys()].find(y => [...Array(COLS).keys()].every(x => ['laneEW', 'crossroads', 'field', 'bridge'].includes(Sim.tileType(x, y)) || x === 7));
  for (const u of [A, mg, sn]) { u.x = 0; u.y = row; u.at = null; }
  const clear = x => [...Array(x).keys()].every(k => !['village', 'hamlet', 'orchard'].includes(Sim.tileType(k, row)));
  if (clear(7)) {
    assert(Sim.sight(st, A, open(4, row)) && !Sim.sight(st, A, open(5, row)), 'rifles do not reach exactly 4 fields');
    assert(Sim.sight(st, mg, open(6, row)), 'a machine gun does not reach 6 fields');
    assert(Sim.sight(st, sn, open(6, row)), 'the sniper cannot see across the board');
  }
  // The sniper ignores cover and range: a far target in a village needs just 3+; taking cover still adds 2 (Steve,
  // 2026-11-15)
  const tgt = { x: 4, y: 4, kind: 'company', side: 'de', at: 'w', down: false };
  sn.quality = 'standard'; sn.shocked = false;
  assert(Sim.needFor(st, sn, tgt) === TO_HIT, 'the sniper was slowed by cover or range');
  tgt.down = true;
  assert(Sim.needFor(st, sn, tgt) === TO_HIT + TAKE_COVER, 'taking cover did not help against the sniper');
});

check('the German artillery shells Americans it can see, clear of its own men, and runs out', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== B && u !== de) u.x = u.y = null;
  // In the lane row, three fields apart: seen, and not next to the Germans
  B.x = 0; B.y = 2; B.at = null; de.x = 3; de.y = 2; de.at = null;
  const before = st.ammo.de.artillery;
  startGermanRound(st);
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(st.ammo.de.artillery === before - 1, 'the German artillery did not fire');
  assert(st.fx.some(f => f.support === 'artillery' && f.side === 'de'), 'no German shells landed');
  // Every German shell, even on an empty field round the target, flies from the German guns (Steve)
  assert(st.fx.filter(f => f.kind === 'shell').every(f => f.side === 'de'), 'a German shell came from the American guns');
});

check('every German move says which piece or gun it is and what it does', () => {
  let moves = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const st = Sim.newGame(seed);
    Sim.startRound(st);
    // Draw tokens through the round; on each German one, let it move (standing fast) and read what it says
    for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
      if (side === 'us') { Sim.passToken(st); continue; }
      if (side === 'timer') continue;
      for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
      const m = st.computer.move;
      assert(m && (m.id || m.gun), `seed ${seed}: a German move named no piece or gun`);
      assert(m.what, `seed ${seed}: ${m.id || m.gun} moved without saying what it did`);
      moves++;
      Sim.endComputerToken(st);
    }
  }
  assert(moves > 10, `only ${moves} German moves were checked`);
});

check('only a piece that has not moved this round can take cover', () => {
  const st = Sim.newGame(3);
  const B = Sim.unitById(st, 'B');
  B.acted = false; B.down = false; B.spentNext = false;
  assert(Sim.canReact(st, B), 'a piece that had not moved could not take cover');
  B.acted = true;
  assert(!Sim.canReact(st, B), 'a piece that had moved could still take cover');
});

check('nine places in a field: corners line both hedges; two pieces never share a place', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), mg = Sim.unitById(st, 'mg1');
  for (const u of st.units) if (u !== A && u !== mg && u.side === 'us') u.x = u.y = null;
  A.x = 0; A.y = 6; mg.x = 9; mg.y = 0;
  st.hedges['1,5|1,6'] = true; st.hedges['1,6|2,6'] = true;
  assert(Sim.actCharge(st, A, 1, 6, 'ne').ok && A.at === 'ne', 'it did not stand in the corner it was sent to');
  assert(Sim.atHedge(A, { x: 1, y: 5 }) && Sim.atHedge(A, { x: 2, y: 6 }), 'in the corner it did not line both hedges');
  // A team sent to the same place takes the nearest free one
  mg.x = 1; mg.y = 7; mg.acted = false;
  assert(Sim.actCharge(st, mg, 1, 6, 'ne').ok, 'the team could not join the platoon');
  assert(mg.at !== A.at, 'two pieces share a place');
  for (let seed = 1; seed <= 10; seed++) {
    const s2 = Sim.newGame(seed);
    for (const u of s2.units.filter(o => o.x !== null)) {
      assert(!s2.units.some(o => o !== u && o.x === u.x && o.y === u.y && o.at === u.at), `seed ${seed}: ${u.name} starts in the same place as another piece`);
    }
  }
});

check('the blind bag: a token for each piece, one piece a token, the round ends when it is empty', () => {
  const st = Sim.newGame(3);
  Sim.startRound(st);
  const us = st.units.filter(u => u.side === 'us' && u.x !== null).length, de = st.units.filter(u => u.side === 'de' && u.x !== null).length;
  // A token for every piece, and for each side's mortars and artillery while they have rounds
  const usGuns = ['mortars', 'artillery', 'bomber'].filter(w => st.ammo.us[w] > 0).length, deGuns = (st.ammo.de.mortars > 0) + (st.ammo.de.artillery > 0) + (st.ammo.de.bomber > 0);
  assert(st.bag.us === us + usGuns && st.bag.de === de + deGuns, `the bag holds ${st.bag.us}+${st.bag.de}, not ${us + usGuns}+${de + deGuns}`);
  const turn = st.turn;
  let draws = 0;
  for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
    draws++;
    if (side === 'de') {
      for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
      Sim.endComputerToken(st);
    } else {
      // Only one piece may move on a token
      const mine = st.units.filter(u => u.side === 'us' && Sim.canAct(st, u));
      const a = mine.find(u => Sim.chargeSpots(st, u).length);
      if (a) {
        const p = Sim.chargeSpots(st, a)[0];
        Sim.actCharge(st, a, p.x, p.y);
        assert(!st.units.some(u => u !== a && u.side === 'us' && Sim.canAct(st, u)), 'a second piece could move on the same token');
      }
      Sim.passToken(st);
    }
    if (draws > 60) break;
  }
  // (the timer is a token too)
  assert(draws <= us + de + usGuns + deGuns + ROUND_TIMER, `${draws} tokens drawn from a bag of ${us + de + usGuns + deGuns} and the timer`);
  Sim.endRound(st);
  assert(st.won || st.lost || st.turn === turn + 1, 'the round did not end');
});

check('out of rounds, a gun leaves the bag; any piece can skip its turn', () => {
  const st = Sim.newGame(3);
  st.ammo.us.mortars = 0;
  Sim.startRound(st);
  const pieces = st.units.filter(u => u.side === 'us' && u.x !== null).length;
  assert(st.bag.us === pieces + 2, 'the mortars with no rounds still had a token');
  // Draw until an American token, then skip with a piece: the token is used and the piece has given up its move
  for (let side = Sim.drawToken(st); side && side !== 'us'; side = Sim.drawToken(st)) {
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
    Sim.endComputerToken(st);
  }
  if (st.drawn === 'us') {
    const u = st.units.find(o => o.side === 'us' && Sim.canAct(st, o));
    assert(Sim.actSkip(st, u).ok && u.acted && Sim.activationOver(st), 'skipping a turn did not use the token');
  }
});

check('a shot label adds up: the 3+ start, then each reason on its own, to the score the dice need', () => {
  // The score a label's reasons add up to: the start, plus each − reason, less each + reason
  const labelSum = why => why.reduce((n, w) => {
    const m = /^([−+])(\d+) /.exec(w);
    if (!m) return n;
    return m[1] === '+' ? n + Number(m[2]) : n - Number(m[2]);
  }, TO_HIT);
  let checked = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const st = Sim.newGame(seed);
    // Some German pieces down in cover, so that reason shows up too
    st.units.filter(u => u.side === 'de').forEach((u, i) => { u.down = i % 3 === 0; });
    // The Germans brought six fields nearer, so plenty of them are in reach on the longer board
    for (const u of st.units) if (u.side === 'de' && u.x !== null) u.x = Math.max(0, u.x - 6);
    for (const u of st.units.filter(o => o.side === 'us' && o.x !== null)) {
      for (const t of Sim.targets(st, u)) {
        const why = Sim.needWhy(st, u, t);
        const need = Sim.needFor(st, u, t) + (Sim.isTank(t) ? PIECES[t.kind].armour : 0);
        if (!why.length) { assert(need === TO_HIT, `seed ${seed}: ${u.name} → ${t.name} needs ${need}+ with no reasons`); continue; }
        assert(why[0] === `${TO_HIT}+`, `seed ${seed}: the label does not start from ${TO_HIT}+: ${why.join(', ')}`);
        if (!PIECES[u.kind].sniper) assert(labelSum(why) === need, `seed ${seed}: ${u.name} → ${t.name} needs ${need}+ but the label says ${why.join(', ')}`);
        checked++;
      }
    }
  }
  assert(checked > 20, `only ${checked} labelled shots were checked`);
});

check('mortars land on the one field, artillery on it and the four next to it; men down in cover need +2', () => {
  const st = Sim.newGame(3);
  assert(Sim.shellFields('mortars', 4, 4).length === 1, 'mortars reached past the target field');
  const guns = Sim.shellFields('artillery', 4, 4);
  assert(guns.length === 5 && guns.filter(f => f.main).length === 1 && guns[0].x === 4 && guns[0].y === 4, 'artillery did not cover the field and the four next to it');
  assert(Sim.shellFields('artillery', 0, 0).length === 3, 'artillery in a corner reached off the board');
  const t = st.units.find(u => u.side === 'de' && u.x !== null && Sim.tileType(u.x, u.y) !== 'village');
  t.down = false;
  assert(Sim.shellNeed(st, t) === TO_HIT + SHELL_HARDER && !Sim.shellWhy(st, t).length, 'shells on men in the open needed more than the start');
  t.down = true;
  assert(Sim.shellNeed(st, t) === TO_HIT + SHELL_HARDER + TAKE_COVER && Sim.shellWhy(st, t).includes('+2 take cover'), 'shells ignored men down in cover');
});

check('tanks cannot take cover', () => {
  const st = Sim.newGame(3);
  assert(!Sim.canReact(st, Sim.unitById(st, 'T1')), 'a tank could take cover');
  assert(Sim.canReact(st, Sim.unitById(st, 'A')), 'a rifle platoon could not take cover');
});

check('leaving everything alone never wins', () => {
  for (let seed = 1; seed <= 30; seed++) assert(!play(seed, false).won, `seed ${seed} won by doing nothing`);
});


check('a small target (two men or fewer) needs one more; an MG team (three men) does not', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
  A.x = 2; A.y = 6; A.at = null; A.quality = 'standard'; A.shocked = false;
  de.x = 3; de.y = 6; de.at = null; de.down = false;
  const open = Sim.needFor(st, A, de);
  // The Panzerschreck team: two men
  de.kind = 'schreck';
  assert(Sim.needFor(st, A, de) === open + SMALL_TARGET, 'a two-man team was no harder to hit');
  assert(Sim.needWhy(st, A, de).includes(`+${SMALL_TARGET} small target`), 'the label did not say small target');
  // An MG 42 team: three men, not small
  de.kind = 'mg42';
  assert(Sim.needFor(st, A, de) === open, 'a three-man MG team counted as a small target');
  assert(Sim.smallTarget({ kind: 'sniper' }) && Sim.smallTarget({ kind: 'bazooka' }) && Sim.smallTarget({ kind: 'captain' }), 'the sniper, bazooka or captain is not a small target');
});

check('villages, hamlets and orchards: +2 or +1 for men, +1 a tank, +1 against shells, none inside the same one', () => {
  assert(PLACE_COVER.village.men === 2 && PLACE_COVER.hamlet.men === 2 && PLACE_COVER.orchard.men === 1, 'men in houses are not +2, in trees +1');
  for (const k of ['village', 'hamlet', 'orchard']) assert(PLACE_COVER[k].tank === 1 && PLACE_COVER[k].shells === 1, `${k}: a tank or shells are not +1`);
  const st0 = Sim.newGame(3);
  for (const u of st0.units) u.x = u.y = null;
  // Two enemies in the very same field: no cover from it; in the next field of the block: full cover (Steve)
  const inside = { x: 7, y: 3, side: 'us', kind: 'company' }, target = { x: 7, y: 4, side: 'de', kind: 'company' };
  const sameField = { x: 7, y: 4, side: 'us', kind: 'company' };
  assert(Sim.tileType(7, 3) === 'village' && Sim.cover(st0, inside, target) - (Sim.sight(st0, inside, target) || { cover: 0 }).cover === PLACE_COVER.village.men, 'a piece in the next field of the village lost its cover');
  assert(Sim.cover(st0, sameField, target) === 0, 'an enemy in the very same field still got cover from it');
  assert(Sim.shellNeed(st0, target) === TO_HIT + SHELL_HARDER + 1, 'shells on the village needed more than +1');
  const tank = { x: 7, y: 4, side: 'de', kind: 'pz4' };
  assert(Sim.cover(st0, null, tank) === 1, 'a tank in the village did not get +1');
});

check('houses are hard cover: two more to hit anyone in a village or hamlet', () => {
  const st = Sim.newGame(3);
  // Nobody else on the board (a tank beside it would give cover too)
  for (const u of st.units) u.x = u.y = null;
  const t = { x: 7, y: 4, side: 'de', kind: 'company' };
  assert(Sim.tileType(7, 4) === 'village' && Sim.cover(st, null, t) === 2, 'a piece in the village did not get +2');
});

check('taking cover no longer halves the dice: every die rolls, needing two more', () => {
  let rolled = 0, shots = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const mg = st.units.find(u => u.side === 'de' && u.kind === 'mg42'), A = Sim.unitById(st, 'A');
    for (const u of st.units) if (u !== mg && u !== A) u.x = u.y = null;
    mg.x = 3; mg.y = 6; mg.at = null; A.x = 2; A.y = 6; A.at = null; A.down = true;
    st.fx = [];
    Sim.fireAt(st, mg, A);
    rolled += st.fx[0].faces.length; shots++;
  }
  // Five dice every time
  const mean = rolled / shots;
  assert(mean === 5, `an MG at men taking cover rolled ${mean.toFixed(2)} dice on average, not 5`);
});

check('the game stops at once when one side has no pieces left, without finishing the round', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  Sim.startRound(st);
  const A = Sim.unitById(st, 'A');
  const last = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u.side === 'de' && u !== last) u.x = u.y = null;
  // One German left, with one section, already shaken: the next hit kills it
  last.x = 3; last.y = 6; last.at = null; last.platoons = 1; last.shocked = true;
  A.x = 2; A.y = 6; A.at = null;
  for (let k = 0; k < 20 && last.x !== null; k++) Sim.fireAt(st, A, last);
  assert(last.x === null, 'the last German was never hit');
  assert(st.won, 'wiping out the Germans did not end the game at once');
  assert(Sim.drawToken(st) === null, 'tokens were still drawn after the game was over');
  const turn = st.turn;
  Sim.endRound(st);
  assert(st.turn === turn, 'a new round started after the game was over');
});

check('the timer token: one in the bag; drawn, it ends the round there and then', () => {
  let timers = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed);
    Sim.startRound(st);
    assert(st.bag.timer === ROUND_TIMER, 'the bag has no timer token');
    for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
      if (side === 'timer') {
        timers++;
        assert(st.bag.us === 0 && st.bag.de === 0 && Sim.drawToken(st) === null, 'the timer did not empty the bag');
        break;
      }
      if (side === 'us') { Sim.passToken(st); continue; }
      for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
      Sim.endComputerToken(st);
    }
  }
  assert(timers > 5, `the timer came out only ${timers} times in 20 rounds`);
});

check('the captain has no Rally and does not hold the token with nobody to rally', () => {
  const st = Sim.newGame(3);
  Sim.startRound(st);
  const cap = Sim.unitById(st, 'cap');
  for (const u of st.units) { u.shocked = false; u.down = false; }
  assert(!Sim.captainCanRally(st, cap), 'the captain could rally with nobody shaken');
  // His token: once he has moved, with nobody to rally, it is over
  st.drawn = 'us'; st.activeId = null;
  Sim.actSkip(st, cap);
  assert(Sim.activationOver(st), 'the token waited for a rally nobody needed');
  // Himself shaken: he can rally himself
  const st2 = Sim.newGame(3);
  const cap2 = Sim.unitById(st2, 'cap');
  for (const u of st2.units) { u.shocked = false; u.down = false; }
  cap2.shocked = true;
  assert(Sim.captainCanRally(st2, cap2) && Sim.rallyTargets(st2, cap2).includes(cap2), 'the captain could not rally himself');
});

check('a tank stops facing the nearest enemy it can see, or the enemy side with none in sight', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const T1 = Sim.unitById(st, 'T1');
  const de = st.units.filter(u => u.side === 'de');
  for (const u of st.units) if (u !== T1) u.x = u.y = null;
  T1.x = 0; T1.y = 6; T1.at = null; T1.acted = false;
  // Nobody in sight: it faces east, towards the Germans' side
  const spot = Sim.chargeSpots(st, T1).find(p => p.x === 1 && p.y === 6);
  assert(Sim.actCharge(st, T1, spot.x, spot.y).ok && T1.aim === 0, 'with nobody in sight the tank did not face east');
  // A German straight south of it, two fields away in the open: it turns to face him
  const g = de.find(u => u.kind === 'company');
  g.x = 2; g.y = 7; g.at = null;
  T1.acted = false; st.drawn = null;
  const back = Sim.chargeSpots(st, T1).find(p => p.x === 1 && p.y === 7);
  assert(back && Sim.actCharge(st, T1, 1, 7).ok, 'the tank could not move');
  assert(Math.abs(T1.aim - 0) < 0.01, `the tank did not face the German beside it (aim ${T1.aim})`);
});

check('skip the shot after Move & shoot ends the token', () => {
  const st = Sim.newGame(3);
  const A = Sim.unitById(st, 'A');
  A.halfShot = true;
  assert(Sim.actSkipShot(st, A).ok && !A.halfShot, 'the shot could not be skipped');
});

check('hand to hand: blows in turn, attacker first, until one side is gone; the winner is no longer shaken', () => {
  let won = 0, lost = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
    // A standard platoon against the elite Fallschirmjäger, so it can go either way
    A.x = 2; A.y = 6; A.at = null; A.acted = false; A.shocked = true; A.quality = 'standard';
    de.x = 3; de.y = 6; de.at = null; de.shocked = true;
    // (both shaken going in: whoever wins comes out of it no longer shaken, Steve)
    const r = Sim.actCharge(st, A, 3, 6);
    assert(r.ok, `seed ${seed}: the charge was refused`);
    const aLeft = A.x !== null, dLeft = de.x !== null;
    assert(aLeft !== dLeft, `seed ${seed}: both sides (or neither) came out of the fight`);
    if (aLeft) { won++; assert(!A.shocked, `seed ${seed}: the attacker won and is still shaken`); }
    else { lost++; assert(!de.shocked, `seed ${seed}: the defenders won and are still shaken`); }
    if (aLeft) assert(A.x === 3 && A.y === 6, `seed ${seed}: the winner did not take the field`);
    assert(/hit/.test(r.lines[0]), `seed ${seed}: no blows reported`);
  }
  assert(won > 0 && lost > 0, `the attacker won ${won} and lost ${lost} of 40: one side always wins`);
});

check('hand to hand: a shaken piece needs one more to hit, attacking or defending (Steve)', () => {
  // Every die a 3: a hit at 3+, a miss at 4+. A standard platoon charges a standard one across open ground
  const fight = (attackerShaken, defenderShaken) => {
    const st = Sim.newGame(3);
    st.hedges = {}; st.wire = {};
    const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
    A.x = 2; A.y = 6; A.at = null; A.acted = false; A.quality = 'standard'; A.shocked = attackerShaken;
    de.x = 3; de.y = 6; de.at = null; de.quality = 'standard'; de.shocked = defenderShaken; de.platoons = 3;
    assert(Sim.tileType(3, 6) !== 'village' && Sim.tileType(3, 6) !== 'hamlet', 'the test needs open ground at 3,6');
    st.rand = () => 0.4;
    st.fx = [];
    Sim.actCharge(st, A, 3, 6);
    const f = st.fx.find(o => o.kind === 'melee');
    return f.strikes.map(b => b.faces.map(d => d.hit));
  };
  // Neither shaken: the attacker's first blow, three 3s, all hit
  assert(fight(false, false)[0].every(h => h), 'fresh, a 3 did not hit');
  // The attacker shaken: its 3s all miss
  assert(fight(true, false)[0].every(h => !h), 'a shaken attacker hit on a 3');
  // The defender shaken: the attacker's 3s hit as before; the defender's 3s, when it strikes back, all miss
  const back = fight(true, true);
  assert(back.length >= 2 && back[1].every(h => !h), 'a shaken defender hit on a 3');
});

check('villages and orchards: never seen through, but pieces in one see out and are seen wherever they stand', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== B && u !== de) u.x = u.y = null;
  // A German in the middle of the orchard at 9,0; 2nd Platoon three fields west in the open
  B.x = 6; B.y = 0; B.at = null;
  de.x = 9; de.y = 0; de.at = null;
  assert(Sim.tileType(9, 0) === 'orchard', 'the test needs an orchard at 9,0');
  assert(Sim.sight(st, B, de) && Sim.sight(st, de, B), 'a piece in the middle of an orchard could not see out or be seen');
  // In the village with 2nd Platoon at a hedge two fields away: they see each other (Steve)
  const v = { x: 7, y: 4 };
  assert(Sim.tileType(v.x, v.y) === 'village', 'the test needs the village at 7,4');
  de.x = v.x; de.y = v.y; de.at = null;
  B.x = 5; B.y = 4; B.at = 'e'; st.hedges['5,4|6,4'] = true;
  assert(Sim.sight(st, B, de) && Sim.sight(st, de, B), 'a piece at a hedge and a German in the village could not see each other');
  // Through a village: no (down its column, over two village fields)
  B.x = 7; B.y = 2; B.at = null; st.hedges = {};
  de.x = 7; de.y = 5; de.at = null;
  assert(Sim.tileType(7, 3) === 'village' && Sim.tileType(7, 4) === 'village' && !Sim.sight(st, B, de), 'a piece was seen through the village');
});

check('a shaken piece still moves and charges, half as far; it needs one more to hit', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== A) u.x = u.y = null;
  A.x = 0; A.y = 6; A.at = null; A.acted = false;
  const far = p => Math.abs(p.x - A.x) + Math.abs(p.y - A.y);
  const fresh = Math.max(...Sim.chargeSpots(st, A).map(far));
  A.shocked = true;
  const spots = Sim.chargeSpots(st, A);
  assert(spots.length > 0, 'a shaken piece could not charge');
  assert(Math.max(...spots.map(far)) === Math.max(1, Math.floor(fresh * SHAKEN_MOVE)), `a shaken piece charged ${Math.max(...spots.map(far))} fields, not half of ${fresh}`);
});

check('the shaken platoon in hand to hand: shaken does not stop it charging in', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
  A.x = 2; A.y = 6; A.at = null; A.acted = false; A.shocked = true;
  de.x = 3; de.y = 6; de.at = null;
  assert(Sim.chargeSpots(st, A).some(p => p.x === 3 && p.y === 6), 'a shaken platoon could not charge the Germans next to it');
});

check('hand to hand: every defender fights, moved or taking cover; the fight is recorded blow by blow for the table', () => {
  let struckBack = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
    A.x = 2; A.y = 6; A.at = null; A.acted = false;
    de.x = 3; de.y = 6; de.at = null; de.acted = true; de.down = true;
    st.fx = [];
    Sim.actCharge(st, A, 3, 6);
    const fight = st.fx.find(f => f.kind === 'melee');
    assert(fight && fight.strikes.length > 0, `seed ${seed}: no fight recorded`);
    assert(fight.strikes[0].side === 'us', `seed ${seed}: the attacker did not strike first`);
    assert(fight.before[de.id] === 3 && fight.before[A.id] === 3, `seed ${seed}: the bases at the start were not recorded`);
    const back = fight.strikes.find(b => b.side === 'de');
    if (back) { struckBack++; assert(back.strikers.includes(de.id), `seed ${seed}: the moved, down defender did not strike back`); }
    // Every hit took a base: the losses add up to what each side lost
    const lost = id => fight.strikes.reduce((n, b) => n + b.losses.filter(x => x === id).length, 0);
    assert(lost(de.id) === 3 - (de.x === null ? 0 : de.platoons) && lost(A.id) === 3 - (A.x === null ? 0 : A.platoons), `seed ${seed}: the blows don't add up to the bases lost`);
  }
  assert(struckBack > 10, `the defender struck back in only ${struckBack} of 30 fights`);
});

check('the timer is never the first token out of the bag', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const st = Sim.newGame(seed);
    Sim.startRound(st);
    assert(Sim.drawToken(st) !== 'timer', `seed ${seed}: the timer came out first`);
  }
});

check('the Germans have a captain who rallies their shaken pieces', () => {
  const st = Sim.newGame(3);
  const cap = st.units.find(u => u.side === 'de' && u.kind === 'captain');
  assert(cap && cap.x !== null, 'no German captain on the table');
  let rallied = 0;
  for (let k = 0; k < 20; k++) {
    const d = st.units.find(u => u.side === 'de' && u.kind === 'company' && u.x === cap.x && u.y === cap.y);
    d.shocked = true;
    st.computer = { queue: [cap.id], mortar: false, artillery: false, rep: [], ask: null, move: { id: cap.id, what: '' } };
    Sim.computerStep(st);
    assert(/rall/i.test(st.computer.move.what), `the captain did not try to rally (${st.computer.move.what})`);
    if (!d.shocked) rallied++;
    st.computer = null;
  }
  assert(rallied > 5, `the German captain rallied only ${rallied} of 20 times`);
});

check('German moves follow your rules: men climb hedges (the hedge stays) and never cross wire', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed);
    // No tanks on either side, so any hedge that goes was knocked down by men
    for (const u of st.units) if (Sim.isTank(u)) u.x = u.y = null;
    for (let h = 0; h < 5 && !st.won && !st.lost; h++) {
      const hedges = Object.keys(st.hedges).length, wire = Object.keys(st.wire).length;
      const men = st.units.filter(u => u.side === 'de' && u.x !== null && !Sim.isTank(u)).map(u => [u, u.x, u.y]);
      startGermanRound(st);
      for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
      Sim.finishRound(st);
      // Only tanks take hedges down (and flatten wire)
      assert(Object.keys(st.hedges).length === hedges, `seed ${seed}: German infantry knocked down a hedge`);
      // Men can't get through wire, so none of it goes either
      assert(Object.keys(st.wire).length === wire, `seed ${seed}: German infantry got through barbed wire`);
      assert(men.length > 0, `seed ${seed}: no German infantry`);
    }
  }
});

check('a rally always clears shaken (a tank too, the Germans too) and says so on the table', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed);
    const cap = Sim.unitById(st, 'cap'), T1 = Sim.unitById(st, 'T1');
    for (const u of st.units) { u.shocked = false; u.down = false; }
    T1.shocked = true; cap.x = T1.x; cap.y = T1.y === 0 ? 1 : T1.y - 1;
    st.fx = [];
    assert(Sim.actRally(st, cap, T1).ok, `seed ${seed}: the captain could not rally the tank pair`);
    const shown = st.fx.find(f => f.kind === 'rally' && f.to.id === T1.id);
    assert(shown, `seed ${seed}: the rally was not shown on the table`);
    assert(!T1.shocked && shown.ok && shown.result === 'Rallied!', `seed ${seed}: the rally did not work (${shown.result})`);
    // Rallying itself works every time too
    const B = Sim.unitById(st, 'B');
    B.shocked = true; B.acted = false;
    assert(Sim.actSelfRally(st, B).ok && !B.shocked, `seed ${seed}: the platoon did not rally itself`);
  }
});

check('shaken lasts through the end of the round, both sides: only a rally clears it', () => {
  const st = Sim.newGame(4);
  const B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  B.shocked = true; de.shocked = true;
  Sim.endRound(st);
  Sim.startRound(st);
  assert(B.shocked, 'your shaken platoon recovered at the end of the round');
  assert(de.shocked, 'the shaken German platoon recovered at the end of the round');
});

check('mortars and artillery never get more rounds, both sides', () => {
  const st = Sim.newGame(6);
  st.ammo.us.mortars = 0; st.ammo.us.artillery = 0; st.ammo.de.artillery = 0; st.ammo.de.mortars = 0;
  for (let k = 0; k < 6; k++) { Sim.endRound(st); Sim.startRound(st); }
  assert(st.ammo.us.mortars === 0 && st.ammo.us.artillery === 0, 'your guns got more rounds');
  assert(st.ammo.de.artillery === 0 && st.ammo.de.mortars === 0, 'the German guns got more rounds');
});

check('the timer has the same odds as every other token left in the bag (never the first)', () => {
  // Where it comes out, as a share of the bag, over many rounds: about as often in each half
  let early = 0, late = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const st = Sim.newGame(seed);
    Sim.startRound(st);
    const n = st.bag.us + st.bag.de;
    let k = 0, side;
    while ((side = Sim.drawToken(st)) && side !== 'timer') { k++; st.bag.us = Math.max(0, st.bag.us); st.drawn = null; }
    assert(k >= 1, `seed ${seed}: the timer came out first`);
    if (side === 'timer') { if (k <= n / 2) early++; else late++; }
  }
  assert(Math.abs(early - late) < 80, `the timer came out early ${early} times and late ${late}`);
});

check('tanks never fight hand to hand: a tank charging men makes them fall back, and takes the field', () => {
  let fell = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const T1 = Sim.unitById(st, 'T1'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (u !== T1 && u !== de) u.x = u.y = null;
    T1.x = 2; T1.y = 6; T1.at = null; T1.acted = false;
    de.x = 3; de.y = 6; de.at = null;
    const before = de.platoons;
    assert(Sim.chargeSpots(st, T1).some(p => p.x === 3 && p.y === 6), `seed ${seed}: the tank could not charge the men`);
    st.fx = [];
    Sim.actCharge(st, T1, 3, 6);
    assert(!st.fx.some(f => f.kind === 'melee'), `seed ${seed}: a tank fought hand to hand`);
    assert(T1.x === 3 && T1.y === 6, `seed ${seed}: the tank did not take the field`);
    assert(de.x === null || (de.x !== 3 || de.y !== 6), `seed ${seed}: the men stayed in the field`);
    if (de.x !== null) { fell++; assert(de.platoons === before, `seed ${seed}: falling back cost the men a section`); assert(de.x !== 2 || de.y !== 6, `seed ${seed}: the men fell back towards the tank`); }
  }
  assert(fell > 10, `the men fell back in only ${fell} of 20`);
});

// A German piece alone on an open board against one American, for the Move & shoot checks below
function moveShootBoard(seed, kind) {
  const st = Sim.newGame(seed);
  st.hedges = {}; st.wire = {};
  const u = st.units.find(o => o.side === 'de' && o.kind === kind), A = Sim.unitById(st, 'A');
  for (const o of st.units) if (o !== u && o !== A) o.x = o.y = null;
  st.ammo.de.mortars = st.ammo.de.artillery = st.ammo.de.bomber = 0;
  u.post = null; u.reserve = true; u.quality = 'standard'; u.x = 3; u.y = 0; u.at = null;
  // One field past rifle range where it stands, so a move puts it in range. The objective is far from both
  A.x = 3; A.y = 5; A.at = null; A.acted = true;
  st.objective = { x: 11, y: 7, name: 'Test' };
  return { st, u, A };
}
// Give one German piece its token and run it to the end, standing fast. Returns the first plan aimed
function germanToken(st, u, showAim = false) {
  startGermanRound(st);
  st.computer.queue = [u.id]; st.computer.mortar = st.computer.artillery = st.computer.bomber = false; st.computer.move = { id: u.id, what: '' };
  let aimed = null;
  for (let r = Sim.computerStep(st, showAim), n = 0; !r.done && n < 20; r = Sim.computerStep(st, showAim), n++) {
    if (r.aim && !aimed) aimed = r.aim;
    if (r.ask) { aimed = aimed || r.ask; Sim.answer(st, false); }
  }
  return aimed;
}

check('the Germans Move & shoot: with no shot from where they stand they move up and fire, needing one more', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { st, u } = moveShootBoard(seed, 'company');
    assert(!Sim.targets(st, u).length, `seed ${seed}: it had a shot before moving`);
    st.fx = [];
    const aimed = germanToken(st, u, true);
    assert(u.y > 0, `seed ${seed}: it did not move up`);
    assert(Math.abs(u.x - 3) + u.y <= MOVE_SHOOT_MOVES, `seed ${seed}: it moved further than a Move & shoot, to ${u.x},${u.y}`);
    assert(aimed && aimed.moving, `seed ${seed}: it did not fire on the move`);
    assert(st.fx.some(f => f.from && f.from.id === u.id), `seed ${seed}: no shot on the table`);
  }
});

check('a German shot after a move needs exactly one more than the same shot standing still', () => {
  const { st, u, A } = moveShootBoard(5, 'company');
  st.fx = [];
  germanToken(st, u);
  const shot = st.fx.find(f => f.from && f.from.id === u.id);
  assert(shot, 'it did not fire');
  assert(shot.need === Sim.needFor(st, u, A) + ON_THE_MOVE, `it needed ${shot.need}, standing still ${Sim.needFor(st, u, A)}`);
});

check('on the page a German Move & shoot is aimed first, showing the +1, and only then fired', () => {
  const { st, u, A } = moveShootBoard(5, 'company');
  startGermanRound(st);
  st.computer.queue = [u.id]; st.computer.mortar = st.computer.artillery = st.computer.bomber = false; st.computer.move = { id: u.id, what: '' };
  st.fx = [];
  const r = Sim.computerStep(st, true);
  assert(r.aim && r.aim.moving && r.aim.target === A.id, `not aimed: ${JSON.stringify(r)}`);
  assert(u.y > 0, 'it should have moved before aiming');
  assert(!st.fx.some(f => f.from && f.from.id === u.id), 'it fired before it aimed');
  assert(String(Sim.needWhy(st, u, A, true)).includes('moving'), 'the label does not say it is moving');
  assert(st.computer.move.what.includes(A.name), `the word bubble says "${st.computer.move.what}"`);
});

check("the Germans don't Move & shoot where you can't: machine guns and the PaK, or a shot that would be a Hail Mary", () => {
  for (const kind of ['mg42', 'pak']) {
    const { st, u } = moveShootBoard(5, kind);
    assert(!Sim.bestMoveShoot(st, u), `${kind} had a Move & shoot`);
  }
  // Every shot it could take after moving needs 7 or more: down in cover in a village, and a small target
  const { st, u, A } = moveShootBoard(5, 'company');
  A.kind = 'bazooka'; A.platoons = 1; A.down = true; A.x = 7; A.y = 4; A.at = null; u.x = 4; u.y = 4;
  const home = { x: u.x, y: u.y, at: u.at };
  const plan = Sim.bestMoveShoot(st, u);
  if (plan) {
    const end = plan.route[plan.route.length - 1];
    u.x = end.x; u.y = end.y; u.at = plan.place;
    assert(Sim.shotNeed(st, u, A, true) <= MAX_NEED, 'it planned a Hail Mary on the move');
    Object.assign(u, home);
  }
});

check('a German piece standing in the objective stays in it; anywhere else it goes to fire', () => {
  const { st, u } = moveShootBoard(5, 'company');
  assert(Sim.bestMoveShoot(st, u), 'it had no Move & shoot off the objective');
  st.objective = { x: u.x, y: u.y, name: 'Test' };
  assert(!Sim.bestMoveShoot(st, u), 'it would leave the objective');
  germanToken(st, u);
  assert(u.x === st.objective.x && u.y === st.objective.y, 'it left the objective');
});

check('a German piece with a shot from where it stands takes that, without moving', () => {
  const { st, u, A } = moveShootBoard(5, 'company');
  u.x = 3; u.y = 3;
  assert(Sim.targets(st, u).includes(A), 'no shot');
  st.fx = [];
  germanToken(st, u);
  assert(u.x === 3 && u.y === 3, 'it moved');
  const shot = st.fx.find(f => f.from && f.from.id === u.id);
  assert(shot && shot.need === Sim.needFor(st, u, A), 'it paid for moving');
});

check('an ambush on a German Move & shoot: it goes no further than it could', () => {
  let touched = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { st, u } = moveShootBoard(seed, 'company');
    const mg = Sim.unitById(st, 'mg1');
    mg.x = 3; mg.y = 3; mg.at = null; mg.ambush = true; mg.acted = true;
    const before = u.platoons;
    germanToken(st, u);
    if (u.x === null || u.shocked || u.platoons < before) touched++;
    if (u.x !== null) assert(Math.abs(u.x - 3) + u.y <= MOVE_SHOOT_MOVES, `seed ${seed}: went too far`);
  }
  assert(touched > 0, 'the ambush never touched it');
});

check('a German piece lining a hedge can fire from it, needing one more, as yours can', () => {
  const { st, u, A } = moveShootBoard(5, 'company');
  // A hedge between them, with neither lining it: no shot until it goes to the hedge
  u.x = 3; u.y = 5; u.at = 'n'; A.x = 3; A.y = 6; A.at = 's';
  st.hedges = { '3,5|3,6': true };
  assert(!Sim.targets(st, u).length, 'it could already see through the hedge');
  st.fx = [];
  const aimed = germanToken(st, u, true);
  assert(u.x === 3 && u.y === 5, 'it left its field');
  assert(aimed && aimed.moving, 'it lined the hedge but did not fire');
  const shot = st.fx.find(f => f.from && f.from.id === u.id);
  assert(shot && shot.need === Sim.needFor(st, u, A, true), 'it did not pay for moving');
});

check('in whole games the Germans fire on the move, and it never leaves pieces overlapping', () => {
  let moved = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed);
    for (let round = 0; round < 8 && !st.won && !st.lost; round++) {
      Sim.startRound(st);
      for (let side = Sim.drawToken(st); side && side !== 'timer'; side = Sim.drawToken(st)) {
        if (side === 'us') { Sim.passToken(st); continue; }
        for (let r = Sim.computerStep(st, true); !r.done; r = Sim.computerStep(st, true)) {
          if (r.aim && r.aim.moving) moved++;
          if (r.ask) Sim.answer(st, false);
        }
        Sim.endComputerToken(st);
      }
      for (const u of live(st)) assert(fieldOk(st, u.x, u.y), `seed ${seed}: pieces overlap at ${u.x},${u.y}`);
      Sim.endRound(st);
    }
  }
  assert(moved > 0, 'no German ever fired on the move');
});

check('ranges: bazookas and Panzerschrecks reach 4, tanks 7, machine guns and the PaK still 6', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  for (const u of st.units) u.at = null;
  const reach = (shooter, far) => {
    const t = Sim.unitById(st, 'd2');
    shooter.x = 0; shooter.y = 2; t.x = far; t.y = 2;
    return !!Sim.sight(st, shooter, t);
  };
  // Along the lane: nothing in the way
  const clear = (id, last) => {
    const u = Sim.unitById(st, id);
    for (const o of st.units) if (o !== u && o.id !== 'd2') o.x = o.y = null;
    assert(reach(u, last), `${id} does not reach ${last} fields`);
    assert(!reach(u, last + 1), `${id} reaches ${last + 1} fields`);
  };
  clear('bz1', 4); clear('T1', 7); clear('mg1', 6);
  const de = Sim.newGame(3);
  de.hedges = {}; de.wire = {};
  const sch = de.units.find(u => u.kind === 'schreck'), tar = Sim.unitById(de, 'A');
  for (const o of de.units) if (o !== sch && o !== tar) o.x = o.y = null;
  sch.at = tar.at = null; sch.x = 0; sch.y = 2; tar.x = 4; tar.y = 2;
  assert(Sim.sight(de, sch, tar), 'a Panzerschreck does not reach 4 fields');
  tar.x = 5;
  assert(!Sim.sight(de, sch, tar), 'a Panzerschreck reaches 5 fields');
});

check('artillery rolls 5 dice on the target field, both sides', () => {
  assert(ARTILLERY.dice === 5 && DE_ARTILLERY.dice === 5, 'artillery is not 5 dice');
  const st = Sim.newGame(3);
  const t = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const o of st.units) if (o !== t) o.x = o.y = null;
  t.x = 4; t.y = 3; t.at = null;
  st.fx = [];
  Sim.startRound(st);
  st.drawn = 'us'; st.activeId = null;
  const friend = st.units.find(u => u.id === 'A');
  friend.x = 4; friend.y = 2; friend.at = null;
  st.hedges = {}; st.wire = {};
  assert(Sim.actFire(st, 'artillery', 4, 3).ok, 'it did not fire');
  const shell = st.fx.find(f => f.kind === 'shell' && f.to && f.to.id === t.id && f.x === 4 && f.y === 3);
  assert(shell && shell.faces.length === 5, `it rolled ${shell && shell.faces.length} dice`);
});

// A mortar mission on one tank, either side. Returns what became of it
function mortarOnTank(seed, side, shaken) {
  const st = Sim.newGame(seed);
  st.hedges = {}; st.wire = {};
  const tank = st.units.find(u => u.side === (side === 'us' ? 'de' : 'us') && Sim.isTank(u));
  const spot = st.units.find(u => u.side === side && u.kind === 'company');
  const foe = st.units.find(u => u.side === tank.side && u.kind === 'company');
  for (const o of st.units) if (o !== tank && o !== spot && o !== foe) o.x = o.y = null;
  tank.x = 5; tank.y = 3; tank.at = null; tank.shocked = shaken; tank.down = false;
  // The spotter next to it; a piece of the tank's side elsewhere, so the game doesn't stop when it goes
  spot.x = 5; spot.y = 2; spot.at = null;
  foe.x = 0; foe.y = 7; foe.at = null; foe.acted = true;
  st.fx = [];
  if (side === 'us') {
    Sim.startRound(st);
    st.drawn = 'us'; st.activeId = null;
    assert(Sim.actFire(st, 'mortars', 5, 3).ok, 'your mortars would not fire on a tank');
  } else {
    startGermanRound(st);
    st.computer.queue = []; st.computer.artillery = false; st.computer.bomber = false; st.computer.mortar = true; st.computer.move = { gun: 'mortars', what: '' };
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) if (r.ask) Sim.answer(st, false);
  }
  const shell = st.fx.find(f => f.kind === 'shell' && f.to && f.to.id === tank.id);
  return { tank, shell };
}

check('a rifle platoon loses at most one section to one mortar or artillery mission, however many hits', () => {
  for (const which of ['mortars', 'artillery']) {
    const st = Sim.newGame(5);
    st.hedges = {}; st.wire = {};
    const spot = st.units.find(u => u.side === 'us' && u.kind === 'company');
    const foe = st.units.find(u => u.side === 'de' && u.kind === 'company');
    const other = st.units.find(u => u.side === 'de' && u !== foe);
    for (const o of st.units) if (![spot, foe, other].includes(o)) o.x = o.y = null;
    foe.x = 5; foe.y = 3; foe.at = null; foe.platoons = 3; foe.shocked = true; foe.down = false;
    spot.x = 5; spot.y = 2; spot.at = null;
    other.x = 11; other.y = 7; other.at = null;
    st.ammo.us[which] = 3;
    st.fx = [];
    Sim.startRound(st);
    st.drawn = 'us'; st.activeId = null;
    // Every die a 6: every die hits
    st.rand = () => 0.99;
    assert(Sim.actFire(st, which, 5, 3).ok, `the ${which} would not fire`);
    const hits = st.fx.filter(f => f.kind === 'shell' && f.to && f.to.id === foe.id).reduce((t, f) => t + f.faces.filter(d => d.hit).length, 0);
    assert(hits >= 2, `${which}: only ${hits} hits, not enough to check`);
    assert(foe.platoons === 2, `${which}: ${hits} hits on a shaken platoon took ${3 - foe.platoons} sections`);
  }
});

check('a mortar has one anti-tank die: a hit only shakes a tank, however many are tried, both sides', () => {
  for (const side of ['us', 'de']) {
    let shook = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { tank, shell } = mortarOnTank(seed, side, false);
      assert(shell && shell.faces.length === 1, `${side}: ${shell ? shell.faces.length : 'no'} dice on the tank`);
      const hit = shell.faces[0].hit;
      assert(tank.x !== null, `${side}, seed ${seed}: an unshaken tank was knocked out by a mortar`);
      assert(tank.shocked === hit, `${side}, seed ${seed}: hit ${hit} but shaken ${tank.shocked}`);
      if (hit) shook++;
    }
    assert(shook > 10, `${side}: only ${shook} of 60 shook it`);
  }
});

check('a mortar hit on a tank already shaken knocks it out, both sides', () => {
  for (const side of ['us', 'de']) {
    let killed = 0, missed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const { tank, shell } = mortarOnTank(seed, side, true);
      const hit = shell.faces[0].hit;
      assert((tank.x === null) === hit, `${side}, seed ${seed}: hit ${hit} but gone ${tank.x === null}`);
      if (hit) killed++; else missed++;
    }
    assert(killed > 10 && missed > 0, `${side}: killed ${killed}, missed ${missed}`);
  }
});

check('artillery on a tank can still knock it out with one hit, unlike a mortar', () => {
  let killed = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const tank = st.units.find(u => u.side === 'de' && Sim.isTank(u) && !PIECES[u.kind].armour), spot = Sim.unitById(st, 'A');
    const foe = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const o of st.units) if (o !== tank && o !== spot && o !== foe) o.x = o.y = null;
    tank.x = 5; tank.y = 3; tank.at = null;
    spot.x = 5; spot.y = 1; spot.at = null;
    foe.x = 11; foe.y = 7; foe.at = null;
    Sim.startRound(st);
    st.drawn = 'us'; st.activeId = null;
    assert(Sim.actFire(st, 'artillery', 5, 3).ok, 'it did not fire');
    if (tank.x === null) killed++;
  }
  assert(killed > 0, 'artillery never knocked out an unshaken tank');
});

check("the German mortar goes for a shaken tank first, a platoon next, an unshaken tank only if there's nothing else", () => {
  const st = Sim.newGame(3);
  const tank = Sim.unitById(st, 'T1'), A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const o of st.units) if (o !== tank && o !== A && o !== de) o.x = o.y = null;
  de.x = 5; de.y = 3; tank.x = 5; tank.y = 4; A.x = 5; A.y = 2;
  const firstShot = () => {
    startGermanRound(st);
    st.computer.queue = []; st.computer.artillery = false; st.computer.bomber = false; st.computer.mortar = true; st.computer.move = { gun: 'mortars', what: '' };
    const r = Sim.computerStep(st, true);
    return r.aim ? r.aim.target : null;
  };
  tank.shocked = false;
  assert(firstShot() === 'A', 'it did not go for the platoon');
  tank.shocked = true;
  assert(firstShot() === 'T1', 'it did not go for the shaken tank');
  tank.shocked = false; A.x = A.y = null;
  assert(firstShot() === 'T1', 'it ignored the tank with nothing else to fire on');
});

check('a knocked-out tank stays as a wreck: three squares in its corner, the middle free, so a full platoon still fits opposite', () => {
  const st = Sim.newGame(3);
  const tank = Sim.unitById(st, 'T1'), A = Sim.unitById(st, 'A');
  for (const o of st.units) if (o !== tank && o !== A) o.x = o.y = null;
  tank.x = 5; tank.y = 3; tank.at = 'nw'; A.x = 2; A.y = 3;
  Sim.remove(st, tank);
  assert(tank.x === null, 'the tank is still a piece on the table');
  const w = Sim.wreckAt(st, 5, 3);
  assert(w && w.corner === 'nw' && w.areas.slice().sort().join() === 'n,nw,w', `the wreck takes ${w && w.areas}`);
  assert(A.platoons === 3 && Sim.roomFor(st, A, 5, 3), 'no room for a full platoon');
  assert(Sim.fitsAt(st, A, 5, 3, 'se'), 'a full platoon does not fit at the opposite corner');
  for (const corner of ['nw', 'ne', 'sw', null]) assert(!Sim.fitsAt(st, A, 5, 3, corner), `a full platoon fits on the wreck at ${corner}`);
  assert(Sim.freePlace(st, A, 5, 3, 'nw') === 'se', 'the platoon was not sent to the opposite corner');
});

check('a tank knocked out in the objective never stops the village being taken', () => {
  for (const place of ['nw', 'ne', 'sw', 'se', null]) {
    const st = Sim.newGame(3);
    const tank = Sim.unitById(st, 'T1'), A = Sim.unitById(st, 'A');
    for (const o of st.units) if (o !== tank && o !== A) o.x = o.y = null;
    tank.x = st.objective.x; tank.y = st.objective.y; tank.at = place; A.x = 1; A.y = 1;
    Sim.remove(st, tank);
    assert(Sim.roomFor(st, A, st.objective.x, st.objective.y), `no room after a tank died at ${place}`);
    A.x = st.objective.x; A.y = st.objective.y; A.at = Sim.freePlace(st, A, A.x, A.y, 'nw');
    assert(Sim.holdsObjective(st), 'the full platoon does not hold the objective');
    assert(!Sim.footprint(A).some(k => Sim.wreckAt(st, A.x, A.y).areas.includes(k)), `the platoon stands on the wreck (tank died at ${place})`);
  }
});

check('a tank dying in the middle of a field rolls to a corner nobody stands in', () => {
  const st = Sim.newGame(3);
  const tank = Sim.unitById(st, 'T1'), team = st.units.find(u => u.side === 'us' && Sim.sizeOf(u) === 1);
  for (const o of st.units) if (o !== tank && o !== team) o.x = o.y = null;
  tank.x = 5; tank.y = 3; tank.at = null; team.x = 5; team.y = 3; team.at = 'nw';
  Sim.remove(st, tank);
  const w = Sim.wreckAt(st, 5, 3);
  assert(w && w.corner !== 'nw' && !w.areas.includes('nw'), `the wreck took ${w && w.areas}, where the team stands`);
});

check('a second wreck in a field clears the older one, so there is always room', () => {
  const st = Sim.newGame(3);
  const tanks = st.units.filter(Sim.isTank).slice(0, 2), A = Sim.unitById(st, 'A');
  for (const o of st.units) if (!tanks.includes(o) && o !== A) o.x = o.y = null;
  tanks[0].x = 5; tanks[0].y = 3; tanks[0].at = 'nw'; tanks[1].x = 7; tanks[1].y = 7; A.x = 1; A.y = 1;
  Sim.remove(st, tanks[0]);
  tanks[1].x = 5; tanks[1].y = 3; tanks[1].at = 'se';
  Sim.remove(st, tanks[1]);
  assert(st.wrecks.length === 1 && st.wrecks[0].id === tanks[1].id && st.wrecks[0].corner === 'se', 'the older wreck is still there');
  assert(Sim.roomFor(st, A, 5, 3) && Sim.fitsAt(st, A, 5, 3, 'nw'), 'no room for a full platoon');
});

check('a wreck blocks the view through its three squares; past its corner only from a piece touching that corner', () => {
  const st = Sim.newGame(3);
  st.wire = {}; st.hedges = {};
  const p = Sim.unitById(st, 'mg1'), q = st.units.find(u => u.side === 'de' && u.kind === 'mg42'), T = Sim.unitById(st, 'T1');
  for (const u of st.units) if (![p, q, T].includes(u)) u.x = u.y = null;
  // Straight across the field along its north row: clear until a tank dies there
  p.x = 8; p.y = 6; p.at = 'ne'; q.x = 10; q.y = 6; q.at = 'nw';
  T.x = 9; T.y = 6; T.at = 'nw';
  Sim.remove(st, T);
  assert(!Sim.sight(st, p, q), 'a line along the wreck was not blocked');
  // The south row of that field is not the wreck's, so that line is clear
  p.at = 'se'; q.at = 'sw';
  const clear = Sim.sight(st, p, q);
  assert(clear && clear.cover === 0, 'a line clear of the wreck was blocked or in cover');
  // A wreck in the north-east of (10,7): its squares are ne, n, e. Looking north-west along the 45° line to (9,6)
  st.wrecks = [];
  T.x = 10; T.y = 7; T.at = 'ne';
  Sim.remove(st, T);
  q.x = 9; q.y = 6; q.at = 'c';
  // From the middle, touching the corner of its north square: seen past it
  p.x = 10; p.y = 7; p.at = 'c';
  assert(Sim.sight(st, p, q), 'a piece touching the wreck did not see past its corner');
  // From the far corner, touching none of the corner it grazes: blocked
  p.at = 'se';
  assert(!Sim.sight(st, p, q), 'a piece not touching that corner saw past the wreck');
});

check('the table is drawn with no more pixels than the budget on a big screen, and as before on an ordinary one', () => {
  const drawn = (w, h, screen, budget = PIXELS.start) => w * h * Math.pow(pixelRatioFor(w, h, screen, budget), 2);
  // A 4K screen, whether at 100% or scaled to 150%: within the budget
  assert(Math.abs(drawn(3840, 2160, 1) - PIXELS.start) < 1, 'a 4K window at 100% is over the budget');
  assert(Math.abs(drawn(2560, 1440, 1.5) - PIXELS.start) < 1, 'a 4K window at 150% is over the budget');
  // An ordinary window keeps its sharpness
  assert(pixelRatioFor(1600, 950, 1, PIXELS.start) === 1, 'an ordinary window was drawn softer');
  assert(pixelRatioFor(1920, 1080, 1, PIXELS.start) === 1, 'a 1080p window was drawn softer');
  assert(pixelRatioFor(800, 600, 3, PIXELS.start) === 1.5, 'a small sharp screen went above 1.5');
  // At the floor it never asks for more than the floor
  assert(Math.abs(drawn(3840, 2160, 1, PIXELS.least) - PIXELS.least) < 1, 'the floor is not kept');
});

// ---------- Playing the Germans (Steve) ----------

// The table with the player as the Germans
function tableAsGermans(places, seed = 3) {
  const st = tableWith(places, seed);
  st.mode = 'de';
  st.human = 'de';
  st.players = { us: 'robot', de: 'human' };
  return st;
}
// A token of a given side, as the bag would give it (no guns left, so it goes to a piece)
function tokenFor(st, side) {
  st.ammo.us = { mortars: 0, artillery: 0, bomber: 0 };
  Sim.startRound(st);
  st.bag = { us: side === 'us' ? 9 : 0, de: side === 'de' ? 9 : 0, timer: 0 };
  assert(Sim.drawToken(st) === side, `no ${side} token`);
}
// Run the computer's token, answering each question; returns the questions asked
function runComputerToken(st, answer = false) {
  const asked = [];
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) { asked.push(r.ask); Sim.answer(st, answer); }
  Sim.endComputerToken(st);
  return asked;
}

check('a new game has the player as the Americans unless asked otherwise', () => {
  assert(Sim.newGame(5).human === 'us', 'not the Americans by default');
  assert(Sim.newGame(5, 'de').human === 'de', 'not the Germans when asked');
  assert(Sim.computerSide(Sim.newGame(5, 'de')) === 'us', 'the computer should play the Americans');
});

check('playing the Germans: only German pieces act, and only on a German token', () => {
  const st = Sim.newGame(5, 'de');
  const german = st.units.find(u => u.side === 'de' && u.kind === 'company');
  const american = st.units.find(u => u.side === 'us' && u.kind === 'company');
  Sim.startRound(st);
  st.drawn = 'de';
  assert(Sim.canAct(st, german), 'a German piece could not act on a German token');
  assert(!Sim.canAct(st, american), 'an American piece could act for the player');
  st.drawn = 'us';
  assert(!Sim.canAct(st, german), 'a German piece could act on an American token');
});

check('playing the Germans: killing every American piece wins, whatever guns and bomber they have left', () => {
  const st = tableAsGermans({ A: [3, 3], d1: [9, 3] });
  assert(st.ammo.us.mortars > 0 && st.ammo.us.artillery > 0 && st.ammo.us.bomber > 0, 'this needs American guns still to fire');
  Sim.remove(st, Sim.unitById(st, 'A'));
  assert(st.lost && !st.won && !st.draw, 'the Germans did not win with only guns left against them');
});

check('playing the Germans (Steve, 2026-11-27): nothing American left that can hurt your tank is a win, pieces left or not', () => {
  const st = tableAsGermans({ mg1: [1, 1], dt1: [9, 3] });
  st.ammo.us.mortars = st.ammo.us.artillery = st.ammo.us.bomber = 0;
  Sim.finishRound(st);
  assert(!st.won && st.lost, 'the game went on though nothing American could destroy the tank');
  // Playing the Americans the same table is a loss, as it always was
  const us = tableWith({ mg1: [1, 1], dt1: [9, 3] });
  us.ammo.us.mortars = us.ammo.us.artillery = us.ammo.us.bomber = 0;
  Sim.finishRound(us);
  assert(us.lost, 'the Americans should still lose here');
});

check('playing the Germans: you lose if an American platoon holds the village at the end of a round', () => {
  const start = Sim.newGame(5, 'de');
  const o = start.objective;
  const st = tableAsGermans({ A: [o.x, o.y], d2: [0, 0] }, 5);
  Sim.finishRound(st);
  assert(!st.won && st.holdUntil === st.turn, 'taking the village should only start the count');
  Sim.finishRound(st);
  assert(st.won && !st.lost, 'the Americans did not win by holding the village for a whole round');
});

check('playing the Germans: your guns use German rounds, one fire a round, on your token only', () => {
  const st = tableAsGermans({ A: [8, 3], d1: [9, 3] });
  const us = { ...st.ammo.us };
  Sim.startRound(st);
  st.drawn = 'us';
  assert(!Sim.canFire(st, 'artillery'), 'your guns could fire on the computer\'s token');
  st.drawn = 'de';
  const before = st.ammo.de.artillery;
  assert(Sim.canFire(st, 'artillery'), 'your guns could not fire on your token');
  const r = Sim.actFire(st, 'artillery', 8, 3);
  assert(r.ok, 'the German battery would not fire on an American in plain view');
  assert(st.ammo.de.artillery === before - 1, 'it did not use a German round');
  assert(st.ammo.us.artillery === us.artillery, 'it used an American round');
  assert(st.fired.de.artillery && !st.fired.us.artillery, 'it was marked on the wrong side');
  st.activeId = null;
  assert(!Sim.canFire(st, 'artillery'), 'it could fire twice in a round');
});

check('playing the Germans: your mortars drop on the one piece, three dice, as the computer\'s always have', () => {
  const st = tableAsGermans({ A: [8, 3], B: [8, 3], d1: [9, 3] });
  const A = Sim.unitById(st, 'A'), B = Sim.unitById(st, 'B');
  A.at = 'nw'; B.at = 'se';
  Sim.startRound(st);
  st.drawn = 'de';
  const before = st.ammo.de.mortars;
  const r = Sim.actFire(st, 'mortars', 8, 3, B);
  assert(r.ok, 'the mortars would not fire');
  assert(st.ammo.de.mortars === before - 1, 'it did not use a mortar round');
  const shells = st.fx.filter(f => f.kind === 'shell' && f.to);
  assert(shells.length === 1 && shells[0].to.id === 'B', 'it fell on more than the piece chosen');
  assert(shells[0].faces.length === DE_MORTAR.dice, 'it did not roll the German mortar\'s dice');
  assert(st.activeId === 'gun:mortars', 'it did not use the token');
});

check('the American computer: a piece fired on is yours to ask, and the shot uses its own weapons', () => {
  // An American platoon, far from the village, with a German platoon along the lane: its token fires, and you are asked first
  const st = tableAsGermans({ A: [1, 5], d2: [3, 5] });
  tokenFor(st, 'us');
  assert(st.computer && st.computer.move.id, 'it did not pick a piece');
  const asked = runComputerToken(st, true);
  const d2 = Sim.unitById(st, 'd2');
  assert(asked.length === 1 && asked[0].target === 'd2', 'you were not asked about your piece');
  assert(d2.down || d2.x === null, 'taking cover did not count');
});

check('the American computer: its shells ask nobody, and use American rounds', () => {
  // (along the lane, so the American platoon sees them)
  const st = tableAsGermans({ A: [0, 2], d1: [6, 2], d2: [6, 3] });
  Sim.startRound(st);
  st.drawn = 'us';
  st.fired.us = {};
  st.computer = { queue: [], mortar: false, artillery: true, bomber: false, rep: [], ask: null, move: { gun: 'artillery', what: '' } };
  const before = st.ammo.us.artillery, german = st.ammo.de.artillery;
  const asked = runComputerToken(st);
  assert(st.ammo.us.artillery === before - 1, 'it did not fire once');
  assert(st.ammo.de.artillery === german, 'it used a German round');
  assert(!asked.length, 'it asked your pieces to take cover from shells');
});

check('the American computer: a rifle platoon charges an empty village in reach; nothing else stops in it', () => {
  const home = Sim.newGame(5, 'de'), o = home.objective;
  const st = tableAsGermans({ A: [o.x - 1, o.y], d2: [0, 0] }, 5);
  tokenFor(st, 'us');
  runComputerToken(st);
  const A = Sim.unitById(st, 'A');
  assert(A.x === o.x && A.y === o.y, `the platoon went to ${A.x},${A.y}, not the village`);
  // A tank next to the village, with a German beyond it, doesn't park in the yard
  const tank = tableAsGermans({ T1: [o.x - 1, o.y], d2: [o.x + 3, o.y] }, 5);
  tokenFor(tank, 'us');
  runComputerToken(tank);
  const T1 = Sim.unitById(tank, 'T1');
  assert(T1.x !== o.x || T1.y !== o.y, 'the tank stopped in the village');
});

check('the American computer: it storms the village only when it outnumbers who is there', () => {
  const home = Sim.newGame(5, 'de'), o = home.objective;
  // Three sections against one MG team: in it goes
  const few = tableAsGermans({ A: [o.x - 1, o.y], dmg1: [o.x, o.y] }, 5);
  Sim.unitById(few, 'A').at = 'e'; Sim.unitById(few, 'dmg1').at = 'w';
  tokenFor(few, 'us');
  assert(few.computer.move.id === 'A', 'it did not pick the platoon');
  Sim.computerStep(few);
  assert(few.fx.some(f => f.kind === 'assault'), 'three sections did not storm one team');
  // One section against three: it doesn't
  const many = tableAsGermans({ A: [o.x - 1, o.y], d2: [o.x, o.y] }, 5);
  Sim.unitById(many, 'A').platoons = 1;
  tokenFor(many, 'us');
  Sim.computerStep(many);
  assert(!many.fx.some(f => f.kind === 'assault'), 'one section stormed three');
});

check('playing the Germans: doing nothing never wins, and the American computer takes the village inside 20 rounds', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = playAsGermans(seed, false);
    assert(!st.lost || st.draw, `seed ${seed}: the Germans won by doing nothing`);
    assert(st.won, `seed ${seed}: the American computer did not beat Germans doing nothing in 20 rounds`);
  }
});

check('playing the Germans: nothing goes negative, out of range or crowded in 40 games, with the same seed the same game', () => {
  const a = playAsGermans(7, true), b = playAsGermans(7, true);
  assert(JSON.stringify(a.units) === JSON.stringify(b.units) && a.turn === b.turn, 'two games with seed 7 ended differently');
  let germanWins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = playAsGermans(seed, true);
    if (st.lost && !st.draw) germanWins++;
    for (const u of live(st)) {
      assert(u.platoons > 0 && Sim.inside(u.x, u.y), `seed ${seed}: ${u.name} at ${u.x},${u.y} with ${u.platoons}`);
      assert(fieldOk(st, u.x, u.y), `seed ${seed}: too many units share ${u.x},${u.y}`);
    }
    for (const n of [st.ammo.us.mortars, st.ammo.us.artillery, st.ammo.us.bomber, st.ammo.de.mortars, st.ammo.de.artillery, st.ammo.de.bomber]) assert(n >= 0, `seed ${seed}: negative ammunition`);
    // A German win means no American left on the table, or (Steve, 2026-11-15) none left to take the goal and nothing
    // German that can hurt the rest
    if (st.lost && !st.draw) assert(!live(st).some(u => u.side === 'us') || /The attack has failed/.test(st.report.join(' ')), `seed ${seed}: a German win with Americans left`);
  }
  assert(germanWins > 0, 'the Germans can never win');
});

check('the PaK moves within its field, on its own move: it never leaves the field and can\'t fire after', () => {
  const st = tableAsGermans({ pak1: [9, 3], A: [0, 0] });
  const pak = Sim.unitById(st, 'pak1');
  pak.at = 'n+c';
  assert(!Sim.chargeSpots(st, pak).length && !Sim.moveShootSpots(st, pak).length, 'the PaK could leave its field');
  assert(Sim.lineSides(st, pak).length > 0, 'the PaK had nowhere to go in its field');
  Sim.startRound(st);
  st.drawn = 'de';
  const r = Sim.actLine(st, pak, 'se');
  assert(r.ok, 'the PaK would not move within its field');
  assert(pak.x === 9 && pak.y === 3, 'it left its field');
  assert(pak.at !== 'n+c' && pak.at.split('+').includes('se'), `it went to ${pak.at}`);
  assert(pak.acted && !pak.halfShot, 'it should have used its move, with no shot after');
  assert(!Sim.actShoot(st, pak, Sim.unitById(st, 'A')).ok, 'it fired after moving');
  // It keeps clear of whoever else is in the field
  const shared = tableAsGermans({ pak1: [9, 3], dmg1: [9, 3], A: [0, 0] });
  const gun = Sim.unitById(shared, 'pak1'), mg = Sim.unitById(shared, 'dmg1');
  gun.at = 'n+c'; mg.at = 'se';
  assert(!Sim.lineSides(shared, gun).some(p => p.split('+').includes('se')), 'it could stand on the machine gun');
});

check('the German computer\'s PaK moves within its field only when that gives it a shot', () => {
  // Over a hedge neither is touching: from a place in its field beside that hedge it can fire
  const st = tableWith({ pak1: [9, 7], A: [8, 7] });
  const pak = Sim.unitById(st, 'pak1'), A = Sim.unitById(st, 'A');
  st.hedges[Sim.edgeKey(8, 7, 9, 7)] = true;
  pak.at = 'ne+e'; A.at = null;
  assert(!Sim.targets(st, pak).length, 'this needs a PaK with no shot from where it stands');
  Sim.startRound(st);
  st.computer = { queue: [pak.id], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: pak.id, what: '' } };
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(pak.x === 9 && pak.y === 7, 'it left its field');
  assert(pak.at !== 'ne+e', 'it stayed where it had no shot');
  assert(Sim.targets(st, pak).includes(A), 'where it went gave it no shot');
  assert(!st.fx.some(f => f.from && f.from.id === pak.id), 'it fired after moving');
  assert(pak.ambush, 'it did not lie in ambush where it went');
  // A shot from where it stands: it stays and fires
  const open = tableWith({ pak1: [9, 7], A: [8, 7] });
  const gun = Sim.unitById(open, 'pak1');
  gun.at = 'w+c';
  Sim.startRound(open);
  open.computer = { queue: [gun.id], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: gun.id, what: '' } };
  const place = gun.at;
  for (let r = Sim.computerStep(open); !r.done; r = Sim.computerStep(open)) Sim.answer(open, false);
  assert(gun.at === place, 'it moved with a shot from where it stood');
});

check('the PaK can move within its field and lie in ambush on the same go, or not', () => {
  const setUp = () => {
    const st = tableAsGermans({ pak1: [9, 3], A: [0, 0], d2: [11, 0] });
    const pak = Sim.unitById(st, 'pak1');
    pak.at = 'n+c';
    Sim.startRound(st);
    st.drawn = 'de';
    assert(Sim.actLine(st, pak, 'se').ok, 'the PaK would not move');
    return { st, pak };
  };
  // Moved: the token stays open, with the ambush on offer and nothing else
  const { st, pak } = setUp();
  assert(pak.mayAmbush && !Sim.activationOver(st), 'the token ended before the ambush was offered');
  assert(Sim.canAmbush(st, pak) && Sim.actAmbush(st, pak).ok, 'it could not lie in ambush after moving');
  assert(pak.ambush && Sim.activationOver(st), 'the ambush did not end the token');
  // Not wanted: the token ends with no ambush
  const no = setUp();
  assert(Sim.actSkipShot(no.st, no.pak).ok && !no.pak.ambush && Sim.activationOver(no.st), 'turning it down did not end the token');
  assert(!Sim.canAmbush(no.st, no.pak), 'the offer stayed open');
  // The token passing takes the offer with it
  const passed = setUp();
  Sim.passToken(passed.st);
  assert(!passed.pak.mayAmbush, 'the offer outlived the token');
  // Not only the PaK now (Steve): a platoon moving within its field can fire or lie in ambush too
  const other = tableAsGermans({ d2: [9, 3], A: [0, 0] });
  const d2 = Sim.unitById(other, 'd2');
  d2.at = 'nw';
  Sim.startRound(other);
  other.drawn = 'de';
  assert(Sim.actLine(other, d2, 'se').ok && d2.mayAmbush && Sim.canAmbush(other, d2), 'a platoon moving within its field could not lie in ambush');
});

check('the PaK faces out of its square when it moves: eight ways, the way clicked', () => {
  const eighth = Math.PI / 4;
  const ways = { e: 0, ne: eighth, n: 2 * eighth, nw: 3 * eighth, w: 4 * eighth, sw: -3 * eighth, s: -2 * eighth, se: -eighth };
  // Wherever it starts, a click on any of the eight areas moves it and faces it that way
  for (const start of ['nw+w', 'n+c', 'c+e', 's+se']) {
    for (const area in ways) {
      const st = tableAsGermans({ pak1: [9, 3], A: [0, 0] });
      const pak = Sim.unitById(st, 'pak1');
      pak.at = start;
      Sim.startRound(st);
      st.drawn = 'de';
      assert(Sim.actLine(st, pak, area).ok, `from ${start}, a click on ${area} did nothing`);
      assert(pak.at !== start && pak.at.split('+').includes(area), `from ${start}, a click on ${area} went to ${pak.at}`);
      assert(Math.abs(pak.aim - ways[area]) < 1e-9, `from ${start}, a click on ${area} faced ${pak.aim}`);
    }
  }
  // The middle of the field: it faces the way it came from
  const cameFrom = { 'nw+n': 'nw', 'nw+w': 'nw', 'n+ne': 'ne', 'ne+e': 'ne', 'w+sw': 'sw', 'sw+s': 'sw', 's+se': 'se', 'e+se': 'se', 'n+c': 'n', 'w+c': 'w', 'c+e': 'e', 'c+s': 's' };
  for (const start in cameFrom) {
    const st = tableAsGermans({ pak1: [9, 3], A: [0, 0] });
    const pak = Sim.unitById(st, 'pak1');
    pak.at = start;
    Sim.startRound(st);
    st.drawn = 'de';
    assert(Sim.actLine(st, pak, null).ok && pak.at.split('+').includes('c') && pak.at !== start, `from ${start}, a click on the middle went to ${pak.at}`);
    assert(Math.abs(pak.aim - ways[cameFrom[start]]) < 1e-9, `from ${start}, in the middle it faced ${pak.aim}, not back ${cameFrom[start]}`);
  }
  // Other pieces keep the old way of moving within a field
  const d = tableAsGermans({ d2: [9, 3], A: [0, 0] });
  const d2 = Sim.unitById(d, 'd2');
  d2.at = 'nw';
  const aimBefore = d2.aim;
  Sim.startRound(d);
  d.drawn = 'de';
  Sim.actLine(d, d2, 'se');
  assert(d2.aim === aimBefore, 'a platoon was turned as the PaK is');
});

check('a captain in cover can\'t rally anyone, himself included, on either side, until it wears off', () => {
  for (const side of ['us', 'de']) {
    const capId = side === 'us' ? 'cap' : 'dcap', friendId = side === 'us' ? 'A' : 'd2';
    const st = side === 'us' ? tableWith({ cap: [3, 5], A: [4, 5], d2: [11, 0] }) : tableAsGermans({ dcap: [3, 5], d2: [4, 5], A: [0, 0] });
    const cap = Sim.unitById(st, capId), friend = Sim.unitById(st, friendId);
    friend.shocked = true;
    Sim.startRound(st);
    st.drawn = side;
    assert(Sim.captainCanRally(st, cap), `${side}: a captain out of cover could not rally`);
    // He takes cover, as Take cover does
    assert(Sim.canReact(st, cap), `${side}: he could not take cover`);
    cap.down = true; cap.acted = true; cap.shocked = true;
    assert(!Sim.canRally(st, cap) && !Sim.captainCanRally(st, cap), `${side}: he could still rally from cover`);
    assert(!Sim.actRally(st, cap, friend).ok, `${side}: he rallied a piece from cover`);
    assert(!Sim.actRally(st, cap, cap).ok, `${side}: he rallied himself from cover`);
    assert(friend.shocked && cap.down, `${side}: something changed`);
    // A new round: the cover has worn off, and he can again
    st.drawn = null;
    Sim.finishRound(st);
    Sim.startRound(st);
    st.drawn = side;
    assert(!cap.down && Sim.captainCanRally(st, cap), `${side}: he could not rally next round`);
    assert(Sim.actRally(st, cap, friend).ok && !friend.shocked, `${side}: his rally next round did not work`);
  }
  // Out of cover he can still get another piece up from its cover
  const st = tableWith({ cap: [3, 5], A: [4, 5] });
  const cap = Sim.unitById(st, 'cap'), A = Sim.unitById(st, 'A');
  A.down = true; A.acted = true;
  Sim.startRound(st);
  st.drawn = 'us';
  assert(Sim.actRally(st, cap, A).ok && !A.down, 'a captain out of cover could not get a piece up');
});

check('the computer\'s captain in cover rallies nobody', () => {
  const st = tableWith({ dcap: [9, 5], d2: [10, 5], A: [0, 0] });
  const cap = Sim.unitById(st, 'dcap'), d2 = Sim.unitById(st, 'd2');
  cap.down = true; d2.shocked = true;
  Sim.startRound(st);
  st.computer = { queue: [cap.id], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: cap.id, what: '' } };
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(d2.shocked, 'he rallied a piece from cover');
});

check('close range is four areas across or less, from the nearest areas of the two pieces', () => {
  // Along the lane: a platoon at the east edge of its field, the target at the west edge of the second field on
  const st = tableWith({ mg1: [3, 5], dmg1: [5, 5] });
  const a = Sim.unitById(st, 'mg1'), b = Sim.unitById(st, 'dmg1');
  // Four areas apart: opposite edges of the field between them
  a.at = 'e'; b.at = 'w';
  assert(Sim.atCloseRange(a, b), 'four areas across was not close');
  // Five areas apart
  a.at = null; b.at = 'w';
  assert(!Sim.atCloseRange(a, b), 'five areas across was close');
  // Next door, middle to middle: three areas
  const next = tableWith({ mg1: [3, 5], dmg1: [4, 5] });
  const c = Sim.unitById(next, 'mg1'), d = Sim.unitById(next, 'dmg1');
  c.at = null; d.at = null;
  assert(Sim.atCloseRange(c, d), 'the next field, middle to middle, was not close');
  // Next door, far edges: five areas
  c.at = 'w'; d.at = 'e';
  assert(!Sim.atCloseRange(c, d), 'far edges of the next field were close');
  // A straight line, not a count of steps: corners of diagonal fields just inside, and past it
  const diag = tableWith({ mg1: [3, 5], dmg1: [4, 6] });
  const e = Sim.unitById(diag, 'mg1'), f = Sim.unitById(diag, 'dmg1');
  e.at = null; f.at = null;
  assert(Math.hypot(1, 1) > 4 / 3 && !Sim.atCloseRange(e, f), 'middles of diagonal fields are 4.2 areas apart, not close');
  e.at = 'se'; f.at = 'nw';
  assert(Sim.atCloseRange(e, f), 'corners touching were not close');
});

check('close range takes one off the score every piece needs, says so on the label, and is never long range', () => {
  const st = tableWith({ A: [3, 5], B: [3, 3], mg1: [3, 7], d2: [4, 5] });
  const A = Sim.unitById(st, 'B'), t = Sim.unitById(st, 'd2');
  A.x = 3; A.y = 5; A.at = null; t.at = null;
  const close = Sim.needFor(st, A, t);
  assert(close === TO_HIT - CLOSE_BONUS, `a standard platoon at close range in the open needed ${close}`);
  assert(Sim.needWhy(st, A, t).some(w => w.includes('close range')), 'the label does not say close range');
  // Further off along the lane: no bonus, and no word of it
  t.x = 5; t.y = 5;
  assert(Sim.needFor(st, A, t) === TO_HIT, `at three fields it needed ${Sim.needFor(st, A, t)}`);
  assert(!Sim.needWhy(st, A, t).some(w => w.includes('close range')), 'the label says close range when it is not');
  // A bazooka two fields off, edge to edge: close, not long range as well
  const bz = tableWith({ bz1: [3, 5], dt1: [5, 5] });
  const baz = Sim.unitById(bz, 'bz1'), tank = Sim.unitById(bz, 'dt1');
  baz.at = 'e'; tank.at = 'nw';
  assert(Sim.atCloseRange(baz, tank), 'edge to edge across one field was not close');
  assert(!Sim.needWhy(bz, baz, tank).some(w => w.includes('long range')), 'close and long range at once');
  // The sniper gets it too
  const sn = tableWith({ sn1: [3, 5], d2: [4, 5] });
  const sniper = Sim.unitById(sn, 'sn1'), target = Sim.unitById(sn, 'd2');
  sniper.at = null; target.at = null;
  assert(Sim.needFor(sn, sniper, target) === TO_HIT - CLOSE_BONUS, 'the sniper had no close-range bonus');
});

check('close range does nothing for mortars, artillery or bombs', () => {
  const st = tableWith({ A: [3, 5], d2: [4, 5] });
  const t = Sim.unitById(st, 'd2');
  t.at = null;
  assert(Sim.shellNeed(st, t) === TO_HIT + SHELL_HARDER, 'shells got a close-range bonus');
  assert(Sim.bombNeed(st, t) === BOMBER.need, 'bombs got a close-range bonus');
  assert(!Sim.shellWhy(st, t).some(w => w.includes('close range')), 'the shell label says close range');
});

check('both captains: three dice at close range, and no shot at all beyond it', () => {
  for (const [capId, targetId] of [['cap', 'd2'], ['dcap', 'A']]) {
    const near = tableWith({ [capId]: [3, 5], [targetId]: [4, 5] });
    const cap = Sim.unitById(near, capId), t = Sim.unitById(near, targetId);
    cap.at = null; t.at = null;
    near.human = cap.side;
    assert(Sim.targets(near, cap).includes(t), `${capId} had no shot at close range`);
    near.fx = [];
    Sim.fireAt(near, cap, t);
    const shot = near.fx.find(f => f.from && f.from.id === capId);
    assert(shot && shot.faces.length === 3, `${capId} threw ${shot && shot.faces.length} dice at close range`);
    // Two fields off along the lane, in plain view: nothing
    const far = tableWith({ [capId]: [3, 5], [targetId]: [5, 5] });
    const cap2 = Sim.unitById(far, capId), t2 = Sim.unitById(far, targetId);
    cap2.at = null; t2.at = null;
    far.human = cap2.side;
    assert(!Sim.targets(far, cap2).includes(t2), `${capId} could shoot beyond close range`);
    Sim.startRound(far);
    far.drawn = cap2.side;
    assert(!Sim.actShoot(far, cap2, t2).ok, `${capId} fired beyond close range`);
    // A rifle platoon there can still fire
    const rifles = tableWith({ B: [3, 5], [targetId === 'd2' ? 'd5' : 'd2']: [5, 5] });
    const B = Sim.unitById(rifles, 'B');
    B.at = null;
    Sim.unitById(rifles, targetId === 'd2' ? 'd5' : 'd2').at = null;
    assert(Sim.targets(rifles, B).length === 1, 'a rifle platoon lost its reach');
  }
});

check('close-range hatching: only the areas of a Move & shoot field with a shot at close range', () => {
  const st = tableWith({ A: [3, 5], d2: [6, 5] });
  const A = Sim.unitById(st, 'A');
  // The field next to the target: its east areas are close, and so on
  const cells = Sim.shootCells(st, A, 5, 5), close = Sim.closeCells(st, A, 5, 5);
  assert(close.length > 0 && close.every(k => cells.includes(k)), `close ${close} is not within the fired-from cells ${cells}`);
  // Too far for close range from anywhere in the field
  const far = Sim.closeCells(st, A, 3, 5);
  assert(!far.length, `close-range cells three fields off: ${far}`);
  // It goes back where it was
  assert(A.x === 3 && A.y === 5, 'trying the cells moved it');
});

check('a 1 always misses: no shot needs less than 2+, and the label says why', () => {
  const st = tableWith({ A: [3, 5], d2: [4, 5] });
  const A = Sim.unitById(st, 'A'), t = Sim.unitById(st, 'd2');
  A.at = null; t.at = null;
  assert(A.quality === 'elite' && Sim.atCloseRange(A, t), 'this needs an elite platoon at close range');
  assert(Sim.needFor(st, A, t) === MIN_NEED, `it needed ${Sim.needFor(st, A, t)}`);
  assert(Sim.needWhy(st, A, t).join('|') === '3+|−1 elite|−1 close range|+1 a 1 always misses', `the label says ${Sim.needWhy(st, A, t)}`);
  // Every 1 thrown misses, over plenty of dice
  let ones = 0;
  for (let k = 0; k < 40; k++) {
    const shot = tableWith({ A: [3, 5], d2: [4, 5] }, k + 1);
    const a = Sim.unitById(shot, 'A'), b = Sim.unitById(shot, 'd2');
    a.at = null; b.at = null;
    Sim.fireAt(shot, a, b);
    for (const f of shot.fx) for (const d of f.faces || []) if (d.face === 1) { ones++; assert(!d.hit, 'a 1 hit'); }
  }
  assert(ones > 0, 'no 1 was thrown to try it');
  // Elite at close range with one thing against it adds up as before, and the words stay off the label
  t.down = true;
  assert(Sim.needFor(st, A, t) === 3 && !Sim.needWhy(st, A, t).some(w => w.includes('always misses')), 'taking cover did not add up as before');
  // Armour counts in the total: a Panther still needs 2+ in all, from an elite piece at close range
  const armour = tableWith({ A: [3, 5], dt2: [4, 5] });
  const shooter = Sim.unitById(armour, 'A'), panther = Sim.unitById(armour, 'dt2');
  shooter.at = null; panther.at = null;
  assert(Sim.shotNeed(armour, shooter, panther) === MIN_NEED, `a Panther at close range needed ${Sim.shotNeed(armour, shooter, panther)}`);
});

// ---------- Human or robot, each side (Steve): all four variations ----------

check('the four variations: who is a robot, from the choice', () => {
  const who = mode => { const st = Sim.newGame(5, mode); return [Sim.isRobot(st, 'us'), Sim.isRobot(st, 'de')].join(); };
  assert(who('us') === 'false,true', 'a human American should face a German robot');
  assert(who('de') === 'true,false', 'a human German should face an American robot');
  assert(who('both') === 'false,false', 'two humans');
  assert(who('none') === 'true,true', 'two robots');
});

check('two robots play whole games: nobody is asked, nothing goes wrong, and every game ends', () => {
  const a = playRobots(11), b = playRobots(11);
  assert(JSON.stringify(a.units) === JSON.stringify(b.units) && a.turn === b.turn, 'two games with seed 11 ended differently');
  for (let seed = 1; seed <= 25; seed++) {
    const st = playRobots(seed);
    assert(st.won || st.lost, `seed ${seed}: it did not end`);
    assert(st.turn <= ROBOT_ROUNDS, `seed ${seed}: it ran to round ${st.turn}`);
    for (const u of live(st)) {
      assert(u.platoons > 0 && Sim.inside(u.x, u.y), `seed ${seed}: ${u.name} at ${u.x},${u.y}`);
      assert(fieldOk(st, u.x, u.y), `seed ${seed}: too many units share ${u.x},${u.y}`);
    }
    for (const n of [st.ammo.us.mortars, st.ammo.us.artillery, st.ammo.us.bomber, st.ammo.de.mortars, st.ammo.de.artillery, st.ammo.de.bomber]) assert(n >= 0, `seed ${seed}: negative ammunition`);
  }
});

check('two robots: both sides really play, and neither can be commanded', () => {
  const st = Sim.newGame(4, 'none');
  const sides = new Set();
  Sim.startRound(st);
  for (let side = Sim.drawToken(st); side && side !== 'timer'; side = Sim.drawToken(st)) {
    sides.add(st.computer.side);
    assert(st.computer.side === side, 'the token and the computer disagree about whose move it is');
    assert(!st.units.some(u => Sim.canAct(st, u)), 'a person could command a robot\'s piece');
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) throw new Error('a robot was asked');
    Sim.endComputerToken(st);
  }
  assert(sides.size === 2, `only ${[...sides]} moved`);
});

check('two robots: too long a game is a draw', () => {
  const st = tableWith({ A: [0, 0], d2: [11, 0] });
  st.mode = 'none';
  st.players = { us: 'robot', de: 'robot' };
  st.turn = ROBOT_ROUNDS;
  Sim.finishRound(st);
  assert(st.draw && st.lost && !st.won, 'it did not end in a draw');
  // Not before
  const early = tableWith({ A: [0, 0], d2: [11, 0] });
  early.mode = 'none';
  early.players = { us: 'robot', de: 'robot' };
  early.turn = ROBOT_ROUNDS - 1;
  Sim.finishRound(early);
  assert(!early.draw && !early.lost && !early.won, 'it ended too soon');
});

check('two humans: each token is commanded by its own side, and the other side can\'t move on it', () => {
  const st = Sim.newGame(5, 'both');
  const american = st.units.find(u => u.side === 'us' && u.kind === 'company');
  const german = st.units.find(u => u.side === 'de' && u.kind === 'company');
  Sim.startRound(st);
  st.bag = { us: 1, de: 0, timer: 0 };
  assert(Sim.drawToken(st) === 'us' && st.human === 'us' && !st.computer, 'the American token was not the American player\'s');
  assert(Sim.canAct(st, american) && !Sim.canAct(st, german), 'the wrong side could act on the American token');
  Sim.passToken(st);
  st.bag = { us: 0, de: 1, timer: 0 };
  assert(Sim.drawToken(st) === 'de' && st.human === 'de' && !st.computer, 'the German token was not the German player\'s');
  assert(Sim.canAct(st, german) && !Sim.canAct(st, american), 'the wrong side could act on the German token');
  // Each uses its own guns
  assert(Sim.canFire(st, 'artillery'), 'the German player could not fire');
  Sim.passToken(st);
  st.bag = { us: 1, de: 0, timer: 0 };
  Sim.drawToken(st);
  assert(Sim.canFire(st, 'artillery'), 'the American player could not fire');
});

check('two humans: the other player is asked about a shot, never shells or bombs; a robot never is', () => {
  const both = Sim.newGame(5, 'both');
  both.wire = {}; both.hedges = {};
  for (const u of both.units) u.x = u.y = null;
  const place = (st, id, x, y) => { const u = Sim.unitById(st, id); u.x = x; u.y = y; u.at = null; u.acted = false; return u; };
  const A = place(both, 'A', 1, 5), d2 = place(both, 'd2', 3, 5), d5 = place(both, 'd5', 3, 4), dt1 = place(both, 'dt1', 4, 5);
  Sim.startRound(both);
  both.human = 'us';
  assert(Sim.piecesToAsk(both, 'shot', 3, 5, d2).join() === [d2].join(), 'the piece shot at was not asked');
  assert(!Sim.piecesToAsk(both, 'artillery', 3, 5, d2).length, 'a piece was asked about shells');
  // Already moved: it can't be asked
  d2.acted = true;
  assert(!Sim.piecesToAsk(both, 'shot', 3, 5, d2).length, 'a piece that had moved was asked');
  d2.acted = false;
  // Nor mortars, either side's
  both.human = 'de';
  const B = place(both, 'B', 3, 5);
  assert(!Sim.piecesToAsk(both, 'mortars', 3, 5, B).length, 'a piece was asked about German mortars');
  both.human = 'us';
  assert(!Sim.piecesToAsk(both, 'mortars', 3, 5, d2).length, 'a piece was asked about American mortars');
  // A robot decides for itself
  const one = Sim.newGame(5, 'us');
  const target = one.units.find(u => u.side === 'de' && u.kind === 'company');
  target.x = 3; target.y = 5;
  assert(!Sim.piecesToAsk(one, 'shot', 3, 5, target).length, 'a robot was asked');
});

check('two humans: taking cover counts in the dice, and the German wins once nothing American can hurt him', () => {
  const st = tableWith({ A: [1, 5], d2: [3, 5] });
  st.mode = 'both';
  st.players = { us: 'human', de: 'human' };
  const A = Sim.unitById(st, 'A'), d2 = Sim.unitById(st, 'd2');
  A.at = null; d2.at = null;
  Sim.startRound(st);
  st.drawn = 'us';
  const before = Sim.needFor(st, A, d2);
  Sim.takeCover(st, d2);
  assert(Sim.needFor(st, A, d2) === before + TAKE_COVER, 'taking cover did not add two');
  assert(Sim.actShoot(st, A, d2).ok, 'the shot did not go');
  // With two humans the shot doesn't make its own choice to take cover
  const again = tableWith({ A: [1, 5], d2: [3, 5] });
  again.mode = 'both';
  again.players = { us: 'human', de: 'human' };
  const shaken = Sim.unitById(again, 'd2');
  shaken.at = null; shaken.shocked = true;
  Sim.unitById(again, 'A').at = null;
  Sim.startRound(again);
  again.drawn = 'us';
  Sim.actShoot(again, Sim.unitById(again, 'A'), shaken);
  assert(!shaken.down, 'a human\'s piece took cover by itself');
  // No American platoon, nothing to hurt a tank: the attack has failed (Steve, 2026-11-27)
  const last = tableWith({ mg1: [1, 1], dt1: [9, 3] });
  last.mode = 'both';
  last.players = { us: 'human', de: 'human' };
  last.ammo.us = { mortars: 0, artillery: 0, bomber: 0 };
  Sim.finishRound(last);
  assert(!last.won && last.lost, 'the game went on though nothing American could destroy the tank');
});

check('moving within its own field, the shot after needs nothing more for moving (Steve); out of it, one more', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
  A.x = 2; A.y = 6; A.at = 'w'; A.acted = false; A.quality = 'standard';
  de.x = 4; de.y = 6; de.at = null;
  Sim.startRound(st); st.drawn = 'us'; st.activeId = null;
  // To the other side of its field: a shot after, and nothing more needed for moving
  assert(Sim.actLine(st, A, 'e').ok && A.halfShot, 'it could not shift in its field and fire');
  assert(!Sim.shotOnTheMove(A), 'a shift in its own field counted as on the move');
  const still = Sim.needFor(st, A, de, false) + Sim.armourOf(de);
  st.fx = [];
  assert(Sim.actHalfShot(st, A, de).ok, 'the shot after the shift was refused');
  const shot = st.fx.find(f => f.to && f.to.id === de.id && f.faces);
  assert(shot && shot.need === still, `the shot after a shift in its field needed ${shot && shot.need}, not ${still}`);
  // A Move & shoot to another field: on the move again
  const st2 = Sim.newGame(3);
  st2.hedges = {}; st2.wire = {};
  const B = Sim.unitById(st2, 'A'), d2 = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st2.units) if (u !== B && u !== d2) u.x = u.y = null;
  B.x = 1; B.y = 6; B.at = null; B.acted = false; B.stayedIn = true;
  d2.x = 4; d2.y = 6; d2.at = null;
  Sim.startRound(st2); st2.drawn = 'us'; st2.activeId = null;
  assert(Sim.actMoveShoot(st2, B, 2, 6).ok, 'the Move & shoot was refused');
  assert(Sim.shotOnTheMove(B), 'a Move & shoot to another field was not on the move');
});

check('the PaK in a village of two or four fields can move all round it; anywhere else it stays in its field', () => {
  // The four fields of the large village: x 7 and 8, y 3 and 4
  const st = tableAsGermans({ pak1: [8, 4], A: [0, 0] });
  const pak = Sim.unitById(st, 'pak1');
  pak.at = 'n+c';
  const spots = Sim.chargeSpots(st, pak).map(p => `${p.x},${p.y}`).sort();
  assert(spots.join(' ') === '7,3 7,4 8,3', `it could go to ${spots}`);
  assert(!Sim.moveShootSpots(st, pak).length, 'it could fire after moving');
  Sim.startRound(st);
  st.drawn = 'de';
  // Across the corner, straight there, facing the way clicked, its move used, and the ambush on offer
  assert(Sim.actCharge(st, pak, 7, 3, 'nw').ok, 'it would not go across the village');
  assert(pak.x === 7 && pak.y === 3 && pak.acted && pak.mayAmbush && !pak.halfShot, 'it did not arrive as it should');
  assert(pak.at.split('+').includes('nw') && Math.abs(pak.aim - 3 * Math.PI / 4) < 1e-9, `it stands at ${pak.at} facing ${pak.aim}`);
  assert(Sim.actAmbush(st, pak).ok && pak.ambush, 'it could not lie in ambush after going there');
  // To the middle of another field: it faces back the way it came
  const back = tableAsGermans({ pak1: [8, 4], A: [0, 0] });
  const gun = Sim.unitById(back, 'pak1');
  gun.at = 'n+c';
  Sim.startRound(back);
  back.drawn = 'de';
  assert(Sim.actCharge(back, gun, 7, 4, null).ok, 'it would not go next door');
  assert(Math.abs(gun.aim) < 1e-9, `going west to the middle it faced ${gun.aim}, not back east`);
  // Not into a field the enemy holds
  const held = tableAsGermans({ pak1: [8, 4], A: [7, 4], B: [0, 0] });
  const spot2 = Sim.chargeSpots(held, Sim.unitById(held, 'pak1')).map(p => `${p.x},${p.y}`);
  assert(!spot2.includes('7,4'), 'it could go into a field the Americans hold');
  // In the small village of two fields (7,1 and 8,1), across to the other one too (Steve)
  const small = tableAsGermans({ pak1: [8, 1], A: [0, 0] });
  const smallSpots = Sim.chargeSpots(small, Sim.unitById(small, 'pak1')).map(p => `${p.x},${p.y}`);
  assert(smallSpots.join(' ') === '7,1', `in the two-field village it could go to ${smallSpots}`);
  // Out in a field: it stays in its field
  const open = tableAsGermans({ pak1: [9, 4], A: [0, 0] });
  assert(!Sim.chargeSpots(open, Sim.unitById(open, 'pak1')).length, 'it could leave an open field');
});

check('the German computer\'s PaK goes across the large village when that is where a shot is', () => {
  // Along the lane above the village, in sight only from its top fields
  const st = tableWith({ pak1: [8, 4], A: [5, 2] });
  st.objective = { x: 7, y: 1, name: 'Test' };
  const pak = Sim.unitById(st, 'pak1'), A = Sim.unitById(st, 'A');
  pak.at = 's+c'; A.at = null;
  assert(!Sim.targets(st, pak).length, 'this needs no shot from where it stands');
  Sim.startRound(st);
  st.computer = { queue: [pak.id], mortar: false, artillery: false, bomber: false, rep: [], ask: null, move: { id: pak.id, what: '' } };
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(Sim.tileType(pak.x, pak.y) === 'village' && pak.x >= 7 && pak.x <= 8 && pak.y >= 3 && pak.y <= 4, `it left the village for ${pak.x},${pak.y}`);
  assert(Sim.targets(st, pak).includes(A), 'where it went gave it no shot');
  assert(pak.ambush, 'it did not lie in ambush there');
});

check('tanks, the PaK and gun bunkers fire with the bazooka\'s sound; the machine guns keep theirs', () => {
  const st = Sim.newGame(5);
  const piece = id => Sim.unitById(st, id);
  for (const id of ['T1', 'T2', 'dt1', 'dt2']) assert(Sim.fireSound(piece(id), 'gun', piece(id).side) === 'rocket', `${id} has the wrong sound`);
  assert(Sim.fireSound(piece('bz1'), 'rocket', 'us') === 'rocket', 'the bazooka changed');
  assert(Sim.fireSound(piece('pak1'), 'gun', 'de') === 'rocket', 'the PaK has the old cannon');
  const beach = Sim.newGame(5, 'us', 'beach');
  assert(Sim.fireSound(Sim.unitById(beach, 'bk3'), 'gun', 'de') === 'rocket', 'a gun bunker has the old cannon');
  Sim.newGame(5);
  assert(Sim.fireSound(piece('dmg1'), 'mg', 'de') === 'mg42', 'the MG 42 changed');
  assert(Sim.fireSound(piece('mg1'), 'mg', 'us') === 'mg', 'the .50 cal changed');
  assert(Sim.fireSound(piece('A'), 'rifle', 'us') === 'rifle', 'the rifles changed');
});

check('a gun that fired has its token in the next round\'s bag, on both sides alike', () => {
  for (const mode of ['us', 'de', 'none']) {
    for (const side of ['us', 'de']) {
      const st = Sim.newGame(9, mode);
      Sim.startRound(st);
      const full = st.bag[side];
      st.fired[side].artillery = true;
      st.ammo[side].artillery = 2;
      Sim.endRound(st);
      if (st.won || st.lost) continue;
      Sim.startRound(st);
      assert(!st.fired[side].artillery, `${mode}: ${side} artillery still marked as fired`);
      assert(st.bag[side] === full, `${mode}: ${side} has ${st.bag[side]} tokens after firing, not ${full}`);
    }
  }
});

// ---------- The maps (Steve) ----------

check('every map is the same size, has real tiles, and its villages are villages', () => {
  for (const map of MAPS) {
    const played = Sim.newGame(1, 'us', map.id).map;
    assert(played.rows.length === ROWS, `${map.id}: ${played.rows.length} rows`);
    for (const row of played.rows) {
      assert(row.length === COLS, `${map.id}: row "${row}"`);
      assert(/^[.ovhr#=|+sqktwb]+$/.test(row), `${map.id}: odd tile in "${row}"`);
    }
    assert(played.villages.length >= 1 && map.name && map.note, `${map.id}: not filled in`);
    // (Dunkirk's is the beach, where the Germans make for, not a village to take)
    // (Stalingrad's is the Univermag's open courtyard, Steve)
    // (the Winter War's is a spot on the road, Steve: the motti, nothing to take)
    if (!played.landing && !played.evacuate && !played.motti && played.generated !== 'paris') for (const v of played.villages) assert(Sim.tileType(v.x, v.y) === 'village' || Sim.inCourtyard(played, v.x, v.y), `${map.id}: ${v.name} is not in a village`);
  }
  // Ids are all different
  assert(new Set(MAPS.map(m => m.id)).size === MAPS.length, 'two maps with the same id');
  Sim.newGame(1);
});

check('every map: nobody starts in a river, every piece has its place, and all of the land can be walked', () => {
  for (const map of MAPS) {
    for (let seed = 1; seed <= 15; seed++) {
      const st = Sim.newGame(seed, 'us', map.id);
      for (const u of live(st)) {
        assert(Sim.tileType(u.x, u.y) !== 'river', `${map.id} seed ${seed}: ${u.name} in the river`);
        assert(fieldOk(st, u.x, u.y), `${map.id} seed ${seed}: too many in ${u.x},${u.y}`);
      }
      assert(new Set(st.units.map(u => u.id)).size === st.units.length, `${map.id}: two pieces with the same id`);
      // A rifle platoon each side at least, and each side has a captain
      for (const side of ['us', 'de']) {
        const mine = live(st).filter(u => u.side === side);
        // (Kursk is tanks only, Steve: no platoons, no captains)
        if (map.id === 'kursk') { assert(mine.length >= 4 && mine.every(u => Sim.isTank(u)), `${map.id}: ${side} short of tanks`); continue; }
        assert(mine.some(u => u.kind === 'company') && mine.some(u => u.kind === 'captain'), `${map.id}: ${side} short of pieces`);
      }
      // Every field that isn't river can reach the objective on foot
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (Sim.tileType(x, y) === 'river') continue;
        assert(Sim.walkDistance({ x, y }, st.objective) < Infinity, `${map.id}: ${x},${y} is cut off`);
      }
    }
  }
  Sim.newGame(1);
});

check('every map changes what it says it does: pieces, ammunition and hedges', () => {
  const pieces = id => Sim.newGame(1, 'us', id).units.map(u => u.id);
  const usual = pieces('hedges');
  assert(!pieces('river').includes('dt2') && pieces('river').includes('dmg5'), 'river crossing: the Germans not as it says');
  // The armoured cars (Steve): on the open maps only, each in place of a tank
  assert(!pieces('river').includes('T1') && !pieces('river').includes('dt1') && pieces('river').includes('AC1') && pieces('river').includes('dac1'), 'river crossing: the armoured cars not in place of a tank each');
  assert(!pieces('town').includes('T3') && pieces('town').includes('AC1') && pieces('town').includes('pak2') && !pieces('town').includes('dt1') && !pieces('town').includes('dt2') && pieces('town').includes('dac1'), 'crossroads town: not as it says');
  assert(!pieces('farmland').includes('T3') && !pieces('farmland').includes('dt3') && pieces('farmland').includes('AC1') && pieces('farmland').includes('dac1') && pieces('farmland').includes('D'), 'open farmland: not as it says');
  for (const id of ['hedges', 'deep', 'beach', 'station', 'paris']) assert(!pieces(id).includes('AC1') && !pieces(id).includes('dac1'), `${id}: an armoured car where there should be none`);
  assert(pieces('deep').includes('D') && !pieces('deep').includes('T2') && pieces('deep').includes('d6'), 'deep bocage: not as it says');
  assert(usual.length === US_START.length + DE_START.length, 'the usual map changed its pieces');
  // The bomber runs and guns as they say (see also: half the bomber runs)
  assert(Sim.newGame(1, 'us', 'river').ammo.us.bomber === 0 && Sim.newGame(1, 'us', 'river').ammo.de.bomber === 1, 'river crossing: bomber runs');
  assert(Sim.newGame(1, 'us', 'river').ammo.us.artillery === 2, 'river crossing: artillery rounds');
  const farm = Sim.newGame(1, 'us', 'farmland');
  assert(farm.ammo.us.bomber === 1 && farm.ammo.de.bomber === 0, 'open farmland: bomber runs');
  assert(Sim.newGame(1).ammo.us.bomber === 1 && Sim.newGame(1).ammo.de.bomber === 1, 'the usual map has one run each');
  // Hedges: far more in deep bocage than in open farmland, over a few games
  const hedges = id => { let n = 0; for (let s = 1; s <= 10; s++) n += Object.keys(Sim.newGame(s, 'us', id).hedges).length; return n; };
  assert(hedges('deep') > hedges('hedges') && hedges('hedges') > hedges('farmland'), 'hedges not as the maps say');
  Sim.newGame(1);
});

check('a bomber run is flown once, on a token; then the bomber is out of the game', () => {
  const st = Sim.newGame(3, 'us', 'hedges');
  Sim.startRound(st);
  st.drawn = 'us';
  assert(Sim.canFire(st, 'bomber') && Sim.actFire(st, 'bomber', 0, 0).ok && st.ammo.us.bomber === 0, 'the run did not fly');
  st.activeId = null;
  assert(!Sim.canFire(st, 'bomber'), 'it flew twice in a round');
  Sim.endRound(st);
  if (!st.won && !st.lost) { Sim.startRound(st); st.drawn = 'us'; assert(!Sim.canFire(st, 'bomber'), 'a second run'); }
  Sim.newGame(1);
});

check('the river: only the bridges cross it, and walking distance goes round by them', () => {
  const st = Sim.newGame(3, 'us', 'river');
  st.wire = {}; st.hedges = {};
  for (const u of st.units) if (u.id !== 'A') u.x = u.y = null;
  const A = Sim.unitById(st, 'A');
  A.x = 4; A.y = 3; A.at = null;
  assert(!Sim.chargeSpots(st, A).some(p => p.x === 5 && Sim.tileType(p.x, p.y) === 'river'), 'it could stand in the river');
  assert(!Sim.chargeSpots(st, A).some(p => p.x === 6 && p.y === 3), 'it could wade across');
  assert(Sim.walkDistance({ x: 4, y: 3 }, { x: 6, y: 3 }) === 4, `round by the bridge is ${Sim.walkDistance({ x: 4, y: 3 }, { x: 6, y: 3 })}, not 4`);
  // From beside the bridge it can cross
  A.x = 4; A.y = 2;
  assert(Sim.chargeSpots(st, A).some(p => p.x === 6 && p.y === 2), 'it could not cross the bridge');
  Sim.newGame(1);
});

check('every map: robots and the test players finish games, and doing nothing never wins', () => {
  for (const map of MAPS) {
    let robotsDone = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = playRobots(seed, map.id);
      if (r.won || r.lost) robotsDone++;
      for (const u of live(r)) assert(Sim.tileType(u.x, u.y) !== 'river', `${map.id}: ${u.name} ended in the river`);
      // (not at Dunkirk: the lorries and boats get the men away on their own, so a British side that never moves can
      // still win when the German robot is slow to the coast road)
      if (!map.evacuate) assert(!play(seed, false, 20, map.id).won, `${map.id} seed ${seed}: the Americans won by doing nothing`);
      const idle = playAsGermans(seed, false, 20, map.id);
      assert(!idle.lost || idle.draw, `${map.id} seed ${seed}: the Germans won by doing nothing`);
    }
    assert(robotsDone === 6, `${map.id}: robot games did not finish`);
  }
  Sim.newGame(1);
});

check('Paris: new streets each game, the same for the same seed, every street joined up, rows of buildings between streets and courtyards (Steve, 2026-11-13)', () => {
  const paris = MAPS.find(m => m.id === 'paris'), usual = paris.design;
  for (const design of Object.keys(PARIS_DESIGNS)) {
    paris.design = design;
    const boards = new Set();
    for (let seed = 1; seed <= 25; seed++) {
      const st = Sim.newGame(seed, 'us', 'paris');
      boards.add(st.map.rows.join());
      assert(Sim.newGame(seed, 'us', 'paris').map.rows.join() === st.map.rows.join(), `${design} seed ${seed}: not the same board twice`);
      const again = Sim.newGame(seed, 'us', 'paris');
      assert(/^[ksq]+$/.test(again.map.rows.join('')), `${design} seed ${seed}: something other than courtyards, streets and squares`);
      // Every street and square joined to every other, along the streets
      const paved = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (Sim.tileType(x, y) !== 'court') paved.push({ x, y });
      const reached = new Set([`${paved[0].x},${paved[0].y}`]), open = [paved[0]];
      while (open.length) {
        const p = open.pop();
        for (const q of paved) if (Sim.adjacent(p, q) && !reached.has(`${q.x},${q.y}`)) { reached.add(`${q.x},${q.y}`); open.push(q); }
      }
      assert(reached.size === paved.length, `${design} seed ${seed}: streets cut off`);
      // A row of buildings (a hedge) only between a courtyard and a street, and on every such edge but one or two gaps a
      // block (Steve: 1 or 2 per island of walls), never beside a café; no wire
      const isCourt = (x, y) => Sim.inside(x, y) && Sim.tileType(x, y) === 'court';
      const block = new Map();
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if (!isCourt(x, y) || block.has(x + ',' + y)) continue;
        const open = [[x, y]];
        block.set(x + ',' + y, x + ',' + y);
        while (open.length) {
          const [cx, cy] = open.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isCourt(cx + dx, cy + dy) && !block.has((cx + dx) + ',' + (cy + dy))) { block.set((cx + dx) + ',' + (cy + dy), x + ',' + y); open.push([cx + dx, cy + dy]); }
        }
      }
      const gaps = {}, rows = {};
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
        if (!Sim.inside(x + dx, y + dy)) continue;
        const between = isCourt(x, y) !== isCourt(x + dx, y + dy);
        const built = Sim.hedge(again, x, y, x + dx, y + dy);
        assert(!built || between, `${design} seed ${seed}: a row of buildings between ${x},${y} and ${x + dx},${y + dy}`);
        if (!between) continue;
        const id = block.get(isCourt(x, y) ? x + ',' + y : (x + dx) + ',' + (y + dy));
        rows[id] = (rows[id] || 0) + 1;
        if (!built) {
          gaps[id] = (gaps[id] || 0) + 1;
          const street = isCourt(x, y) ? [x + dx, y + dy] : [x, y];
          assert(!again.features.some(f => f.kind === 'cafe' && f.x === street[0] && f.y === street[1]), `${design} seed ${seed}: a gap beside a café`);
        }
      }
      for (const id in rows) assert((gaps[id] || 0) <= 2 && (gaps[id] || 0) >= Math.min(1, rows[id] - 1), `${design} seed ${seed}: block ${id} has ${gaps[id] || 0} gaps`);
      assert(!Object.keys(again.wire).length, `${design} seed ${seed}: wire in Paris`);
      // Boulevards run straight across the board
      for (const row of PARIS_DESIGNS[design].rows || []) assert(!/k/.test(again.map.rows[row]), `${design} seed ${seed}: row ${row} not a boulevard`);
      for (const col of PARIS_DESIGNS[design].cols || []) assert(again.map.rows.every(r => r[col] !== 'k'), `${design} seed ${seed}: column ${col} not a boulevard`);
    // The objective is always the Eiffel Tower, in the centre of the board, on open paving with streets to it, and not in a little square
      const o = again.objective;
      assert(o.name === 'Eiffel Tower' && o.x === 6 && o.y === 4 && Sim.tileType(o.x, o.y) === 'square', `${design} seed ${seed}: objective ${o.name} at ${o.x},${o.y}`);
      const here = Sim.featuresAt(again, o.x, o.y);
      assert(here.length === 1 && here[0].kind === 'eiffel', `${design} seed ${seed}: ${here.map(f => f.kind)} with the tower`);
      assert(again.map.villages.length === 1, `${design} seed ${seed}: more than one target`);
      // Every piece has a place
      for (const u of live(again)) assert(fieldOk(again, u.x, u.y), `${design} seed ${seed}: too many in ${u.x},${u.y}`);
    }
    assert(boards.size > 20, `${design}: only ${boards.size} different boards in 25 games`);
  }
  // The designs differ as they say: the old quarter has more courtyards than the grid
  const courts = design => { paris.design = design; let n = 0; for (let s = 1; s <= 20; s++) n += (Sim.newGame(s, 'us', 'paris').map.rows.join('').match(/k/g) || []).length; return n; };
  assert(courts('old') > courts('grid'), 'the old quarter is no tighter than the grid');
  paris.design = usual;
  Sim.newGame(1);
});

check('Paris: each little square has a café and a fountain, with room left for a platoon or a tank', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed, 'us', 'paris');
    const squares = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (Sim.tileType(x, y) === 'square' && !(x === st.objective.x && y === st.objective.y)) squares.push({ x, y });
    assert(squares.length === 3, `seed ${seed}: ${squares.length} squares`);
    for (const q of squares) {
      const here = Sim.featuresAt(st, q.x, q.y);
      const cafe = here.find(f => f.kind === 'cafe'), fountain = here.find(f => f.kind === 'fountain');
      assert(cafe && cafe.areas.length >= 2 && cafe.blocksView, `seed ${seed}: no café`);
      assert(fountain && fountain.areas.length === 1 && !fountain.blocksView, `seed ${seed}: no fountain`);
      assert(!fountain.areas.some(a => cafe.areas.includes(a)), `seed ${seed}: the fountain is in the café`);
      // Empty the square: a platoon fits, and a tank, unless the café is in the middle; smaller pieces always do
      const inMiddle = cafe.areas.includes('c');
      const platoon = st.units.find(u => u.kind === 'company'), tank = st.units.find(u => Sim.isTank(u));
      const team = st.units.find(u => u.kind === 'mg');
      for (const piece of [platoon, tank, team]) {
        const others = st.units.filter(u => u !== piece && u.x === q.x && u.y === q.y);
        const saved = others.map(u => [u.x, u.y]);
        others.forEach(u => { u.x = u.y = null; });
        const should = piece === team || !inMiddle;
        assert(Sim.roomFor(st, piece, q.x, q.y) === should, `seed ${seed}: room for ${piece.name} in a square with the café at ${cafe.areas}`);
        others.forEach((u, i) => { [u.x, u.y] = saved[i]; });
      }
    }
  }
  Sim.newGame(1);
});

check('a café or a barn blocks the view as a tank does, and nobody stands on it; a fountain or pond can be seen over', () => {
  // A row of three fields, a building along the north side of the middle one, the shooter and target lined up behind it
  const set = (kind, side, area) => {
    const st = tableWith({ B: [3, 5], d2: [5, 5] });
    const placed = side ? { n: ['nw', 'n', 'ne'], s: ['sw', 's', 'se'] }[side] : [area];
    st.features = [{ x: 4, y: 5, kind, side, area, areas: placed, blocksView: FEATURES[kind].blocksView, name: FEATURES[kind].name }];
    const a = Sim.unitById(st, 'B'), b = Sim.unitById(st, 'd2');
    return { st, a, b };
  };
  // Standing level with the north side of the fields: along the building, so blocked
  const c = set('cafe', 'n');
  c.a.at = 'n'; c.b.at = 'n';
  c.a.platoons = 1; c.b.platoons = 1;
  assert(!Sim.sight(c.st, c.a, c.b), 'a café did not block the view through it');
  // Level with the south side: clear of it
  c.a.at = 's'; c.b.at = 's';
  assert(Sim.sight(c.st, c.a, c.b), 'a café blocked a view clear of it');
  // A barn the same
  const barn = set('barn', 'n');
  barn.a.at = 'n'; barn.b.at = 'n'; barn.a.platoons = 1; barn.b.platoons = 1;
  assert(!Sim.sight(barn.st, barn.a, barn.b), 'a barn did not block the view');
  // A pond and a fountain can be seen over
  const pond = set('pond', 'n');
  pond.a.at = 'n'; pond.b.at = 'n'; pond.a.platoons = 1; pond.b.platoons = 1;
  assert(Sim.sight(pond.st, pond.a, pond.b), 'a pond blocked the view');
  // Nobody stands on any of them
  const taken = set('cafe', 'n');
  const small = Sim.unitById(taken.st, 'B');
  small.platoons = 1;
  for (const k of ['nw', 'n', 'ne']) assert(!Sim.fitsAt(taken.st, small, 4, 5, k), `a piece fits on the café at ${k}`);
  assert(Sim.fitsAt(taken.st, small, 4, 5, 's'), 'a piece does not fit beside the café');
  Sim.newGame(1);
});

check('Open farmland has its barns and duck pond, in fields with room round them; other maps have none', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const st = Sim.newGame(seed, 'us', 'farmland');
    assert(st.features.filter(f => f.kind === 'barn').length >= 3, 'not a few barns');
    assert(st.features.filter(f => f.kind === 'pond').length === 1, 'no duck pond');
    // (the railway runs right across, whatever the ground: its own check is with the train's)
    for (const f of st.features.filter(o => o.kind !== 'rail')) {
      assert(Sim.tileType(f.x, f.y) === 'field', `${f.name} is on a ${Sim.tileType(f.x, f.y)}`);
      const tank = st.units.find(u => Sim.isTank(u));
      const others = st.units.filter(u => u !== tank && u.x === f.x && u.y === f.y);
      const saved = others.map(u => [u.x, u.y]);
      others.forEach(u => { u.x = u.y = null; });
      assert(Sim.roomFor(st, tank, f.x, f.y) === !f.areas.includes('c'), `room for a tank beside the ${f.name} at ${f.areas}`);
      others.forEach((u, i) => { [u.x, u.y] = saved[i]; });
    }
    for (const u of live(st)) assert(fieldOk(st, u.x, u.y), `seed ${seed}: too many in ${u.x},${u.y}`);
  }
  assert(!Sim.newGame(1, 'us', 'hedges').features.length, 'the usual map has features');
  Sim.newGame(1);
});

check('a tank goes one field further if it starts, stays and ends on road or lane; nobody else does', () => {
  // Along the lane at y 5 on the usual map, with nothing in the way
  const lane = (id, x = 3, y = 5) => {
    const st = tableWith({ [id]: [x, y], d2: [11, 0] });
    return { st, u: Sim.unitById(st, id) };
  };
  const reaches = (spots, x, y) => spots.some(p => p.x === x && p.y === y);
  const { st, u } = lane('T1');
  assert(Sim.isRoad(3, 5) && Sim.isRoad(2, 5) && !Sim.isRoad(3, 6), 'the map is not as this expects');
  assert(reaches(Sim.chargeSpots(st, u), 7, 5), 'a tank on the lane did not charge four fields along it');
  assert(!reaches(Sim.chargeSpots(st, u), 8, 5), 'a tank on the lane charged five');
  // Three fields along and then off the road, three in all, as anyone: four to end off the road, no
  assert(reaches(Sim.chargeSpots(st, u), 5, 6), 'three fields, ending off the road, should be allowed');
  assert(!reaches(Sim.chargeSpots(st, u), 6, 6), 'four fields ending off the road');
  // Starting off the road: no more
  const off = lane('T1', 3, 6);
  assert(!reaches(Sim.chargeSpots(off.st, off.u), 7, 5), 'a tank starting off the road went further');
  assert(!reaches(Sim.chargeSpots(off.st, off.u), 7, 6), 'a tank starting off the road went four fields');
  // Lane and crossroads together: from the lane at y 5 round the corner up the lane at x 2
  const corner = lane('T1', 3, 5);
  assert(reaches(Sim.chargeSpots(corner.st, corner.u), 2, 2), 'a tank did not go along a mix of lane and crossroads');
  // Move & shoot: three, not two, with someone to fire at from there
  const ms = tableWith({ T1: [3, 5], d2: [7, 5] });
  const tank = Sim.unitById(ms, 'T1');
  ms.units.find(o => o.id === 'd2').at = null;
  const spots = Sim.moveShootSpots(ms, tank);
  assert(reaches(spots, 6, 5), 'a tank did not Move & shoot three fields along the lane');
  // Shaken: half as far, and no more
  const shaken = lane('T1');
  shaken.u.shocked = true;
  assert(!reaches(Sim.chargeSpots(shaken.st, shaken.u), 5, 5), 'a shaken tank went further than half');
  // Nobody else
  const men = lane('A');
  assert(!reaches(Sim.chargeSpots(men.st, men.u), 7, 5), 'a platoon went four fields along the lane');
  // Bridges and city streets count
  const river = Sim.newGame(3, 'us', 'river');
  assert(Sim.isRoad(5, 5) && Sim.tileType(5, 5) === 'bridge', 'a bridge is not road');
  const city = Sim.newGame(3, 'us', 'paris');
  let street = false, square = false;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (Sim.tileType(x, y) === 'street') street = Sim.isRoad(x, y);
    if (Sim.tileType(x, y) === 'square') square = Sim.isRoad(x, y);
  }
  assert(street && square, 'city streets and squares are not road');
  Sim.newGame(1);
});

check('cafés and barns come in different lengths and places, and a big piece gets past one in the middle', () => {
  // Over many games of Paris: the full length and shorter, never in the middle (Steve: never across the road)
  const seen = { long: 0, short: 0, middle: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    for (const f of Sim.newGame(seed, 'us', 'paris').features) {
      if (f.kind !== 'cafe') continue;
      if (f.areas.includes('c')) seen.middle++;
      else if (f.areas.length === 3) seen.long++;
      else seen.short++;
    }
  }
  assert(seen.long && seen.short && !seen.middle, `cafés: ${JSON.stringify(seen)}`);
  const farm = Sim.newGame(1, 'us', 'farmland').features.filter(f => f.kind === 'barn');
  assert(farm.some(f => f.areas.includes('c')) && farm.some(f => f.areas.length === 2 && !f.areas.includes('c')) && farm.some(f => f.areas.length === 3), 'the barns are not varied');
  // A big piece can't stop beside a building in the middle, but goes past it; a team can stop there
  const st = tableWith({ B: [2, 5], cap: [2, 5], d2: [11, 0] });
  st.features = [{ x: 3, y: 5, kind: 'cafe', areas: ['c', 'n'], blocksView: true, name: 'Café' }];
  const B = Sim.unitById(st, 'B'), cap = Sim.unitById(st, 'cap');
  B.at = null; cap.at = 'nw';
  const spots = Sim.chargeSpots(st, B);
  assert(!spots.some(p => p.x === 3 && p.y === 5), 'a platoon could stop in a field with a building in the middle');
  assert(spots.some(p => p.x === 4 && p.y === 5), 'a platoon could not go past a building in the middle');
  assert(Sim.chargeSpots(st, cap).some(p => p.x === 3 && p.y === 5), 'the captain could not stop beside it');
  // The garrison never starts in such a field
  for (let seed = 1; seed <= 40; seed++) {
    const city = Sim.newGame(seed, 'us', 'paris');
    for (const u of live(city)) assert(fieldOk(city, u.x, u.y), `seed ${seed}: too many in ${u.x},${u.y}`);
    for (const f of city.features) {
      if (!f.areas.includes('c')) continue;
      for (const u of Sim.at(city, f.x, f.y)) assert(Sim.sizeOf(u) === 1, `seed ${seed}: ${u.name} started beside a building in the middle`);
    }
  }
  Sim.newGame(1);
});

check('the scenery is only to look at: the same each time for a game, on the right ground, and it leaves the rules alone', () => {
  const kinds = new Set();
  for (const map of MAPS) {
    for (let seed = 1; seed <= 12; seed++) {
      const st = Sim.newGame(seed, 'us', map.id);
      const before = JSON.stringify([st.units, st.hedges, st.wire, st.features, st.rand()]);
      const again = Sim.newGame(seed, 'us', map.id);
      const items = Scenery.list(again);
      // It uses none of the game's dice, and changes nothing
      assert(JSON.stringify([again.units, again.hedges, again.wire, again.features, again.rand()]) === before, `${map.id} seed ${seed}: scenery changed the game`);
      assert(JSON.stringify(Scenery.list(again)) === JSON.stringify(items), `${map.id} seed ${seed}: different scenery the second time`);
      for (const item of items) {
        kinds.add(item.kind);
        const fx = Math.floor(item.x), fy = Math.floor(item.y);
        assert(Sim.inside(fx, fy), `${map.id}: ${item.kind} off the board at ${item.x},${item.y}`);
        const tile = Sim.tileType(fx, fy);
        const ground = { crater: 'beach', cow: 'field', sheep: 'field', lamp: 'street', posters: 'street', stall: 'square' }[item.kind];
        assert(tile === ground, `${map.id}: ${item.kind} on a ${tile}`);
        // Animals stay out of fields with a barn or a pond, and things that could be in a piece's way say which field
        if (item.kind === 'cow' || item.kind === 'sheep') assert(!Sim.featuresAt(again, fx, fy).length, `${map.id}: animals in a field with a building or a pond`);
        if (['cow', 'sheep', 'stall'].includes(item.kind)) assert(item.field && item.field.x === fx && item.field.y === fy, `${map.id}: ${item.kind} has no field`);
        // A stall keeps clear of the café and the fountain
        if (item.kind === 'stall') {
          const near = Sim.featuresAt(again, fx, fy).flatMap(f => f.areas);
          const dx = item.x - fx < 0.5 ? 'w' : 'e', dy = item.y - fy < 0.5 ? 'n' : 's';
          assert(!near.includes(dy + dx), `${map.id}: a stall on the ${dy + dx} of a square, in the way of what is there`);
        }
      }
    }
  }
  for (const k of ['crater', 'cow', 'sheep', 'lamp', 'posters', 'stall']) assert(kinds.has(k), `no ${k} anywhere`);
  assert(!kinds.has('parachute'), 'a parachute is back');
  Sim.newGame(1);
});

check('the train station: houses and tracks; many trucks and a few other things, all blocking the view, new each game', () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed, 'us', 'station');
    assert(/^[vt]+$/.test(st.map.rows.join('')), 'something other than houses and tracks');
    assert(!Object.keys(st.hedges).length && !Object.keys(st.wire).length, 'hedges or wire in the yard');
    const ON_RAILS = ['engine', 'carriage', 'wagon'];
    const trucks = st.features.filter(f => ON_RAILS.includes(f.kind));
    const others = st.features.filter(f => !ON_RAILS.includes(f.kind));
    // (fewer since three lines across the yard are kept clear for the trains, Steve)
    assert(trucks.length >= 12, `seed ${seed}: only ${trucks.length} on the rails`);
    // One or two engines, the full length of a field; mostly carriages and goods wagons
    const engines = trucks.filter(f => f.kind === 'engine');
    assert(engines.length === 1 || engines.length === 2, `seed ${seed}: ${engines.length} engines`);
    assert(engines.every(f => f.areas.length === 3), `seed ${seed}: a short engine`);
    assert(trucks.some(f => f.kind === 'carriage') && trucks.some(f => f.kind === 'wagon'), `seed ${seed}: no carriages or no wagons`);
    assert(others.length >= 2, `seed ${seed}: only ${others.length} other things`);
    assert(st.map.joins.length >= 5, `seed ${seed}: only ${st.map.joins.length} joins`);
    for (const f of st.features) {
      assert(f.blocksView === (f.kind !== 'signal' && f.kind !== 'rail'), `${f.name}: blocks the view is ${f.blocksView}`);
      assert(Sim.tileType(f.x, f.y) === 'yard', `${f.name} is not on the tracks`);
      assert(!f.areas.includes('c'), `${f.name} takes the middle`);
      // Room left for a big piece
      const tank = st.units.find(u => Sim.isTank(u));
      const there = st.units.filter(u => u !== tank && u.x === f.x && u.y === f.y);
      const saved = there.map(u => [u.x, u.y]);
      there.forEach(u => { u.x = u.y = null; });
      assert(Sim.roomFor(st, tank, f.x, f.y), `no room for a tank beside the ${f.name}`);
      there.forEach((u, i) => { [u.x, u.y] = saved[i]; });
    }
    for (const u of live(st)) assert(fieldOk(st, u.x, u.y), `seed ${seed}: too many in ${u.x},${u.y}`);
    layouts.add(JSON.stringify(st.features));
    // The same seed, the same yard
    assert(JSON.stringify(Sim.newGame(seed, 'us', 'station').features) === JSON.stringify(st.features), 'not the same yard twice');
  }
  assert(layouts.size === 30, 'the yard did not change from game to game');
  const kinds = new Set();
  for (let seed = 1; seed <= 30; seed++) for (const f of Sim.newGame(seed, 'us', 'station').features) kinds.add(f.kind);
  for (const k of ['engine', 'carriage', 'wagon', 'signalbox', 'signal', 'watertower', 'coal']) assert(kinds.has(k), `no ${k} anywhere`);
  const loads = new Set();
  for (let seed = 1; seed <= 30; seed++) for (const f of Sim.newGame(seed, 'us', 'station').features) if (f.kind === 'wagon') loads.add(f.load);
  for (const l of ['van', 'coal', 'wheat', 'timber', 'tank']) assert(loads.has(l), `no wagon of ${l}`);
  Sim.newGame(1);
});

check('railway tracks change nothing: as open ground for moving and for the view, and not a road for a tank', () => {
  let st = Sim.newGame(3, 'us', 'station');
  st.features = [];
  for (const u of st.units) if (u.id !== 'T1' && u.id !== 'B' && u.id !== 'd2') u.x = u.y = null;
  const T1 = Sim.unitById(st, 'T1'), B = Sim.unitById(st, 'B'), d2 = Sim.unitById(st, 'd2');
  d2.x = 11; d2.y = 0; d2.at = null;
  T1.x = 1; T1.y = 7; T1.at = null; T1.shocked = false;
  assert(!Sim.isRoad(1, 7), 'tracks count as a road');
  const reach = Sim.chargeSpots(st, T1);
  assert(reach.some(p => p.x === 4 && p.y === 7), 'a tank could not go three fields over the tracks');
  assert(!reach.some(p => p.x === 5 && p.y === 7), 'a tank went further on the tracks');
  // Men the same, and across them there is nothing in the way
  B.x = 1; B.y = 5; B.at = null;
  assert(Sim.chargeSpots(st, B).some(p => p.x === 4 && p.y === 5), 'men could not go three fields over the tracks');
  d2.x = 4; d2.y = 5; d2.at = null;
  assert(Sim.sight(st, B, d2), 'tracks blocked the view');
  // A signal in the way doesn't block it, though nobody can stand on it
  const signal = Sim.newGame(5, 'us', 'station');
  signal.features = [{ x: 3, y: 5, kind: 'signal', area: 'c', areas: ['c'], blocksView: FEATURES.signal.blocksView, name: 'Signal' }];
  for (const u of signal.units) if (u.id !== 'B' && u.id !== 'd2') u.x = u.y = null;
  const b2 = Sim.unitById(signal, 'B'), d3 = Sim.unitById(signal, 'd2');
  b2.x = 2; b2.y = 5; b2.at = 'e'; b2.platoons = 1;
  d3.x = 4; d3.y = 5; d3.at = 'w'; d3.platoons = 1;
  assert(Sim.sight(signal, b2, d3), 'a signal blocked the view');
  assert(!Sim.fitsAt(signal, b2, 3, 5, 'c'), 'a piece could stand on a signal');
  Sim.newGame(3, 'us', 'station');
  // A truck between them does block it
  st.features = [{ x: 3, y: 5, kind: 'wagon', areas: ['w', 'c', 'e'], blocksView: true, name: 'Railway truck' }];
  B.at = 'e'; d2.at = 'w'; B.platoons = 1; d2.platoons = 1;
  assert(!Sim.sight(st, B, d2), 'a truck did not block the view');
  Sim.newGame(1);
});

// ---------- The beach landing (Steve) ----------

check('the beach: Americans start in the sea and can only leave it; Germans are few, with bunkers and no tanks', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const st = Sim.newGame(seed, 'us', 'beach');
    const us = live(st).filter(u => u.side === 'us'), de = live(st).filter(u => u.side === 'de');
    assert(us.every(u => Sim.tileType(u.x, u.y) === 'sea'), `seed ${seed}: an American not in the sea`);
    assert(!de.some(u => Sim.isTank(u)), `seed ${seed}: a German tank`);
    assert(de.filter(u => Sim.isBunker(u)).length === 5, `seed ${seed}: not five bunkers`);
    assert(de.some(u => u.kind === 'company') && de.some(u => u.kind === 'mg42'), `seed ${seed}: no loose infantry or MGs`);
    assert(de.length < DE_START.length && us.length > de.length - 2, `seed ${seed}: the Germans are not fewer: ${de.length}`);
    assert(st.ammo.de.artillery > DE_ARTILLERY.ammo, 'the Germans have no extra artillery');
    for (const u of us.concat(de)) assert(fieldOk(st, u.x, u.y), `seed ${seed}: too many in ${u.x},${u.y}`);
    // The main bunker is the objective
    const main = Sim.unitById(st, 'bk1');
    assert(main.x === st.objective.x && main.y === st.objective.y && st.objective.name === 'Main bunker', 'the main bunker is not the objective');
    // Into the sea, nobody: forward onto the sand, yes
    const a = us.find(u => u.kind === 'company');
    const spots = Sim.chargeSpots(st, a);
    assert(spots.length && !spots.some(p => Sim.tileType(p.x, p.y) === 'sea'), `seed ${seed}: a platoon could go back to sea`);
    assert(spots.some(p => Sim.tileType(p.x, p.y) === 'beach'), `seed ${seed}: a platoon could not reach the sand`);
  }
  Sim.newGame(1);
});

check('tank traps stop tanks and give no cover (Steve); the lanes off the beach are always clear', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const st = Sim.newGame(seed, 'us', 'beach');
    for (const f of st.features) if (f.kind === 'tanktrap') assert(![2, 5].includes(f.y) && Sim.tileType(f.x, f.y) === 'beach', `seed ${seed}: a trap across a lane, or off the sand`);
  }
  const st = tableWith({ T1: [1, 3], B: [1, 4], d2: [11, 0] });
  st.features = [{ x: 2, y: 3, kind: 'tanktrap', areas: ['ne', 'sw'], blocksView: false, name: 'Tank traps' }];
  const T1 = Sim.unitById(st, 'T1'), B = Sim.unitById(st, 'B');
  T1.at = null; B.at = null;
  assert(!Sim.chargeSpots(st, T1).some(p => p.x === 2 && p.y === 3), 'a tank went into tank traps');
  assert(Sim.chargeSpots(st, B).some(p => p.x === 2 && p.y === 3), 'men could not go among tank traps');
  // No cover among them (Steve)
  B.x = 2; B.y = 3; B.at = null;
  assert(Sim.cover(st, null, B) === 0, 'men among tank traps had cover');
  Sim.newGame(1);
});

check('the craters on the beach never overlap (Steve)', () => {
  let craters = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed, 'us', 'beach');
    const holes = Scenery.list(st).filter(o => o.kind === 'crater');
    craters += holes.length;
    for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
      const d = Math.hypot(holes[i].x - holes[j].x, holes[i].y - holes[j].y);
      assert(d >= 0.42, `seed ${seed}: two craters ${d.toFixed(2)} apart`);
    }
  }
  assert(craters > 20 * 10, `only ${craters} craters in 20 beaches`);
  Sim.newGame(1);
});

check('a burnt-out landing craft: cover like a hedge for a piece right beside it, in its field or the next; none past its corner', () => {
  const st = tableWith({ mg1: [2, 3], d2: [11, 0] });
  // A wreck along the north row of field 2,3
  st.features = [{ x: 2, y: 3, kind: 'hulk', side: 'n', areas: ['nw', 'n', 'ne'], blocksView: true, name: 'Burnt-out wreck' }];
  // (a one-area piece, the machine-gun team)
  const B = Sim.unitById(st, 'mg1');
  // In the middle row, right beside it: +1, and the label says wreck
  B.at = 'w';
  assert(Sim.cover(st, null, B) === COVER.hedge, `right beside the wreck it had ${Sim.cover(st, null, B)} cover`);
  assert(Sim.wrecksBeside(st, 2, 3, ['w']).length === 1, 'the wreck beside it was not found');
  // In the bottom row, an area away from it: nothing
  B.at = 's';
  assert(Sim.cover(st, null, B) === 0, 'an area away from the wreck had cover');
  // In the field to the north, against the wreck from the other side: +1
  B.y = 2; B.at = 's';
  assert(Sim.cover(st, null, B) === COVER.hedge, 'beside the wreck from the next field had no cover');
  // No cover against shells
  B.y = 3; B.at = 'c';
  assert(Sim.shellNeed(st, B) === TO_HIT + SHELL_HARDER, 'the wreck gave cover against shells');
  Sim.newGame(1);
});

check('a bunker: never moves, fires only out of its front', () => {
  const st = Sim.newGame(5, 'de', 'beach');
  for (const u of st.units) if (!['bk3', 'A', 'B'].includes(u.id)) u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  const bunker = Sim.unitById(st, 'bk3'), A = Sim.unitById(st, 'A'), B = Sim.unitById(st, 'B');
  bunker.x = 5; bunker.y = 5; bunker.at = 'nw+w';
  // On the lane in front, and behind
  A.x = 3; A.y = 5; A.at = null;
  B.x = 7; B.y = 5; B.at = null;
  assert(Sim.targets(st, bunker).includes(A), 'it could not fire out of its front');
  assert(!Sim.targets(st, bunker).includes(B), 'it fired out of its back');
  // Off to one side, more than 45°
  B.x = 5; B.y = 3;
  assert(!Sim.targets(st, bunker).includes(B), 'it fired out of its side');
  Sim.startRound(st);
  st.drawn = 'de';
  assert(!Sim.chargeSpots(st, bunker).length && !Sim.moveShootSpots(st, bunker).length, 'a bunker could move');
  assert(!Sim.lineSides(st, bunker).length && !Sim.actLine(st, bunker, 'se').ok, 'a bunker could shift in its field');
  Sim.newGame(1);
});

check('a bunker: +3 from the front, none from the back; rifles only shake it; anti-tank weapons can kill it', () => {
  const setUp = (shooterId, x, y) => {
    const st = Sim.newGame(5, 'us', 'beach');
    st.hedges = {}; st.wire = {};
    for (const u of st.units) if (![shooterId, 'bk3'].includes(u.id)) u.x = u.y = null;
    const b = Sim.unitById(st, 'bk3'), s = Sim.unitById(st, shooterId);
    b.x = 5; b.y = 5; b.at = 'nw+w';
    s.x = x; s.y = y; s.at = null;
    return { st, b, s };
  };
  const front = setUp('B', 3, 5), back = setUp('B', 7, 5);
  assert(Sim.needFor(front.st, front.s, front.b) === Sim.needFor(back.st, back.s, back.b) + BUNKER_FRONT, 'the front is not +3');
  assert(Sim.needWhy(front.st, front.s, front.b).some(w => w.includes('bunker front')), 'the label does not say bunker front');
  // Rifles, however many hits: only shaken
  const rifles = setUp('B', 7, 5);
  rifles.st.rand = () => 0.99;
  for (let k = 0; k < 5; k++) Sim.fireAt(rifles.st, rifles.s, rifles.b);
  assert(rifles.b.x !== null && rifles.b.shocked, 'rifles did not just shake a bunker');
  // A bazooka from behind: shaken, then dead, leaving its shell
  const baz = setUp('bz1', 7, 5);
  baz.st.rand = () => 0.99;
  for (let k = 0; k < 4 && baz.b.x !== null; k++) Sim.fireAt(baz.st, baz.s, baz.b);
  assert(baz.b.x === null, 'a bazooka could not kill a bunker');
  assert(baz.st.wrecks.some(w => w.id === 'bk3'), 'it left no shell');
  // Shells: mortars only shake it, artillery can kill it; +3 either way
  const shell = setUp('B', 0, 0);
  shell.b.shocked = true;
  assert(Sim.shellNeed(shell.st, shell.b) === TO_HIT + SHELL_HARDER + BUNKER_FRONT, 'shells do not need +3');
  Sim.newGame(1);
});

check('a bunker: stormed from the side or back, never the front; it blocks the view; on the beach taking its field never wins', () => {
  const setUp = (x, y) => {
    const st = Sim.newGame(5, 'us', 'beach');
    st.hedges = {}; st.wire = {};
    for (const u of st.units) if (!['B', 'bk1'].includes(u.id)) u.x = u.y = null;
    st.features = [];
    const b = Sim.unitById(st, 'bk1'), s = Sim.unitById(st, 'B');
    s.x = x; s.y = y; s.at = null;
    return { st, b, s };
  };
  const o = Sim.newGame(5, 'us', 'beach').objective;
  const reaches = (st, s) => Sim.chargeSpots(st, s).some(p => p.x === o.x && p.y === o.y);
  // (shaken, it only goes one field: with a full charge it could go round to the side)
  const front = setUp(o.x - 1, o.y);
  front.s.shocked = true;
  assert(!reaches(front.st, front.s), 'a platoon charged a bunker from in front');
  const side = setUp(o.x, o.y - 1);
  assert(reaches(side.st, side.s), 'a platoon could not storm a bunker from the side');
  const back = setUp(o.x + 1, o.y);
  assert(reaches(back.st, back.s), 'a platoon could not storm a bunker from the back');
  // It blocks the view
  const look = Sim.newGame(5, 'us', 'beach');
  look.hedges = {}; look.wire = {}; look.features = [];
  for (const u of look.units) if (!['B', 'd2', 'bk4'].includes(u.id)) u.x = u.y = null;
  const eye = Sim.unitById(look, 'B'), far = Sim.unitById(look, 'd2'), mid = Sim.unitById(look, 'bk4');
  mid.x = 4; mid.y = 5; mid.at = 'n+c';
  eye.x = 3; eye.y = 5; eye.at = 'n'; eye.platoons = 1;
  far.x = 5; far.y = 5; far.at = 'n'; far.platoons = 1;
  assert(!Sim.sight(look, eye, far), 'a bunker did not block the view');
  // No goal on the beach (Steve): standing in the main bunker's field, the bunker gone, a German elsewhere, wins nothing
  // however long it is held, and there is no label for it
  const taken = setUp(o.x, o.y);
  Sim.unitById(taken.st, 'dcap').x = 11; Sim.unitById(taken.st, 'dcap').y = 7;
  Sim.remove(taken.st, taken.b);
  assert(taken.st.noGoal && !Sim.holdsObjective(taken.st), 'the beach has a goal to hold');
  Sim.finishRound(taken.st);
  Sim.finishRound(taken.st);
  assert(!taken.st.won && !taken.st.holdUntil, `holding the main bunker's field won the beach`);
  // Every German gone: that wins
  for (const u of taken.st.units) if (u.side === 'de' && u.x !== null) Sim.remove(taken.st, u);
  assert(taken.st.won, 'destroying every German did not win the beach');
  // The other maps still have their goal
  assert(!Sim.newGame(5, 'us', 'hedges').noGoal, 'Hedge country lost its goal');
  Sim.newGame(1);
});

check('the campaign has every map once, from the beach to Paris, each with a date and a picture', () => {
  // (the bonus battles are outside it)
  const campaignMaps = MAPS.filter(m => !m.bonus);
  assert(CAMPAIGN.length === campaignMaps.length && new Set(CAMPAIGN).size === campaignMaps.length, 'not every map once');
  for (const m of campaignMaps) {
    assert(CAMPAIGN.includes(m.id), `${m.id} is not in the campaign`);
    assert(/1944$/.test(m.date), `${m.id} has no date`);
    assert(fs.existsSync(path.join(__dirname, '..', 'assets', 'maps', m.id + '.jpg')), `${m.id} has no picture`);
  }
  assert(CAMPAIGN[0] === 'beach' && CAMPAIGN[CAMPAIGN.length - 1] === 'paris', 'it does not run from the beach to Paris');
  const at = id => CAMPAIGN.indexOf(id);
  assert(at('deep') < at('farmland') && at('hedges') < at('farmland') && at('farmland') < at('station') && at('station') < at('paris'), 'the battles are out of order');
  // The dates run in the same order
  const when = CAMPAIGN.map(id => Date.parse(MAPS.find(m => m.id === id).date));
  assert(when.every((d, i) => i === 0 || d > when[i - 1]), 'the dates are out of order');
});

check('the two Shermans go by their guns', () => {
  const st = Sim.newGame(1);
  assert(Sim.unitById(st, 'T1').name === 'Sherman 75mm' && Sim.unitById(st, 'T2').name === 'Sherman 76mm', 'wrong names');
  assert(PIECES.firefly.name === 'Sherman 76mm' && PIECES.sherman.name === 'Sherman 75mm', 'wrong names in the list of pieces');
  assert(PIECES.firefly.hard > PIECES.sherman.hard, 'the 76mm should be the better gun against tanks');
});

check('the Eiffel Tower: pieces stand under it, it blocks no view, and men there have one more to hit', () => {
  const st = Sim.newGame(5, 'us', 'paris');
  const tower = st.features.find(f => f.kind === 'eiffel');
  assert(tower && tower.x === st.objective.x && tower.y === st.objective.y, 'the tower is not on the target');
  assert(tower.areas.length === 0 && tower.blocksView === false, 'the tower takes room or blocks the view');
  // A rifle platoon can stand there (one starts there, holding it)
  const held = Sim.at(st, tower.x, tower.y, 'de').filter(u => u.kind === 'company');
  assert(held.length === 1, 'no platoon holding the tower');
  // The one more to hit
  assert(Sim.cover(st, null, held[0]) === 1, 'no cover at the tower');
  Sim.newGame(1);
});

check('the beach is four fields of sand deep, with the bunkers behind it and each named for what is in it', () => {
  const st = Sim.newGame(5, 'us', 'beach');
  for (let y = 0; y < ROWS; y++) {
    for (let x = 1; x <= 4; x++) assert(Sim.tileType(x, y) === 'beach', `no sand at ${x},${y}`);
    assert(Sim.tileType(5, y) !== 'beach', `too much sand in row ${y}`);
  }
  assert(Sim.unitById(st, 'bk1').x === 8 && ['bk2', 'bk3', 'bk4', 'bk5'].every(id => Sim.unitById(st, id).x === 5), 'the bunkers are not behind the sand');
  // (Steve: a third MG bunker, in the middle of the sea wall)
  assert(Sim.unitById(st, 'bk5').kind === 'bunker_mg' && Sim.unitById(st, 'bk5').y === 4, 'no MG bunker in the middle of the sea wall');
  assert(Sim.unitById(st, 'bk3').name === 'PaK 40 bunker' && PIECES.bunker_mg.name === 'MG bunker', 'a bunker is not named for what is in it');
  // No hedges round a bunker: its sides are open to get at
  for (const id of ['bk1', 'bk2', 'bk3', 'bk4', 'bk5']) {
    const b = Sim.unitById(st, id);
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0]]) assert(!Sim.inside(b.x + dx, b.y + dy) || !Sim.hedge(st, b.x, b.y, b.x + dx, b.y + dy), `a hedge round ${id}`);
  }
  assert(!Sim.hedge(st, 7, 4, 8, 4), 'a hedge across the main bunker');
  Sim.newGame(1);
});

check('a bunker takes no cover from the sea wall, hedges, houses or trees: only its own faces add', () => {
  const st = Sim.newGame(5, 'us', 'beach');
  const b = Sim.unitById(st, 'bk2'), s = Sim.unitById(st, 'mg1');
  for (const u of st.units) if (u !== b && u !== s) u.x = u.y = null;
  // On the sand to its side, shooting across the sea wall it is built into (Steve: it said +1)
  s.x = 4; s.y = 0; s.at = 'n';
  assert(Sim.sight(st, s, b) && !Sim.inFrontOf(b, s), 'not a side shot that can be made');
  const why = Sim.needWhy(st, s, b);
  assert(!why.some(w => w.includes('hedge') || w.includes('cover') || w.includes('village') || w.includes('house')), `a bunker had cover: ${why.join(' | ')}`);
  assert(why.includes(`+${BUNKER_SIDE} bunker side`), 'the label does not say bunker side');
  // The score needed: the plain score, less close range, and the side's 1 more
  assert(Sim.shotNeed(st, s, b) === TO_HIT - CLOSE_BONUS + BUNKER_SIDE, `a side shot at a bunker needs ${Sim.shotNeed(st, s, b)}`);
  Sim.newGame(1);
});

check('the label on a shot at a bunker says front, side or back: +3, +1, +0 (Steve)', () => {
  const st = Sim.newGame(5, 'us', 'beach');
  const bunker = Sim.unitById(st, 'bk3'), A = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== bunker && u !== A) u.x = u.y = null;
  A.x = bunker.x - 1; A.y = bunker.y; A.at = null;
  assert(Sim.needWhy(st, A, bunker).includes('+3 bunker front'), 'from in front it does not say so');
  const fromFront = Sim.needFor(st, A, bunker);
  A.x = bunker.x; A.y = bunker.y - 1;
  const side = Sim.needWhy(st, A, bunker);
  assert(side.includes('+1 bunker side') && !side.some(w => w.includes('front')), 'from the side it does not say so: ' + side);
  A.x = bunker.x + 1; A.y = bunker.y;
  const back = Sim.needWhy(st, A, bunker);
  assert(back.includes('+0 bunker back'), 'from behind it does not say so: ' + back);
  assert(Sim.bunkerFace(bunker, { x: bunker.x + 2, y: bunker.y + 3 }) === 'side' && Sim.bunkerFace(bunker, { x: bunker.x + 3, y: bunker.y + 1 }) === 'back', 'the back is not the 90 degrees behind it');
  Sim.newGame(1);
});

check('weak hatching: only the areas where a Hail Mary is the only shot', () => {
  const st = Sim.newGame(5, 'us', 'beach');
  const bunker = Sim.unitById(st, 'bk3'), A = Sim.unitById(st, 'A');
  // Only the bunker to shoot at
  for (const u of st.units) if (u.side === 'de' && u !== bunker) u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  A.x = 1; A.y = bunker.y; A.at = null;
  // Shaken and well out in front of it, on the move: every shot from there is past a 6
  A.shocked = true;
  const cells = Sim.shootCells(st, A, 2, bunker.y), hail = Sim.hailMaryCells(st, A, 2, bunker.y);
  assert(cells.length > 0 && hail.length === cells.length, `well out in front: ${hail} of ${cells}`);
  // Steady and right up to it: close range, one less to hit, so a real shot and not weak
  A.shocked = false;
  const near = Sim.hailMaryCells(st, A, 4, bunker.y);
  assert(Sim.shootCells(st, A, 4, bunker.y).includes('e') && !near.includes('e'), `close range counted as a Hail Mary: ${near}`);
  // Steady and beside it: nothing extra, so none of it is weak
  const beside = Sim.hailMaryCells(st, A, bunker.x, bunker.y - 1);
  assert(!beside.length, `beside it: ${beside}`);
  // Trying them left it where it was
  assert(A.x === 1 && A.y === bunker.y, 'trying the cells moved it');
  Sim.newGame(1);
});

check('the goal must be held for the whole of the next round: taken on the last move wins nothing yet', () => {
  const start = Sim.newGame(5, 'us');
  const o = start.objective;
  const st = tableWith({ A: [o.x, o.y], d2: [0, 0] }, 5);
  const A = Sim.unitById(st, 'A');
  const round = st.turn;
  st.bag = { us: 3, de: 3, timer: 0 };
  // Taken at the end of a round: not won yet, and it says which round it must be held through
  Sim.finishRound(st);
  assert(!st.won && st.turn === round + 1 && st.holdUntil === st.turn, `won ${st.won}, round ${st.turn}, hold until ${st.holdUntil}`);
  assert(st.report.concat(st.roundRep || []).some(l => l.includes('Hold it for the whole')), 'it does not say to hold it');
  // Lost during that round, even if back by its end: the count stops
  const home = { x: A.x, y: A.y, at: A.at };
  A.x = 0; A.y = 7;
  st.bag = { us: 3, de: 3, timer: 0 };
  st.roundRep = [];
  Sim.drawToken(st);
  st.computer = null;
  assert(!st.holdUntil, 'leaving the goal did not stop the count');
  A.x = home.x; A.y = home.y; A.at = home.at;
  const turn = st.turn;
  Sim.finishRound(st);
  assert(!st.won && st.turn === turn + 1 && st.holdUntil === st.turn, 'back at the end of the round it should start the count again, not win');
  // Held all through this next round: won
  st.bag = { us: 3, de: 3, timer: 0 };
  Sim.drawToken(st);
  st.computer = null;
  Sim.finishRound(st);
  assert(st.won, 'held for a whole round did not win');
  Sim.newGame(1);
});

check('the bomber can be sent through any field, and nothing has to be lit', () => {
  const st = tableWith({ A: [3, 3], d2: [6, 4] }, 5);
  st.bag = { us: 3, de: 3, timer: 0 };
  st.drawn = 'us'; st.activeId = null; st.ammo.us.bomber = 1;
  const r = Sim.actFire(st, 'bomber', 6, 4);
  assert(r.ok && st.ammo.us.bomber === 0, 'the bomber would not fly through the middle of the board');
  assert(st.fx.some(f => f.kind === 'flyover' && f.line.some(q => q.x === 6 && q.y === 4)), 'its line missed the field');
  Sim.newGame(1);
});

check('a bunker fires across 90 degrees: 45 either side of straight ahead, from where it stands to where they stand', () => {
  // A bunker against the west edge of its field, in the north and middle areas: it stands at x 8.17, y 4.33
  const bunker = { kind: 'bunker_gun', x: 8, y: 4, at: 'nw+w' };
  const mg = (x, y, at) => ({ kind: 'mg', x, y, at });
  // Straight out of its front, in the next field: in
  assert(Sim.inFrontOf(bunker, mg(7, 4, 'e')), 'straight ahead was not in front');
  // The next field along the diagonal, close in at its corner: about 68 degrees off, out (Steve: it fired at these)
  assert(!Sim.inFrontOf(bunker, mg(7, 5, 'ne')), 'the near corner of the diagonal field was in front');
  // The same field's far corner: under 45 degrees, in
  assert(Sim.inFrontOf(bunker, mg(7, 5, 'nw')), 'the far corner of the diagonal field was not in front');
  // Two fields out: the near corner two rows down is in, the far one out to the side is not
  assert(Sim.inFrontOf(bunker, mg(6, 6, 'nw')) && !Sim.inFrontOf(bunker, mg(6, 6, 'se')), 'two fields out');
  // Beside it and behind it: never
  assert(!Sim.inFrontOf(bunker, mg(8, 3, 'sw')) && !Sim.inFrontOf(bunker, mg(9, 4, 'w')), 'beside or behind it');
  // Everywhere on the board: nothing it counts as in front is more than 45 degrees off straight ahead, and nothing
  // within 44 degrees is left out
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) for (const at of ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']) {
    const t = mg(x, y, at);
    const ahead = 8 + 1 / 6 - (x + 0.5 + (at.includes('e') ? 1 / 3 : at.includes('w') ? -1 / 3 : 0));
    const aside = Math.abs(y + 0.5 + (at.includes('s') ? 1 / 3 : at.includes('n') ? -1 / 3 : 0) - (4 + 1 / 3));
    const degrees = Math.atan2(aside, ahead) * 180 / Math.PI;
    if (Sim.inFrontOf(bunker, t)) assert(ahead > 0 && degrees <= 45 + 1e-6, `${x},${y} ${at} is ${degrees.toFixed(0)} degrees off but counted in front`);
    else assert(ahead <= 0 || degrees > 44, `${x},${y} ${at} is ${degrees.toFixed(0)} degrees off but left out`);
  }
});

check('the guns only fire on a piece their side can see: not behind a hedge, not next door across one', () => {
  const setUp = (ax, ay, where) => {
    const st = tableWith({ A: [ax, ay], d2: [5, 5] });
    for (const [x, y] of [[4, 5], [6, 5], [5, 4], [5, 6]]) st.hedges[Sim.edgeKey(5, 5, x, y)] = true;
    const A = Sim.unitById(st, 'A'), d2 = Sim.unitById(st, 'd2');
    A.at = null; d2.at = where;
    return { st, d2 };
  };
  // In the middle of a field with a hedge all round it, from far off, or from right next to it: not seen
  for (const [ax, ay] of [[1, 5], [4, 5]]) {
    const { st, d2 } = setUp(ax, ay, null);
    assert(!Sim.sees(st, 'us', d2), `seen from ${ax},${ay}`);
    assert(!Sim.canCallFire(st, 5, 5), `fire could be called from ${ax},${ay}`);
    assert(!Sim.artilleryTarget(st, 'us') && !Sim.mortarTarget(st, 'us'), `the computer's guns would fire from ${ax},${ay}`);
    st.drawn = 'us';
    const rounds = st.ammo.us.artillery;
    assert(!Sim.actFire(st, 'artillery', 5, 5).ok && st.ammo.us.artillery === rounds, 'the guns fired on a piece nobody could see');
  }
  // Lining the hedge on the far side from you, still not; lining the side you are looking from, seen
  const lined = setUp(1, 5, 'w');
  assert(Sim.sees(lined.st, 'us', lined.d2) && Sim.canCallFire(lined.st, 5, 5), 'a piece lining the near hedge could not be seen');
  assert(Sim.artilleryTarget(lined.st, 'us') === lined.d2, 'the computer would not fire on a piece it can see');
  const far = setUp(1, 5, 'e');
  assert(!Sim.sees(far.st, 'us', far.d2), 'a piece lining the far hedge was seen through the near one');
  Sim.newGame(1);
});

check('whenever a robot picks a gun target, on every map, someone on that side can see it', () => {
  for (const map of MAPS) for (let seed = 1; seed <= 3; seed++) {
    const st = Sim.newGame(seed, 'none', map.id);
    for (const side of ['us', 'de']) {
      for (const t of [Sim.artilleryTarget(st, side), Sim.mortarTarget(st, side)]) {
        if (t) assert(st.units.some(u => u.side === side && u.x !== null && Sim.sight(st, u, t, true)), `${map.id} ${seed}: ${side} would fire on ${t.name} unseen`);
      }
    }
  }
  Sim.newGame(1);
});

check('the captain can take the goal too, as a rifle platoon can; nobody else can', () => {
  const o = Sim.newGame(5, 'us').objective;
  for (const [id, takes] of [['cap', true], ['A', true], ['mg1', false], ['bz1', false], ['T1', false]]) {
    const st = tableWith({ [id]: [o.x, o.y], d2: [0, 0] }, 5);
    assert(Sim.holdsObjective(st) === takes, `${id}: holds ${Sim.holdsObjective(st)}`);
  }
  // Held a whole round by the captain alone: won
  const st = tableWith({ cap: [o.x, o.y], d2: [0, 0] }, 5);
  Sim.finishRound(st);
  Sim.finishRound(st);
  assert(st.won, 'the captain held the goal for a whole round and did not win');
  // With a German still in the field, not
  const contested = tableWith({ cap: [o.x, o.y], d2: [o.x, o.y] }, 5);
  assert(!Sim.holdsObjective(contested), 'the captain held it with a German in it');
  // No platoon left but the captain: not beaten yet
  const last = tableWith({ cap: [1, 1], dt1: [10, 4] }, 5);
  assert(!Sim.cannotWin(last), 'with the captain left the attack was given up');
  Sim.newGame(1);
});

check('half the bomber runs: nine over the campaign, at most one a side on each map, given to the side that needs it', () => {
  const runs = {};
  // (the campaign only: the bonus battles have their own, Steve: the RAF's Blenheim at Dunkirk)
  for (const map of MAPS.filter(m => !m.bonus)) {
    const st = Sim.newGame(1, 'us', map.id);
    runs[map.id] = [st.ammo.us.bomber, st.ammo.de.bomber];
  }
  const total = Object.values(runs).reduce((n, [us, de]) => n + us + de, 0);
  assert(total === 9, `${total} runs in all`);
  assert(Object.values(runs).every(([us, de]) => us <= 1 && de <= 1), 'a map with two runs a side: ' + JSON.stringify(runs));
  // (Crossroads town: none at all, Steve: it was too easy for the Americans)
  const want = { beach: [1, 0], deep: [1, 0], hedges: [1, 1], farmland: [1, 0], river: [0, 1], town: [0, 0], station: [1, 1], paris: [0, 1] };
  for (const id of Object.keys(want)) assert(runs[id].join() === want[id].join(), `${id}: ${runs[id]}`);
  // No runs: no token for it in the bag
  const paris = Sim.newGame(1, 'us', 'paris');
  assert(!Sim.canFire(paris, 'bomber'), 'a bomber with no runs could fly');
  Sim.newGame(1);
});

check('mortars and artillery: half the rounds, one more to hit, and nobody takes cover from them or from bombs', () => {
  const st = Sim.newGame(1);
  // (Hedge country, the usual map, has one more American artillery round: see the next test)
  assert(st.ammo.us.mortars === 3 && st.ammo.us.artillery === 3 && st.ammo.de.mortars === 4 && st.ammo.de.artillery === 1, 'rounds: ' + JSON.stringify(st.ammo));
  assert(ARTILLERY.ammo === 2 && MORTARS.ammo === 3 && DE_MORTAR.ammo === 4 && DE_ARTILLERY.ammo === 1, 'the usual rounds');
  assert(Sim.newGame(1, 'us', 'river').ammo.us.artillery === 2 && Sim.newGame(1, 'us', 'beach').ammo.de.artillery === 2, 'the maps\' extra rounds not halved');
  // Men in the open: 4+ against shells, 3+ against a shot
  const open = tableWith({ A: [3, 5], d2: [5, 5] });
  const d2 = Sim.unitById(open, 'd2');
  d2.at = null;
  assert(Sim.shellNeed(open, d2) === 4, `shells need ${Sim.shellNeed(open, d2)}`);
  // Already down: still +2 against them
  d2.down = true;
  assert(Sim.shellNeed(open, d2) === 6 && Sim.shellWhy(open, d2)[0] === '4+', `down: ${Sim.shellNeed(open, d2)}, ${Sim.shellWhy(open, d2)}`);
  // Nobody of the other side is asked about shells or bombs, only about a shot
  const both = tableWith({ A: [3, 5], d2: [5, 5] });
  both.mode = 'both'; both.players = { us: 'human', de: 'human' };
  for (const which of ['mortars', 'artillery', 'bomber']) assert(!Sim.piecesToAsk(both, which, 5, 5).length, `asked about ${which}`);
  // The computer's guns and bomber never stop to ask you either, and its own men never duck under yours
  for (let seed = 1; seed <= 12; seed++) {
    const g = Sim.newGame(seed, 'us', 'hedges');
    let rounds = 0;
    while (!g.won && !g.lost && rounds++ < 25) {
      Sim.startRound(g);
      for (let side = Sim.drawToken(g); side; side = Sim.drawToken(g)) {
        if (side === 'timer') break;
        if (side === 'us') { g.drawn = null; continue; }
        for (let r = Sim.computerStep(g); !r.done; r = Sim.computerStep(g)) {
          if (r.ask) { assert(!r.ask.shelled && !r.ask.bombed && !r.ask.mortar, `seed ${seed}: asked about ${JSON.stringify(r.ask)}`); Sim.answer(g, false); }
        }
        Sim.endComputerToken(g);
      }
      Sim.endRound(g);
    }
    assert(!g.fx.some(f => (f.kind === 'shell' || f.kind === 'bomb') && f.tookCover), `seed ${seed}: someone ducked under shells`);
  }
  Sim.newGame(1);
});

check('one more American artillery round in Hedge country, Deep bocage, the Train station and on the beach; one fewer in Crossroads town; four at Dunkirk; two elsewhere', () => {
  for (const map of MAPS) {
    // (Dunkirk: four for the destroyers; the beach: three for USS Texas, Steve 2026-11-12)
    const want = map.id === 'dunkirk' ? 4 : ['hedges', 'deep', 'station', 'beach'].includes(map.id) ? 3 : map.id === 'town' ? 1 : 2;
    assert(Sim.newGame(1, 'us', map.id).ammo.us.artillery === want, `${map.id}: ${Sim.newGame(1, 'us', map.id).ammo.us.artillery} rounds`);
  }
  Sim.newGame(1);
});

check('no American or British mortars on either beach (Steve), and Dunkirk boats only off the top four rows, clear of the destroyer and the bomber', () => {
  for (const id of ['beach', 'dunkirk']) {
    const g = Sim.newGame(1, 'us', id);
    assert(g.ammo.us.mortars === 0, `${id}: ${g.ammo.us.mortars} mortar rounds`);
    // (the Germans keep theirs)
    assert(g.ammo.de.mortars > 0, `${id}: the Germans lost their mortars`);
  }
  assert(MAPS.find(m => m.id === 'dunkirk').evacuate.noBoats.join() === '4,5,6,7', 'Dunkirk keeps the wrong rows clear of boats');
  for (let seed = 1; seed <= 30; seed++) {
    const g = Sim.newGame(seed, 'us', 'dunkirk');
    assert(g.evac.boats.every(b => b.y <= 3), `seed ${seed}: a boat behind the destroyer or the bomber`);
  }
  Sim.newGame(1);
});

check('the British at Dunkirk have one run of the RAF Blenheim; the Germans none; other maps keep the B-17 and Ju 88', () => {
  const g = Sim.newGame(1, 'us', 'dunkirk');
  assert(g.ammo.us.bomber === 1 && g.ammo.de.bomber === 0, `Dunkirk bombers ${g.ammo.us.bomber} and ${g.ammo.de.bomber}`);
  assert(Sim.bomberName('us') === 'Blenheim', `the British bomber is the ${Sim.bomberName('us')}`);
  Sim.newGame(1, 'us', 'hedges');
  assert(Sim.bomberName('us') === 'B-17' && Sim.bomberName('de') === 'Ju 88', 'the usual bombers renamed');
  Sim.newGame(1);
});

check('less than one die is always one die (Steve: everyone who shoots rolls); none stays none; whole dice stay whole', () => {
  const st = Sim.newGame(1);
  for (let k = 0; k < 50; k++) {
    assert(Sim.wholeDice(st, 0.5) === 1 && Sim.wholeDice(st, 0.25) === 1, 'a fraction of a die rolled none');
    assert(Sim.wholeDice(st, 0) === 0, 'no dice rolled one');
    assert(Sim.wholeDice(st, 2) === 2, 'two dice rolled other than two');
    const n = Sim.wholeDice(st, 1.5);
    assert(n === 1 || n === 2, `one and a half dice rolled ${n}`);
  }
  Sim.newGame(1);
});

check('Dunkirk boats are named by their type, a tug or a cabin cruiser, as the table draws them (Steve)', () => {
  const st = Sim.newGame(3, 'us', 'dunkirk');
  const kinds = [0, 1, 2, 3].map(y => Sim.boatKind(st, y));
  assert(kinds.every(k => k === 'tug' || k === 'cabin cruiser') && new Set(kinds).size === 2, kinds.join());
  // (the same rule as Models.littleShip: odd is a tug)
  assert(Sim.boatKind(st, 0) === (Math.abs(st.seed) % 2 ? 'tug' : 'cabin cruiser'), 'not the boat on the table');
  Sim.newGame(1);
});

// ---------- Stalingrad (Steve, 2026-11-12): a bonus battle in a bombed-out city ----------

check('Stalingrad: the Soviets against the Germans, the table seen from the far side, walls between the fields, rubble and minefields', () => {
  const st = Sim.newGame(3, 'us', 'stalingrad');
  assert(Sim.armyOf(st) === 'su' && Sim.sideName(st, 'us') === 'Soviets' && st.map.flip, 'not the Soviets, or not flipped');
  // (Steve: the cover is a ruin there, not a hedge)
  assert(Sim.hedgeWord() === 'ruin', `the walls are called ${Sim.hedgeWord()}`);
  // (Steve: the player is the Soviets when it is picked)
  assert(st.map.player === 'us', 'the player is not the Soviets');
  // The walls stand on the edges as hedges do
  assert(Object.keys(st.hedges).length > 40, `only ${Object.keys(st.hedges).length} walls`);
  // Rubble and minefields, never in the store or on a street, nor where the sides start
  const rubble = st.features.filter(f => f.kind === 'rubble'), mines = st.features.filter(f => f.kind === 'minefield');
  assert(rubble.length >= 5 && mines.length >= 2, `${rubble.length} rubble, ${mines.length} minefields`);
  for (const f of rubble.concat(mines)) {
    const t = Sim.tileType(f.x, f.y);
    assert(t === 'field', `${f.kind} on ${t} at ${f.x},${f.y}`);
    assert(f.x >= 3 && f.x <= 8, `${f.kind} where a side starts, at ${f.x},${f.y}`);
  }
  // (rubble takes one area, never the middle; a minefield none)
  assert(rubble.every(f => f.areas.length === 1 && f.areas[0] !== 'c') && mines.every(f => !f.areas.length), 'wrong areas');
  // Their armies: the Soviets' T-34 and PPSh section, the Germans' 88 and MP 40 section
  const kinds = side => st.units.filter(u => u.side === side).map(u => u.kind + (u.arms ? ':' + u.arms : ''));
  assert(kinds('us').includes('t34') && kinds('us').includes('kv2') && kinds('us').includes('company:smg'), kinds('us').join());
  // (Steve: the Germans rebalanced for the KV-2)
  assert(kinds('de').filter(k => k === 'pak').length === 2 && kinds('de').includes('pz4f2'), kinds('de').join());
  assert(PIECES.kv2.armour === 2 && PIECES.kv2.extraMove < 0 && PIECES.pz4f2.hard > PIECES.pz4.hard, 'the KV-2 or the F2 numbers are wrong');
  assert(kinds('de').includes('flak88') && kinds('de').includes('company:smg'), kinds('de').join());
  Sim.newGame(1);
  assert(Sim.hedgeWord() === 'hedge', 'hedges are still called ruins elsewhere');
});

check('Stalingrad: the Univermag is an open courtyard of four plain fields, walled all round its outside (Steve)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const st = Sim.newGame(seed, 'us', 'stalingrad');
    const yard = st.map.courtyard;
    for (let y = yard.y; y < yard.y + yard.h; y++) for (let x = yard.x; x < yard.x + yard.w; x++) {
      assert(Sim.tileType(x, y) === 'field', `the courtyard is ${Sim.tileType(x, y)} at ${x},${y}`);
      assert(!st.features.some(f => f.x === x && f.y === y), `rubble or a minefield in the courtyard at ${x},${y}`);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!Sim.inside(nx, ny)) continue;
        const inside = Sim.inCourtyard(st.map, nx, ny);
        // No wall between two of its fields; a wall on every edge out of it
        assert(Sim.hedge(st, x, y, nx, ny) === !inside, `seed ${seed}: ${inside ? 'a wall inside' : 'a gap in the outside wall'} at ${x},${y} to ${nx},${ny}`);
      }
    }
    // Seen across it: from one corner field to the far one, nothing in the way
    const a = { side: 'us', kind: 'company', x: yard.x, y: yard.y, at: null, platoons: 3 }, b = { side: 'de', kind: 'company', x: yard.x + 1, y: yard.y + 1, at: null, platoons: 3 };
    assert(Sim.sight(st, a, b), `seed ${seed}: no sight across the courtyard`);
  }
  Sim.newGame(1);
});

check('Stalingrad: a section of submachine gunners is two bases of three men, 3 dice a base, at close range only (Steve)', () => {
  const st = Sim.newGame(3, 'us', 'stalingrad');
  st.hedges = {}; st.wire = {}; st.features = [];
  const smg = Sim.unitById(st, 'smg1'), d1 = Sim.unitById(st, 'd1');
  for (const u of st.units) if (u !== smg && u !== d1) u.x = u.y = null;
  assert(smg.platoons === 2, `${smg.platoons} bases`);
  const f = Sim.firepower(st, smg);
  assert(f.soft === 6 && f.hard === 0, `fires ${f.soft} and ${f.hard}`);
  assert(Sim.closeRangeOnly(smg) && !Sim.closeRangeOnly(d1), 'close range only for the wrong pieces');
  // In the next field, middle to middle: close; three fields off: no shot
  smg.x = 4; smg.y = 6; smg.at = null; d1.x = 5; d1.y = 6; d1.at = null;
  assert(Sim.targets(st, smg).includes(d1), 'no shot at close range');
  d1.x = 7;
  assert(!Sim.targets(st, smg).includes(d1), 'a shot beyond close range');
  Sim.newGame(1);
});

check('Stalingrad: the 88 is dug in for good: it never moves, not even within its field, but it fires (Steve)', () => {
  const st = Sim.newGame(3, 'de', 'stalingrad');
  const gun = Sim.unitById(st, 'd88');
  assert(gun.x !== null && Sim.isEmplaced(gun) && Sim.isAtGun(gun), 'no 88 dug in');
  assert(!Sim.chargeSpots(st, gun).length && !Sim.moveShootSpots(st, gun).length, 'the 88 could move');
  assert(PIECES.flak88.hard > PIECES.pak.hard, 'the 88 is no stronger than the PaK');
  // (Steve: pointing down an open street, on a crossroads) On a crossroads, facing west along the street to the Soviets
  assert(Sim.tileType(gun.x, gun.y) === 'crossroads' && Math.abs(gun.aim - Math.PI) < 1e-6, `the 88 in ${Sim.tileType(gun.x, gun.y)}, facing ${gun.aim}`);
  // Nothing in the way along the street: no wall between it and the far end of the board
  for (let x = gun.x; x > 0; x--) assert(!Sim.hedge(st, x, gun.y, x - 1, gun.y), `a wall across the street at ${x}`);
  Sim.newGame(1);
});

check('Stalingrad: the 88 has 2 cover from the front (its gun shield), and it can turn on the spot (Steve)', () => {
  const st = Sim.newGame(3, 'de', 'stalingrad');
  const gun = Sim.unitById(st, 'd88'), sov = Sim.unitById(st, 'B');
  for (const u of st.units) if (u !== gun && u !== sov) u.x = u.y = null;
  st.hedges = {}; st.wire = {}; st.features = [];
  // Facing west: a shot from two fields west needs two more than one from two fields north (off to its side)
  sov.x = gun.x - 2; sov.y = gun.y; sov.at = null; sov.shocked = false;
  const front = Sim.needFor(st, sov, gun);
  assert(Sim.needWhy(st, sov, gun).some(w => w.includes('gun shield')), 'no gun shield in the reasons');
  sov.x = gun.x; sov.y = gun.y - 2;
  const beside = Sim.needFor(st, sov, gun);
  assert(front === beside + 2, `from the front ${front}, from the side ${beside}`);
  // Turning: its move, it stays where it is and faces the way clicked
  st.drawn = 'de'; st.activeId = null; gun.acted = false;
  const was = { x: gun.x, y: gun.y, at: gun.at };
  const turned = Sim.actLine(st, gun, 'e');
  assert(turned.ok && gun.x === was.x && gun.y === was.y && gun.at === was.at && Math.abs(gun.aim) < 1e-6, 'the 88 did not turn on the spot');
  // Turned to face north, the shot from the north is the one into its shield
  Sim.actLine(Object.assign(st, { activeId: null }), Object.assign(gun, { acted: false }), 'n');
  assert(Sim.needFor(st, sov, gun) === beside + 2, 'the shield did not turn with it');
  Sim.newGame(1);
});

check('small arms only shake a crewed gun; a hit on one already shaken kills it, but never the sniper\'s (Steve: the sniper against the 88)', () => {
  const st = Sim.newGame(3, 'us', 'stalingrad');
  const sn = Sim.unitById(st, 'sn1'), gun = Sim.unitById(st, 'd88');
  for (const u of st.units) if (u !== sn && u !== gun) u.x = u.y = null;
  sn.x = 0; sn.y = gun.y; sn.at = null;
  // Every die a 6: still only shaken (no coin toss for a wound)
  st.rand = () => 0.999;
  gun.shocked = false;
  Sim.fireAt(st, sn, gun);
  assert(gun.x !== null && gun.shocked, 'a sniper wiped out a fresh 88');
  // Shaken already: the sniper's next hit still only shakes it (Steve, 2026-11-21); a machine gun's kills it
  Sim.fireAt(st, sn, gun);
  assert(gun.x !== null && gun.shocked, 'the sniper killed a shaken 88');
  const mg = st.units.find(u => u.side === 'us' && u.kind === 'mg');
  mg.x = sn.x; mg.y = sn.y; mg.at = null;
  Sim.fireAt(st, mg, gun);
  assert(gun.x === null, 'a hit on a shaken 88 did not kill it');
  Sim.newGame(1);
});

check('a small gun needs one more against a tank, said as "+1 small gun" (Steve)', () => {
  const st = Sim.newGame(1, 'us', 'dunkirk');
  const pz2 = st.units.find(u => u.kind === 'pz2'), pz3 = st.units.find(u => u.kind === 'pz3'), mat = Sim.unitById(st, 'T1');
  for (const u of st.units) if (![pz2, pz3, mat].includes(u)) u.x = u.y = null;
  st.hedges = {}; st.wire = {}; st.features = [];
  mat.x = 6; mat.y = 4; mat.at = null; pz2.x = 8; pz2.y = 4; pz2.at = null; pz3.x = 8; pz3.y = 4; pz3.at = 'nw';
  assert(Sim.needFor(st, pz2, mat) === Sim.needFor(st, pz3, mat) + 1, `Panzer II ${Sim.needFor(st, pz2, mat)}, Panzer III ${Sim.needFor(st, pz3, mat)}`);
  assert(Sim.needWhy(st, pz2, mat).includes('+1 small gun') && !Sim.needWhy(st, pz3, mat).includes('+1 small gun'), Sim.needWhy(st, pz2, mat).join(' '));
  Sim.newGame(1);
});

check('Stalingrad: a piece going into a minefield rolls a die; 5 or 6 sets off a mine (Steve)', () => {
  const st = Sim.newGame(3, 'us', 'stalingrad');
  st.hedges = {}; st.wire = {};
  st.features = [{ x: 5, y: 6, kind: 'minefield', areas: [], seed: 1, name: 'Minefield', blocksView: false }];
  const a = Sim.unitById(st, 'B');
  for (const u of st.units) if (u !== a && u.side === 'de') u.x = u.y = null;
  a.x = 4; a.y = 6; a.at = null; a.acted = false; a.shocked = false;
  // Every die a 6: the mine goes off, and the platoon is shaken (a coin toss of 0.99: no section lost)
  st.rand = () => 0.99;
  st.drawn = 'us'; st.activeId = null;
  const r = Sim.actCharge(st, a, 5, 6);
  assert(r.ok && a.x === 5 && a.shocked, 'no mine went off');
  assert(r.lines.join(' ').includes('mine'), 'the mine is not reported: ' + r.lines.join(' '));
  assert(st.fx.some(f => f.kind === 'mine' && f.hit), 'no mine on the table');
  // Every die a 1: another platoon picks its way through a minefield next to it
  const b = Sim.unitById(st, 'C');
  b.x = 4; b.y = 5; b.at = null; b.acted = false; b.shocked = false;
  st.features[0].y = 5;
  st.fx = [];
  st.rand = () => 0.01;
  st.activeId = null;
  Sim.actCharge(st, b, 5, 5);
  assert(b.x === 5 && !b.shocked && st.fx.some(f => f.kind === 'mine' && !f.hit), 'a 1 set off a mine');
  Sim.newGame(1);
});

check('Stalingrad: a mine stops the move in the minefield; getting through, a piece goes on and rolls again on the way out (Steve)', () => {
  // A platoon next to a minefield with open ground beyond, nobody else on the table
  const setUp = () => {
    const st = Sim.newGame(3, 'us', 'stalingrad');
    st.hedges = {}; st.wire = {};
    st.features = [{ x: 5, y: 6, kind: 'minefield', areas: [], seed: 1, name: 'Minefield', blocksView: false }];
    const a = Sim.unitById(st, 'B');
    for (const u of st.units) if (u !== a) u.x = u.y = null;
    a.x = 4; a.y = 6; a.at = null; a.acted = false; a.shocked = false;
    st.drawn = 'us'; st.activeId = null;
    return { st, a };
  };
  const mines = st => st.fx.filter(f => f.kind === 'mine');
  // Every die a 1: it picks its way in and out, and carries on to the field beyond
  let { st, a } = setUp();
  st.rand = () => 0.01;
  let r = Sim.actCharge(st, a, 6, 6);
  assert(r.ok && a.x === 6 && a.y === 6 && !a.shocked, `it did not get through: ${a.x},${a.y}`);
  assert(mines(st).length === 2 && mines(st).every(f => !f.hit), `${mines(st).length} mine rolls, not 2 (in and out)`);
  assert(r.lines.join(' ').includes('into the minefield') && r.lines.join(' ').includes('out of the minefield'), r.lines.join(' '));
  // The table waits for the piece to get there before each mine goes off
  assert(mines(st).every(f => f.midMove), 'the table would not wait for the piece');
  // Every die a 6: the mine goes off on the way in, and it stops there
  ({ st, a } = setUp());
  st.rand = () => 0.99;
  r = Sim.actCharge(st, a, 6, 6);
  assert(r.ok && a.x === 5 && a.y === 6 && a.shocked, `it did not stop in the minefield: ${a.x},${a.y}`);
  assert(mines(st).length === 1 && mines(st)[0].hit, 'one mine should go off, on the way in');
  // Next go, standing in the minefield: the way out rolls again, a 6 stops it there once more
  ({ st, a } = setUp());
  a.x = 5;
  st.rand = () => 0.99;
  r = Sim.actCharge(st, a, 6, 6);
  assert(r.ok && a.x === 5 && a.y === 6, `it left the minefield on a 6: ${a.x},${a.y}`);
  assert(r.lines.join(' ').includes('on its way out'), r.lines.join(' '));
  // With a 1 it walks out
  ({ st, a } = setUp());
  a.x = 5;
  st.rand = () => 0.01;
  r = Sim.actCharge(st, a, 6, 6);
  assert(r.ok && a.x === 6 && mines(st).length === 1 && !mines(st)[0].hit, 'it should walk out on a 1');
  // Two ways as long: it goes round the minefield, not through it
  ({ st, a } = setUp());
  const route = Sim.chargeRoutes(st, a).find(rt => rt[rt.length - 1].x === 5 && rt[rt.length - 1].y === 7);
  assert(route && route.length === 2 && !(route[0].x === 5 && route[0].y === 6), `the way goes through the minefield: ${JSON.stringify(route)}`);
  Sim.newGame(1);
});

check('no piece has less than one die in the numbers (Steve: whole dice in the data, not half a die rounded up)', () => {
  for (const [kind, P] of Object.entries(PIECES)) {
    for (const key of ['soft', 'hard', 'he', 'vsMen']) {
      const n = P[key];
      if (n === undefined) continue;
      assert(n === 0 || n >= 1, `${kind}: ${key} ${n}`);
    }
    // Every tank says what its gun rolls at men
    if (P.tank) assert(P.he !== undefined, `${kind} has no high explosive number`);
    // At men, as worked out: never between none and one
    if (!P.tank) { const men = P.vsMen !== undefined ? P.vsMen : P.soft + P.hard * 0.5; assert(men === 0 || men >= 1, `${kind}: ${men} at men`); }
  }
});

check('the panel shows dice as they are rolled: less than one is one (Steve: the Panzer II showed 0.5)', () => {
  const st = Sim.newGame(1, 'us', 'dunkirk');
  const pz2 = st.units.find(u => u.kind === 'pz2');
  const f = Sim.firepower(st, pz2);
  assert(f.hard === 1 && Sim.diceShown(f.hard) === 1, `the Panzer II shows ${Sim.diceShown(f.hard)} vs tanks`);
  // At men: one machine-gun die and its gun's quarter die, rolled as one each
  assert(Sim.menDiceShown(pz2, f) === 2, `the Panzer II shows ${Sim.menDiceShown(pz2, f)} vs men`);
  assert(Sim.diceShown(0) === 0 && Sim.diceShown(1.5) === 1.5 && Sim.diceShown(3) === 3, 'whole and half dice changed');
  Sim.newGame(1);
});

check('parachutes (Steve picked C): big, uneven, olive drab, swinging less near the table and still once down, gone at the end', () => {
  const Chute = require('../js/chute.js');
  const seeded = n => () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
  const a = Chute.shape(seeded(7)), b = Chute.shape(seeded(99));
  // Bigger: the hem reaches well past the old canopy's 0.07
  const hem = s => Array.from({ length: Chute.SEGS }, (_, j) => Chute.point(s, Chute.RINGS, j, 0));
  const reach = hem(a).map(([x, , z]) => Math.hypot(x, z));
  assert(Math.min(...reach) > 0.2, `the hem only reaches ${Math.min(...reach).toFixed(2)}`);
  // Not evenly round: the hem's reach differs round the canopy, and no two parachutes are alike
  assert(Math.max(...reach) - Math.min(...reach) > 0.02, 'the hem is evenly round');
  assert(JSON.stringify(hem(a)) !== JSON.stringify(hem(b)), 'two parachutes alike');
  // A hole at the top
  const [vx, , vz] = Chute.point(a, 0, 0, 0);
  assert(Math.hypot(vx, vz) > 0.02, 'no vent hole');
  // Olive drab
  assert(Chute.LOOK.colour === '#77764a', 'not olive drab');
  // Swinging: more just after it opens than near the table, and still soon after landing
  const most = (from, to) => { let m = 0; for (let t = from; t < to; t += 0.02) m = Math.max(m, Math.abs(Chute.swing(a, t).along)); return m; };
  const early = most(0, Chute.LOOK.period), late = most(Chute.TIME.fall - Chute.LOOK.period, Chute.TIME.fall);
  assert(early > 0.12 && late < early, `swing early ${early.toFixed(2)}, late ${late.toFixed(2)}`);
  assert(most(Chute.TIME.fall + 0.31, Chute.TIME.fall + 1) === 0, 'still swinging on the table');
  // It starts just over the plane and lands with the man's feet (or the crate) on the table
  for (const load of ['man', 'crate']) {
    const feet = Chute.height(Chute.TIME.fall, load) + Chute.HANG.lines - Chute.HANG.riser[load] - Chute.LOAD_TOP[load] * Chute.HANG[load];
    assert(Math.abs(feet) < 1e-9, `${load} lands ${feet} off the table`);
  }
  assert(Chute.height(0, 'man') === Chute.HANG.top, 'not starting at the top');
  // Gone by the end, the last of three landing after the others
  assert(Chute.opacity(Chute.TIME.fall + Chute.TIME.settle) === 0 && Chute.opacity(Chute.TIME.fall) === 1, 'fading wrong');
  assert(Chute.lasts(3) === 2 * Chute.TIME.apart + Chute.TIME.fall + Chute.TIME.settle, 'the drop ends too soon');
  // The piece (or crate) shows when the last one is on the table (Steve: not before), before the canopies have gone
  assert(Chute.landed(3) === 2 * Chute.TIME.apart + Chute.TIME.fall, 'the last one lands at the wrong time');
  assert(Chute.landed(1) === Chute.TIME.fall && Chute.landed(3) < Chute.lasts(3), 'the crate lands at the wrong time');
});

const DUNKIRK = MAPS.find(m => m.id === 'dunkirk').evacuate;
// ---------- Dunkirk (Steve, 2026-11-11): a bonus battle, lorry-loads of British getting away on little ships ----------

// A Dunkirk table set up for one check: only the pieces named, where they are put, no hedges or wire, boats off these rows
function dunkirkWith(places, boats = [3], seed = 3) {
  const st = Sim.newGame(seed, 'us', 'dunkirk');
  st.wire = {}; st.hedges = {};
  for (const u of st.units) if (!(u.id in places)) u.x = u.y = null;
  for (const id in places) { const u = Sim.unitById(st, id); u.x = places[id][0]; u.y = places[id][1]; u.at = null; }
  st.evac.boats = boats.map(y => ({ x: 0, y }));
  return st;
}
// The British at the front, enough of them that the game isn't lost before a check
const FRONT = { A: [5, 1], B: [5, 3], C: [5, 5], cap: [5, 6], mg1: [5, 2], at1: [5, 4], d1: [10, 3] };
// A lorry put on the table by hand
function lorryAt(st, x, y, sections = 2) {
  const u = { id: 'lorryT', kind: 'lorry', name: 'Lorry T', side: 'us', auto: true, platoons: sections, x, y, at: null, quality: 'standard', shocked: false, acted: false };
  st.units.push(u);
  return u;
}

check('Dunkirk: the British start in the strongpoints along the front, the Germans at the far end, 2 or 3 boats off the beach, the destroyers', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const st = Sim.newGame(seed, 'us', 'dunkirk');
    for (const u of live(st)) {
      if (u.side === 'us') assert(u.x >= 4 && u.x <= 6, `seed ${seed}: ${u.name} starts at ${u.x}`);
      else assert(u.x >= 9, `seed ${seed}: ${u.name} starts at ${u.x}`);
    }
    assert(st.evac.boats.length >= 2 && st.evac.boats.length <= 3, `seed ${seed}: ${st.evac.boats.length} boats`);
    assert(st.evac.boats.every(b => b.x === 0 && Sim.tileType(b.x, b.y) === 'beach'), `seed ${seed}: a boat off no beach`);
    assert(new Set(st.evac.boats.map(b => b.y)).size === st.evac.boats.length, `seed ${seed}: two boats off one field`);
    // Every rifle platoon starts in a strongpoint
    const inStrongpoint = u => st.features.some(f => f.kind === 'strongpoint' && f.x === u.x && f.y === u.y);
    assert(live(st).filter(u => u.side === 'us' && u.kind === 'company').every(inStrongpoint), `seed ${seed}: a platoon out of the strongpoints`);
  }
  // No sea on the board: it is off the edge, with the boats
  const played = Sim.newGame(1, 'us', 'dunkirk').map;
  assert(played.rows.every(r => !r.includes('w')), 'the sea is on the board');
  assert(Sim.sideName(Sim.newGame(1), 'us') === 'Americans', 'the Americans are misnamed');
  const st = Sim.newGame(1, 'us', 'dunkirk');
  assert(Sim.sideName(st, 'us') === 'British', 'the British are misnamed');
  assert(Sim.unitById(st, 'T1').kind === 'matilda' && Sim.armourOf(Sim.unitById(st, 'T1')) === 2, 'no Matilda, or a thin one');
  assert(Sim.gunStats('artillery', 'us').name === 'Royal Navy destroyers' && Sim.gunStats('artillery', 'de').name === DE_ARTILLERY.name, 'the guns are misnamed');
  Sim.newGame(1);
  assert(Sim.gunStats('artillery', 'us').name === ARTILLERY.name, 'the destroyers stayed for another map');
});

check('Dunkirk: a strongpoint gives the men in it two more to hit, one against shells; nothing for a tank', () => {
  const st = dunkirkWith({ A: [5, 0], d1: [8, 0] });
  const A = Sim.unitById(st, 'A'), d1 = Sim.unitById(st, 'd1');
  const inOpen = dunkirkWith({ A: [5, 2], d1: [8, 2] });
  const A2 = Sim.unitById(inOpen, 'A'), d2 = Sim.unitById(inOpen, 'd1');
  A2.at = null;
  // (the label says what each thing adds)
  assert(Sim.needWhy(st, d1, A).includes('+2 cover') && !Sim.needWhy(inOpen, d2, A2).some(w => w.includes('cover')), 'a strongpoint does not give +2 cover');
  assert(Sim.shellNeed(st, A) - Sim.shellNeed(inOpen, A2) === 1, 'shells: not one more');
  const tank = dunkirkWith({ T1: [5, 0], dt3: [8, 0] });
  assert(!Sim.needWhy(tank, Sim.unitById(tank, 'dt3'), Sim.unitById(tank, 'T1')).some(w => w.includes('cover')), 'a tank has cover in a strongpoint');
  Sim.newGame(1);
});

check('Dunkirk: the men at the front never go to the boats; lorries come in at the top of the coast road from round 2', () => {
  const st = dunkirkWith(FRONT, [3]);
  // No British piece can get off the board onto a boat: the boats are off it
  for (const u of live(st).filter(o => o.side === 'us')) assert(!Sim.chargeSpots(st, u).some(f => f.x < 0), `${u.name} can go into the sea`);
  st.turn = DUNKIRK.trucks.first - 1;
  Sim.finishRound(st);
  const lorries = st.units.filter(u => Sim.isLorry(u));
  assert(lorries.length >= 1 && lorries.length <= DUNKIRK.trucks.each[1], `${lorries.length} lorries in round ${st.turn}`);
  for (const l of lorries) {
    assert(l.auto && l.acted && !Sim.canAct(st, l), 'a lorry takes orders');
    assert(l.platoons >= 1 && l.platoons <= 2, `${l.platoons} sections in a lorry`);
    // It came in at the top of the road and drove on from there, no further than it can
    assert(Math.abs(l.x - DUNKIRK.trucks.road) + l.y <= DUNKIRK.trucks.moves, `${l.name} got to ${l.x},${l.y}`);
  }
  // Before round 2: none
  const early = dunkirkWith(FRONT, [3]);
  Sim.finishRound(early);
  assert(early.turn === 2 && early.units.some(u => Sim.isLorry(u)), 'no lorry in round 2');
  Sim.newGame(1);
});

check('Dunkirk: a lorry drives to the field off which a boat lies; the men go aboard, out of every field and out of sight', () => {
  const st = dunkirkWith(FRONT, [1]);
  const l = lorryAt(st, 3, 0);
  st.turn = DUNKIRK.trucks.last + 1;   // (no more lorries to come)
  st.evac.boats = [{ x: 0, y: 1 }];
  // A new round brings new boats: put one off row 1 again by hand, then drive
  const route = Sim.routeToBoat(st, l, DUNKIRK.trucks.moves);
  assert(route && route[route.length - 1].x === 0 && route[route.length - 1].y === 1, 'no way to the boat');
  assert(Sim.boatOff(st, 0, 1) && !Sim.boatOff(st, 1, 1) && !Sim.boatOff(st, 0, 2), 'boats off the wrong fields');
  // Aboard: in no field, seen by nobody, a target for nobody
  l.x = 0; l.y = 1; l.aboard = true;
  const g = Sim.unitById(st, 'd1');
  g.x = 1; g.y = 1;
  assert(!Sim.at(st, 0, 1).includes(l) && !Sim.sees(st, 'de', l) && !Sim.targets(st, g).includes(l), 'men aboard can be got at');
  assert(Sim.isAboard(st, l) && !Sim.canAct(st, l), 'not aboard, or takes orders');
  Sim.newGame(1);
});

check('Dunkirk: the boats sail at the end of the round with whoever is aboard; its sections count (Steve); enough away wins, too few left loses', () => {
  const st = dunkirkWith(FRONT, [3]);
  const l = lorryAt(st, 0, 3);
  l.aboard = true;
  Sim.finishRound(st);
  // (a lorry with two sections: two away)
  assert(st.evac.saved === 2 && l.saved && l.x === null, `saved ${st.evac.saved}`);
  assert(!st.won && !st.lost, 'over too soon');
  assert(st.evac.boats.length >= 2, 'no new boats for the next round');
  // Enough away: the British win
  const win = dunkirkWith(FRONT, [3]);
  lorryAt(win, 0, 3, 1).aboard = true;
  win.evac.saved = DUNKIRK.need - 1;
  Sim.finishRound(win);
  assert(win.won && !win.lost, 'getting enough away did not win');
  // Too few left to make it, even with every lorry still to come: the Germans win
  const lose = dunkirkWith(FRONT, [3]);
  lose.turn = DUNKIRK.trucks.last;
  Sim.finishRound(lose);
  assert(lose.lost && !lose.won, 'too few left did not lose');
  // Out of time
  const late = dunkirkWith(FRONT, [3]);
  late.evac.saved = DUNKIRK.need - 3;
  late.turn = DUNKIRK.rounds;
  for (let k = 0; k < 4; k++) { const o = lorryAt(late, 3, k); o.id = 'lorryL' + k; }
  Sim.finishRound(late);
  assert(late.lost, 'the time limit did not end it');
  Sim.newGame(1);
});

check('tanks and armoured cars always roll at least one die at a tank (Steve: half a die often rolled none), and their machine guns count against carriers', () => {
  let none = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const st = dunkirkWith({ UC1: [5, 3], dt2: [7, 3], A: [5, 1], B: [5, 5], C: [5, 6], cap: [4, 6], mg1: [4, 2], at1: [4, 4] }, [3], seed);
    st.fx = [];
    Sim.fireAt(st, Sim.unitById(st, 'dt2'), Sim.unitById(st, 'UC1'));
    const shot = st.fx.find(f => f.to && f.to.id === 'UC1');
    if (!shot || !shot.faces.length) none++;
  }
  assert(none === 0, `${none} shots of 60 rolled no dice`);
  // A Panzer I (machine guns only) can fire on a carrier, as a machine gun can on an armoured car
  const st = dunkirkWith({ UC1: [5, 2], dt1: [7, 2] });
  assert(Sim.targets(st, Sim.unitById(st, 'dt1')).some(t => t.id === 'UC1'), 'the Panzer I can\'t fire on a carrier');
  Sim.newGame(1);
});

check('the M5 Stuart (Steve: a small American tank with a round turret) is on River crossing, Open farmland and Paris', () => {
  const has = id => Sim.newGame(1, 'us', id).units.some(u => u.side === 'us' && u.kind === 'stuart');
  for (const id of ['river', 'farmland', 'paris']) assert(has(id), `${id}: no Stuart`);
  for (const id of ['hedges', 'deep', 'beach', 'town', 'station']) assert(!has(id), `${id}: a Stuart where there should be none`);
  // A light tank: tracked (cuts hedges), the 37 mm (one more against tanks), a field quicker
  const p = PIECES.stuart;
  assert(p.tank && p.cutter && !p.car && p.smallGun && p.extraMove === 1 && p.hard >= 1, 'the Stuart\'s numbers are wrong');
  // Paris: in place of the Sherman 76mm
  assert(!Sim.newGame(1, 'us', 'paris').units.some(u => u.id === 'T2'), 'Paris still has the Sherman 76mm');
  Sim.newGame(1);
});

check('the artillery (Steve, 2026-11-14): the German Nebelwerfer 41s, the Soviet Katyushas, the American 105 mm howitzers; the warships stay', () => {
  Sim.newGame(1);
  assert(Sim.gunStats('artillery', 'us').name === '105 mm howitzers', 'the American artillery is misnamed');
  assert(Sim.gunStats('artillery', 'de').name === '15 cm Nebelwerfer 41s', 'the German artillery is not the Nebelwerfer');
  Sim.newGame(1, 'us', 'stalingrad');
  assert(Sim.gunStats('artillery', 'us').name === 'Katyusha rockets', 'the Soviet artillery is not the Katyusha');
  Sim.newGame(1, 'us', 'dunkirk');
  assert(Sim.gunStats('artillery', 'us').name === 'Royal Navy destroyers', 'the destroyers went from Dunkirk');
  Sim.newGame(1, 'us', 'beach');
  assert(Sim.gunStats('artillery', 'us').name === 'USS Texas', 'the battleship went from the beach');
  Sim.newGame(1);
});

check('Paris (Steve, 2026-11-13): tanks never go through the buildings, nobody sees through them, tanks start on the streets, cafés only in dead ends and on corners', () => {
  const paris = MAPS.find(m => m.id === 'paris'), usual = paris.design;
  for (const design of Object.keys(PARIS_DESIGNS)) {
    paris.design = design;
    for (let seed = 1; seed <= 15; seed++) {
      const st = Sim.newGame(seed, 'us', 'paris');
      // Every tank on a street or square
      for (const u of st.units.filter(o => Sim.isTank(o) && o.x !== null)) assert(Sim.tileType(u.x, u.y) !== 'court', `${design} seed ${seed}: ${u.name} starts in a courtyard`);
      // Each café in a dead end or on a corner, along a side closed by buildings, never in the middle
      for (const f of st.features.filter(o => o.kind === 'cafe')) {
        const ways = [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']].filter(([dx, dy]) => Sim.tileType(f.x + dx, f.y + dy) !== 'court');
        const straight = ways.length === 2 && ways[0][0] === -ways[1][0] && ways[0][1] === -ways[1][1];
        assert(ways.length === 1 || (ways.length === 2 && !straight), `${design} seed ${seed}: a café at ${f.x},${f.y} on a through road`);
        assert(!f.areas.includes('c'), `${design} seed ${seed}: a café in the middle of the road`);
        const side = ['n', 'e', 's', 'w'].find(d => f.areas.every(a => a.includes(d)));
        assert(side && !ways.some(w => w[2] === side), `${design} seed ${seed}: a café at ${f.x},${f.y} against an open side`);
      }
    }
  }
  paris.design = usual;
  // A tank beside a row of buildings can't go through it; across it, right beside it both sides, nobody sees
  const st = Sim.newGame(3, 'us', 'paris');
  const [ax, ay, bx, by] = Object.keys(st.hedges)[0].split(/[^0-9]+/).filter(Boolean).map(Number);
  const tank = st.units.find(u => u.side === 'us' && Sim.isTank(u)), foe = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== tank && u !== foe) u.x = u.y = null;
  tank.x = ax; tank.y = ay; tank.at = null;
  assert(!Sim.hasCutters(tank), 'a tank has hedge cutters in Paris');
  assert(!Sim.moveShootSpots(st, tank).some(p => p.x === bx && p.y === by), 'a tank could drive through a row of buildings');
  foe.x = bx; foe.y = by; foe.at = null;
  assert(!Sim.sight(st, tank, foe) && !Sim.sight(st, foe, tank), 'seen through a row of buildings');
  // Called a building, not a hedge, everywhere the game names it (Steve: it said hedge in Paris)
  assert(Sim.hedgeWord() === 'building', `Paris calls them ${Sim.hedgeWord()}`);
  Sim.newGame(1);
});

// A piece of a page script, cut out by its first and last lines, to check on its own (it needs no page)
function pageCode(file, from, to) {
  const text = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  const start = text.indexOf(from), end = text.indexOf(to, start);
  assert(start >= 0 && end > start, `${file} has no ${from}`);
  return text.slice(start, end + to.length);
}

check('the minefield says what it does on hover (Steve, 2026-11-14): movement damage on 5+, not that nobody can stand there', () => {
  // (the hover box's line, from main.js)
  const featureLine = vm.runInThisContext(`(${pageCode('main.js', 'function featureLine(thing) {', '\n  }')})`);
  const line = featureLine({ kind: 'minefield', name: FEATURES.minefield.name, blocksView: false });
  assert(line === 'Minefield: movement damage on 5+', `a minefield says "${line}"`);
  // (the others as they were)
  assert(featureLine({ kind: 'rubble', name: 'Rubble', blocksView: false }) === 'Rubble: nobody can stand there', 'rubble changed');
});

check('the artillery\'s rounds stand in a line in front of the gun, twice as big; the warship\'s bigger still (Steve, 2026-11-14: they were hidden)', () => {
  // (the pile's places, from board3d.js, with the table seen the usual way round)
  const code = pageCode('board3d.js', 'const ARTILLERY_PILE', 'return { x, y: (spot.pileY || 0) + 0.02, z, size: p.size };\n  }');
  const pileSpot = vm.runInThisContext(`(() => { const TANKS = 1.6, MEN = 2.45, PILE_MAX = 12; const screenUp = () => -1, screenRight = () => 1, gunDir = side => ({ x: side === 'us' ? 1 : -1, z: 0 }); ${code}; return pileSpot; })()`);
  const gun = { x: -0.7, z: 2.55, pileX: -1.45, pileZ: 2.3 };
  const first = pileSpot(gun, 'artillery', 0, 'us'), third = pileSpot(gun, 'artillery', 2, 'us');
  // In front of the gun on the screen (down it: more z), past its ring, close beside it across the screen
  assert(first.z > gun.z + 0.36, `the first round is at z ${first.z}, behind or on the gun's ring`);
  assert(Math.abs(first.x - gun.x) < 0.3 && Math.abs(third.x - gun.x) < 0.3, 'the rounds are not under the gun');
  assert(third.z === first.z && third.x > first.x, 'the first rounds are not in one line, going on towards the board');
  // Twice as big as they were (the gun's own size)
  assert(Math.abs(first.size - 1.6 * 1.7 * 2) < 1e-9, `the rounds are size ${first.size}`);
  // The warship's: one line from where the map puts it, bigger still
  const ship = pileSpot({ x: -0.75, z: 6.3, pileX: -1.1, pileZ: 5.1, pileRow: true }, 'artillery', 3, 'us');
  assert(ship.z === 5.1 && ship.x > -1.1 && ship.size > first.size, 'the warship\'s shells moved or are smaller');
});

check('I go, you go (Steve, 2026-11-15): the side with fewer tokens first, then turn about, the other finishing; no timer when left out', () => {
  for (let seed = 1; seed <= 8; seed++) {
    // (two humans: nobody moves on a token, so only the order shows)
    const st = Sim.newGame(seed, 'both', 'hedges', { order: 'turns', timer: false });
    Sim.startRound(st);
    const start = { us: st.bag.us, de: st.bag.de };
    assert(st.bag.timer === 0, 'the timer is in the bag though it was left out');
    const order = [];
    for (let k = 0; k < 60; k++) { const side = Sim.drawToken(st); if (!side) break; order.push(side); Sim.passToken(st); }
    assert(!order.includes('timer'), `seed ${seed}: the timer came out`);
    assert(order.length === start.us + start.de, `seed ${seed}: ${order.length} tokens out of ${start.us + start.de}`);
    const fewer = start.us < start.de ? 'us' : start.de < start.us ? 'de' : order[0];
    assert(order[0] === fewer, `seed ${seed}: ${order[0]} went first with ${start[order[0]]} tokens`);
    // Turn about while both have tokens, then the side with more carries on
    const both = Math.min(start.us, start.de) * 2;
    for (let i = 1; i < both; i++) assert(order[i] !== order[i - 1], `seed ${seed}: the same side twice at token ${i + 1}`);
    assert(order.slice(both).every(x => x === order[1]), `seed ${seed}: the side with fewer had a token after running out`);
  }
});

check('the timer stays in the bag unless left out, and the blind draw can still end on it', () => {
  const st = Sim.newGame(3, 'both', 'hedges');
  Sim.startRound(st);
  assert(st.bag.timer === ROUND_TIMER && !st.alternate, 'a plain game lost its timer or its blind draw');
  // Left out, the blind draw never brings it
  for (let seed = 1; seed <= 20; seed++) {
    const g = Sim.newGame(seed, 'both', 'hedges', { timer: false });
    Sim.startRound(g);
    for (let k = 0; k < 60; k++) { const side = Sim.drawToken(g); assert(side !== 'timer', `seed ${seed}: the timer came out`); if (!side) break; Sim.passToken(g); }
  }
});

check('the goal in big letters (Steve, 2026-11-15): capture the village or destroy all, said for the player', () => {
  const st = Sim.newGame(3, 'us', 'hedges');
  const place = st.objective.name;
  assert(Sim.goalLines(st).join('|') === `Capture ${place}|or destroy all Germans`, Sim.goalLines(st).join('|'));
  st.holdUntil = 4;
  assert(Sim.goalLines(st)[2] === 'Held: keep it all round 4', 'no word that it is held');
  const de = Sim.newGame(3, 'de', 'hedges');
  assert(Sim.goalLines(de).join('|') === `Hold ${de.objective.name}|or destroy all Americans`, Sim.goalLines(de).join('|'));
  const beach = Sim.newGame(3, 'us', 'beach');
  assert(Sim.goalLines(beach).join('|') === 'Destroy all Germans', Sim.goalLines(beach).join('|'));
  const su = Sim.newGame(3, 'us', 'stalingrad');
  assert(Sim.goalLines(su)[0] === 'Capture the Univermag', Sim.goalLines(su)[0]);
  Sim.newGame(1);
});

check('a click off the table puts the chosen gun or bomber down (Steve, 2026-11-15)', () => {
  const code = pageCode('ui.js', 'function dropSupport() {', '\n  }');
  const view = { support: 'bomber', mode: 'fire:bomber', sel: null };
  const dropSupport = vm.runInNewContext(`(${code})`, { view });
  assert(dropSupport() === true && view.support === null && view.mode === null, 'the bomber is still chosen');
  assert(dropSupport() === false, 'nothing chosen, but something was put down');
});

check('the Germans hold out (Steve, 2026-11-15): no American left to take the goal, and nothing German can hurt what is left', () => {
  for (const map of ['paris', 'hedges', 'stalingrad', 'beach']) {
    const st = Sim.newGame(3, 'de', map);
    Sim.startRound(st);
    // The Americans down to one tank; the Germans down to riflemen, with no fire support left
    const tank = st.units.find(u => u.side === 'us' && u.x !== null && Sim.isTank(u) && !PIECES[u.kind].car);
    const rifles = st.units.find(u => u.side === 'de' && u.x !== null && u.kind === 'company');
    assert(tank && rifles, `${map}: no American tank or German platoon to test with`);
    for (const u of st.units) if (u !== tank && u !== rifles) u.x = u.y = null;
    st.ammo.de = { mortars: 0, artillery: 0, bomber: 0 };
    // (out of the way of each other, nobody holding anything)
    st.holdUntil = null;
    Sim.finishRound(st);
    assert(st.lost && !st.won, `${map}: the Germans did not hold out against a tank they cannot hurt`);
    // With a mortar round left, or an American platoon to take the goal, it goes on
    const st2 = Sim.newGame(3, 'de', map);
    Sim.startRound(st2);
    const tank2 = st2.units.find(u => u.id === tank.id), rifles2 = st2.units.find(u => u.id === rifles.id);
    for (const u of st2.units) if (u !== tank2 && u !== rifles2) u.x = u.y = null;
    st2.ammo.de = { mortars: 1, artillery: 0, bomber: 0 };
    Sim.finishRound(st2);
    assert(!st2.lost && !st2.won, `${map}: it ended though the German mortars can still hurt the tank`);
  }
  Sim.newGame(1);
});

check('submachine guns Move & shoot as far as a Charge, still one more on the move (Steve, 2026-11-15)', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const cap = Sim.unitById(st, 'cap'), rifles = Sim.unitById(st, 'A');
  const foe = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== cap && u !== foe) u.x = u.y = null;
  cap.x = 0; cap.y = 6; cap.at = null; foe.x = 4; foe.y = 6; foe.at = null;
  const far = Sim.moveShootSpots(st, cap);
  assert(far.some(p => p.x === 3 && p.y === 6), `the captain's Move & shoot does not reach three fields: ${JSON.stringify(far)}`);
  assert(far.every(p => Math.abs(p.x - 0) + Math.abs(p.y - 6) <= CHARGE_MOVES), 'the captain went further than a Charge');
  // A rifle platoon still goes two
  cap.x = cap.y = null; rifles.x = 0; rifles.y = 6; rifles.at = null;
  assert(Sim.moveShootSpots(st, rifles).every(p => Math.abs(p.x) + Math.abs(p.y - 6) <= MOVE_SHOOT_MOVES), 'a rifle platoon went further than two');
  Sim.newGame(1);
});

check('Stalingrad round 3 (Steve, 2026-11-15): the T-35 and the StuG come on at their own edges, one column in when the edge is full', () => {
  const st = Sim.newGame(5, 'none', 'stalingrad');
  Sim.startRound(st);
  assert(!st.units.some(u => u.id === 'T3' || u.id === 'dstug'), 'a reinforcement was on the table from the start');
  // Round 2: still nobody
  st.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(st);
  assert(st.turn === 2 && !st.units.some(u => u.id === 'T3'), 'the T-35 came before round 3');
  st.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(st);
  const t35 = Sim.unitById(st, 'T3'), stug = Sim.unitById(st, 'dstug');
  assert(st.turn === 3 && t35 && stug, 'no reinforcements in round 3');
  assert(t35.x === 0 && stug.x === COLS - 1, `they came on at ${t35.x} and ${stug.x}, not at their own edges`);
  assert(!t35.acted && !stug.acted, 'a reinforcement cannot move in the round it arrives');
  assert(Sim.footprint(t35).length === 6 && Sim.sizeOf(t35) === 6, 'the T-35 does not take 3 by 2 areas');
  // The whole Soviet edge taken by Germans: the T-35 comes on one column in
  const g = Sim.newGame(5, 'none', 'stalingrad');
  Sim.startRound(g);
  const filler = g.units.filter(u => u.side === 'de' && u.x !== null && !PIECES[u.kind].fixed);
  for (let y = 0; y < ROWS; y++) { const u = filler[y % filler.length]; if (y < filler.length) { u.x = 0; u.y = y; } }
  // (every edge field needs an enemy in it, so fill those left with copies of the first German)
  for (let y = filler.length; y < ROWS; y++) g.units.push(Object.assign({}, filler[0], { id: 'fill' + y, x: 0, y }));
  g.turn = 2; g.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(g);
  const moved = Sim.unitById(g, 'T3');
  assert(moved && moved.x === 1, `with the edge full the T-35 came on at column ${moved && moved.x}`);
  Sim.newGame(1);
});

check('a long tank takes 3 by 2 areas: four places in a field, each starting with a corner (Steve, 2026-11-15)', () => {
  const st = Sim.newGame(5, 'none', 'stalingrad');
  const t35 = { id: 'x', kind: 't35', side: 'us', platoons: 1, x: 0, y: 0 };
  for (const at of ['n', 's', 'e', 'w']) {
    const areas = Sim.footprint(t35, at);
    assert(areas.length === 6 && new Set(areas).size === 6 && areas[0].length === 2, `${at}: ${areas}`);
  }
  // A corner asked for gives its north or south half
  assert(Sim.footprint(t35, 'ne').join() === Sim.footprint(t35, 'n').join(), 'a corner gave the wrong half');
  Sim.newGame(1);
});

check('the T-35\'s hull machine guns: once a round on its token, men only, before or after its move; the token waits for them (Steve, 2026-11-15)', () => {
  const st = Sim.newGame(5, 'us', 'stalingrad');
  Sim.startRound(st);
  st.hedges = {}; st.wire = {};
  const t35 = Object.assign({ id: 'T3', kind: 't35', name: 'T-35', side: 'us', platoons: 1, shocked: false, acted: false, quality: 'standard' }, { x: 2, y: 3, at: 'n' });
  st.units.push(t35);
  const foe = st.units.find(u => u.side === 'de' && u.kind === 'company');
  const panzer = st.units.find(u => u.side === 'de' && Sim.isTank(u));
  for (const u of st.units) if (u !== t35 && u !== foe && u !== panzer) u.x = u.y = null;
  foe.x = 4; foe.y = 3; foe.at = null; panzer.x = 5; panzer.y = 3; panzer.at = null;
  // Its token
  st.drawn = 'us'; st.human = 'us'; st.activeId = null; st.computer = null;
  assert(Sim.hullMgTargets(st, t35).includes(foe) && !Sim.hullMgTargets(st, t35).includes(panzer), 'the hull MGs can fire on a tank, or not on men');
  assert(Sim.canHullMg(st, t35), 'the hull MGs cannot fire on its token');
  const r = Sim.actHullMg(st, t35, foe);
  assert(r.ok && st.activeId === 'T3' && t35.mgFired, 'firing the hull MGs did not take the token');
  assert(!Sim.canHullMg(st, t35), 'the hull MGs could fire twice in a round');
  assert(Sim.canAct(st, t35), 'after its hull MGs the T-35 had lost its move');
  // Its move after: the token now ends
  assert(Sim.actShoot(st, t35, panzer).ok, 'the T-35 could not shoot after its hull MGs');
  assert(Sim.activationOver(st), 'the token did not end after both');
  // The other way round: its move first, then the token waits for the MGs until they fire or hold
  const st2 = Sim.newGame(5, 'us', 'stalingrad');
  Sim.startRound(st2);
  st2.hedges = {}; st2.wire = {};
  const t2 = Object.assign({}, t35, { mgFired: false, acted: false });
  st2.units.push(t2);
  const foe2 = st2.units.find(u => u.id === foe.id), pz2 = st2.units.find(u => u.id === panzer.id);
  for (const u of st2.units) if (u !== t2 && u !== foe2 && u !== pz2) u.x = u.y = null;
  foe2.x = 4; foe2.y = 3; foe2.at = null; pz2.x = 5; pz2.y = 3; pz2.at = null;
  st2.drawn = 'us'; st2.human = 'us'; st2.activeId = null; st2.computer = null;
  assert(Sim.actShoot(st2, t2, pz2).ok, 'the T-35 could not shoot');
  assert(!Sim.activationOver(st2), 'the token ended with the hull MGs still to fire');
  assert(Sim.actHoldMg(st2, t2).ok && Sim.activationOver(st2), 'holding the hull MGs did not end the token');
  Sim.newGame(1);
});

check('the motti: once the Soviets have only tanks left, the Finns win there and then (Steve, 2026-11-20)', () => {
  const st = Sim.newGame(5, 'us', 'winterwar');
  Sim.startRound(st);
  // Every Soviet man gone but one rifle platoon: still playing
  const men = st.units.filter(u => u.side === 'us' && !Sim.isTank(u));
  const last = men.pop();
  for (const u of men) u.x = u.y = null;
  Sim.finishRound(st);
  assert(!st.won && !st.lost, 'the game ended with a Soviet platoon still on the table');
  // The last of their men goes: only tanks and the aerosan left, so the Finns win
  st.report = [];
  Sim.remove(st, last);
  assert(st.lost && !st.draw, 'the Soviets with only tanks left did not lose');
  assert(/starved out/.test(st.report.join(' ')), `the report said: ${st.report.join(' ')}`);
  // The goal on the table says so
  assert(/Lose all your men/.test(Sim.goalLines(Sim.newGame(5, 'us', 'winterwar')).join(' ')), 'the goal does not say tanks alone lose');
  // Not on other maps: the Bulge's tanks alone still fight on
  const b = Sim.newGame(5, 'us', 'bulge');
  Sim.startRound(b);
  for (const u of b.units) if (u.side === 'us' && !Sim.isTank(u)) Sim.remove(b, u);
  assert(!b.lost, 'tanks alone lost on the Bulge too');
  Sim.newGame(1);
});

check('a shaken T-35 that rallies itself can still fire its hull MGs (Steve, 2026-11-20)', () => {
  const st = Sim.newGame(5, 'us', 'stalingrad');
  Sim.startRound(st);
  st.hedges = {}; st.wire = {};
  const t35 = { id: 'T3', kind: 't35', name: 'T-35', side: 'us', platoons: 1, shocked: true, acted: false, quality: 'standard', x: 2, y: 3, at: 'n' };
  st.units.push(t35);
  const foe = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== t35 && u !== foe) u.x = u.y = null;
  foe.x = 4; foe.y = 3; foe.at = null;
  st.drawn = 'us'; st.human = 'us'; st.activeId = null; st.computer = null;
  assert(Sim.actSelfRally(st, t35).ok && !t35.shocked, 'the T-35 could not rally itself');
  assert(!Sim.activationOver(st) && Sim.canHullMg(st, t35), 'after rallying the hull MGs could not fire');
  assert(Sim.actHullMg(st, t35, foe).ok && Sim.activationOver(st), 'the hull MGs did not fire after the rally');
  Sim.newGame(1);
});

check('reinforcements and airdrops are announced in big letters over the table (Steve, 2026-11-16)', () => {
  const st = Sim.newGame(5, 'none', 'stalingrad');
  Sim.startRound(st);
  st.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(st);
  assert(!(st.announce || []).length, 'something was announced before round 3');
  st.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(st);
  const said = (st.announce || []).map(a => [a.text].concat(a.more || []).join(' ')).join(' | ');
  assert(/Reinforcements!/.test(said) && /T-35/.test(said) && /StuG/.test(said), `round 3 said: ${said}`);
  // Paratroopers and supplies
  for (const kind of ['paras', 'crate']) {
    const g = Sim.newGame(3, 'none', 'hedges');
    Sim.startRound(g);
    g.airdrop = { kind, round: g.turn + 1, done: false };
    g.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(g);
    const words = (g.announce || []).map(a => a.text).join(' | ');
    assert(kind === 'paras' ? /Paratroopers drop in/.test(words) : /Supplies dropped/.test(words), `${kind}: ${words}`);
  }
  Sim.newGame(1);
});

check('the Battle of the Bulge (Steve, 2026-11-16): tanks and infantry (paratroopers, Volksgrenadiers), no tank in the pine forest, every open field reachable, nothing to take, reinforcements on both sides in round 3', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const st = Sim.newGame(seed, 'none', 'bulge');
    const live = st.units.filter(u => u.x !== null);
    assert(['us', 'de'].every(side => live.some(u => u.side === side && u.kind === 'company')), `seed ${seed}: no infantry on one side`);
    assert(live.filter(u => Sim.isTank(u)).every(u => Sim.tileType(u.x, u.y) !== 'orchard'), `seed ${seed}: a tank started in the forest`);
    assert(st.noGoal, 'the Bulge has a goal to take');
    // No tank route goes into the forest
    for (const u of live.filter(o => Sim.isTank(o))) for (const p of Sim.chargeSpots(st, u)) assert(Sim.tileType(p.x, p.y) !== 'orchard', `seed ${seed}: ${u.name} could drive into the forest at ${p.x},${p.y}`);
    assert(Sim.sizeOf(Sim.unitById(st, 'dkt')) === 6, 'the King Tiger does not take 3 by 2 areas');
  }
  // Every open field joined to every other, round the forest
  const map = MAPS.find(m => m.id === 'bulge');
  const open = (x, y) => Sim.inside(x, y) && map.rows[y][x] !== 'o';
  const seen = new Set(['0,2']), todo = [[0, 2]];
  while (todo.length) { const [x, y] = todo.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${x + dx},${y + dy}`; if (open(x + dx, y + dy) && !seen.has(k)) { seen.add(k); todo.push([x + dx, y + dy]); } } }
  let count = 0; for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (open(x, y)) count++;
  assert(seen.size === count, `${count - seen.size} open fields cut off by the forest`);
  // Round 3: both sides' reinforcements
  const g = Sim.newGame(5, 'none', 'bulge');
  Sim.startRound(g);
  g.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(g);
  g.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(g);
  assert(['TD3', 'T5', 'T6', 'dp2'].every(id => Sim.unitById(g, id) && Sim.unitById(g, id).x !== null), 'not every reinforcement came in round 3');
  Sim.newGame(1);
});

check('the Bulge\'s forest says what it is on hover (Steve, 2026-11-16): a pine forest no tank can go into, not an orchard with cover', () => {
  const fieldWords = vm.runInThisContext(`(() => { const PLACE_COVER = ${JSON.stringify({ orchard: { men: 1, tank: 1, shells: 1 } })}; return ${pageCode('main.js', 'function fieldWords(t, forest) {', "\n    return { name: NAMES[t], note: '' };\n  }")}; })()`);
  const pine = fieldWords('orchard', true);
  assert(pine.name === 'Pine forest' && /Tanks can't go in/.test(pine.note) && !/\+1/.test(pine.note), JSON.stringify(pine));
  assert(fieldWords('orchard', false).name === 'Orchard', 'an orchard elsewhere lost its name');
});

// The fixes of 2026-11-21 (Steve): all their checks have "2026-11-21 fix" in their names (node tools/test.js "2026-11-21 fix")
check('2026-11-21 fix: anti-tank rifles and the 88 boom like a tank, not a rifle, shooting and hand to hand', () => {
  for (const [map, kinds] of [['stalingrad', ['boys', 'flak88']], ['dunkirk', ['boys']], ['winterwar', ['lahti']]]) {
    const g = Sim.newGame(1, 'us', map);
    for (const kind of kinds) {
      const u = g.units.find(o => o.kind === kind);
      assert(u, `${map} has no ${kind}`);
      assert(Sim.soundOf(u) === 'rocket', `${map}'s ${kind} sounds like ${Sim.soundOf(u)}`);
    }
  }
  // (riflemen and MGs as they were)
  const g = Sim.newGame(1, 'us', 'stalingrad');
  assert(Sim.soundOf(g.units.find(u => u.kind === 'company')) === 'rifle', 'the rifles changed');
  assert(Sim.soundOf(g.units.find(u => u.kind === 'mg42')) === 'mg42', 'the MG 42 changed');
  // Hand to hand: a blow by the 88 booms, a blow by riflemen cracks (board3d's meleeSound)
  const meleeSound = vm.runInThisContext(`(${pageCode('board3d.js', 'function meleeSound(st, blow) {', '\n  }')})`);
  const gun = g.units.find(u => u.kind === 'flak88'), men = g.units.find(u => u.kind === 'company');
  assert(meleeSound(g, { strikers: [gun.id] }) === 'rocket', 'the 88 cracks like a rifle hand to hand');
  assert(meleeSound(g, { strikers: [men.id] }) === 'rifle', 'riflemen boom hand to hand');
  Sim.newGame(1);
});

check('2026-11-21 fix: a shaken piece that has moved says both on its card', () => {
  const statePill = vm.runInThisContext(`(${pageCode('ui.js', 'function statePill(u, inCover, shaken) {', '\n  }')})`);
  const both = statePill({ shocked: true, acted: true }, 'Taking cover', 'Shaken');
  assert(/Shaken/.test(both) && /Moved this round/.test(both), `a shaken piece that moved says ${both}`);
  const notYet = statePill({ shocked: true, acted: false }, 'Taking cover', 'Shaken');
  assert(/Shaken/.test(notYet) && !/Moved/.test(notYet), `a shaken piece that hasn't moved says ${notYet}`);
  assert(/Moved this round/.test(statePill({ acted: true }, 'Taking cover', 'Shaken')), 'a piece that moved lost its badge');
});

check('2026-11-21 fix: a mine is heard going off, and a move stopped by a mine is heard', () => {
  const startMine = pageCode('board3d.js', 'function startMine(st, f) {', '\n  }');
  assert(/f\.hit\) Sound\.play\('he'/.test(startMine) && /mineMoveSound\(st, f\)/.test(startMine), 'startMine plays no sound');
  // mineMoveSound: heard once when the piece stays in its field or dies; not when it changed field (updatePieces has it)
  const played = [];
  const make = vm.runInThisContext(`((pieces, Sound) => { let mineMoveHeard = new Set(); return ${pageCode('board3d.js', 'function mineMoveSound(st, f) {', '\n  }')}; })`);
  const g = Sim.newGame(1, 'us', 'stalingrad');
  const u = g.units.find(o => o.side === 'us' && o.kind === 'company');
  const tank = g.units.find(o => Sim.isTank(o));
  const pieces = { [u.id]: { userData: { field: u.x + ',' + u.y } }, [tank.id]: { userData: { field: '0,0' } } };
  const mineMoveSound = make(pieces, { play: n => played.push(n) });
  mineMoveSound(g, { to: { id: u.id } });
  mineMoveSound(g, { to: { id: u.id } });
  assert(played.join() === 'run', `stopped in its own field it played ${played.join() || 'nothing'}`);
  // (a tank that drove on into another field: updatePieces hears it)
  mineMoveSound(g, { to: { id: tank.id } });
  assert(played.join() === 'run', `a tank that changed field was heard as well: ${played.join()}`);
  assert(pageCode('board3d.js', 'function startShots(st) {', 'mineMoveHeard = new Set();'), 'the moves heard are never reset');
  Sim.newGame(1);
});

check('2026-11-21 fix: a shaken marker waits for the shot that shook it to land', () => {
  // updatePieces: while the piece is held, the marker shows as it was
  const marks = pageCode('board3d.js', 'const shaken = h && ',"marker(u, ':shock', '#9b2a22', '!', shaken, 'back');");
  assert(marks.includes('h && h.shocked !== undefined ? h.shocked : u.shocked'), 'the marker follows the rules at once');
  // holdBases keeps the marker as it was showing
  const hold = vm.runInThisContext(`((pieces, tokens, held) => { ${pageCode('board3d.js', 'function shockShown(id) {', '\n  }')}; return ${pageCode('board3d.js', 'function holdBases(id, until) {', '\n  }')}; })`);
  const held = {};
  const holdBases = hold({ T1: { visible: true, userData: { bases: [{ visible: true }] } } }, { 'T1:shock': { visible: false } }, held);
  holdBases('T1', 1e12);
  assert(held.T1.shocked === false, 'a tank not yet shown shaken is held as shaken');
  // (and hand to hand)
  assert(pageCode('board3d.js', 'function startMelee(st, f, t0) {', '\n  }').includes('shocked: shockShown(id)'), 'hand to hand shows shaken at once');
});

check('2026-11-21 fix: the 88 shoots the whole length of the board; the PaK keeps its reach', () => {
  const g = Sim.newGame(1, 'us', 'stalingrad');
  const gun = g.units.find(u => u.kind === 'flak88');
  const pak = g.units.find(u => u.kind === 'pak');
  const foe = g.units.find(u => u.side === 'us' && u.kind === 'company');
  // Only the two pieces on the table, so nothing else is in the way
  g.units = [gun, foe];
  // For each pair of fields further apart than the PaK reaches: the farthest the 88 can shoot along a clear line
  let farthest = 0, pakToo = false;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    gun.x = x; gun.y = y;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const dist = Math.hypot(tx - x, ty - y);
      if (dist <= farthest || dist <= RANGES.heavy.sight + 0.01) continue;
      foe.x = tx; foe.y = ty;
      if (!Sim.sight(g, gun, foe)) continue;
      farthest = dist;
      // (the PaK in the 88's place)
      pak.x = x; pak.y = y;
      if (Sim.sight(g, pak, foe)) pakToo = true;
    }
  }
  assert(farthest >= COLS - 2, `the 88's longest shot is ${farthest.toFixed(1)} fields`);
  assert(!pakToo, 'the PaK reaches as far as the 88');
  Sim.newGame(1);
});

check('2026-11-21 fix: the sniper only shakes the 88 and the PaK, never kills them; others still kill a shaken gun', () => {
  const g = Sim.newGame(1, 'us', 'stalingrad');
  const sniper = g.units.find(u => u.side === 'us' && PIECES[u.kind].sniper);
  const gun = g.units.find(u => u.kind === 'flak88');
  const pak = g.units.find(u => u.kind === 'pak');
  assert(sniper, 'Stalingrad has no Soviet sniper');
  // Every die a 6: every shot hits
  g.rand = () => 0.99;
  for (const target of [gun, pak]) {
    for (let k = 0; k < 5; k++) Sim.fireAt(g, sniper, target);
    assert(target.x !== null && target.shocked, `${target.name} was killed by the sniper, or not shaken`);
  }
  // A rifle platoon still kills the shaken 88, as everywhere
  const men = g.units.find(u => u.side === 'us' && u.kind === 'company');
  Sim.fireAt(g, men, gun);
  assert(gun.x === null, 'riflemen no longer kill a shaken 88');
  Sim.newGame(1);
});

check('2026-11-21 fix: a long tank turns to lie towards what it fires at, before it fires, where there is room', () => {
  // (before the dice, Steve: the turn comes ahead of the score its shot needs)
  const fireAtCode = pageCode('sim.js', 'function fireAt(st, shooter, target', 'const need = needFor(st, shooter, target, moving);');
  assert(fireAtCode.includes('lieToward(st, shooter'), 'the long tank turns after the dice');
  const g = Sim.newGame(1, 'us', 'bulge');
  const kt = g.units.find(u => u.kind === 'kingtiger');
  const foe = g.units.find(u => u.side === 'us' && Sim.isTank(u));
  assert(kt && foe, 'the Bulge has no King Tiger, or no American tank');
  // Only the two of them on the table, the King Tiger in the middle of the board lying east to west
  g.units = [kt, foe];
  g.wrecks = []; g.features = [];
  kt.x = 5; kt.y = 4; kt.at = 'n';
  // A target due north, in sight: it turns to lie north to south
  foe.x = 5; foe.y = 3;
  Sim.fireAt(g, kt, foe);
  assert(['e', 'w'].includes(Sim.footprint(kt)[1]), `firing north it lies along ${Sim.footprint(kt).join()}`);
  // A target due east: back to lying east to west
  if (foe.x === null) { foe.x = 6; foe.platoons = 1; } else foe.x = 6;
  foe.y = 4;
  Sim.fireAt(g, kt, foe);
  assert(['n', 's'].includes(Sim.footprint(kt)[1]), `firing east it lies along ${Sim.footprint(kt).join()}`);
  // No room to turn (a piece of its own in a north corner of each north-south half): it stays as it is
  const blocker = { id: 'blk', kind: 'mg42', side: kt.side, x: 5, y: 4, at: 'ne', platoons: 1, quality: 'standard' };
  const blocker2 = { id: 'blk2', kind: 'mg42', side: kt.side, x: 5, y: 4, at: 'nw', platoons: 1, quality: 'standard' };
  kt.at = 's';
  g.units.push(blocker, blocker2);
  // (they don't stand where it is now)
  assert(Sim.fitsAt(g, kt, 5, 4, 's'), 'the blockers are in its way already');
  foe.x = 5; foe.y = 3; foe.platoons = 1;
  Sim.fireAt(g, kt, foe);
  assert(Sim.footprint(kt)[1] === 's', `with no room it turned to ${Sim.footprint(kt).join()}`);
  Sim.newGame(1);
});

check('2026-11-21 fix: in the Bulge no tank starts or comes on as a reinforcement in the pine forest', () => {
  const inForest = g => g.units.filter(u => u.x !== null && Sim.isTank(u) && Sim.tileType(u.x, u.y) === 'orchard').map(u => `${u.name} at ${u.x},${u.y}`);
  // For each of a few games: at the start, then after round 3's reinforcements
  for (let seed = 1; seed <= 6; seed++) {
    const g = Sim.newGame(seed, 'none', 'bulge');
    assert(!inForest(g).length, `seed ${seed} starts with ${inForest(g).join(', ')} in the forest`);
    Sim.startRound(g);
    g.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(g);
    g.bag = { us: 0, de: 0, timer: 0 }; Sim.finishRound(g);
    assert(['TD2', 'TD3', 'T5', 'T6'].some(id => Sim.unitById(g, id)), `seed ${seed}: no reinforcements came`);
    assert(!inForest(g).length, `seed ${seed}: reinforcements ${inForest(g).join(', ')} came on in the forest`);
  }
  Sim.newGame(1);
});

check('2026-11-21 fix: the computer\'s pieces show their Move & shoot hatching area by area, close range and Hail Mary too', () => {
  const g = Sim.newGame(1, 'us', 'bulge');
  // ui.js's moveSpotsFor and shotAreas, with this game as theirs
  const make = vm.runInThisContext(`((st) => { ${pageCode('ui.js', 'function shotAreas(u, p) {', '\n  }')}; return ${pageCode('ui.js', 'function moveSpotsFor(u) {', '\n  }')}; })`);
  const moveSpotsFor = make(g);
  // A German tank with somewhere to move and shoot from
  const tank = g.units.find(u => u.side === 'de' && Sim.isTank(u) && Sim.moveShootSpots(g, u).length);
  assert(tank, 'no German tank has a Move & shoot');
  const hatched = moveSpotsFor(tank).filter(p => p.kind === 'hatch');
  assert(hatched.length, 'no hatching');
  for (const p of hatched) {
    assert(Array.isArray(p.cells) && Array.isArray(p.closeCells) && Array.isArray(p.hailCells), `field ${p.x},${p.y} has no areas`);
    assert(p.cells.join() === Sim.shootCells(g, tank, p.x, p.y).join(), `field ${p.x},${p.y}: the wrong areas`);
  }
  Sim.newGame(1);
});

check('2026-11-21 fix: men on foot turn to face what they fire at (an MG team, riflemen), until they move', () => {
  const g = Sim.newGame(1, 'us', 'stalingrad');
  const mg = g.units.find(u => u.side === 'us' && u.kind === 'mg');
  const men = g.units.find(u => u.side === 'us' && u.kind === 'company');
  const foe = g.units.find(u => u.side === 'de' && u.kind === 'company');
  assert(mg && men && foe, 'missing pieces');
  // A target due north of each: they face north (a quarter turn)
  for (const u of [mg, men]) {
    foe.x = u.x; foe.y = u.y - 1 >= 0 ? u.y - 1 : u.y + 1;
    Sim.fireAt(g, u, foe);
    const want = Math.atan2(-(foe.y - u.y), 0);
    assert(Math.abs(u.faceTo - want) < 1e-9, `${u.name} faces ${u.faceTo}, not ${want}`);
    if (foe.x === null) { foe.x = 0; foe.platoons = 3; }
  }
  // The table: footFacing turns them that way; with nothing fired, the enemy's side
  const footFacing = vm.runInThisContext(`(${pageCode('board3d.js', 'function footFacing(u, g) {', '\n  }')})`);
  assert(footFacing(mg, { userData: { face: 0 } }) === mg.faceTo, 'the MG team on the table still faces the enemy side');
  assert(footFacing({ kind: 'mg', side: 'us' }, { userData: { face: 0 } }) === 0, 'a team that has not fired lost its facing');
  // Tanks and guns keep their own aim
  const tank = g.units.find(u => Sim.isTank(u)), gun = g.units.find(u => u.kind === 'flak88');
  assert(!Sim.facesItsShot(tank) && !Sim.facesItsShot(gun), 'tanks or guns use the men\'s facing');
  // Moving on: back to facing the enemy's side (step clears it)
  const stepCode = pageCode('sim.js', 'function step(st, u, x, y', '\n    u.faceTo = null;');
  assert(stepCode.length > 0, 'a move does not clear the facing');
  Sim.newGame(1);
});

check('2026-11-21 fix: the Finnish infantry\'s card says they have Molotov cocktails against tanks, with the score', () => {
  const g = Sim.newGame(1, 'us', 'winterwar');
  const elite = Sim.unitById(g, 'd1'), plain = Sim.unitById(g, 'd2'), smg = Sim.unitById(g, 'dsmg');
  // The score each die needs charging a tank: 5+, elite 4+
  assert(Sim.molotovNeed(plain) === TO_HIT + MOLOTOV, `a ski platoon needs ${Sim.molotovNeed(plain)}`);
  assert(Sim.molotovNeed(elite) === TO_HIT + MOLOTOV - 1, `the elite platoon needs ${Sim.molotovNeed(elite)}`);
  assert(Sim.molotovNeed(smg) > 0, 'the Suomi section has no Molotovs');
  // Nobody else has them
  assert(!g.units.some(u => !u.molotov && Sim.molotovNeed(u)), 'a piece without Molotovs says it has them');
  // The card (ui.js): "3 vs tanks" on its dice line, a die for each section standing, fewer as sections are lost
  const molotovText = vm.runInThisContext(`(u => { ${pageCode('ui.js', 'const molotov = Sim.molotovNeed(u)', ": '';")} return molotov; })`);
  assert(molotovText(plain).includes('🔥 3 vs tanks') && molotovText(plain).includes('5+'), `a full platoon's card says "${molotovText(plain)}"`);
  plain.platoons = 1;
  assert(molotovText(plain).includes('🔥 1 vs tanks'), `a platoon of one section says "${molotovText(plain)}"`);
  assert(molotovText(Sim.unitById(g, 'dat1')) === '', 'the Lahti team says it has Molotovs');
  assert(pageCode('ui.js', 'const dice = `', ';').includes('${molotov}'), 'the dice line leaves the Molotovs out');
  // Hand to hand: the blow at tanks is marked for the table's bottles and fire (board3d's playMolotovs)
  assert(pageCode('sim.js', 'function handToHand(', 'fight.won =').includes('if (atTanks) a.blow.molotov = true;'), 'the Molotov blow is not marked');
  assert(pageCode('board3d.js', 'function playMelee(f, t, add) {', 'playMolotovs(f, b, t - blowStart(f, k), add)'), 'hand to hand shows no Molotovs');
  // Heard as glass breaking, and the fire catching on a hit, not as rifles (Steve, 2026-11-21)
  const played = [];
  const molotovSounds = vm.runInThisContext(`((Sound, MELEE_LAND, MOLOTOV_LAND, MOLOTOV_GAP) => { const blowLand = b => (b.molotov ? MOLOTOV_LAND : MELEE_LAND); const dieGap = b => (b.molotov ? MOLOTOV_GAP : 0.07); return ${pageCode('board3d.js', 'function molotovSounds(b, wait) {', '\n  }')}; })`)({ play: (n, w) => played.push(n) }, 0.45, 1.15, 0.14);
  molotovSounds({ molotov: true, faces: [{ hit: true }, { hit: false }] }, 0);
  assert(played.join() === 'glass,flames,glass', `the bottles sound like ${played.join()}`);
  assert(pageCode('board3d.js', 'if (b.molotov) {', 'return; }').includes('molotovSounds(b, wait)'), 'a Molotov blow still sounds like rifles');
  // Slower than a plain blow (Steve: to be seen), the bottles landing later
  const timing = pageCode('board3d.js', 'const MOLOTOV_BLOW = ', 'const MOLOTOV_GAP');
  const blow = +/MOLOTOV_BLOW = ([\d.]+)/.exec(timing)[1], land = +/MOLOTOV_LAND = ([\d.]+)/.exec(timing)[1];
  assert(blow > 1.1 && land > 0.45, `a blow of bottles takes ${blow} s and lands at ${land} s`);
  Sim.newGame(1);
});

check('2026-11-22 fix: a tank can\'t strike back at men throwing Molotovs: one blow of bottles, then they stay back', () => {
  // For each roll of the dice: all misses, then all hits
  for (const roll of [0.01, 0.99]) {
    const g = Sim.newGame(1, 'de', 'winterwar');
    g.hedges = {}; g.wire = {};
    const finns = Sim.unitById(g, 'd2');
    const tank = g.units.find(u => u.side === 'us' && Sim.isTank(u) && u.x !== null);
    // Just the two of them, side by side on open ground (a tank never stands in the forest)
    for (const u of g.units) if (u !== finns && u !== tank) u.x = u.y = null;
    let spot = null;
    for (let y = 0; y < ROWS && !spot; y++) for (let x = 0; x < COLS - 1 && !spot; x++) {
      if (Sim.tileType(x, y) !== 'forest' && Sim.tileType(x + 1, y) !== 'forest') spot = { x, y };
    }
    tank.x = spot.x + 1; tank.y = spot.y; finns.x = spot.x; finns.y = spot.y;
    finns.acted = false; finns.shocked = false; finns.platoons = 3;
    g.human = 'de'; g.computer = null;
    g.rand = () => roll;
    const before = g.fx.length;
    const done = Sim.actCharge(g, finns, tank.x, tank.y);
    assert(done.ok, 'the Finns could not charge the tank');
    const fight = g.fx.slice(before).find(f => f.kind === 'melee');
    assert(fight, 'no hand to hand');
    // Only the Finns' bottles: the tank never strikes, and the Finns lose nobody
    assert(fight.strikes.length === 1 && fight.strikes[0].molotov, `the fight has ${fight.strikes.length} blows`);
    assert(fight.strikes.every(b => b.side === 'de'), 'the tank struck back');
    assert(finns.platoons === 3, `the Finns lost sections: ${finns.platoons} left`);
    if (roll < 0.5) {
      // All missed: the tank is still there, the Finns stay back where they were
      assert(tank.x !== null && finns.x === spot.x, 'missing every bottle did not leave them apart');
    } else {
      // Hits: the tank burns, the Finns take its field
      assert(tank.x === null && finns.x === spot.x + 1, 'a hit did not take the tank');
    }
  }
  // The table: the first bottle waits until the charging men have run in, and they are thrown from where the men are
  assert(pageCode('board3d.js', "if (f.kind === 'melee') {", 'startMelee(st, f, t0)').includes('chargeRun(f)'), 'the bottles do not wait for the men');
  assert(pageCode('board3d.js', 'function moloThrowers(b) {', '\n  }').includes('g.position.x + base.position.x'), 'the bottles fly from where the men will stop');
  Sim.newGame(1);
});

check('2026-11-22 fix: in hand to hand the attacker runs into the field it charges, fights there, then goes on or back', () => {
  // board3d's chargeRun and runInToFight, with the table's pieces stubbed
  const FIELD_TIME = { men: 0.5, tank: 0.7 };
  const pieces = {};
  const hedges = new Set();
  const units = { A: { id: 'A', kind: 'company' }, D: { id: 'D', kind: 'company' } };
  const SimStub = { hedge: (st, ax, ay, bx, by) => hedges.has([ax, ay, bx, by].join()), unitById: (st, id) => units[id], isTank: u => u.kind === 'tank' };
  // (a piece's middle: its origin plus the middle of its bases)
  const pieceCentre = u => { const g = pieces[u.id], b = g.userData.bases[0].userData.to; return { x: g.userData.to.x + b.x, z: g.userData.to.z + b.z }; };
  const fn = name => pageCode('board3d.js', `function ${name} {`, '\n  }');
  const consts = pageCode('board3d.js', 'const CHARGE_SETTLE', 'const CHARGE_REACH = { big: 0.22, small: 0.13 };');
  const make = vm.runInThisContext(`((pieces, FIELD_TIME, Sim, pieceCentre) => { ${consts}
    ${fn('chargeRun(f)')}
    ${fn('runInToFight(st, g)')}
    ${fn('fightSpot(st, g, e, offX, offZ)')}
    ${fn('middleOfBases(g)')}
    ${fn('reachOf(u)')}
    ${fn('hedgeHop(a, b, offX, offZ)')}
    return { chargeRun, runInToFight, CHARGE_REACH }; })`);
  const { chargeRun, runInToFight, CHARGE_REACH } = make(pieces, FIELD_TIME, SimStub, pieceCentre);
  // A charge from 2,3 at 3,3, the table still having it at 2,3: one field to run, so the fight waits for it
  pieces.A = { userData: { field: '2,3', to: { x: 2.3, z: 3.6, ry: 0 } } };
  const f = { attacker: 'A', from: { x: 2, y: 3 }, x: 3, y: 3 };
  assert(chargeRun(f) >= FIELD_TIME.men, `the fight waits ${chargeRun(f)} s`);
  // A two-field charge waits longer
  pieces.A.userData.field = '1,3';
  assert(chargeRun(f) >= 2 * FIELD_TIME.men, `a two-field charge waits ${chargeRun(f)} s`);
  // Beaten off: it runs into 3,3, waits there till the fight is over, then back to its own place
  pieces.A.userData = { field: '2,3', to: { x: 2.3, z: 3.6, ry: 0 }, engage: { from: f.from, x: 3, y: 3, until: 1234 } };
  runInToFight({}, pieces.A);
  let way = pieces.A.userData.way;
  assert(way.length === 1 && way[0].x > 3 && way[0].x < 3.5 && way[0].holdUntil === 1234, `the way in is ${JSON.stringify(way)}`);
  assert(Math.abs(way[0].z - 3.6) < 1e-9, 'it lost its place in the field');
  // Over a hedge: up over it on the way in and on the way back
  hedges.add('2,3,3,3');
  pieces.A.userData = { field: '2,3', to: { x: 2.3, z: 3.6, ry: 0 }, engage: { from: f.from, x: 3, y: 3, until: 1 } };
  runInToFight({}, pieces.A);
  way = pieces.A.userData.way;
  assert(way.length === 5 && way[0].y > 0 && way[2].holdUntil === 1 && way[4].y > 0, `over the hedge the way is ${JSON.stringify(way)}`);
  // Won: it is already on its way into the field (with its own climb): the fight point goes on the end, then it stands
  pieces.A.userData = { field: '3,3', to: { x: 3.5, z: 3.5, ry: 0 }, way: [{ x: 2.9, z: 3.5, y: 0.14 }], engage: { from: f.from, x: 3, y: 3, until: 2 } };
  runInToFight({}, pieces.A);
  way = pieces.A.userData.way;
  assert(way.length === 2 && way[1].holdUntil === 2, `a won fight's way is ${JSON.stringify(way)}`);
  // Right up against the other side (Steve, 2026-11-22): the defenders at the far side of 3,3, the attacker's middle
  // just short of theirs, two reaches apart, coming from its place in 2,3
  hedges.clear();
  const base = to => ({ visible: true, userData: { to } });
  pieces.D = { userData: { to: { x: 3, z: 3, ry: 0 }, bases: [base({ x: 0.8, z: 0.3 })] } };
  pieces.A = { userData: { field: '2,3', to: { x: 2, z: 3, ry: 0 }, bases: [base({ x: 0.5, z: 0.5 })], engage: { attacker: 'A', from: f.from, x: 3, y: 3, defenders: ['D'], until: 5 } } };
  runInToFight({}, pieces.A);
  way = pieces.A.userData.way;
  const middle = { x: way[0].x + 0.5, z: way[0].z + 0.5 };
  const apart = Math.hypot(3.8 - middle.x, 3.3 - middle.z);
  assert(Math.abs(apart - 2 * CHARGE_REACH.big) < 1e-9, `the two middles are ${apart} apart`);
  assert(middle.x > 3 && way[0].holdUntil === 5, `it fights from ${JSON.stringify(middle)}`);
  // Wired in: the fight is marked on the attacker, used by updatePieces, and the lunge comes from where it really is
  assert(pageCode('board3d.js', "if (f.kind === 'melee') {", 'continue;').includes('defenders: f.defenders'), 'the attacker is not sent at the defenders');
  assert(pageCode('board3d.js', 'function updatePieces(st) {', 'updateWrecks(st);').includes('runInToFight(st, pieces[u.id])'), 'updatePieces does not send it in');
  assert(pageCode('board3d.js', 'function playMelee(f, t, add) {', '// Hit! or Miss').includes('g.position.x + base.userData.to.x'), 'the lunge is from where it will end up');
});

check('2026-11-22 fix: an MG team lying in ambush faces the nearest enemy', () => {
  const g = Sim.newGame(1);
  g.hedges = {}; g.wire = {};
  const mg = g.units.find(u => u.side === 'us' && u.kind === 'mg' && u.x !== null);
  assert(mg, 'no MG team');
  for (const u of g.units) if (u !== mg) u.x = u.y = null;
  mg.x = 4; mg.y = 6; mg.acted = false; mg.faceTo = null;
  // Two Germans: one further off to the north, one nearer to the east
  const [far, near] = g.units.filter(u => u.side === 'de' && u.kind === 'company');
  far.x = 4; far.y = 1; near.x = 6; near.y = 6;
  g.human = 'us'; g.computer = null; g.drawn = 'us';
  const done = Sim.actAmbush(g, mg);
  assert(done.ok, 'the MG could not lie in ambush');
  assert(Math.abs(mg.faceTo - 0) < 1e-9, `it faces ${mg.faceTo}, not east to the nearest`);
  // After a move too (ambushAfterMoving): the code turns it
  assert(pageCode('sim.js', 'function ambushAfterMoving(st, u) {', '\n  }').includes('faceNearestEnemy(st, u)'), 'moving into ambush does not turn it');
  Sim.newGame(1);
});

check('2026-11-22 fix: every piece faces its nearest enemy after a move, men and tanks', () => {
  const g = Sim.newGame(1);
  g.hedges = {}; g.wire = {};
  const men = Sim.unitById(g, 'A');
  const tank = g.units.find(u => u.side === 'us' && Sim.isTank(u) && u.x !== null);
  for (const u of g.units) if (u !== men && u !== tank) u.x = u.y = null;
  // One German, south of where they go
  const foe = g.units.find(u => u.side === 'de' && u.kind === 'company');
  foe.x = 3; foe.y = 7;
  for (const u of [men, tank]) {
    u.x = 3; u.y = 2; u.acted = false; u.faceTo = null;
    g.human = 'us'; g.computer = null; g.drawn = 'us';
    const spot = Sim.chargeSpots(g, u).find(p => p.x === 3 && p.y === 3);
    assert(spot, `${u.name} can't move south`);
    assert(Sim.actCharge(g, u, 3, 3).ok, `${u.name} did not move`);
    // Facing south (towards y going up the rows: -π/2)
    const facing = Sim.isTank(u) ? u.aim : u.faceTo;
    assert(Math.abs(facing + Math.PI / 2) < 1e-9, `${u.name} faces ${facing}, not the German`);
    u.x = u.y = null;
  }
  Sim.newGame(1);
});

check('2026-11-22 fix: a charge of more than a field that is beaten off shows the way it came on the table', () => {
  const code = pageCode('sim.js', 'function chargeAlong(st, u, route, side) {', '\n  }');
  assert(code.includes('route.slice(0, reached + 1)'), 'a charge stopped short glides straight across the fields');
});

check('2026-11-23 fix: a piece in ambush has one circle of red and yellow stripes, pulsing', () => {
  const code = pageCode('board3d.js', 'function stripedRing(inner, outer) {', '\n  }');
  // A stand-in for three.js: a circle of two triangles a step
  const T = {
    RingGeometry: function (inner, outer, steps) {
      const shape = { attributes: { position: { count: steps * 6 } }, setAttribute: (n, v) => { shape.colours = v; } };
      this.toNonIndexed = () => shape;
    },
    Color: function (hex) { this.r = hex >> 16; this.g = (hex >> 8) & 255; this.b = hex & 255; },
    Float32BufferAttribute: function (list) { return list; },
  };
  const numbers = pageCode('board3d.js', 'const AMBUSH_RED', 'let ambushRings');
  const stripedRing = vm.runInThisContext(`(T => { ${numbers} = []; return ${code}; })`)(T);
  const colours = stripedRing(0.3, 0.37).colours;
  // Each corner red (little green) or yellow (plenty of green), and how often that changes going round
  const yellow = [];
  for (let k = 0; k < colours.length; k += 3) yellow.push(colours[k + 1] > 128);
  const changes = yellow.filter((y, k) => y !== yellow[(k + 1) % yellow.length]).length;
  assert(changes === 16, `${changes} changes of colour round the circle`);
  assert(colours.every((c, k) => k % 3 || c > 200), 'a stripe is neither red nor yellow');
  // The one circle both striped and pulsing
  assert(pageCode('board3d.js', 'function markAmbush(u) {', '\n  }').includes('stripedRing('), 'the ambush circle is not striped');
  assert(pageCode('board3d.js', 'function pulseAmbush(now) {', '\n  }').includes('scale.setScalar'), 'it does not pulse');
});

check('2026-11-21 fix: after a battle the New game screen comes up with the next battle lit; bonus battles go round to the Winter War', () => {
  // main.js's nextInList
  const nextInList = vm.runInThisContext(`(${pageCode('main.js', 'function nextInList(id) {', '\n  }')})`);
  // The campaign: one after another, Paris back to the beach
  for (let k = 0; k < CAMPAIGN.length; k++) assert(nextInList(CAMPAIGN[k]) === CAMPAIGN[(k + 1) % CAMPAIGN.length], `after ${CAMPAIGN[k]} comes ${nextInList(CAMPAIGN[k])}`);
  // The bonus battles: in date order, the last back to the first
  const bonus = BONUS.filter(b => !b.stamp && MAPS.some(m => m.id === b.id)).map(b => b.id);
  assert(bonus[0] === 'winterwar', `the first bonus battle is ${bonus[0]}`);
  for (let k = 0; k < bonus.length - 1; k++) assert(nextInList(bonus[k]) === bonus[k + 1], `after ${bonus[k]} comes ${nextInList(bonus[k])}`);
  assert(nextInList(bonus[bonus.length - 1]) === 'winterwar', `after the last bonus battle comes ${nextInList(bonus[bonus.length - 1])}`);
  // The end opens the New game screen with how it ended, not a Next battle button
  const openResult = pageCode('main.js', 'function openResult() {', '\n  }');
  assert(openResult.includes('chosenMap = nextMapId();') && openResult.includes('askSide(true)'), 'the end does not open the battles with the next one lit');
  const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(!page.includes('again-btn'), 'the Next battle button is still on the page');
  assert(/id="newgame"[\s\S]*id="result"[\s\S]*id="map-choice"/.test(page), 'how it ended is not at the top of the New game screen');
});

check('2026-11-21 fix: a machine-gun team can move and lie in ambush on the same go, yours and the computer\'s, and its card says so', () => {
  // Yours: the .50 cal charges to an empty field, then lies in ambush on the same token
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  Sim.startRound(st);
  st.drawn = 'us';
  const mg = st.units.find(u => u.side === 'us' && u.kind === 'mg');
  const spot = Sim.chargeSpots(st, mg).find(p => !Sim.at(st, p.x, p.y, 'de').length);
  assert(spot, 'the MG has nowhere to go');
  assert(Sim.actCharge(st, mg, spot.x, spot.y).ok, 'the MG would not move');
  // (by itself, Steve 2026-11-22: nothing to choose, and the token is done)
  assert(mg.ambush && !mg.mayAmbush && Sim.activationOver(st), 'the MG did not lie in ambush by itself after moving');
  // Moving within its field too
  const st3 = Sim.newGame(3);
  Sim.startRound(st3);
  st3.drawn = 'us';
  const mg3 = st3.units.find(u => u.side === 'us' && u.kind === 'mg');
  const side = Sim.lineSides(st3, mg3)[0];
  if (side) {
    assert(Sim.actLine(st3, mg3, side).ok, 'the MG would not move within its field');
    assert(mg3.ambush && Sim.activationOver(st3), 'moving within its field, the MG did not lie in ambush');
  }
  // Other pieces moving to another field still can't
  const st2 = Sim.newGame(3);
  st2.hedges = {}; st2.wire = {};
  const men = Sim.unitById(st2, 'A');
  const to = Sim.chargeSpots(st2, men).find(p => !Sim.at(st2, p.x, p.y, 'de').length);
  Sim.actCharge(st2, men, to.x, to.y);
  assert(!men.mayAmbush, 'a rifle platoon may lie in ambush after a charge');
  // The rule is for machine-gun teams only, not bunkers
  assert(Sim.movesThenAmbushes({ kind: 'mg42' }) && Sim.movesThenAmbushes({ kind: 'mg' }), 'the MG 42 or the .50 cal is left out');
  assert(!Sim.movesThenAmbushes({ kind: 'bunker_mg' }) && !Sim.movesThenAmbushes({ kind: 'company' }), 'a bunker or a platoon counts as an MG team');
  // The computer's MG marching up lies in ambush where it gets to (computerMove)
  const move = pageCode('sim.js', 'function computerMove(st, u, route) {', '\n  }');
  assert(move.includes('ambushAfterMoving(st, u)'), 'the computer\'s MG does not lie in ambush after moving');
  // Its card says it does
  const card = pageCode('ui.js', 'const mgAmbush = ', ';');
  assert(card.includes('lies in ambush by itself') && pageCode('ui.js', 'const mgAmbush = ', '[strength, dice, armour, mgAmbush, where, status]'), 'the card says nothing of it');
  Sim.newGame(1);
});

check('2026-11-23: the opponent guns can be looked at: their state this round, and no orders', () => {
  const st = { ammo: { de: { mortars: 2, artillery: 0, bomber: 1 } }, fired: { de: {} }, human: 'us' };
  const gunState = vm.runInThisContext(`(st => (${pageCode('ui.js', 'function gunState(side, which) {', '\n  }')}))`)(st);
  assert(/Ready/.test(gunState('de', 'mortars')), 'a gun still to fire is not Ready');
  assert(/No rounds/.test(gunState('de', 'artillery')), 'an empty gun does not say so');
  st.fired.de = { mortars: true, bomber: 'held' };
  assert(/Fired this round/.test(gunState('de', 'mortars')), 'a gun that fired does not say so');
  assert(/Stayed away this round/.test(gunState('de', 'bomber')), 'a bomber that stayed away says it flew');
  st.fired.de.mortars = 'held';
  assert(/Held fire this round/.test(gunState('de', 'mortars')), 'a gun that held fire says it fired');
  // Looking at one picks no piece and starts no shot
  const view = { sel: 'x', mode: 'go' };
  const inspectGun = vm.runInThisContext(`(view => (${pageCode('ui.js', 'function inspectGun(side, which) {', '\n  }')}))`)(view);
  inspectGun('de', 'mortars');
  assert(view.sel === null && view.mode === null && view.support === 'mortars' && view.supportSide === 'de', JSON.stringify(view));
  // Skip turn marks your own gun as held, and its go as used
  const g = Sim.newGame(3, 'us', 'hedges');
  Sim.startRound(g);
  g.drawn = 'us'; g.human = 'us'; g.activeId = null; g.computer = null;
  g.ammo.us.mortars = 2;
  assert(Sim.skipSupport(g, 'mortars').ok && g.fired.us.mortars === 'held', `skipping left ${g.fired.us.mortars}`);
  Sim.newGame(1);
});

check('2026-11-23: the attackers lose at once when they truly cannot win, and only then', () => {
  // Crossroads town with only these pieces left; the crate long gone
  const table = (keep, ammo = {}, map = 'town') => {
    const st = Sim.newGame(3, 'us', map);
    Sim.startRound(st);
    if (st.airdrop) st.airdrop.done = true;
    for (const u of st.units) if (!keep.includes(u.kind)) u.x = u.y = null;
    st.ammo.us = Object.assign({ mortars: 0, artillery: 0, bomber: 0 }, ammo);
    return st;
  };
  // (only the Americans' own pieces of a kind both sides have)
  const noUs = (st, kinds) => { for (const u of st.units) if (u.side === 'us' && kinds.includes(u.kind)) u.x = u.y = null; return st; };
  // Machine guns hurt men and the Puma, and kill a PaK once it is shaken: it goes on
  const mg = noUs(table(['mg', 'mg42', 'pak', 'puma']), []);
  assert(!Sim.cannotWin(mg), 'a machine gun could still destroy them all');
  // The sniper hurts men, but only pins a PaK, and nothing on a Puma
  assert(!Sim.cannotWin(table(['sniper', 'mg42'])), 'the sniper could still kill the MG teams');
  assert(Sim.cannotWin(table(['sniper', 'mg42', 'pak'])), 'the sniper can never destroy a PaK');
  assert(Sim.cannotWin(table(['sniper', 'puma'])), 'the sniper can never destroy a Puma');
  // Shells: artillery destroys anything; one mortar round only shakes a tank, two can kill it, one if it is shaken
  assert(!Sim.cannotWin(table(['sniper', 'puma'], { artillery: 1 })), 'an artillery round could destroy the Puma');
  assert(Sim.cannotWin(table(['sniper', 'puma'], { mortars: 1 })), 'one mortar round cannot destroy a Puma');
  assert(!Sim.cannotWin(table(['sniper', 'puma'], { mortars: 2 })), 'two mortar rounds could destroy the Puma');
  const shaken = table(['sniper', 'puma'], { mortars: 1 });
  shaken.units.find(u => u.kind === 'puma').shocked = true;
  assert(!Sim.cannotWin(shaken), 'one mortar round could destroy a shaken Puma');
  // Someone to take the goal, an anti-tank weapon, or a crate to fetch: it goes on
  const withCaptain = table(['sniper', 'puma']);
  withCaptain.units.find(u => u.side === 'us' && u.kind === 'captain').x = 1;
  assert(!Sim.cannotWin(withCaptain), 'the captain could still take the goal');
  assert(!Sim.cannotWin(table(['bazooka', 'puma'])), 'the bazooka could still destroy the Puma');
  const crate = table(['sniper', 'puma']);
  crate.crate = { x: 5, y: 4, taken: null };
  assert(!Sim.cannotWin(crate), 'the crate could still give an artillery round');
  crate.crate.taken = 'de';
  assert(Sim.cannotWin(crate), 'a crate the Germans took kept it going');
  // At once, before the next token, not at the end of the round
  const st = table(['sniper', 'puma']);
  assert(Sim.drawToken(st) === null && st.lost && !st.won && /Puma/.test(st.report[0]), `it played on: ${st.report[0]}`);
  // A Sherman the Germans have nothing to hurt with can still win it
  const sherman = table(['sherman', 'mg42']);
  sherman.ammo.de = { mortars: 0, artillery: 0, bomber: 0 };
  assert(!Sim.attackFailed(sherman), 'lost though the Sherman could still destroy every German');
  // Playing the Germans (Steve, 2026-11-27): they win at once too, with a piece nothing American can destroy
  const german = Sim.newGame(3, 'de', 'town');
  Sim.startRound(german);
  if (german.airdrop) german.airdrop.done = true;
  for (const u of german.units) if (!['sniper', 'puma'].includes(u.kind)) u.x = u.y = null;
  german.ammo.us = { mortars: 0, artillery: 0, bomber: 0 };
  assert(/Puma/.test(Sim.attackFailed(german)), 'a German player had to destroy the last American');
  // The Winter War as the Finns: their Vickers left against Soviet riflemen only, no shells; it ends there and then
  const finns = Sim.newGame(3, 'de', 'winterwar');
  Sim.startRound(finns);
  for (const u of finns.units) if (!(u.side === 'de' && u.kind === 'vickers6t') && !(u.side === 'us' && u.kind === 'company')) u.x = u.y = null;
  finns.ammo.us = { mortars: 0, artillery: 0, bomber: 0 };
  assert(finns.units.some(u => u.side === 'de' && u.x !== null) && finns.units.some(u => u.side === 'us' && u.x !== null), 'the Vickers or the Soviet riflemen missing');
  assert(Sim.drawToken(finns) === null && finns.lost && !finns.won, `the Finns played on: ${finns.report && finns.report[0]}`);
  // A Soviet mortar round or two still to come could destroy it: it goes on
  const shells = Sim.newGame(3, 'de', 'winterwar');
  Sim.startRound(shells);
  for (const u of shells.units) if (!(u.side === 'de' && u.kind === 'vickers6t') && !(u.side === 'us' && u.kind === 'company')) u.x = u.y = null;
  shells.ammo.us = { mortars: 2, artillery: 0, bomber: 0 };
  assert(!Sim.attackFailed(shells), 'the Finns won though two Soviet mortar rounds could destroy the Vickers');
  // The beach: riflemen can storm a bunker, a machine gun cannot
  const beach = kind => {
    const b = table(['bunker_mg'], {}, 'beach');
    b.units.find(u => u.side === 'us' && u.kind === kind).x = 1;
    return b;
  };
  assert(!Sim.cannotWin(beach('company')), 'riflemen could still storm the bunkers');
  assert(Sim.cannotWin(beach('mg')), 'a machine gun cannot destroy a bunker');
  Sim.newGame(1);
});

check('2026-11-24 fix: any piece can take cover on its own token, not tanks, not after moving; +2', () => {
  // A platoon and an MG team on the table, no bag
  const st = tableWith({ A: [0, 5], mg1: [2, 5], d1: [8, 5] });
  const A = Sim.unitById(st, 'A');
  assert(Sim.canTakeCover(st, A), 'a platoon not fired on could not take cover');
  assert(Sim.actTakeCover(st, A).ok && A.down && A.acted, 'it did not get down, or kept its move');
  assert(!Sim.actTakeCover(st, A).ok, 'it took cover twice');
  // One that has moved can't
  const mg = Sim.unitById(st, 'mg1');
  mg.acted = true;
  assert(!Sim.canTakeCover(st, mg), 'a piece that had moved could take cover');
  // The shot at it needs two more
  const d1 = Sim.unitById(st, 'd1');
  const down = Sim.shotNeed(st, d1, A);
  A.down = false;
  assert(down - Sim.shotNeed(st, d1, A) === 2, 'taking cover was not +2');
  // A tank can't
  const tanks = tableWith({ T1: [0, 5], d1: [8, 5] });
  assert(!Sim.canTakeCover(tanks, Sim.unitById(tanks, 'T1')), 'a tank could take cover');
  // With the bag: only on your own token, and it uses it
  const bag = tableWith({ A: [0, 5], d1: [9, 1] });
  Sim.startRound(bag);
  const bagA = Sim.unitById(bag, 'A');
  bag.drawn = 'de';
  assert(!Sim.canTakeCover(bag, bagA), 'it took cover on a German token');
  bag.drawn = 'us';
  assert(Sim.actTakeCover(bag, bagA).ok && Sim.activationOver(bag), 'the token was not used');
  // In its pop-up menu
  assert(pageCode('ui.js', 'function openMenu(', 'menu.append(b)').includes("'cover'"), 'not in the pop-up menu');
});

check('2026-11-24 fix: the computer holding the goal takes cover when an enemy could fire on it and it has no shot', () => {
  // A Sherman beside a German platoon in the goal, which can't hurt it
  const st = Sim.newGame(1);
  st.hedges = {}; st.wire = {};
  const tank = st.units.find(u => u.side === 'us' && Sim.isTank(u) && u.x !== null);
  const men = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== tank && u !== men) u.x = u.y = null;
  men.x = st.objective.x; men.y = st.objective.y; men.reserve = true; men.shocked = false;
  tank.x = men.x - 1; tank.y = men.y;
  assert(Sim.targets(st, tank).includes(men), 'the tank has no shot at them: the check is set up wrong');
  st.ammo.de = { mortars: 0, artillery: 0, bomber: 0 };
  startGermanRound(st);
  Sim.computerStep(st);
  assert(men.down, 'they did not take cover');
  Sim.newGame(1);
});

check('2026-11-24 fix: a machine gun rolls five dice; only a 6 in a Hail Mary adds a die', () => {
  const st = tableWith({ A: [2, 5], dmg1: [8, 5] });
  const A = Sim.unitById(st, 'A'), mg = Sim.unitById(st, 'dmg1');
  let rerolls = 0;
  for (let i = 0; i < 400; i++) {
    // Next to each other, then across the table (and in cover, for the Hail Marys)
    A.x = 2; A.y = 5; A.platoons = 3; A.shocked = false; A.down = i % 2 === 1;
    mg.x = i % 3 === 0 ? 3 : 9; mg.y = 5; mg.shocked = i % 4 === 1;
    st.fx = [];
    // (on the move every other time: one more needed, so Hail Marys come up)
    Sim.fireAt(st, mg, A, false, i % 2 === 1);
    const shot = st.fx.find(f => f.faces && f.from && f.from.id === mg.id);
    const again = shot.faces.filter(f => f.lead).length;
    rerolls += again;
    assert(shot.faces.length - again === 5, `it rolled ${shot.faces.length - again} dice`);
    assert(!again || shot.need > 6, 'a die was rolled again without a Hail Mary');
  }
  assert(rerolls, 'no Hail Marys came up: the check is set up wrong');
});

check('2026-11-24 bubbles: the red bubbles keep clear of the grey word bubble and the dice tags; the menu and hover box keep clear of them', () => {
  const Labels = require('../js/labels.js');
  const bounds = { x: 0, y: 0, w: 1600, h: 820 };
  // One target, a ring of spots round it, and a grey bubble over all of the near ones on its right
  const options = [];
  for (const ring of [90, 140, 200, 260]) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, mx = 700 + ring * Math.cos(a), my = 400 + ring * Math.sin(a);
    options.push({ mid: { x: mx, y: my }, box: { x: mx - 45, y: my - 35, w: 90, h: 70 } });
  }
  const item = { id: 1, aim: { x: 700, y: 400 }, circles: [{ x: 700, y: 400, r: 22 }], options };
  // Where it goes with nothing in the way, then with a grey bubble on that very spot
  const free = options[Labels.place([item], bounds)[0]].box;
  const grey = { x: free.x - 10, y: free.y - 10, w: 300, h: 60 };
  const moved = options[Labels.place([item], bounds, [grey])[0]].box;
  assert(Labels.boxOnBox(free, grey) && !Labels.boxOnBox(moved, grey), 'the red bubble stayed under the grey one');
  // The menu, with no clear spot: fields to move to go before a red bubble, as ui.js weighs them
  const weights = pageCode('ui.js', 'const MENU_WEIGHT = {', '};');
  const important = Number(/important: (\d+)/.exec(weights)[1]);
  const lit = [{ x: 0, y: 0, w: 1600, h: 800, weight: 1 }, { x: 0, y: 0, w: 800, h: 800, weight: 1 }, { x: 900, y: 360, w: 90, h: 70, weight: important }];
  const menu = Labels.menuSpot({ w: 160, h: 90 }, { x: 800, y: 400 }, lit, { width: 1600, height: 800 });
  assert(!Labels.boxOnBox(menu, lit[2]), 'the menu covered a red bubble');
  // Wired in: the grey bubble is made first and its box handed to the red ones; the page looks again after each change
  const marks = pageCode('board3d.js', 'function buildMarks(st, view) {', 'view.hotTarget, inTheWay)');
  assert(marks.indexOf('computerMoveMark(') < marks.indexOf('markTargets('), 'the grey bubble is placed after the red ones');
  assert(pageCode('main.js', 'const more = Board.render', 'requestAnimationFrame(frame)').includes('clearRedBubbles()'), 'the page never looks again');
});

check('2026-11-24 facing: men turn to the nearest enemy they can hurt, not a tank unless they have anti-tank weapons or Molotovs', () => {
  // A German tank just to the east, German men further off to the south
  const facing = (id, tankKind, molotov) => {
    const g = Sim.newGame(1);
    g.hedges = {}; g.wire = {};
    const u = Sim.unitById(g, id);
    const tank = g.units.find(o => o.side === 'de' && Sim.isTank(o));
    const men = g.units.find(o => o.side === 'de' && o.kind === 'company');
    for (const o of g.units) if (![u, tank, men].includes(o)) o.x = o.y = null;
    if (tankKind) tank.kind = tankKind;
    u.molotov = molotov;
    u.x = 4; u.y = 4; u.acted = false; u.faceTo = null;
    tank.x = 5; tank.y = 4; men.x = 4; men.y = 7;
    g.human = 'us'; g.computer = null; g.drawn = 'us';
    assert(Sim.actAmbush(g, u).ok, `${id} could not lie in ambush`);
    return u.faceTo;
  };
  const east = 0, south = -Math.PI / 2;
  const faces = (got, want) => Math.abs(got - want) < 1e-9;
  assert(faces(facing('A'), south), 'riflemen faced a tank');
  assert(faces(facing('mg1'), south), 'a machine gun faced a tank');
  assert(faces(facing('bz1'), east), 'a bazooka did not face the tank');
  assert(faces(facing('A', null, true), east), 'men with Molotovs did not face the tank');
  // An armoured car: a machine gun hurts it, rifles don't
  assert(faces(facing('mg1', 'puma'), east), 'a machine gun did not face an armoured car');
  assert(faces(facing('A', 'puma'), south), 'riflemen faced an armoured car');
  Sim.newGame(1);
});

check('2026-11-27: a piece\'s card lists what marks it out at the bottom (small gun, fast, slow, MG turrets, armoured car, long), never hedge cutters', () => {
  const marks = kind => Sim.traitLines({ kind }).join(' | ');
  // The Stuart: a small gun and fast
  assert(marks('stuart').includes('Small gun: needs 1 more to hit a tank') && marks('stuart').includes('Fast: 1 field further'), `the Stuart says "${marks('stuart')}"`);
  // The Sherman 75mm: nothing to mark out
  assert(marks('sherman') === '', `the Sherman says "${marks('sherman')}"`);
  // Slow, long, the T-35's turrets, an armoured car, the aerosan's two fields
  assert(marks('kingtiger').includes('Slow: 1 field less') && marks('kingtiger').includes('Long'), `the King Tiger says "${marks('kingtiger')}"`);
  assert(marks('t35').includes('Extra MG turrets') && marks('t35').includes('(2 dice)'), `the T-35 says "${marks('t35')}"`);
  assert(marks('puma').includes('Armoured car'), `the Puma says "${marks('puma')}"`);
  assert(marks('aerosan').includes('Fast: 2 fields further'), `the aerosan says "${marks('aerosan')}"`);
  // Every piece, and none says hedge cutters
  assert(!Object.keys(PIECES).some(kind => /cutter/i.test(marks(kind))), 'a piece says hedge cutters');
  // The card (ui.js) shows them at the bottom, under the buttons, and no longer says hedge cutters
  assert(pageCode('ui.js', 'const traitList = Sim.traitLines(u);', 'box.insertBefore(acts, traitList.length ? traits : null);'), 'the card does not show the markers at the bottom');
  assert(!fs.readFileSync(path.join(__dirname, '..', 'js', 'ui.js'), 'utf8').includes("' · hedge cutters'"), 'the card still says hedge cutters');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
