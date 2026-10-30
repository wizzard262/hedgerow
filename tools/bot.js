// A simple attacking player for headless checks: node tools/bot.js [games]
// Each hour: guns and mortars on seen Germans, the captain rallies, then every piece shoots, charges a weak field, or moves east
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'));
if (typeof Sim === 'undefined') { load('data.js'); load('sim.js'); }

function playHour(st) {
  const us = () => st.units.filter(u => u.side === 'us' && u.x !== null);
  // Fire support on the strongest German field we can see
  for (const which of ['artillery', 'mortars']) {
    const seen = st.units.filter(g => g.side === 'de' && g.x !== null && Sim.canCallFire(st, g.x, g.y));
    const t = seen.sort((a, b) => b.platoons - a.platoons)[0];
    if (t) Sim.actFire(st, which, t.x, t.y);
  }
  // The captain rallies whoever is shaken nearby
  for (const c of us().filter(u => u.kind === 'captain')) {
    const t = Sim.rallyTargets(st, c).sort((a, b) => (b.kind === 'company') - (a.kind === 'company'))[0];
    if (t) Sim.actRally(st, c, t);
  }
  // Teams join a rifle platoon next door
  for (const t of us().filter(u => Sim.isTeam(u) && !u.attachedTo)) {
    const co = us().find(u => u.kind === 'company' && Sim.adjacent(u, t));
    if (co) Sim.actAttach(st, t, co);
  }
  for (const u of us().filter(u => u.kind === 'company' || Sim.isTank(u))) {
    for (let k = 0; k < 1 && Sim.canAct(st, u); k++) {
      const ts = Sim.targets(st, u);
      const weak = Sim.chargeSpots(st, u).find(p => Sim.at(st, p.x, p.y, 'de').some(g => g.shocked) && u.kind === 'company' && u.platoons >= 2);
      if (weak) { Sim.actCharge(st, u, weak.x, weak.y); continue; }
      if (ts.length) { Sim.actShoot(st, u, ts[0]); continue; }
      const across = st.units.find(g => g.side === 'de' && g.x !== null && Sim.acrossHedge(st, u, g));
      if (across) { const side = Sim.lineSides(st, u).find(d => ({ e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] })[d].join() === [across.x - u.x, across.y - u.y].join()); if (side && Sim.actLine(st, u, side).ok) continue; }
      // Move towards the hamlet
      const m = Sim.moveShootSpots(st, u).sort((a, b) => (Math.abs(a.x - st.objective.x) + Math.abs(a.y - st.objective.y)) - (Math.abs(b.x - st.objective.x) + Math.abs(b.y - st.objective.y)))[0];
      const empty = Sim.chargeSpots(st, u).find(p => p.x === st.objective.x && p.y === st.objective.y);
      if (empty) { Sim.actCharge(st, u, empty.x, empty.y); continue; }
      const closer = p => Math.abs(p.x - st.objective.x) + Math.abs(p.y - st.objective.y) < Math.abs(u.x - st.objective.x) + Math.abs(u.y - st.objective.y);
      if (m && closer(m)) { Sim.actMoveShoot(st, u, m.x, m.y); const t = Sim.targets(st, u)[0]; if (t) Sim.actHalfShot(st, u, t); continue; }
      const c = Sim.chargeSpots(st, u).filter(p => !Sim.at(st, p.x, p.y, 'de').length && closer(p))[0];
      if (c) { Sim.actCharge(st, u, c.x, c.y); continue; }
      const b = Sim.breachSpots(st, u).find(closer);
      if (b) { Sim.actBreach(st, u, b.x, b.y); continue; }
      break;
    }
  }
  // The captain follows the strongest company
  for (const c of us().filter(u => u.kind === 'captain')) {
    const co = us().filter(u => u.kind === 'company').sort((a, b) => b.platoons - a.platoons)[0];
    if (co && co.x !== null && !(co.x === c.x && co.y === c.y) && Sim.canAct(st, c)) {
      const m = Sim.moves(st, c).sort((a, b) => (Math.abs(a.x - co.x) + Math.abs(a.y - co.y)) - (Math.abs(b.x - co.x) + Math.abs(b.y - co.y)))[0];
      if (m) Sim.actMove(st, c, m.x, m.y);
    }
  }
}

// Pull back when a weakened or shaken piece is fired on
function decide(st, shot) {
  const t = Sim.unitById(st, shot.target);
  return t.shocked || t.platoons < (t.kind === 'company' ? 3 : 2);
}

// Play a game; with no time limit it stops after maxHours if neither side has won
function play(seed, bot, maxHours = 20) {
  const st = Sim.newGame(seed);
  while (!st.won && !st.lost && st.turn <= maxHours) { if (bot) playHour(st); Sim.endTurn(st, bot ? shot => decide(st, shot) : undefined); }
  return st;
}

if (require.main === module) {
  const n = +process.argv[2] || 100;
  let wins = 0, idle = 0, turns = 0;
  for (let s = 1; s <= n; s++) { const st = play(s, true); if (st.won) { wins++; turns += st.turn; } if (play(s, false).won) idle++; }
  console.log(`attacking bot wins ${Math.round(wins / n * 100)}% (avg turn ${wins ? (turns / wins).toFixed(1) : '-'}), idle wins ${Math.round(idle / n * 100)}%`);
}
module.exports = { play, playHour };
