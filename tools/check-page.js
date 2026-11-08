// Plays the page in a visible browser with real clicks, and prints what happens: the choice of Human or Robot, two humans
// sharing the screen, two robots, the order shots and moves are drawn in, and the PaK round the large village. The automatic
// tests (tools/test.js) don't reach the page's code, so run this after changing ui.js, main.js or board3d.js
// Needs the game served at http://localhost:8768/ (python -m http.server 8768): node tools/check-page.js
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'harrier-carrier-playwright-tests', 'node_modules', 'playwright'));

// Who plays each side, then a game of each
async function checkPlayers() {
  const browser = await chromium.launch({ headless: false, slowMo: 25 });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8768/');
  await page.waitForTimeout(1500);

  // ---------- The choice ----------
  const lit = () => page.evaluate(() => ['us-human', 'us-robot', 'de-human', 'de-robot'].filter(id => document.getElementById(id).className === 'on').join(','));
  console.log('version', await page.textContent('#ver'), '| opens lit:', await lit(), '| asked:', await page.isVisible('#newgame'), '| cancel:', await page.isVisible('#newgame [data-close]'));
  await page.click('#map-hedges');
  await page.click('#de-human');
  await page.waitForTimeout(200);
  console.log('after picking German Human:', await lit());


  // ---------- Two humans ----------
  await page.click('#start-game');
  await page.waitForTimeout(600);
  console.log('two humans: mode', await page.evaluate(() => Game.state.mode), '| players', await page.evaluate(() => JSON.stringify(Game.state.players)));
  const humanToken = async () => {
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      const s = await page.evaluate(() => { const st = Game.state; return { ok: st.drawn && st.drawn === st.human && !st.computer && !st.activeId && !st.won && !st.lost, drawn: st.drawn }; });
      if (s.ok) { await page.waitForTimeout(900); return s.drawn; }
      await page.waitForTimeout(200);
    }
    throw new Error('no token');
  };
  const seenSides = new Set();
  for (let k = 0; k < 8 && seenSides.size < 2; k++) {
    const side = await humanToken();
    seenSides.add(side);
    const hint = await page.textContent('#hint');
    console.log(`  token ${side}: human is ${await page.evaluate(() => Game.state.human)} | ${hint.slice(0, 50)}`);
    // Pass it, from a piece's menu
    // (a piece a click really lands on: in a shared field the click can pick one beside it that has already gone)
    const p = await page.evaluate(() => {
      const st = Game.state;
      const ready = st.units.filter(o => o.side === st.human && o.x !== null && Sim.canAct(st, o));
      const clean = ready.find(o => { const at = Board.pieceScreen(o); return Board.pieceAt(st, at.x, at.y, st.human) === o; });
      return Board.pieceScreen(clean || ready[0]);
    });
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
    const skip = page.locator('#menu button', { hasText: 'Skip turn' });
    if (await skip.count()) await skip.first().click();
    await page.waitForTimeout(1200);
  }
  console.log('  both players had tokens:', [...seenSides].join(','));

  // A shot at the other player's piece: the bubble, Take cover, then the dice
  const side = await humanToken();
  const set = await page.evaluate(() => {
    const st = Game.state;
    st.hedges = {}; st.wire = {};
    const me = st.units.find(u => u.side === st.human && u.kind === 'company' && u.x !== null);
    const foe = st.units.find(u => u.side !== st.human && u.kind === 'company' && u.x !== null);
    for (const u of st.units) if (u !== me && u !== foe && u.x !== null && u.y === 5 && u.x >= 2 && u.x <= 6) { u.x = u.side === 'us' ? 0 : 11; u.y = 7; }
    me.x = 2; me.y = 5; me.at = null; me.acted = false; me.down = false; me.shocked = false;
    foe.x = 4; foe.y = 5; foe.at = null; foe.acted = false; foe.down = false; foe.shocked = false;
    Game.refresh();
    return { me: me.id, foe: foe.id };
  });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(id => Board.pieceScreen(Sim.unitById(Game.state, id)), set.me);
  await page.mouse.click(m.x, m.y);
  await page.waitForTimeout(500);
  const f = await page.evaluate(id => Board.pieceScreen(Sim.unitById(Game.state, id)), set.foe);
  await page.mouse.click(f.x, f.y);
  await page.waitForTimeout(500);
  const askedNow = await page.isVisible('#ask-pull');
  console.log(`  ${side} fires: other player asked: ${askedNow} | fired yet: ${await page.evaluate(id => Game.state.fx.some(o => o.from && o.from.id === id), set.me)}`);

  await page.click('#ask-pull');
  await page.waitForTimeout(900);
  console.log('  after Take cover:', JSON.stringify(await page.evaluate(([a, b]) => { const st = Game.state, t = Sim.unitById(st, b), shot = st.fx.filter(o => o.from && o.from.id === a).pop(); return { foeDown: t.down, need: shot && shot.need, dice: shot && shot.faces.length }; }, [set.me, set.foe])));

  // Shells at the other player's pieces: nobody is asked (no taking cover from shells, Steve), they just land
  await page.waitForTimeout(600);
  await page.evaluate(() => {});
  const side2 = await humanToken();
  const shell = await page.evaluate(() => {
    const st = Game.state;
    st.hedges = {}; st.wire = {};
    const foes = st.units.filter(u => u.side !== st.human && u.x !== null && u.kind === 'company');
    const mine = st.units.find(u => u.side === st.human && u.kind === 'company' && u.x !== null);
    for (const u of st.units) if (u.x !== null && u.y >= 4 && u.y <= 5 && u.x >= 2 && u.x <= 6 && !foes.includes(u)) { u.x = u.side === 'us' ? 0 : 11; u.y = 7; }
    mine.x = 2; mine.y = 5; mine.at = null;
    foes[0].x = 5; foes[0].y = 5; foes[0].at = null; foes[0].acted = false; foes[0].down = false;
    if (foes[1]) { foes[1].x = 5; foes[1].y = 4; foes[1].at = null; foes[1].acted = false; foes[1].down = false; }
    Game.refresh();
    return { target: foes[0].id, other: foes[1] && foes[1].id, side: st.human, rounds: st.ammo[st.human].artillery };
  });
  await page.waitForTimeout(1000);
  const gunSpot = await page.evaluate(s => {
    const box = document.querySelector('#board').getBoundingClientRect();
    for (let y = box.top + 5; y < box.bottom; y += 10) for (let x = box.left + 5; x < box.right; x += 10) if (Board.gunAt(x, y, s) === 'artillery') return { x, y };
    return null;
  }, shell.side);
  await page.mouse.click(gunSpot.x, gunSpot.y);
  await page.waitForTimeout(500);
  const t = await page.evaluate(id => Board.pieceScreen(Sim.unitById(Game.state, id)), shell.target);
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(500);
  let asks = 0;
  while (await page.isVisible('#ask-stay').catch(() => false)) {
    asks++;
    await page.click(asks === 1 ? '#ask-pull' : '#ask-stay');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(800);
  if (asks) { process.exitCode = 1; console.log('  ❌ a piece was asked to take cover from shells'); }
  console.log(`  ${side2} artillery: ${asks} pieces asked |`, JSON.stringify(await page.evaluate(s => ({ roundsLeft: Game.state.ammo[s].artillery }), shell.side)), 'was', shell.rounds);

  // Two humans, a win: the plain ending
  const endBy = Date.now() + 60000;
  await page.evaluate(() => {
    const st = Game.state, o = st.objective;
    for (const u of st.units) if (u.side === 'de' && u.x !== null) { if (u.kind === 'company' && !st.__keep) { st.__keep = u; u.x = 11; u.y = 7; u.at = null; } else Sim.remove(st, u); }
    for (const u of st.units) if (u.side === 'us' && u.x !== null && u.id !== 'A') Sim.remove(st, u);
    const A = Sim.unitById(st, 'A'); A.platoons = 3; A.x = o.x; A.y = o.y; A.at = null;
    Game.refresh();
  });
  while (Date.now() < endBy && !(await page.isVisible('#result'))) {
    await page.evaluate(() => { const st = Game.state; if (st.drawn && st.drawn === st.human && !st.computer) Game.pass(); });
    await page.waitForTimeout(400);
  }
  console.log('  two humans ends:', await page.textContent('#result-title'), '|', await page.textContent('#result-text'));
  const was = await page.evaluate(() => Game.state.map.id);
  console.log('  its button:', await page.textContent('#again-btn'));
  await page.click('#again-btn');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ mode: Game.state.mode, map: Game.state.map.id }));
  const wanted = await page.evaluate(id => CAMPAIGN[(CAMPAIGN.indexOf(id) + 1) % CAMPAIGN.length], was);
  console.log('  next battle keeps the commanders:', after.mode, '| map', was, '->', after.map, after.map === wanted ? 'ok' : 'WRONG');
  if (after.map !== wanted || after.mode !== 'both') process.exitCode = 1;

  // ---------- Two robots ----------
  await page.click('#new-btn');
  await page.waitForTimeout(300);
  console.log('new game lit:', await lit(), '| cancel:', await page.isVisible('#newgame [data-close]'));
  await page.click('#us-robot');
  await page.click('#de-robot');
  await page.click('#start-game');
  await page.waitForTimeout(800);
  console.log('two robots: goal:', (await page.textContent('#goal')).slice(0, 70));
  const moved = new Set();
  const watchBy = Date.now() + 75000;
  let shotDone = false;
  while (Date.now() < watchBy) {
    const m2 = await page.evaluate(() => { const st = Game.state; return st.computer ? st.computer.side : null; });
    if (m2) moved.add(m2);

    if (await page.isVisible('#ask-stay').catch(() => false)) { console.log('  ❌ a robot game asked a question'); break; }
    await page.waitForTimeout(300);
  }
  console.log('  sides seen moving:', [...moved].join(','), '| round', await page.evaluate(() => Game.state.turn));
  // A click on a piece only shows it
  const any = await page.evaluate(() => { const u = Game.state.units.find(o => o.x !== null && o.side === 'us'); return { id: u.id, ...Board.pieceScreen(u) }; });
  await page.mouse.click(any.x, any.y);
  await page.waitForTimeout(400);
  console.log('  click on a piece:', JSON.stringify(await page.evaluate(() => ({ sel: UI.selected() && UI.selected().id, mode: UI.view.mode, menu: !document.querySelector('#menu').hidden, buttons: document.querySelectorAll('#actions button').length }))));
  // To the round limit: a draw
  await page.evaluate(lim => { Game.state.turn = lim; }, 30);
  await page.waitForSelector('#result:not([hidden])', { timeout: 120000 });
  console.log('  two robots ends:', await page.textContent('#result-title'), '|', await page.textContent('#result-text'));
  // A draw is not a win: the same battle again (Steve)
  const drawnOn = await page.evaluate(() => Game.state.map.id);
  console.log('  its button:', await page.textContent('#again-btn'));
  await page.click('#again-btn');
  await page.waitForTimeout(500);
  const drawnNext = await page.evaluate(() => Game.state.map.id);
  console.log('  after a draw, the same battle again:', drawnOn, '->', drawnNext, drawnOn === drawnNext ? 'ok' : 'WRONG');
  if (drawnOn !== drawnNext) process.exitCode = 1;

  // ---------- A reload remembers; one human still works ----------
  await page.reload();
  await page.waitForTimeout(1000);
  console.log('after reload lit:', await lit());
  await page.click('#de-human');
  await page.click('#start-game');
  await page.waitForTimeout(600);
  console.log('human German v robot:', await page.evaluate(() => Game.state.mode));
  const humanEnd = Date.now() + 60000;
  let robotAsked = false;
  while (Date.now() < humanEnd) {
    if (await page.isVisible('#ask-stay').catch(() => false)) { robotAsked = true; break; }
    const st2 = await page.evaluate(() => { const st = Game.state; return st.drawn === 'de' && !st.computer && !st.activeId; });
    if (st2) { await page.evaluate(() => Game.pass()); }
    await page.waitForTimeout(300);
  }
  console.log('  the American robot asks you about its shots:', robotAsked);
  if (errors.length) { process.exitCode = 1; console.log('ERRORS: ' + errors.join('; ')); } else console.log('no errors');
  await browser.close();
}

