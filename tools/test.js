// Headless checks of the rules in js/sim.js: node tools/test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
load('data.js'); load('sim.js');
const { play, playAsGermans } = require('./bot.js');

let failed = 0;
function check(name, fn) {
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

check('every script on the page parses (a slip in one stops the whole game loading)', () => {
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js')).filter(n => n.endsWith('.js'))) {
    try { new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f }); }
    catch (e) { throw new Error(`${f}: ${e.message}`); }
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
    assert(st.ammo.mortars >= 0 && st.ammo.artillery >= 0, `seed ${seed}: negative ammunition`);
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
  const key = (ax, ay, bx, by) => (ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`);
  const setUp = (u, y) => { u.x = 0; u.y = y; const k = key(0, y, 1, y); delete st.hedges[k]; delete st.wire[k]; return k; };
  const k1 = setUp(sher, 0); st.hedges[k1] = true;
  assert(Sim.actCharge(st, sher, 1, 0).ok && sher.x === 1, 'the Sherman could not drive through the hedge');
  assert(!st.hedges[k1], 'the Sherman left the hedge standing');
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
      Sim.endTurn(st);
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
    Sim.startGermanHour(st);
    const down = [];
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) {
      const t = Sim.unitById(st, r.ask.target), where = [t.x, t.y];
      Sim.answer(st, true);
      if (t.x !== null) { assert(t.x === where[0] && t.y === where[1], `${t.name} moved when taking cover`); assert(t.down, `${t.name} is not down in cover`); down.push(t); }
    }
    Sim.finishHour(st);
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
  us.x = 0; us.y = 6; de.x = 1; de.y = 6; us.at = null; de.at = null;
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
    Sim.startGermanHour(st);
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
  assert(Sim.sees(st, 'us', far.x, far.y), 'a piece could not see the far end of an open lane (moved this round, too)');
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
    if (T1.x === 5) snagged++;
    else assert(T1.x === 6, `seed ${seed}: the tank stopped at ${T1.x}`);
  }
  assert(runs > 50 && snagged > runs * 0.2 && snagged < runs * 0.47, `snagged ${snagged} of ${runs}`);
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
  assert(Sim.shellWhy(st, pan).includes('+1 armour') && Sim.shellNeed(st, pan) === TO_HIT + 1, 'shells on the Panther ignore its armour');
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
  Sim.fireAt(st, mg, de, 1);
  assert(de.x === null || de.down, 'a shaken German under machine-gun fire did not take cover');
  // One that has moved can't
  const st2 = Sim.newGame(4);
  st2.hedges = {}; st2.wire = {};
  const mg2 = Sim.unitById(st2, 'mg1'), de2 = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st2.units) if (u !== mg2 && u !== de2) u.x = u.y = null;
  mg2.x = 0; mg2.y = 6; mg2.at = null; de2.x = 1; de2.y = 6; de2.at = null; de2.shocked = true; de2.acted = true;
  Sim.fireAt(st2, mg2, de2, 1);
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
  Sim.fireAt(st, mg, A, 1, true);
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
  Sim.fireAt(st2, mg2, A2, 1, false);
  assert(st2.fx[0].faces.length === 5, 'standing fast, the MG did not roll five dice');
});

check('a piece that took cover cannot act this round, and the cover wears off next round, on a token or not', () => {
  const st = Sim.newGame(3);
  Sim.startRound(st);
  const A = Sim.unitById(st, 'A'), mg = st.units.find(u => u.side === 'de' && u.kind === 'mg42');
  st.drawn = 'us'; st.activeId = null;
  Sim.fireAt(st, mg, A, 1, true);
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
  for (let heading = 0; heading < BOMBER.directions; heading++) for (const e of Sim.bomberEdges()) {
    const line = Sim.bomberLine(e.x, e.y, heading);
    assert(line.some(f => f.x === e.x && f.y === e.y), `heading ${heading} missed its field`);
    for (let k = 1; k < line.length; k++) {
      const step = Math.abs(line[k].x - line[k - 1].x) + Math.abs(line[k].y - line[k - 1].y);
      assert(step >= 1 && step <= 2, `heading ${heading} from ${e.x},${e.y} jumped ${step}`);
    }
  }
  assert(Sim.bomberEdges().length === 2 * COLS + 2 * ROWS - 4, 'not every edge field can be chosen');
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
  assert(st.ammo.bomber === 0, 'the run was not used');
  assert(!Sim.actFire(st, 'bomber', 3, 7).ok, 'it flew twice');
  // Out of runs: no token next round
  const pieces = st.units.filter(u => u.side === 'us' && u.x !== null && !u.acted).length;
  st.fired = {};
  Sim.startRound(st);
  assert(st.bag.us === pieces + 2, 'a bomber with no run left still has a token');
});

check('the bomber only goes through an edge field, on your token; the score adds cover and take cover', () => {
  const st = tableWith({ A: [7, 4] });
  assert(!Sim.actFire(st, 'bomber', 5, 4).ok, 'it flew through a field in the middle of the board');
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
  assert(st.ammo.bomber === 1 && st.fired.bomber && st.activeId === 'gun:bomber', 'staying away used the run or kept the token');
  Sim.endRound(st);
  Sim.startRound(st);
  assert(Sim.tokensHome(st).us.from.some(w => w.gun === 'bomber') && st.bag.us === 1 + 3, 'it did not get a token next round');
});

check('the German bomber: your pieces under the line are each asked, then it flies once; its line is worth flying', () => {
  const st = tableWith({ A: [3, 7], B: [3, 5], C: [3, 3], d1: [9, 1] });
  Sim.startRound(st);
  st.spin.de = 0;
  st.deFired = {};
  st.drawn = 'de';
  st.computer = { queue: [], mortar: false, artillery: false, bomber: true, rep: [], ask: null, move: { gun: 'bomber', what: '' } };
  const asked = [];
  let r = Sim.computerStep(st);
  while (r.ask) {
    assert(r.ask.bombed, 'it asked about something else');
    assert(st.deBomberAmmo === 1, 'the bombs fell before everyone was asked');
    asked.push(r.ask.target);
    Sim.answer(st, r.ask.target === 'B');
    r = Sim.computerStep(st);
  }
  assert(r.done, 'the run did not end');
  assert(asked.length === 3 && asked.includes('A') && asked.includes('B') && asked.includes('C'), `asked ${asked.join(', ')}`);
  assert(st.deBomberAmmo === 0, 'the run was not used');
  const bombs = st.fx.filter(f => f.kind === 'bomb' && f.side === 'de');
  assert(bombs.length === 3, `${bombs.length} bombs fell`);
  assert(bombs.find(f => f.to.id === 'B').need === BOMBER.need + TAKE_COVER, 'taking cover did not count');
  assert(Sim.unitById(st, 'B').down, 'B did not get down');
  // Nothing worth bombing: it stays away and keeps its run
  const quiet = tableWith({ A: [3, 7], d1: [9, 1] });
  Sim.startRound(quiet);
  quiet.spin.de = 0;
  quiet.computer = { queue: [], mortar: false, artillery: false, bomber: true, rep: [], ask: null, move: { gun: 'bomber', what: '' } };
  assert(Sim.computerStep(quiet).done && quiet.deBomberAmmo === 1, 'it flew for one piece');
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

check('ambush: fires as soon as an enemy comes into sight along its move; a shaken piece stops there and can still shoot', () => {
  const { st, d1 } = ambushOnLane({ A: [2, 5] }, 7);
  const A = Sim.unitById(st, 'A');
  st.rand = HIGH;
  // Two fields along the lane: seen from the first (four fields from the ambush), shaken, and stops
  const r = Sim.actMoveShoot(st, A, 4, 5);
  assert(r.ok, 'the move was refused');
  assert(A.x === 3 && A.shocked, `it ended at ${A.x} (shaken: ${A.shocked})`);
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

check('ambush: a charge stopped short gets no fight; a piece killed on the way stays dead', () => {
  const { st } = ambushOnLane({ A: [4, 5] }, 7);
  const A = Sim.unitById(st, 'A');
  st.rand = HIGH;
  // Charging the ambusher itself: shaken as it sets off, already in sight
  assert(Sim.actCharge(st, A, 7, 5).ok, 'the charge was refused');
  assert(A.x === 4 && A.shocked && !st.fx.some(f => f.kind === 'melee'), `it reached ${A.x}`);
  assert(!A.halfShot, 'a charge got a shot');
  // A team already shaken: this hit kills it, and it doesn't come back at the goal
  const two = ambushOnLane({ bz1: [3, 5] }, 7);
  const bz = Sim.unitById(two.st, 'bz1');
  bz.shocked = true;
  two.st.rand = HIGH;
  assert(Sim.actCharge(two.st, bz, 5, 5).ok, 'the second charge was refused');
  assert(bz.x === null, `the team is at ${bz.x}`);
});

check('ambush: shaken in a field of friends it can only pass through, it stops at the next field it can', () => {
  // A tank fills the field, so the platoon can only pass through
  const { st } = ambushOnLane({ A: [2, 5], T1: [3, 4] }, 7);
  const A = Sim.unitById(st, 'A'), T1 = Sim.unitById(st, 'T1');
  T1.y = 5;
  st.rand = HIGH;
  assert(!Sim.roomFor(st, A, 3, 5), 'there is room beside the tank');
  assert(Sim.actMoveShoot(st, A, 4, 5).ok, 'the move was refused');
  assert(A.x === 4, `it ended at ${A.x}`);
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

check('the Germans: every American under their artillery is asked, then it fires once', () => {
  const st = tableWith({ A: [3, 5], B: [3, 4], C: [0, 0], d2: [9, 5], dcap: [11, 7] });
  const before = st.deArtilleryAmmo;
  st.computer = { queue: [], mortar: false, artillery: true, bomber: false, rep: [], ask: null, move: { gun: 'artillery', what: '' } };
  const asked = [];
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) {
    assert(st.deArtilleryAmmo === before, 'it fired before everyone was asked');
    asked.push(r.ask.target);
    Sim.answer(st, r.ask.target !== asked[0]);
  }
  assert(asked.length === 2 && asked.includes('A') && asked.includes('B'), `asked ${asked.join(', ')}`);
  assert(st.deArtilleryAmmo === before - 1, 'it did not fire once');
  // The one that got down needs two more; the one that stood fast doesn't
  const down = asked[1], stood = asked[0];
  const need = id => st.fx.find(f => f.kind === 'shell' && f.to && f.to.id === id).need;
  assert(Sim.unitById(st, down).down && need(down) === need(stood) + TAKE_COVER, 'taking cover did not count');
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

check('endings: no rifle platoon and nothing to hurt the German tanks loses at the end of the round; otherwise it goes on', () => {
  const noAmmo = st => { st.ammo.mortars = 0; st.ammo.artillery = 0; st.ammo.bomber = 0; };
  // A sniper against a tank, nothing left off the board: lost
  const lost = tableWith({ sn1: [0, 0], dt1: [11, 7] });
  noAmmo(lost);
  Sim.endRound(lost);
  assert(lost.lost && !lost.draw, 'it played on with no way to win');
  // A round of mortars left, a bazooka, a rifle platoon, or no German tanks: it goes on
  const rounds = tableWith({ sn1: [0, 0], dt1: [11, 7] });
  noAmmo(rounds); rounds.ammo.mortars = 1;
  Sim.endRound(rounds);
  assert(!rounds.lost, 'lost with a mortar round left');
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
  for (let k = 0; k < 30 && cap.x !== null; k++) Sim.fireAt(st, de, cap, 1);
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
  assert(g.de.platoons === 1, `three rifle hits on a fresh platoon should shake it with the first and kill with the next two (it has ${g.de.platoons})`);
  g = setUp(); g.de.shocked = true;
  Sim.actShoot(g.st, g.A, g.de);
  assert(g.de.x === null, 'three hits on a shaken platoon did not wipe it out');
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
  Sim.startGermanHour(st);
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  Sim.finishHour(st);
  assert(st.won, 'wiping out the Germans did not win');
  const st2 = Sim.newGame(6);
  for (const u of st2.units) if (u.kind === 'company' && u.side === 'us') { u.x = null; u.y = null; }
  Sim.startGermanHour(st2);
  for (let r = Sim.computerStep(st2); !r.done; r = Sim.computerStep(st2)) Sim.answer(st2, false);
  Sim.finishHour(st2);
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
  Sim.startGermanHour(st);
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
  // The sniper ignores cover and range: a far target in a village needs just 3+
  const tgt = { x: 4, y: 4, kind: 'company', side: 'de', at: 'w', down: true };
  sn.quality = 'standard'; sn.shocked = false;
  assert(Sim.needFor(st, sn, tgt) === TO_HIT, 'the sniper was slowed by cover or range');
});

check('the German artillery shells Americans it can see, clear of its own men, and runs out', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== B && u !== de) u.x = u.y = null;
  // In the lane row, three fields apart: seen, and not next to the Germans
  B.x = 0; B.y = 2; B.at = null; de.x = 3; de.y = 2; de.at = null;
  const before = st.deArtilleryAmmo;
  Sim.startGermanHour(st);
  for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
  assert(st.deArtilleryAmmo === before - 1, 'the German artillery did not fire');
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
  const usGuns = ['mortars', 'artillery', 'bomber'].filter(w => st.ammo[w] > 0).length, deGuns = (st.deMortarAmmo > 0) + (st.deArtilleryAmmo > 0) + (st.deBomberAmmo > 0);
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
  st.ammo.mortars = 0;
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
  assert(Sim.shellNeed(st, t) === TO_HIT && !Sim.shellWhy(st, t).length, 'shells on men in the open needed more than the start');
  t.down = true;
  assert(Sim.shellNeed(st, t) === TO_HIT + TAKE_COVER && Sim.shellWhy(st, t).includes('+2 take cover'), 'shells ignored men down in cover');
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
  assert(Sim.shellNeed(st0, target) === TO_HIT + 1, 'shells on the village needed more than +1');
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
    Sim.fireAt(st, mg, A, 1);
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
  for (let k = 0; k < 20 && last.x !== null; k++) Sim.fireAt(st, A, last, 1);
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

check('hand to hand: blows in turn, attacker first, until one side is gone; shaken lasts past the fight', () => {
  let won = 0, lost = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = Sim.newGame(seed);
    st.hedges = {}; st.wire = {};
    const A = Sim.unitById(st, 'A'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (u !== A && u !== de) u.x = u.y = null;
    // A standard platoon against the elite Fallschirmjäger, so it can go either way
    A.x = 2; A.y = 6; A.at = null; A.acted = false; A.shocked = true; A.quality = 'standard';
    de.x = 3; de.y = 6; de.at = null; de.shocked = true;
    // (being shaken doesn't stop a charge in this check)
    A.shocked = false;
    const r = Sim.actCharge(st, A, 3, 6);
    assert(r.ok, `seed ${seed}: the charge was refused`);
    const aLeft = A.x !== null, dLeft = de.x !== null;
    assert(aLeft !== dLeft, `seed ${seed}: both sides (or neither) came out of the fight`);
    if (aLeft) won++;
    else { lost++; assert(de.shocked, 'the fight cleared the defender\'s shaken (only a rally does)'); }
    if (aLeft) assert(A.x === 3 && A.y === 6, `seed ${seed}: the winner did not take the field`);
    assert(/hit/.test(r.lines[0]), `seed ${seed}: no blows reported`);
  }
  assert(won > 0 && lost > 0, `the attacker won ${won} and lost ${lost} of 40: one side always wins`);
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
      Sim.startGermanHour(st);
      for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, false);
      Sim.finishHour(st);
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
  st.ammo.mortars = 0; st.ammo.artillery = 0; st.deArtilleryAmmo = 0; st.deMortarAmmo = 0;
  for (let k = 0; k < 6; k++) { Sim.endRound(st); Sim.startRound(st); }
  assert(st.ammo.mortars === 0 && st.ammo.artillery === 0, 'your guns got more rounds');
  assert(st.deArtilleryAmmo === 0 && st.deMortarAmmo === 0, 'the German guns got more rounds');
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
  st.deMortarAmmo = st.deArtilleryAmmo = st.deBomberAmmo = 0;
  u.post = null; u.reserve = true; u.quality = 'standard'; u.x = 3; u.y = 0; u.at = null;
  // One field past rifle range where it stands, so a move puts it in range. The objective is far from both
  A.x = 3; A.y = 5; A.at = null; A.acted = true;
  st.objective = { x: 11, y: 7, name: 'Test' };
  return { st, u, A };
}
// Give one German piece its token and run it to the end, standing fast. Returns the first plan aimed
function germanToken(st, u, showAim = false) {
  Sim.startGermanHour(st);
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
  Sim.startGermanHour(st);
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

check('an ambush can stop a German Move & shoot, and it goes no further', () => {
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
    Sim.startGermanHour(st);
    st.computer.queue = []; st.computer.artillery = false; st.computer.bomber = false; st.computer.mortar = true; st.computer.move = { gun: 'mortars', what: '' };
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) if (r.ask) Sim.answer(st, false);
  }
  const shell = st.fx.find(f => f.kind === 'shell' && f.to && f.to.id === tank.id);
  return { tank, shell };
}

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
    Sim.startGermanHour(st);
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
  st.human = 'de';
  return st;
}
// A token of a given side, as the bag would give it (no guns left, so it goes to a piece)
function tokenFor(st, side) {
  st.ammo = { mortars: 0, artillery: 0, bomber: 0 };
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
  assert(st.ammo.mortars > 0 && st.ammo.artillery > 0 && st.ammo.bomber > 0, 'this needs American guns still to fire');
  Sim.remove(st, Sim.unitById(st, 'A'));
  assert(st.lost && !st.won && !st.draw, 'the Germans did not win with only guns left against them');
});

check('playing the Germans: an American piece left means no win yet, even with nothing that can hurt your tanks', () => {
  const st = tableAsGermans({ mg1: [1, 1], dt1: [9, 3] });
  st.ammo.mortars = st.ammo.artillery = st.ammo.bomber = 0;
  Sim.finishHour(st);
  assert(!st.won && !st.lost, 'the game ended with an American piece still on the table');
  // Playing the Americans the same table is a loss, as it always was
  const us = tableWith({ mg1: [1, 1], dt1: [9, 3] });
  us.ammo.mortars = us.ammo.artillery = us.ammo.bomber = 0;
  Sim.finishHour(us);
  assert(us.lost, 'the Americans should still lose here');
});

check('playing the Germans: you lose if an American platoon holds the village at the end of a round', () => {
  const start = Sim.newGame(5, 'de');
  const o = start.objective;
  const st = tableAsGermans({ A: [o.x, o.y], d2: [0, 0] }, 5);
  Sim.finishHour(st);
  assert(st.won && !st.lost, 'the Americans did not win by holding the village');
});

check('playing the Germans: your guns use German rounds, one fire a round, on your token only', () => {
  const st = tableAsGermans({ A: [8, 3], d1: [9, 3] });
  const us = { ...st.ammo };
  Sim.startRound(st);
  st.drawn = 'us';
  assert(!Sim.canFire(st, 'artillery'), 'your guns could fire on the computer\'s token');
  st.drawn = 'de';
  const before = st.deArtilleryAmmo;
  assert(Sim.canFire(st, 'artillery'), 'your guns could not fire on your token');
  const r = Sim.actFire(st, 'artillery', 8, 3);
  assert(r.ok, 'the German battery would not fire on an American in plain view');
  assert(st.deArtilleryAmmo === before - 1, 'it did not use a German round');
  assert(st.ammo.artillery === us.artillery, 'it used an American round');
  assert(st.deFired.artillery && !st.fired.artillery, 'it was marked on the wrong side');
  st.activeId = null;
  assert(!Sim.canFire(st, 'artillery'), 'it could fire twice in a round');
});

check('playing the Germans: your mortars drop on the one piece, three dice, as the computer\'s always have', () => {
  const st = tableAsGermans({ A: [8, 3], B: [8, 3], d1: [9, 3] });
  const A = Sim.unitById(st, 'A'), B = Sim.unitById(st, 'B');
  A.at = 'nw'; B.at = 'se';
  Sim.startRound(st);
  st.drawn = 'de';
  const before = st.deMortarAmmo;
  const r = Sim.actFire(st, 'mortars', 8, 3, B);
  assert(r.ok, 'the mortars would not fire');
  assert(st.deMortarAmmo === before - 1, 'it did not use a mortar round');
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

check('the American computer: its shells ask every German piece under them, and use American rounds', () => {
  // (along the lane, so the American platoon sees them)
  const st = tableAsGermans({ A: [0, 2], d1: [6, 2], d2: [6, 3] });
  Sim.startRound(st);
  st.drawn = 'us';
  st.fired = {};
  st.computer = { queue: [], mortar: false, artillery: true, bomber: false, rep: [], ask: null, move: { gun: 'artillery', what: '' } };
  const before = st.ammo.artillery, german = st.deArtilleryAmmo;
  const asked = runComputerToken(st);
  assert(st.ammo.artillery === before - 1, 'it did not fire once');
  assert(st.deArtilleryAmmo === german, 'it used a German round');
  assert(asked.length === 2 && asked.every(a => a.shelled && Sim.unitById(st, a.target).side === 'de'), 'it did not ask both your pieces');
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
    for (const n of [st.ammo.mortars, st.ammo.artillery, st.ammo.bomber, st.deMortarAmmo, st.deArtilleryAmmo, st.deBomberAmmo]) assert(n >= 0, `seed ${seed}: negative ammunition`);
    // A German win means no American left on the table
    if (st.lost && !st.draw) assert(!live(st).some(u => u.side === 'us'), `seed ${seed}: a German win with Americans left`);
  }
  assert(germanWins > 0, 'the Germans can never win');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
