// A simple attacking player for headless checks: node tools/bot.js [games]
// It plays the game as the page does, token by token from the blind bag. On each American token: a gun on a German it can
// see, or the captain rallies, or a piece shoots, charges a weak field, or moves towards the objective
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
if (typeof Sim === 'undefined') { load('data.js'); load('sim.js'); }

const toGoal = (st, p) => Math.abs(p.x - st.objective.x) + Math.abs(p.y - st.objective.y);

// One piece's go: true if it did something
function actPiece(st, u) {
  if (!Sim.canAct(st, u)) return false;
  // (proper shots only: no Hail Marys while it can move up instead)
  const ts = Sim.mayFire(u) ? Sim.targets(st, u).filter(t => Sim.shotNeed(st, u, t) <= MAX_NEED) : [];
  const weak = Sim.chargeSpots(st, u).find(p => Sim.at(st, p.x, p.y, 'de').some(g => g.shocked) && u.kind === 'company' && u.platoons >= 2);
  if (weak) return Sim.actCharge(st, u, weak.x, weak.y).ok;
  if (ts.length) return Sim.actShoot(st, u, ts[0]).ok;
  // Germans across a hedge: go to that hedge
  const across = st.units.find(g => g.side === 'de' && g.x !== null && Sim.acrossHedge(st, u, g));
  if (across) {
    const dir = Object.keys(Sim.DIRS).find(d => Sim.DIRS[d].join() === [across.x - u.x, across.y - u.y].join());
    const side = Sim.lineSides(st, u).find(p => p && p.includes(dir));
    if (side && Sim.actLine(st, u, side).ok) return true;
  }
  // The objective itself, if it is in reach
  const empty = Sim.chargeSpots(st, u).find(p => p.x === st.objective.x && p.y === st.objective.y);
  if (empty) return Sim.actCharge(st, u, empty.x, empty.y).ok;
  // Otherwise nearer the objective, firing on the way if it can
  const closer = p => toGoal(st, p) < toGoal(st, u);
  const m = Sim.moveShootSpots(st, u).sort((a, b) => toGoal(st, a) - toGoal(st, b))[0];
  if (m && closer(m)) {
    if (!Sim.actMoveShoot(st, u, m.x, m.y).ok) return false;
    const t = Sim.targets(st, u, true).sort((a, b) => Sim.shotNeed(st, u, a, true) - Sim.shotNeed(st, u, b, true))[0];
    if (t) Sim.actHalfShot(st, u, t);
    return true;
  }
  const c = Sim.chargeSpots(st, u).filter(p => !Sim.at(st, p.x, p.y, 'de').length && closer(p))[0];
  if (c) return Sim.actCharge(st, u, c.x, c.y).ok;
  return false;
}

// One American token: guns first, then the captain's rallies, then the first piece that can do something
function usToken(st) {
  const us = st.units.filter(u => u.side === 'us' && u.x !== null);
  // The bomber, when its compass gives a line worth flying
  if (Sim.canFire(st, 'bomber')) {
    const run = Sim.bestBomberRun(st, 'us');
    if (run && Sim.actFire(st, 'bomber', run.x, run.y).ok) return;
  }
  for (const which of ['artillery', 'mortars']) {
    if (!Sim.canFire(st, which)) continue;
    const seen = st.units.filter(g => g.side === 'de' && g.x !== null && Sim.canCallFire(st, g.x, g.y));
    const t = seen.sort((a, b) => b.platoons - a.platoons)[0];
    if (t && Sim.actFire(st, which, t.x, t.y).ok) return;
  }
  const cap = us.find(u => u.kind === 'captain');
  if (cap && Sim.captainCanRally(st, cap)) {
    while (Sim.captainCanRally(st, cap)) {
      const t = Sim.rallyTargets(st, cap).sort((a, b) => (b.kind === 'company') - (a.kind === 'company'))[0];
      if (!Sim.actRally(st, cap, t).ok) break;
    }
    return;
  }
  // Those with a shot first; the captain last, following the strongest platoon
  const pieces = us.filter(u => u.kind !== 'captain').sort((a, b) => Sim.targets(st, b).length - Sim.targets(st, a).length);
  for (const u of pieces) if (actPiece(st, u)) return;
  if (cap && Sim.canAct(st, cap)) {
    const co = us.filter(u => u.kind === 'company').sort((a, b) => b.platoons - a.platoons)[0];
    if (!co) return;
    const near = p => Math.abs(p.x - co.x) + Math.abs(p.y - co.y);
    const m = Sim.chargeSpots(st, cap).filter(p => !Sim.at(st, p.x, p.y, 'de').length).sort((a, b) => near(a) - near(b))[0];
    if (m && near(m) < near(cap)) Sim.actCharge(st, cap, m.x, m.y);
  }
}

// Take cover when a weakened or shaken piece is fired on
function decide(st, shot) {
  const t = Sim.unitById(st, shot.target);
  return t.shocked || t.platoons < (t.kind === 'company' ? 3 : 1);
}

