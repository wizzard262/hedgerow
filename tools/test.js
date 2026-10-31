// Headless checks of the rules in js/sim.js: node tools/test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
load('data.js'); load('sim.js');
const { play } = require('./bot.js');

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n      ', e.message); }
}
function assert(ok, message) { if (!ok) throw new Error(message); }
const live = st => st.units.filter(u => u.x !== null);
// A field's units are allowed: either one unit, or a rifle platoon with up to three teams or the captain.
// (Teams and the captain can only come into a platoon's field, but may be left together there when the platoon moves on)
function fieldOk(st, x, y) {
  for (const side of ['us', 'de']) {
    const here = live(st).filter(u => u.x === x && u.y === y && u.side === side);
    if (here.length <= 1) continue;
    const platoons = here.filter(u => u.kind === 'company').length, rest = here.filter(u => u.kind !== 'company');
    if (platoons > 1 || !rest.every(u => Sim.isSmall(u)) || rest.length > 3) return false;
  }
  return true;
}

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
  const tank = Sim.unitById(st, 'T1'), able = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== tank && u !== able) u.x = u.y = null;
  tank.x = 0; tank.y = 6; able.x = 1; able.y = 6;
  const spots = Sim.chargeSpots(st, tank);
  assert(spots.some(p => p.x === 2 && p.y === 6), 'the tank could not charge through the platoon');
  assert(!spots.some(p => p.x === 1 && p.y === 6), "the tank could stop in the platoon's field");
  assert(Sim.actCharge(st, tank, 2, 6).ok && tank.x === 2, 'the charge through the platoon did not arrive');
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
  assert(Sim.chargeSpots(st, ff).some(p => p.x === 1 && p.y === 6) && !Sim.breachSpots(st, ff).length, 'the Firefly should drive through hedges with no separate Break through');
  const k3 = setUp(co, 3); st.wire[k3] = true;
  assert(!Sim.chargeSpots(st, co).some(p => p.x === 1 && p.y === 3) && !Sim.actBreach(st, co, 1, 3).ok, 'men got through barbed wire');
  // Men climb a hedge as part of a charge, using one more move: the hedge stays, and they get one field less far
  const k4 = setUp(co, 5); co.acted = false; st.hedges[k4] = true;
  assert(Sim.chargeSpots(st, co).some(p => p.x === 1 && p.y === 5), 'men could not climb the hedge in a charge');
  assert(Sim.chargeSpots(st, co).some(p => p.x === 2 && p.y === 5), 'men could not go on a field after climbing');
  assert(!Sim.chargeSpots(st, co).some(p => p.x === 3 && p.y === 5), 'climbing the hedge cost nothing');
  assert(Sim.actCharge(st, co, 2, 5).ok && co.x === 2 && st.hedges[k4], 'the climb did not arrive, or the men knocked the hedge down');
});

check('one unit to a field', () => {
  const st = Sim.newGame(2);
  for (let seed = 1; seed <= 20; seed++) {
    const s2 = Sim.newGame(seed);
    for (const u of live(s2)) assert(fieldOk(s2, u.x, u.y), `seed ${seed}: ${u.name} starts sharing a field it shouldn't`);
  }
  const co = Sim.unitById(st, 'B');
  assert(!Sim.roomFor(st, Sim.unitById(st, 'T1'), co.x, co.y), 'a tank section fitted in beside a rifle platoon');
  assert(Sim.roomFor(st, Sim.unitById(st, 'mg1'), co.x, co.y) && Sim.roomFor(st, Sim.unitById(st, 'cap'), co.x, co.y), "a team or the captain could not join a rifle platoon's field");
  const empty = [...Array(COLS).keys()].map(x => ({ x, y: 7 })).find(p => !Sim.at(st, p.x, p.y).length && Sim.tileType(p.x, p.y) !== 'river');
  const mg = Sim.unitById(st, 'mg1'); mg.x = empty.x; mg.y = empty.y;
  assert(!Sim.roomFor(st, Sim.unitById(st, 'bz1'), empty.x, empty.y), 'two teams shared a field with no platoon');
});

check('dice: every face is 1 to 6 and hits are the ones at or over the score needed', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = Sim.newGame(seed);
    for (let h = 0; h < 6 && !st.won && !st.lost; h++) {
      Sim.endTurn(st);
      for (const f of st.fx) for (const r of f.faces || []) {
        assert(r.face >= 1 && r.face <= 6, `face ${r.face}`);
        assert(r.hit === (r.face >= f.need), `face ${r.face} needing ${f.need} marked ${r.hit ? 'hit' : 'miss'}`);
      }
    }
  }
});

