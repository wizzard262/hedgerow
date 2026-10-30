// Hedgerow: start-up, input, drawing the table, and playing the German hour with its "pull back?" questions

window.Game = (() => {
  const G = {};
  let st, hover = null, dirty = true;
  const $ = s => document.querySelector(s);
  const board = $('#board');

  function start(seed) {
    st = Sim.newGame(seed);
    G.state = st;
    UI.setState(st);
    changed();
  }

  // Something changed: the panel now, the table on the next frame
  function changed() {
    UI.update();
    dirty = true;
  }

  // Draw the table whenever something changed or pieces are still gliding; place the hamlet's name over it
  function frame() {
    if (dirty) {
      const spots = UI.spots();
      // During the German hour, show who is firing on whom
      if (st.de && st.de.ask) {
        const shot = st.de.ask, t = Sim.unitById(st, shot.target), s = shot.shooter && Sim.unitById(st, shot.shooter);
        if (s) spots.push({ x: s.x, y: s.y, kind: 'charge' });
        spots.push({ x: t.x, y: t.y, kind: 'shoot' });
      }
      dirty = Board.render(st, { spots, selected: UI.selected(), hover });
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

  // ---------- The German hour ----------

  function endHour() {
    if (st.won || st.lost || st.de) return;
    UI.view.mode = null;
    Sim.startGermanHour(st);
    changed();
    runGermans();
  }

  // Play the Germans until one of them fires on a piece that could pull back, then ask
  function runGermans() {
    const r = Sim.germanStep(st);
    if (r.ask) return ask(r.ask);
    Sim.finishHour(st);
    UI.view.log = [];
    $('#ask').hidden = true;
    changed();
    if (st.won || st.lost) showResult();
  }

  function ask(shot) {
    const t = Sim.unitById(st, shot.target);
    const who = shot.mortar ? 'German mortars range on' : `${Sim.unitById(st, shot.shooter).name} opens fire on`;
    const g = Sim.groupOf(t), left = Math.floor((st.points[g] || 0) + 1e-9);
    $('#ask-text').innerHTML = `${who} <b>${t.name}</b>. ${Sim.groupName(st, g)} has ${left} point${left === 1 ? '' : 's'}: spend one to try to pull back a field and take half the hits?`;
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
    const f = Board.fieldAt(e.clientX, e.clientY);
    if (!f) return;
    UI.clickField(f.x, f.y);
    changed();
    if (st.won || st.lost) showResult();
  });
  board.addEventListener('mousemove', e => {
    const f = Board.fieldAt(e.clientX, e.clientY);
    if ((f && hover && f.x === hover.x && f.y === hover.y) || (!f && !hover)) return;
    hover = f; dirty = true;
    tooltip(e, f);
  });
  board.addEventListener('mouseleave', () => { hover = null; dirty = true; $('#tip').style.display = 'none'; });

  // What is in a field, on hover
  function tooltip(e, f) {
    const tip = $('#tip');
    if (!f) { tip.style.display = 'none'; return; }
    const NAMES = { field: 'Field', orchard: 'Orchard', village: 'Saint-Jean', hamlet: 'Hamlet', river: 'River', bridge: 'Bridge', laneEW: 'Lane', laneNS: 'Lane', crossroads: 'Crossroads' };
    const here = Sim.at(st, f.x, f.y);
    const lines = here.map(u => `${u.side === 'us' ? 'US' : 'German'} · ${u.name}${u.kind === 'company' ? ` · ${u.platoons} platoons` : Sim.isTank(u) ? ` · ${u.platoons} tanks` : ''}${u.shocked ? ' · shaken' : ''}`);
    const t = Sim.tileType(f.x, f.y);
    const cover = t === 'village' || t === 'hamlet' ? 'Houses: hard to hit (6 to hit); room for one company or one tank platoon' : t === 'river' ? 'Nothing can cross except at a bridge' : t === 'orchard' ? 'Trees' : '';
    tip.innerHTML = `<b>${NAMES[t]}</b>${cover ? `<br><span style="color:var(--muted)">${cover}</span>` : ''}${lines.length ? '<br>' + lines.join('<br>') : ''}`;
    const r = board.getBoundingClientRect();
    Object.assign(tip.style, { display: 'block', left: Math.min(r.width - 290, e.clientX - r.left + 14) + 'px', top: e.clientY - r.top + 14 + 'px' });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { UI.view.mode = null; changed(); }
    if (e.key === 'Enter' && $('#ask').hidden && $('#help').hidden && $('#result').hidden) endHour();
  });
  $('#end').onclick = endHour;
  $('#ask-pull').onclick = () => answer(true);
  $('#ask-stay').onclick = () => answer(false);
  $('#help-btn').onclick = () => { $('#help').hidden = false; };
  $('#help [data-close]').onclick = () => { $('#help').hidden = true; };
  $('#new-btn').onclick = () => { if (confirm('Start a new game?')) start(); };
  $('#again-btn').onclick = () => { $('#result').hidden = true; start(); };
  window.addEventListener('resize', fit);

  // ---------- Start ----------
  Board.init(board);
  UI.init(changed);
  start();
  fit();
  $('#help').hidden = false;
  requestAnimationFrame(frame);

  G.endHour = endHour;
  G.restart = start;
  G.refresh = changed;
  return G;
})();
