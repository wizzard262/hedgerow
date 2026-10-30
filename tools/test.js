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
    for (const g in st.points) assert(st.points[g] >= -1e-9, `seed ${seed}: ${g} has ${st.points[g]} points`);
    assert(st.ammo.mortars >= 0 && st.ammo.artillery >= 0, `seed ${seed}: negative ammunition`);
    assert(st.won || st.lost, `seed ${seed}: game did not end`);
    assert(st.turn <= TURNS, `seed ${seed}: ran past the last hour`);
  }
});

check('a company earns a point an hour (two thirds more for each team with it), the tanks two thirds a platoon; banks are kept', () => {
  const st = Sim.newGame(3);
  const able = Sim.members(st, 'A').length;
  assert(Math.abs(st.points.A - (1 + (able - 1) * COMMAND_SHARE)) < 1e-9, `Able has ${st.points.A} points with ${able} pieces`);
  assert(Math.abs(st.points.T - 2 * COMMAND_SHARE) < 1e-9, `the tanks have ${st.points.T} points`);
  for (let h = 0; h < 5; h++) Sim.endTurn(st);
  assert(st.points.A <= COMMAND_BANK + 1e-9, `Able saved ${st.points.A}, more than the bank`);
});

check('a piece acts once an hour', () => {
  const st = Sim.newGame(3);
  const able = Sim.unitById(st, 'A');
  st.points.A = 3; st.hedges = {}; st.wire = {};
  const m = Sim.moves(st, able)[0];
  assert(Sim.actMoveShoot(st, able, m.x, m.y).ok, 'first move refused');
  const m2 = Sim.moves(st, able)[0];
  assert(!Sim.actMoveShoot(st, able, m2.x, m2.y).ok, 'a second action in the same hour was allowed');
});

check('a charge reaches two fields, a move one', () => {
  const st = Sim.newGame(3);
  st.hedges = {}; st.wire = {};
  const able = Sim.unitById(st, 'A');
  for (const u of st.units) if (u !== able) u.x = u.y = null;
  able.x = 0; able.y = 6; st.points.A = 3;
  assert(Sim.chargeSpots(st, able).some(p => Math.abs(p.x - able.x) + Math.abs(p.y - able.y) === 2), 'no charge reaches two fields');
  assert(Sim.moves(st, able).every(p => Math.abs(p.x - able.x) + Math.abs(p.y - able.y) === 1), 'a move went further than one field');
  assert(Sim.actCharge(st, able, 2, 6).ok && able.x === 2, 'the two-field charge did not arrive');
});

check('Shermans cut through hedges; Fireflies need a gap or must break through; wire stops men but not tanks', () => {
  const st = Sim.newGame(5);
  const sher = Sim.unitById(st, 'T1'), ff = Sim.unitById(st, 'T2'), co = Sim.unitById(st, 'B');
  // Clear the board of everyone else, and put each piece in an empty field with a field to its east
  for (const u of st.units) if (![sher, ff, co].includes(u)) u.x = u.y = null;
  const key = (ax, ay, bx, by) => (ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`);
  const setUp = (u, y) => { u.x = 0; u.y = y; const k = key(0, y, 1, y); delete st.hedges[k]; delete st.wire[k]; return k; };
  st.points.T = 3; st.points.B = 3;
  const k1 = setUp(sher, 0); st.hedges[k1] = true;
  assert(Sim.actMoveShoot(st, sher, 1, 0).ok, 'the Sherman could not drive through the hedge');
  assert(!st.hedges[k1], 'the Sherman left the hedge standing');
  const k2 = setUp(ff, 6); st.hedges[k2] = true;
  assert(!Sim.moves(st, ff).some(p => p.x === 1 && p.y === 6), 'the Firefly could climb a hedge');
  assert(Sim.actBreach(st, ff, 1, 6).ok && !st.hedges[k2] && ff.x === 1, 'the Firefly could not break through into the next field');
  const k3 = setUp(co, 3); st.wire[k3] = true;
  assert(!Sim.moves(st, co).some(p => p.x === 1 && p.y === 3), 'men walked through barbed wire');
  assert(Sim.actBreach(st, co, 1, 3).ok && !st.wire[k3] && co.x === 1, 'the company could not cut through the wire');
  const k4 = setUp(co, 5); co.acted = false; st.points.B = 3; st.hedges[k4] = true;
  assert(!Sim.moves(st, co).some(p => p.x === 1 && p.y === 5) && !Sim.chargeSpots(st, co).some(p => p.x === 1 && p.y === 5), 'men walked or charged across a hedge into an empty field');
});

check('a hamlet or the village holds one company or one tank platoon, not both', () => {
  const st = Sim.newGame(2);
  let hx = -1, hy = -1;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (Sim.tileType(x, y) === 'hamlet' && !Sim.at(st, x, y).length && hx < 0) { hx = x; hy = y; }
  const co = Sim.unitById(st, 'B'); co.x = hx; co.y = hy;
  assert(!Sim.roomFor(st, Sim.unitById(st, 'T1'), hx, hy), 'a tank platoon fitted in beside a company');
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

check('pulling back costs a point whether it works or not', () => {
  const st = Sim.newGame(9);
  for (let h = 0; h < 8 && !st.won && !st.lost; h++) {
    Sim.startGermanHour(st);
    for (let r = Sim.germanStep(st); !r.done; r = Sim.germanStep(st)) {
      const t = Sim.unitById(st, r.ask.target), g = Sim.groupOf(t), before = st.points[g];
      Sim.answer(st, true);
      assert(Math.abs(st.points[g] - (before - 1)) < 1e-9, `${g} went from ${before} to ${st.points[g]}`);
    }
    Sim.finishHour(st);
  }
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

check('line of sight: three fields over open ground, blocked by a hedge in between or a village, one more at range', () => {
  const st = Sim.newGame(4);
  const us = Sim.unitById(st, 'A'), de = Sim.unitById(st, 'd2');
  for (const u of st.units) if (u !== us && u !== de) u.x = u.y = null;
  st.hedges = {}; st.wire = {};
  us.x = 0; us.y = 7; de.x = 3; de.y = 7; us.at = null; de.at = null;
  const s3 = Sim.sight(st, us, de);
  assert(s3 && s3.cover === LONG_RANGE, 'three open fields away should be seen, one more to hit');
  de.x = 4;
  assert(!Sim.sight(st, us, de), 'four fields away was seen');
  de.x = 3; st.hedges['1,7|2,7'] = true;
  assert(!Sim.sight(st, us, de), 'a hedge in between did not block the view');
});

check('leaving everything alone always loses', () => {
  for (let seed = 1; seed <= 30; seed++) assert(!play(seed, false).won, `seed ${seed} won by doing nothing`);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