check('taking cover: no moving, harder to hit, misses the next move unless the captain gets it up', () => {
  const st = Sim.newGame(9);
  let checked = 0;
  for (let h = 0; h < 8 && !st.won && !st.lost; h++) {
    Sim.startGermanHour(st);
    const down = [];
    for (let r = Sim.germanStep(st); !r.done; r = Sim.germanStep(st)) {
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
  // Down in cover, it is harder to hit
  const de = st2.units.find(u => u.side === 'de' && u.kind === 'company');
  const before = Sim.needFor(st2, de, A); A.down = true;
  assert(Sim.needFor(st2, de, A) === before + TAKE_COVER, 'taking cover did not make it harder to hit');
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
  us.x = 0; us.y = 7; de.x = 1; de.y = 7; us.at = null; de.at = null;
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
  T1.x = 0; T1.y = 6; A.x = 0; A.y = 7; platoon.x = 1; platoon.y = 6; team.x = 1; team.y = 6;
  st.fx = [];
  Sim.actShoot(st, T1, platoon);
  const hitIds = st.fx.filter(f => f.faces).map(f => f.to.id);
  assert(hitIds.includes(platoon.id) && hitIds.includes(team.id), 'only the target rolled: ' + hitIds.join(','));
  // Rifles stay one target at a time
  // (the tank's shot may have killed it: set it up again)
  st.fx = []; A.acted = false; platoon.x = 1; platoon.y = 6; platoon.platoons = 3; platoon.shocked = false;
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
  assert(Sim.actCharge(st, able, 2, 6, 'e').ok && able.at === 'e', 'it did not line the hedge it was sent to');
  able.acted = false;
  assert(Sim.actCharge(st, able, 1, 6, null).ok && able.at === null, 'it did not stand in the open');
});

check('the captain can shoot, but the Germans never target him', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const cap = Sim.unitById(st, 'cap'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== cap && u !== de) u.x = u.y = null;
  cap.x = 0; cap.y = 6; de.x = 1; de.y = 6;
  assert(Sim.targets(st, cap).includes(de), 'the captain had no target next to him');
  assert(Sim.actShoot(st, cap, de).ok, 'the captain could not shoot');
  assert(!Sim.targets(st, de).includes(cap), 'a German could target the captain');
});

check('two pins kill; bazookas and tanks kill men outright; MGs and tanks reach further; tanks give cover', () => {
  const setUp = () => {
    const st = Sim.newGame(4);
    st.hedges = {}; st.wire = {};
    const A = Sim.unitById(st, 'A'), bz = Sim.unitById(st, 'bz1'), mg = Sim.unitById(st, 'mg1'), T1 = Sim.unitById(st, 'T1');
    const de = st.units.find(u => u.side === 'de' && u.kind === 'company');
    for (const u of st.units) if (![A, bz, mg, T1, de].includes(u)) u.x = u.y = null;
    A.x = 0; A.y = 6; de.x = 1; de.y = 6; de.platoons = 3; de.at = null; A.at = 'e'; A.quality = 'standard';
    bz.x = 0; bz.y = 7; mg.x = 9; mg.y = 0; T1.x = 9; T1.y = 2;
    // Every die a 6, every coin toss tails: only the rules themselves kill
    st.rand = () => 0.99;
    return { st, A, bz, mg, T1, de };
  };
  let g = setUp();
  Sim.actShoot(g.st, g.A, g.de);
  assert(g.de.platoons === 1, `three rifle hits on a fresh platoon should pin with the first and kill with the next two (it has ${g.de.platoons})`);
  g = setUp(); g.de.shocked = true;
  Sim.actShoot(g.st, g.A, g.de);
  assert(g.de.x === null, 'three hits on a pinned platoon did not wipe it out');
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
  // Cover: men beside their own tank
  const c = setUp();
  c.T1.x = 1; c.T1.y = 5;
  const inOpen = Sim.needFor(c.st, c.de, c.A);
  c.T1.x = 0; c.T1.y = 6;
  assert(Sim.needFor(c.st, c.de, c.A) === inOpen + COVER.tank, 'a platoon beside its tank was not in cover');
});

check('the captain rallies twice if he stays put, once if he moves or shoots', () => {
  const st = Sim.newGame(3);
  const cap = Sim.unitById(st, 'cap'), A = Sim.unitById(st, 'A'), B = Sim.unitById(st, 'B');
  for (const u of st.units) if (![cap, A, B].includes(u) && u.side === 'us') u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  cap.x = 0; cap.y = 6; A.x = 0; A.y = 5; B.x = 1; B.y = 6;
  A.down = true; A.acted = true; B.down = true; B.acted = true;
  assert(Sim.actRally(st, cap, A).ok && Sim.actRally(st, cap, B).ok, 'two rallies refused');
  assert(!Sim.canAct(st, cap), 'he could still move after two rallies');
  // Next hour: he charges, then can rally just once
  const st2 = Sim.newGame(3);
  const c2 = Sim.unitById(st2, 'cap'), A2 = Sim.unitById(st2, 'A'), B2 = Sim.unitById(st2, 'B');
  for (const u of st2.units) if (![c2, A2, B2].includes(u) && u.side === 'us') u.x = u.y = null;
  st2.hedges = {}; st2.wire = {};
  c2.x = 0; c2.y = 6; A2.x = 0; A2.y = 4; B2.x = 2; B2.y = 4;
  A2.shocked = true; B2.shocked = true;
  const spot = Sim.chargeSpots(st2, c2).find(p => p.x === 1 && p.y === 6) || Sim.chargeSpots(st2, c2)[0];
  assert(Sim.actCharge(st2, c2, spot.x, spot.y).ok, 'the captain could not charge');
  assert(Sim.canRally(st2, c2) && Sim.actRally(st2, c2, Sim.rallyTargets(st2, c2)[0]).ok, 'no rally after moving');
  assert(!Sim.canRally(st2, c2), 'a second rally after moving');
});

check('destroying every German wins, even with no rifle platoons; losing everything loses', () => {
  const st = Sim.newGame(6);
  for (const u of st.units) if (u.side === 'de' || u.kind === 'company') { u.x = null; u.y = null; }
  Sim.startGermanHour(st);
  for (let r = Sim.germanStep(st); !r.done; r = Sim.germanStep(st)) Sim.answer(st, false);
  Sim.finishHour(st);
  assert(st.won, 'wiping out the Germans did not win');
  const st2 = Sim.newGame(6);
  for (const u of st2.units) if (u.kind === 'company' && u.side === 'us') { u.x = null; u.y = null; }
  Sim.startGermanHour(st2);
  for (let r = Sim.germanStep(st2); !r.done; r = Sim.germanStep(st2)) Sim.answer(st2, false);
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
});

check('a shot that would need 7 or more cannot be taken', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const B = Sim.unitById(st, 'B'), de = st.units.find(u => u.side === 'de' && u.kind === 'company');
  for (const u of st.units) if (u !== B && u !== de) u.x = u.y = null;
  // A German in the orchard three fields off (cover and long range), the shooter shaken: 3 + 1 + 1 + 1 = 6
  B.x = 6; B.y = 0; B.at = null; B.quality = 'standard'; B.shocked = true;
  de.x = 9; de.y = 0; de.at = null;
  assert(Sim.tileType(9, 0) === 'orchard', 'the test needs an orchard at 9,0');
  assert(Sim.targets(st, B).includes(de), 'a 6+ shot was refused');
  // Taking cover makes it 7: no shot
  de.down = true;
  assert(!Sim.targets(st, B).includes(de), 'a 7+ shot was allowed');
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
  for (let r = Sim.germanStep(st); !r.done; r = Sim.germanStep(st)) Sim.answer(st, false);
  assert(st.deArtilleryAmmo === before - 1, 'the German artillery did not fire');
  assert(st.fx.some(f => f.support === 'artillery' && f.side === 'de'), 'no German shells landed');
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
  const usGuns = ['mortars', 'artillery'].filter(w => st.ammo[w] > 0).length, deGuns = (st.deMortarAmmo > 0) + (st.deArtilleryAmmo > 0);
  assert(st.bag.us === us + usGuns && st.bag.de === de + deGuns, `the bag holds ${st.bag.us}+${st.bag.de}, not ${us + usGuns}+${de + deGuns}`);
  const turn = st.turn;
  let draws = 0;
  for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
    draws++;
    if (side === 'de') {
      for (let r = Sim.germanStep(st); !r.done; r = Sim.germanStep(st)) Sim.answer(st, false);
      Sim.endGermanToken(st);
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
  assert(draws <= us + de + usGuns + deGuns, `${draws} tokens drawn from a bag of ${us + de + usGuns + deGuns}`);
  Sim.endRound(st);
  assert(st.won || st.lost || st.turn === turn + 1, 'the round did not end');
});

check('out of rounds, a gun leaves the bag; any piece can skip its turn', () => {
  const st = Sim.newGame(3);
  st.ammo.mortars = 0;
  Sim.startRound(st);
  const pieces = st.units.filter(u => u.side === 'us' && u.x !== null).length;
  assert(st.bag.us === pieces + 1, 'the mortars with no rounds still had a token');
  // Draw until an American token, then skip with a piece: the token is used and the piece has given up its move
  for (let side = Sim.drawToken(st); side && side !== 'us'; side = Sim.drawToken(st)) {
    for (let r = Sim.germanStep(st); !r.done; r = Sim.germanStep(st)) Sim.answer(st, false);
    Sim.endGermanToken(st);
  }
  if (st.drawn === 'us') {
    const u = st.units.find(o => o.side === 'us' && Sim.canAct(st, o));
    assert(Sim.actSkip(st, u).ok && u.acted && Sim.activationOver(st), 'skipping a turn did not use the token');
  }
});

check('leaving everything alone never wins', () => {
  for (let seed = 1; seed <= 30; seed++) assert(!play(seed, false).won, `seed ${seed} won by doing nothing`);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
