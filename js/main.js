// Hedgerow: start-up, input, drawing the table, and the rounds: tokens drawn from a blind bag one at a time, each side
// moving one piece a token (the Germans with their "take cover?" questions)

window.Game = (() => {
  const G = {};
  let st, hover = null, hotTarget = null, dirty = true;
  const $ = s => document.querySelector(s);
  const board = $('#board');

  function start(seed) {
    st = Sim.newGame(seed);
    G.state = st;
    UI.setState(st);
    Sim.startRound(st);
    changed();
    setTimeout(drawNext, 900);
  }

  // Something changed: the panel now, the table on the next frame. If that was the American token's piece finishing its
  // move, the next token is drawn
  let drawing = false;
  function changed() {
    UI.update();
    dirty = true;
    if (!drawing && Sim.activationOver(st)) {
      drawing = true;
      Sim.passToken(st);
      UI.view.mode = null;
      UI.update();
      Board.clearToken();
      setTimeout(() => { drawing = false; drawNext(); }, 700);
    }
  }

  // Draw the table whenever something changed or pieces are still gliding; place the hamlet's name over it
  function frame() {
    if (dirty) {
      const spots = UI.spots();
      let targets = UI.targets();
      // The shooter, for the lines of sight to its targets
      let shooter = ['shoot', 'halfShot'].includes(UI.view.mode) ? UI.selected() : null, mortarAim = null, aimWhich = null;
      // During the German hour, show who is aiming at whom (Steve): the shooter's field, a line of fire to the target,
      // its red cross-hair with the score needed. German mortars: the line comes from their mortar off the board
      if (st.de && st.de.ask) {
        const shot = st.de.ask, t = Sim.unitById(st, shot.target), s = shot.shooter && Sim.unitById(st, shot.shooter);
        if (s) spots.push({ x: s.x, y: s.y, kind: 'charge' });
        spots.push({ x: t.x, y: t.y, kind: 'shoot' });
        if (s) {
          t.needNow = Math.min(6, Sim.needFor(st, s, t) + (Sim.isTank(t) ? PIECES[t.kind].armour : 0));
          t.needWhy = Sim.needWhy(st, s, t);
          shooter = s;
        } else {
          t.needNow = TO_HIT + (Sim.tileType(t.x, t.y) === 'village' ? COVER.village : 0);
          t.needWhy = [];
          mortarAim = t;
          aimWhich = shot.artillery ? 'artillery' : 'mortars';
        }
        targets = [t];
      }
      // Green rings under pieces that can still act this hour, grey under those that have
      const ready = st.de || st.won || st.lost ? null : u => Sim.canAct(st, u) || (Sim.canRally(st, u) && Sim.rallyTargets(st, u).length > 0);
      const guns = st.de || st.won || st.lost ? null : UI.supportState();
      dirty = Board.render(st, { spots, selected: UI.selected(), hover, targets, hotTarget, ready, shooter, mortarAim, aimWhich, guns, fireFrom: (UI.view.mode || '').startsWith('fire:') ? UI.view.mode.slice(5) : null });
      const p = Board.screenPoint(st.objective.x + 0.5, st.objective.y, 0.35), r = board.getBoundingClientRect();
      Object.assign($('#label').style, { left: p.x - r.left + 'px', top: p.y - r.top + 'px' });
      $('#label').textContent = `🎯 ${st.objective.name}`;
    }
    requestAnimationFrame(frame);
  }

  function fit() {
    const r = board.getBoundingClientRect();
    Board.resize(Math.max(200, r.width), Math.max(200, r.height));
    dirty = true;
  }

  // ---------- The bag ----------

  // Draw the next token: it grows and floats to the middle of the table, then that side moves. An empty bag ends the round
  function drawNext() {
    if (st.won || st.lost) return;
    const side = Sim.drawToken(st);
    if (!side) {
      Sim.endRound(st);
      UI.view.log = [];
      changed();
      if (st.won || st.lost) return showResult();
      Sim.startRound(st);
      changed();
      setTimeout(drawNext, 1200);
      return;
    }
    changed();
    UI.flyToken(side, () => {
      if (side === 'de') return runGermans();
      // No American piece able to move on it: the token is used up
      if (!Sim.usCanMove(st)) { Sim.passToken(st); Board.clearToken(); changed(); setTimeout(drawNext, 600); return; }
      changed();
    });
  }

  // Pass on an American token (the bar's button, or Enter)
  function pass() {
    if (st.won || st.lost || st.drawn !== 'us') return;
    UI.closeMenu();
    UI.view.mode = null;
    Sim.passToken(st);
    Board.clearToken();
    changed();
    setTimeout(drawNext, 400);
  }

  // The German piece moves; if it fires on a piece that could take cover, ask first
  function runGermans() {
    const r = Sim.germanStep(st);
    if (r.ask) return ask(r.ask);
    Sim.endGermanToken(st);
    $('#ask').hidden = true;
    changed();
    setTimeout(() => { Board.clearToken(); setTimeout(drawNext, 400); }, 700);
  }

  function ask(shot) {
    const t = Sim.unitById(st, shot.target);
    const who = shot.artillery ? 'German artillery ranges on' : shot.mortar ? 'German mortars range on' : `${Sim.unitById(st, shot.shooter).name} opens fire on`;
    $('#ask-text').innerHTML = `${who} <b>${t.name}</b>. Take cover? Its men get down where they are: one more is needed to hit it for the rest of this round, but it loses its move (this round's if it still has one, otherwise next round's) unless the captain gets it up.`;
    $('#ask').hidden = false;
    changed();
  }

  function answer(pull) {
    $('#ask').hidden = true;
    Sim.answer(st, pull);
    changed();
    // A moment to see the dice before the Germans carry on
    setTimeout(runGermans, 350);
  }

  function showResult() {
    $('#result-title').textContent = st.won ? '🏆 Saint-Jean is ours' : '⌛ The attack has failed';
    $('#result-text').textContent = st.report[0];
    $('#result').hidden = false;
  }

  // ---------- Input ----------

  board.addEventListener('click', e => {
    if (e.target.closest('#menu')) return;
    UI.closeMenu();
    // Shooting: the red cross-hair nearest the click, even one over a house
    const aimed = Board.targetAt(UI.targets(), e.clientX, e.clientY);
    if (aimed && UI.shootTarget(aimed)) { hotTarget = null; changed(); if (st.won || st.lost) showResult(); return; }
    // Your mortars or artillery off the board: choose them like a piece
    const gun = !st.de && Board.gunAt(e.clientX, e.clientY);
    if (gun) { Sound.play('select'); Board.clearDice(); UI.selectSupport(gun); changed(); return; }
    const f = Board.fieldAt(e.clientX, e.clientY);
    if (!f) return;
    // The one piece under the pointer (the nearest in the field if the click misses the models)
    const mine = UI.clickField(f.x, f.y, Board.pieceAt(st, e.clientX, e.clientY), f.side);
    changed();
    // Your pieces there: open their menu by the click
    // Picking the next piece clears the last shots' dice off the table
    if (mine) { Sound.play('select'); Board.clearDice(); const r = board.getBoundingClientRect(); UI.openMenu(mine, e.clientX - r.left, e.clientY - r.top, r); $('#tip').style.display = 'none'; }
    if (st.won || st.lost) showResult();
  });
  board.addEventListener('mousemove', e => {
    // The cross-hair under the pointer grows, so it is clear which target a click will fire on
    const hot = Board.targetAt(UI.targets(), e.clientX, e.clientY);
    if ((hot && hot.id) !== (hotTarget && hotTarget.id)) { hotTarget = hot; dirty = true; }
    const f = Board.fieldAt(e.clientX, e.clientY);
    const sameField = f && hover && f.x === hover.x && f.y === hover.y;
    if ((sameField && f.side === hover.side) || (!f && !hover)) return;
    hover = f; dirty = true;
    if (!sameField && $('#menu').hidden) tooltip(e, f);
  });
  board.addEventListener('mouseleave', () => { hover = null; dirty = true; $('#tip').style.display = 'none'; });

  // What is in a field, on hover
  function tooltip(e, f) {
    const tip = $('#tip');
    if (!f) { tip.style.display = 'none'; return; }
    const NAMES = { field: 'Field', orchard: 'Orchard', village: 'Village', hamlet: 'Hamlet', river: 'River', bridge: 'Bridge', laneEW: 'Lane', laneNS: 'Lane', crossroads: 'Crossroads' };
    const here = Sim.at(st, f.x, f.y);
    const lines = here.map(u => `${u.side === 'us' ? 'US' : 'German'} · ${u.name}${u.kind === 'company' ? ` · ${u.platoons} sections` : Sim.isTank(u) ? ` · ${u.platoons} tanks` : ''}${u.shocked ? ' · shaken' : ''}`);
    const t = Sim.tileType(f.x, f.y);
    const cover = t === 'village' || t === 'hamlet' ? 'Houses: one more needed on the dice to hit anyone here' : t === 'river' ? 'Nothing can cross except at a bridge' : t === 'orchard' ? 'Trees: they block the view across' : '';
    // A village field takes the name of the nearest village
    const village = t === 'village' ? VILLAGES.slice().sort((a, b) => (Math.abs(a.x - f.x) + Math.abs(a.y - f.y)) - (Math.abs(b.x - f.x) + Math.abs(b.y - f.y)))[0].name : null;
    tip.innerHTML = `<b>${village || NAMES[t]}</b>${cover ? `<br><span style="color:var(--muted)">${cover}</span>` : ''}${lines.length ? '<br>' + lines.join('<br>') : ''}`;
    const r = board.getBoundingClientRect();
    Object.assign(tip.style, { display: 'block', left: Math.min(r.width - 290, e.clientX - r.left + 14) + 'px', top: e.clientY - r.top + 14 + 'px' });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { UI.view.mode = null; UI.closeMenu(); changed(); }
    if (e.key === 'Enter' && $('#ask').hidden && $('#help').hidden && $('#result').hidden) pass();
  });
  $('#end').onclick = pass;
  $('#ask-pull').onclick = () => answer(true);
  $('#ask-stay').onclick = () => answer(false);
  $('#help-btn').onclick = openHelp;
  // The rules all on the screen at once: the text gets a little smaller until it fits (Steve: no scrolling)
  function openHelp() {
    const help = $('#help'), card = help.querySelector('.card');
    help.hidden = false;
    let size = 12.5;
    card.style.fontSize = size + 'px';
    while (card.scrollHeight > card.clientHeight + 1 && size > 8.5) { size -= 0.25; card.style.fontSize = size + 'px'; }
  }
  // Sound on or off (remembered on this computer)
  const soundIcon = () => { $('#sound-btn').textContent = Sound.isOn() ? '🔊' : '🔇'; };
  $('#sound-btn').onclick = () => { Sound.wake(); Sound.toggle(); soundIcon(); };
  soundIcon();
  $('#help [data-close]').onclick = () => { $('#help').hidden = true; };
  $('#new-btn').onclick = () => { if (confirm('Start a new game?')) start(); };
  $('#again-btn').onclick = () => { $('#result').hidden = true; start(); };
  window.addEventListener('resize', fit);

  // ---------- Start ----------
  Board.init(board);
  UI.init(changed);
  start();
  fit();
  // The rules don't open at the start (Steve): How to play opens them
  requestAnimationFrame(frame);

  G.pass = pass;
  G.restart = start;
  G.refresh = changed;
  return G;
})();