// One round from the bag. bot false: the Americans do nothing
function playRound(st, bot) {
  Sim.startRound(st);
  for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
    if (side === 'timer') break;
    if (side === 'us') {
      if (bot) usToken(st);
      Sim.passToken(st);
      continue;
    }
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, bot ? decide(st, r.ask) : false);
    Sim.endComputerToken(st);
  }
  Sim.endRound(st);
}

// Play a game; with no time limit it stops after maxRounds if neither side has won
function play(seed, bot, maxRounds = 20) {
  const st = Sim.newGame(seed);
  while (!st.won && !st.lost && st.turn <= maxRounds) playRound(st, bot);
  return st;
}

// ---------- Playing the Germans, with the computer as the Americans ----------

// One German token for the test player: guns first, then the captain's rallies, then the first piece that can shoot,
// or Move & shoot; the rest stay where they are
function deToken(st) {
  const de = st.units.filter(u => u.side === 'de' && u.x !== null);
  if (Sim.canFire(st, 'bomber')) {
    const run = Sim.bestBomberRun(st, 'de');
    if (run && Sim.actFire(st, 'bomber', run.x, run.y).ok) return;
  }
  for (const which of ['artillery', 'mortars']) {
    if (!Sim.canFire(st, which)) continue;
    const seen = st.units.filter(a => a.side === 'us' && a.x !== null && Sim.canCallFire(st, a.x, a.y));
    const t = seen.sort((a, b) => b.platoons - a.platoons)[0];
    if (t && Sim.actFire(st, which, t.x, t.y, t).ok) return;
  }
  const cap = de.find(u => u.kind === 'captain');
  if (cap && Sim.captainCanRally(st, cap)) {
    while (Sim.captainCanRally(st, cap)) {
      const t = Sim.rallyTargets(st, cap)[0];
      if (!Sim.actRally(st, cap, t).ok) break;
    }
    return;
  }
  const pieces = de.filter(u => Sim.canAct(st, u)).sort((a, b) => Sim.targets(st, b).length - Sim.targets(st, a).length);
  for (const u of pieces) {
    const proper = Sim.mayFire(u) ? Sim.targets(st, u).filter(t => Sim.shotNeed(st, u, t) <= MAX_NEED) : [];
    if (proper.length) { if (Sim.actShoot(st, u, proper[0]).ok) return; }
    const m = Sim.moveShootSpots(st, u)[0];
    if (m && Sim.actMoveShoot(st, u, m.x, m.y).ok) {
      const t = Sim.targets(st, u, true).sort((a, b) => Sim.shotNeed(st, u, a, true) - Sim.shotNeed(st, u, b, true))[0];
      if (t) Sim.actHalfShot(st, u, t);
      return;
    }
  }
}

// One round with the player as the Germans. bot false: the Germans do nothing
function playRoundAsGermans(st, bot) {
  Sim.startRound(st);
  for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
    if (side === 'timer') break;
    if (side === 'de') {
      if (bot) deToken(st);
      Sim.passToken(st);
      continue;
    }
    for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) Sim.answer(st, bot ? decide(st, r.ask) : false);
    Sim.endComputerToken(st);
  }
  Sim.endRound(st);
}

// A game with the player as the Germans: st.lost means the Germans (the player) won, st.won the American computer
function playAsGermans(seed, bot, maxRounds = 20) {
  const st = Sim.newGame(seed, 'de');
  while (!st.won && !st.lost && st.turn <= maxRounds) playRoundAsGermans(st, bot);
  return st;
}

// ---------- Two robots ----------

// A game with no human: every token is the computer's, and nobody is ever asked anything
function playRobots(seed) {
  const st = Sim.newGame(seed, 'none');
  while (!st.won && !st.lost) {
    Sim.startRound(st);
    for (let side = Sim.drawToken(st); side; side = Sim.drawToken(st)) {
      if (side === 'timer') break;
      for (let r = Sim.computerStep(st); !r.done; r = Sim.computerStep(st)) throw new Error('a robot was asked a question');
      Sim.endComputerToken(st);
    }
    Sim.endRound(st);
  }
  return st;
}

if (require.main === module) {
  const n = +process.argv[2] || 100;
  let wins = 0, idle = 0, turns = 0;
  for (let s = 1; s <= n; s++) { const st = play(s, true); if (st.won) { wins++; turns += st.turn; } if (play(s, false).won) idle++; }
  console.log(`attacking bot wins ${Math.round(wins / n * 100)}% (avg round ${wins ? (turns / wins).toFixed(1) : '-'}), idle wins ${Math.round(idle / n * 100)}%`);
  let german = 0, americans = 0;
  for (let s = 1; s <= n; s++) { const st = playAsGermans(s, true); if (st.lost && !st.draw) german++; if (st.won) americans++; }
  console.log(`as the Germans: the test player wins ${Math.round(german / n * 100)}%, the American computer ${Math.round(americans / n * 100)}%`);
}
module.exports = { play, playRound, playAsGermans, playRobots };
