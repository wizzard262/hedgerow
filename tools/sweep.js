// Tries different values of the numbers in js/data.js with the attacking bot: node tools/sweep.js "TO_HIT=4 & TURNS=10" ... (settings joined with &)
const fs = require('fs'), vm = require('vm'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
for (const arg of process.argv.slice(2).length ? process.argv.slice(2) : ['']) {
  let data = read('js/data.js');
  for (const kv of arg.split('&').map(x => x.trim()).filter(Boolean)) {
    const i = kv.indexOf('='), k = kv.slice(0, i), v = kv.slice(i + 1);
    data = data.replace(new RegExp(`const ${k} = [^;]+;`), `const ${k} = ${v};`);
  }
  const ctx = vm.createContext({ Math, Date, console, module: undefined, require });
  const bot = read('tools/bot.js').replace(/const fs = [\s\S]*?load\('sim.js'\); \}/, '').replace(/if \(require.main[\s\S]*$/, 'this.play = play; this.playAsGermans = playAsGermans;');
  vm.runInContext(data + '\n' + read('js/sim.js') + '\nthis.Sim = Sim;\n' + bot, ctx);
  // With no time limit the bot plays up to 20 hours a game
  let wins = 0, idle = 0, turns = 0;
  const n = 150;
  for (let s = 1; s <= n; s++) { const st = ctx.play(s, true); if (st.won) { wins++; turns += st.turn; } if (ctx.play(s, false).won) idle++; }
  // The other way round: the test player as the Germans, the computer as the Americans
  let german = 0, american = 0, americanTurns = 0, idleGerman = 0, stuck = 0;
  for (let s = 1; s <= n; s++) {
    const st = ctx.playAsGermans(s, true);
    if (st.lost && !st.draw) german++;
    else if (st.won) { american++; americanTurns += st.turn; }
    else if (!st.draw) stuck++;
    const lazy = ctx.playAsGermans(s, false);
    if (lazy.lost && !lazy.draw) idleGerman++;
  }
  console.log((arg || 'as is').padEnd(60), `bot ${Math.round(wins / n * 100)}% (turn ${wins ? (turns / wins).toFixed(1) : '-'})  idle ${Math.round(idle / n * 100)}%`);
  console.log(''.padEnd(60), `as the Germans: bot ${Math.round(german / n * 100)}%  American computer ${Math.round(american / n * 100)}% (turn ${american ? (americanTurns / american).toFixed(1) : '-'})  unfinished ${Math.round(stuck / n * 100)}%  idle ${Math.round(idleGerman / n * 100)}%`);
}
