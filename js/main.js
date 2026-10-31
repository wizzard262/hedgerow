// Hedgerow: start-up, input, drawing the table, and the rounds: tokens drawn from a blind bag one at a time, each side
// moving one piece a token (the Germans with their "take cover?" questions)

window.Game = (() => {
  const G = {};
  let st, hover = null, hotTarget = null, dirty = true;
  // The German move just made ({ id or gun, what }), kept on the table for GERMAN_MOVE_SHOWN ms after its token ends
  let shownMove = null;
  const GERMAN_MOVE_SHOWN = 2200;
  const $ = s => document.querySelector(s);
  const board = $('#board');

  function start(seed) {
    st = Sim.newGame(seed);
    G.state = st;
    UI.setState(st);
    Sim.startRound(st);
    changed();
    // The first round's tokens fly into the bag once the pieces are on the table
    setTimeout(() => UI.returnTokens(() => setTimeout(drawNext, 400)), 700);
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

  // The fields your shot at the target under the pointer would land on, when it can hit more than one piece:
  // mortars the whole field, artillery the field and the four next to it, a tank's high explosive at men the whole field
  function blastFor(shooter, target) {
    // Nothing under the pointer, or it has left the table
    if (!target || target.x === null) return [];
    const mode = UI.view.mode || '';
    // Mortars or artillery chosen
    if (mode.startsWith('fire:')) return Sim.shellFields(mode.slice(5), target.x, target.y);
    // A tank shooting at men: its burst catches every other German piece on foot in that field
    if (shooter && Sim.isTank(shooter) && !Sim.isTank(target)) return [{ x: target.x, y: target.y, main: true }];
    // Every other weapon hits only the one piece
    return [];
  }

  // Draw the table whenever something changed or pieces are still gliding; place the hamlet's name over it
  function frame() {
    if (dirty) {
      const spots = UI.spots();
      let targets = UI.targets();
      // The shooter, for the lines of sight to its targets
      // (just picked, a piece that can shoot from where it stands shows its targets too)
      const aiming = ['shoot', 'halfShot'].includes(UI.view.mode) || (UI.view.mode === 'go' && targets.length > 0);
      let shooter = aiming ? UI.selected() : null, mortarAim = null, aimWhich = null;
      // The fields a shot that hits more than one piece would land on, shown round its target (Steve)
      let blast = blastFor(shooter, hotTarget);
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
          // A German tank's high explosive: the whole field
          blast = Sim.isTank(s) && !Sim.isTank(t) ? [{ x: t.x, y: t.y, main: true }] : [];
        } else {
          t.needNow = Sim.shellNeed(st, t);
          t.needWhy = Sim.shellWhy(st, t);
          mortarAim = t;
          aimWhich = shot.artillery ? 'artillery' : 'mortars';
          // German guns: the field and the four round it. Their mortar drops on the one piece only
          blast = shot.artillery ? Sim.shellFields('artillery', t.x, t.y, 'de') : [];
        }
        targets = [t];
      }
      // Green rings under pieces that can still act this hour, grey under those that have
      const ready = st.de || st.won || st.lost ? null : u => Sim.canAct(st, u) || Sim.captainCanRally(st, u);
      const guns = st.de || st.won || st.lost ? null : UI.supportState();
      dirty = Board.render(st, { spots, selected: UI.selected(), hover, targets, hotTarget, ready, shooter, mortarAim, aimWhich, guns, blast, rallies: UI.rallies(), deMove: (st.de && st.de.move) || shownMove, fireFrom: (UI.view.mode || '').startsWith('fire:') ? UI.view.mode.slice(5) : null });
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
    // One side wiped out: the game stops at once (Steve: the round isn't finished)
    if (st.won || st.lost) return showResult();
    const side = Sim.drawToken(st);
    if (!side) return nextRound();
    changed();
    // The timer token (Steve): it lands on the table, and the round ends at once
    if (side === 'timer') {
      UI.flyToken(side, () => setTimeout(() => { Board.clearToken(); nextRound(); }, 900));
      return;
    }
    UI.flyToken(side, () => {
      if (side === 'de') return runGermans();
      // No American piece able to move on it: the token is used up
      if (!Sim.usCanMove(st)) { Sim.passToken(st); Board.clearToken(); changed(); setTimeout(drawNext, 600); return; }
      changed();
    });
  }

  // The bag is empty (or the timer came out): the round ends, then a new one starts with a full bag
  function nextRound() {
    Sim.endRound(st);
    UI.view.log = [];
    changed();
    if (st.won || st.lost) return showResult();
    Sim.startRound(st);
    changed();
    // Every piece's token flies back into the bag (Steve), then the first is drawn
    UI.returnTokens(() => setTimeout(drawNext, 400));
  }

  // Pass on an American token (no button for it now, Steve: each piece has Skip turn; the screenshot tool still uses it)
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
    // Keep what it did on the table a moment after the token ends, so you can see it (Steve)
    shownMove = st.de && st.de.move;
    Sim.endGermanToken(st);
    $('#ask').hidden = true;
    changed();
    // The Germans' move wiped one side out: the game is over
    if (st.won || st.lost) return showResult();
    setTimeout(() => { shownMove = null; dirty = true; Board.clearToken(); setTimeout(drawNext, 400); }, GERMAN_MOVE_SHOWN);
  }

  function ask(shot) {
    const t = Sim.unitById(st, shot.target);
    const who = shot.artillery ? 'German artillery ranges on' : shot.mortar ? 'German mortars range on' : `${Sim.unitById(st, shot.shooter).name} opens fire on`;
    $('#ask-text').innerHTML = `${who} <b>${t.name}</b>. Take cover? Its men get down where they are: every shot at it rolls half the dice for the rest of this round, but it loses its move this round unless the captain gets it up. (Only a piece that hasn't moved yet can take cover.)`;
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
    // How it ended: a side wiped out, the village taken, or time run out
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    const usLeft = st.units.some(u => u.side === 'us' && u.x !== null);
    const winTitle = germansLeft ? `🏆 ${st.objective.name} is ours` : '🏆 The Germans are wiped out';
    const loseTitle = usLeft ? '⌛ The attack has failed' : '💀 The company is wiped out';
    $('#result-title').textContent = st.won ? winTitle : loseTitle;
    $('#result-text').textContent = st.report[0];
    $('#result').hidden = false;
  }

  // ---------- Input ----------

  board.addEventListener('click', e => {
    if (e.target.closest('#menu')) return;
    UI.closeMenu();
    // The captain rallying: the blue target nearest the click (Steve)
    const rallied = Board.targetAt(UI.rallies(), e.clientX, e.clientY);
    if (rallied && UI.rallyTarget(rallied)) { changed(); return; }
    // Shooting: the red cross-hair nearest the click, even one over a house
    const aimed = Board.targetAt(UI.targets(), e.clientX, e.clientY);
    if (aimed && UI.shootTarget(aimed)) { hotTarget = null; changed(); if (st.won || st.lost) showResult(); return; }
    // Your mortars or artillery off the board: choose them like a piece
    const gun = !st.de && Board.gunAt(e.clientX, e.clientY);
    if (gun) {
      // No pick-up sound as its targets show (Steve)
      Board.clearDice(); UI.selectSupport(gun); changed();
      // Its menu by the click, with Skip turn (Steve)
      const r = board.getBoundingClientRect();
      UI.openGunMenu(gun, e.clientX - r.left, e.clientY - r.top, r);
      return;
    }
    const f = Board.fieldAt(e.clientX, e.clientY);
    if (!f) return;
    // The one piece under the pointer (the nearest in the field if the click misses the models)
    const mine = UI.clickField(f.x, f.y, Board.pieceAt(st, e.clientX, e.clientY), f.side);
    changed();
    // Your pieces there: open their menu by the click
    // Picking the next piece clears the last shots' dice off the table
    // No pick-up sound as its moves spread out on the table (Steve)
    if (mine) { Board.clearDice(); const r = board.getBoundingClientRect(); UI.openMenu(mine, e.clientX - r.left, e.clientY - r.top, r); $('#tip').style.display = 'none'; }
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
    const cover = t === 'village' || t === 'hamlet' ? `Houses: hard cover, ${COVER.village} more needed on the dice to hit anyone here` : t === 'river' ? 'Nothing can cross except at a bridge' : t === 'orchard' ? 'Trees: they block the view across' : '';
    // A village field takes the name of the nearest village
    const village = t === 'village' ? VILLAGES.slice().sort((a, b) => (Math.abs(a.x - f.x) + Math.abs(a.y - f.y)) - (Math.abs(b.x - f.x) + Math.abs(b.y - f.y)))[0].name : null;
    tip.innerHTML = `<b>${village || NAMES[t]}</b>${cover ? `<br><span style="color:var(--muted)">${cover}</span>` : ''}${lines.length ? '<br>' + lines.join('<br>') : ''}`;
    const r = board.getBoundingClientRect();
    Object.assign(tip.style, { display: 'block', left: Math.min(r.width - 290, e.clientX - r.left + 14) + 'px', top: e.clientY - r.top + 14 + 'px' });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { UI.view.mode = null; UI.closeMenu(); changed(); }
  });
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