// Where a piece is at the moment a shot at it lands
async function checkOrder() {
  const browser = await chromium.launch({ headless: false, slowMo: 25 });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8768/');
  await page.waitForTimeout(800);
  console.log('version', await page.textContent('#ver'));
  await page.click('#map-hedges');
  await page.click('#us-human');
  await page.click('#de-robot');
  await page.click('#start-game');

  const ourToken = async () => {
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      if (await page.isVisible('#ask-stay').catch(() => false)) await page.click('#ask-stay');
      const ready = await page.evaluate(() => { const st = Game.state; return st.drawn === 'us' && !st.computer && !st.activeId && !st.won && !st.lost; });
      if (ready) { await page.waitForTimeout(900); return; }
      await page.waitForTimeout(200);
    }
    throw new Error('no token');
  };
  // Record where a piece is every 40 ms, and how long until the shots land
  const record = id => page.evaluate(pid => {
    window.__log = [];
    const t0 = performance.now();
    window.__rec = setInterval(() => {
      const w = Board.whereNow(pid);
      window.__log.push({ t: Math.round(performance.now() - t0), x: w.x, z: w.z, vis: w.visible, bases: w.bases, busy: Math.round(Board.busyFor()) });
    }, 40);
  }, id);
  const stop = () => page.evaluate(() => { clearInterval(window.__rec); return window.__log; });
  // The moment the shot lands: the last moment there was still time to wait
  const report = (label, log) => {
    let lastBusy = -1;
    log.forEach((e, i) => { if (e.busy > 0) lastBusy = i; });
    const start = log[0], end = log[log.length - 1];
    if (lastBusy < 0) { console.log(`${label}: no shot seen | start x ${start.x.toFixed(2)} end x ${end.x.toFixed(2)}`); return; }
    const at = log[lastBusy];
    const moves = log.filter((e, i) => i && Math.hypot(e.x - log[i - 1].x, e.z - log[i - 1].z) > 0.003);
    const before = moves.filter(e => e.t < at.t).length, after = moves.filter(e => e.t > at.t).length;
    console.log(`${label}: start (${start.x.toFixed(2)},${start.z.toFixed(2)}) | shot lands at ${at.t} ms with the piece at (${at.x.toFixed(2)},${at.z.toFixed(2)}), showing ${at.vis} with ${at.bases} bases | end (${end.x.toFixed(2)},${end.z.toFixed(2)}) showing ${end.vis} with ${end.bases} bases | frames moving before ${before}, after ${after}`);
  };

  // ---------- 1. Steve's: I shoot a platoon, it loses a section ----------
  await ourToken();
  await page.evaluate(() => {
    const st = Game.state;
    st.hedges = {}; st.wire = {};
    for (const u of st.units) if (u.x !== null && u.y >= 4 && u.y <= 6 && u.x >= 1 && u.x <= 6) { u.x = u.side === 'us' ? 0 : 11; u.y = 7; }
    const A = Sim.unitById(st, 'B'), d = Sim.unitById(st, 'd2');
    A.x = 2; A.y = 5; A.at = null; A.acted = false; A.down = false; A.shocked = false;
    // Two sections, shaken, in a corner: a hit takes a section, and one section takes one area at the hedge
    d.x = 4; d.y = 5; d.at = 'nw'; d.platoons = 2; d.shocked = true; d.acted = true; d.down = false;
    Game.refresh();
  });
  await page.waitForTimeout(1300);
  const a = await page.evaluate(() => Board.pieceScreen(Sim.unitById(Game.state, 'B')));
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(500);
  // Every die hits
  // One die hits, the rest miss
  await page.evaluate(() => { const st = Game.state; window.__rand = st.rand; const seq = [0, 0.99]; st.rand = () => (seq.length ? seq.shift() : 0); });
  await record('d2');
  await page.waitForTimeout(160);
  const t = await page.evaluate(() => Board.pieceScreen(Sim.unitById(Game.state, 'd2')));
  await page.mouse.click(t.x, t.y);
  await page.waitForTimeout(2200);
  await page.evaluate(() => { Game.state.rand = window.__rand; });
  report('Shot at a platoon, it drops to one section', await stop());
  console.log('   it stands now at', await page.evaluate(() => Sim.unitById(Game.state, 'd2').at), 'sections', await page.evaluate(() => Sim.unitById(Game.state, 'd2').platoons));

  // ---------- 2. Ambushes on a piece of ours moving along the lane, three fields ----------
  const cases = [
    ['Ambush as it sets off', 5, false],
    ['Ambush as it passes a field', 7, false],
    ['Ambush as it arrives', 8, false],
    ['Ambush kills it on the way', 7, true],
    ['Ambush kills it as it arrives', 8, true],
  ];
  for (const [label, ambushX, kill] of cases) {
    await page.evaluate(() => Game.restart(undefined, 'us', 'hedges'));
    await ourToken();
    await page.evaluate(([x, k]) => {
      const st = Game.state;
      st.hedges = {}; st.wire = {};
      for (const u of st.units) if (u.x !== null && u.y >= 4 && u.y <= 6) { u.x = u.side === 'us' ? 0 : 11; u.y = 7; }
      const C = Sim.unitById(st, 'C'), d = Sim.unitById(st, 'd2');
      C.x = 1; C.y = 5; C.at = null; C.acted = false; C.down = false; C.shocked = false; C.platoons = k ? 1 : 3;
      if (k) C.shocked = false;
      d.x = x; d.y = 5; d.at = null; d.acted = true; d.down = false; d.shocked = false; d.ambush = true; d.platoons = 3;
      Game.refresh();
    }, [ambushX, kill]);
    await page.waitForTimeout(1300);
    const c = await page.evaluate(() => Board.pieceScreen(Sim.unitById(Game.state, 'C')));
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(500);
    // Hits every time when it must die; a shaken result otherwise stops it, so misses when it must carry on
    await page.evaluate(k => { const st = Game.state; window.__rand = st.rand; let n = 0; st.rand = () => (k ? 0.1 + 0.89 * ((n++ % 2)) : 0.0); }, kill);
    await page.evaluate(k => { const st = Game.state; if (k) st.rand = () => 0.99; }, kill);
    await record('C');
    await page.waitForTimeout(160);
    const to = await page.evaluate(() => Board.screenPoint(4.5, 5.5));
    await page.mouse.click(to.x, to.y);
    await page.waitForTimeout(3600);
    const res = await page.evaluate(() => { const st = Game.state, u = Sim.unitById(st, 'C'), f = (st.fx || []).filter(o => o.from && o.to && o.to.id === 'C').pop(); return { x: u.x, y: u.y, seen: f ? [f.x, f.y] : null, hit: f ? f.result : null }; });
    await page.evaluate(() => { Game.state.rand = window.__rand; });
    report(`${label} (seen at ${res.seen}, ${res.hit}, now at ${res.x})`, await stop());
  }
  // ---------- The PaK across the large village, as the Germans ----------
  let done = false;
  for (let k = 0; k < 8 && !done; k++) {
    await page.evaluate(() => Game.restart(undefined, 'de', 'hedges'));
    await page.waitForTimeout(300);
    const large = await page.evaluate(() => Game.state.objective.y === 4);
    if (!large) continue;
    done = true;
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      if (await page.isVisible('#ask-stay').catch(() => false)) await page.click('#ask-stay');
      const ready = await page.evaluate(() => { const st = Game.state; return st.drawn === 'de' && !st.computer && !st.activeId && Sim.canAct(st, Sim.unitById(st, 'pak1')); });
      if (ready) break;
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(900);
    const p = await page.evaluate(() => { const u = Sim.unitById(Game.state, 'pak1'); return { field: [u.x, u.y], at: u.at, ...Board.pieceScreen(u) }; });
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(500);
    const lit = await page.evaluate(() => ({ spots: UI.spots().map(s => s.x + ',' + s.y + ':' + s.kind), menu: document.querySelector('#menu').innerText.replace(/\n+/g, ' | ') }));
    console.log('PaK at', p.field.join(), p.at, '| lit', lit.spots.join(' '), '| menu', lit.menu);

    const empty = await page.evaluate(list => list.filter(s => s.includes(':charge')).find(s => { const [x, y] = s.split(':')[0].split(',').map(Number); return !Sim.at(Game.state, x, y).length; }), lit.spots);
    const dest = empty || lit.spots.find(s => s.includes(':charge'));
    const [dx, dy] = dest.split(':')[0].split(',').map(Number);
    const to = await page.evaluate(([x, y]) => Board.screenPoint(x + 0.17, y + 0.17), [dx, dy]);
    const onMenu = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y).closest('#menu'), [to.x, to.y]);
    await page.mouse.click(to.x, to.y);
    await page.waitForTimeout(1200);
    console.log('  clicked the north-west of', dest, '| menu in the way:', onMenu, '|', JSON.stringify(await page.evaluate(() => { const u = Sim.unitById(Game.state, 'pak1'); return { at: [u.x, u.y, u.at], deg: u.aim === undefined ? null : Math.round(u.aim * 180 / Math.PI), acted: u.acted, offer: !!u.mayAmbush, menu: document.querySelector('#menu').hidden ? '' : document.querySelector('#menu').innerText.replace(/\n+/g, ' | ') }; })));
  }
  console.log('large village game found:', done);
  if (errors.length) { process.exitCode = 1; console.log('ERRORS: ' + errors.join('; ')); } else console.log('no errors');
  await browser.close();
}

// The Eiffel Tower in Paris: its top on screen in wide and narrow windows, and the view put back on the next map
async function checkTower() {
  const browser = await chromium.launch({ headless: false, slowMo: 25 });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8768/');
  await page.waitForTimeout(800);
  await page.click('#start-game');
  await page.waitForTimeout(300);
  const backEdge = () => page.evaluate(() => Math.round(Board.screenPoint(6, 0).y));
  await page.evaluate(() => Game.restart(5, 'none', 'hedges'));
  await page.waitForTimeout(400);
  const usual = await backEdge();
  for (const [width, height] of [[1600, 950], [2400, 800], [1000, 900], [1280, 640]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await page.evaluate(() => Game.restart(5, 'none', 'paris'));
    await page.waitForTimeout(500);
    const seen = await page.evaluate(() => {
      const o = Game.state.objective;
      const p = Board.screenPoint(o.x + 0.5, o.y + 0.5, Models.EIFFEL_HEIGHT), r = document.querySelector('#board').getBoundingClientRect();
      return { top: Math.round(p.y - r.top), left: Math.round(p.x - r.left), width: Math.round(r.width) };
    });
    const ok = seen.top >= 0 && seen.left >= 0 && seen.left <= seen.width;
    console.log(`tower at ${width}x${height}: top of it ${seen.top}px below the top of the table's box: ${ok ? 'ok' : 'CUT OFF'}`);
    if (!ok) process.exitCode = 1;
  }
  // Back on another map, in the first window, the view is as it was
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.waitForTimeout(400);
  await page.evaluate(() => Game.restart(5, 'none', 'hedges'));
  await page.waitForTimeout(500);
  const after = await backEdge();
  console.log(`hedge country view: back edge at ${usual}, after Paris ${after}`);
  if (Math.abs(after - usual) > 2) process.exitCode = 1;
  if (errors.length) { process.exitCode = 1; console.log('ERRORS: ' + errors.join('; ')); } else console.log('no errors');
  await browser.close();
}

(async () => {
  await checkTower();
  await checkPlayers();
  await checkOrder();
})().catch(e => { console.error(e); process.exit(1); });
