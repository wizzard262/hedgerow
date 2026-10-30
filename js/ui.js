// Hedgerow: the controls on the left: the clock, the company's fire support, the chosen piece and what it can do,
// the pieces by platoon, and what happened

const UI = (() => {
  let st;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  // What the player has chosen: a piece, and an action waiting for a field to be clicked
  const view = { sel: null, mode: null, log: [] };

  const KIND = { company: 'Rifle platoon', captain: 'Captain', sherman: 'Sherman section', firefly: 'Firefly section', mg: 'Machine-gun team', bazooka: 'Bazooka team',
                 pz4: 'Panzer IV section', panther: 'Panther section', mg42: 'MG 42 team', schreck: 'Panzerschreck team', pak: 'PaK 40 anti-tank gun' };

  function setState(s) { st = s; view.sel = null; view.mode = null; view.log = []; }
  const selected = () => (view.sel ? Sim.unitById(st, view.sel) : null);

  // ---------- Which fields an action can use ----------

  function spots() {
    const u = selected();
    if (view.mode && view.mode.startsWith('fire:')) {
      const out = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (Sim.canCallFire(st, x, y) && Sim.at(st, x, y, 'de').length) out.push({ x, y, kind: 'fire' });
      return out;
    }
    if (!u || !view.mode) return [];
    const fields = list => list.map(p => ({ x: p.x, y: p.y }));
    const uniq = list => list.filter((p, i) => list.findIndex(q => q.x === p.x && q.y === p.y) === i);
    const kind = { charge: 'charge', moveShoot: 'hatch', move: 'move', shoot: 'shoot', halfShot: 'shoot', rally: 'rally', breach: 'breach' }[view.mode];
    let list = [];
    if (view.mode === 'charge') list = Sim.chargeSpots(st, u);
    if (view.mode === 'moveShoot') list = Sim.moveShootSpots(st, u);
    if (view.mode === 'move') list = Sim.moves(st, u);
    if (view.mode === 'shoot' || view.mode === 'halfShot') list = fields(Sim.targets(st, u));
    if (view.mode === 'rally') list = fields(Sim.rallyTargets(st, u));
    if (view.mode === 'breach') list = Sim.breachSpots(st, u);
    return uniq(list).map(p => Object.assign(p, { kind }));
  }

  // The pieces the chosen piece could shoot now, to mark with red targets: while choosing Shoot or Fire on the move
  function targets() {
    const u = selected();
    if (!u || !['shoot', 'halfShot'].includes(view.mode)) return [];
    return Sim.targets(st, u);
  }

  // The best target for a shooter in a field: tanks for anti-tank weapons, otherwise the infantry
  function pickTarget(u, x, y) {
    const ts = Sim.targets(st, u).filter(t => t.x === x && t.y === y);
    const f = Sim.firepower(st, u);
    ts.sort((a, b) => ((Sim.isTank(b) ? f.hard : f.soft) - (Sim.isTank(a) ? f.hard : f.soft)));
    return ts[0] || null;
  }

  // ---------- Clicking the table ----------

  // A click on the table: carry out the chosen action on a highlighted field, or open the menu for your pieces there.
  // Returns the pieces to offer in a menu, if any
  function clickField(x, y) {
    if (st.won || st.lost || st.de) return null;
    const u = selected();
    const spot = spots().find(p => p.x === x && p.y === y);
    let r = null;
    if (view.mode && spot) {
      if (view.mode.startsWith('fire:')) r = Sim.actFire(st, view.mode.slice(5), x, y);
      else if (view.mode === 'charge') r = Sim.actCharge(st, u, x, y);
      else if (view.mode === 'moveShoot') r = Sim.actMoveShoot(st, u, x, y);
      else if (view.mode === 'move') r = Sim.actMove(st, u, x, y);
      else if (view.mode === 'breach') r = Sim.actBreach(st, u, x, y);
      else if (view.mode === 'shoot') r = Sim.actShoot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'halfShot') r = Sim.actHalfShot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'rally') r = Sim.actRally(st, u, Sim.rallyTargets(st, u).find(t => t.x === x && t.y === y));
      if (r && r.ok) {
        view.log.push(...r.lines);
        // After moving with Move & shoot, offer the half-dice shot straight away, with red targets on who can be hit
        if (view.mode === 'moveShoot') {
          if (u.halfShot) view.mode = 'halfShot';
          else { view.mode = null; view.log.push(`No Germans in reach for ${u.name} to shoot from here.`); }
        } else view.mode = null;
      }
      return null;
    }
    // Otherwise your pieces in the field, for the menu (the first one chosen)
    const mine = Sim.at(st, x, y, 'us');
    view.mode = null;
    if (!mine.length) { view.sel = null; return null; }
    if (!mine.some(m => m.id === view.sel)) view.sel = mine[0].id;
    return mine;
  }

  // The menu by a piece on the table: for each of your pieces in the field, its name and state and the actions it can take now
  function openMenu(pieces, left, top, box) {
    const menu = document.querySelector('#menu');
    menu.innerHTML = '';
    for (const u of pieces) {
      const state = u.shocked ? '<span class="pill bad">Shaken</span>' : u.acted ? '<span class="pill done">✓ Moved this hour</span>' : '<span class="pill ready">Ready</span>';
      menu.append(el('div', 'mhead', `<b>${u.name}${u.quality === 'elite' ? ' ★' : ''}</b><span>${state}</span>`));
      const acts = actionButtons(u);
      if (Sim.isTeam(u) && u.kind !== 'pak') {
        const co = st.units.find(c => c.side === 'us' && c.kind === 'company' && c.x !== null && Sim.adjacent(c, u));
        acts.push({ mode: 'attach', label: u.attachedTo ? '🔗 Leave the platoon' : co ? `🔗 Join ${co.name}` : '🔗 Join a platoon next door', ok: !!(u.attachedTo || co) && Sim.canAct(st, u), title: 'Its move for the hour', run: () => Sim.actAttach(st, u, co) });
      }
      for (const a of acts) {
        const b = el('button', '', a.label);
        b.disabled = !a.ok; b.title = a.title || '';
        b.onclick = ev => {
          ev.stopPropagation();
          view.sel = u.id;
          if (a.run) { const r = a.run(); if (r.ok) view.log.push(...r.lines); view.mode = null; }
          else view.mode = a.mode;
          closeMenu(); refresh();
        };
        menu.append(b);
      }
      if (!acts.some(a => a.ok)) menu.append(el('div', 'mnote', u.shocked ? 'Shaken: it must rest an hour or be rallied by the captain' : 'It has moved this hour'));
    }
    menu.hidden = false;
    // Keep the menu inside the table's box
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(6, Math.min(box.width - w - 6, left + 12)) + 'px';
    menu.style.top = Math.max(6, Math.min(box.height - h - 6, top + 12)) + 'px';
  }
  function closeMenu() { const m = document.querySelector('#menu'); if (m) m.hidden = true; }

  // ---------- The left-hand panel ----------

  function actionButtons(u) {
    const can = Sim.canAct(st, u);
    const b = [];
    const add = (mode, label, ok, title) => b.push({ mode, label, ok: can && ok, title });
    if (u.kind === 'company' || Sim.isTank(u)) {
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, 'Up to two fields without shooting; hand to hand if the Germans hold the field it ends in');
      add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, 'One field to where it can fire, then fire at half the dice (the red-hatched fields)');
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
      if (Sim.breachSpots(st, u).length) add('breach', '⛏️ Break through', true, 'Through a hedge or wire into the next field, leaving a gap: a move with no shooting');
    } else if (u.kind === 'captain') {
      add('move', '➡️ Move', Sim.moves(st, u).length > 0, 'One field');
      add('rally', '📣 Rally', Sim.rallyTargets(st, u).length > 0, 'Use his move to steady a shaken piece in his field or the next');
      if (Sim.breachSpots(st, u).length) add('breach', '⛏️ Break through', true, 'Through a hedge or wire into the next field: no shooting');
    } else {
      add('move', '➡️ Move', Sim.moves(st, u).length > 0, u.attachedTo ? 'One field (it leaves its platoon)' : 'One field');
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
      if (Sim.breachSpots(st, u).length) add('breach', '⛏️ Break through', true, 'Through a hedge or wire into the next field: no shooting');
    }
    // Line another hedge of its field, to fire through it
    for (const side of Sim.lineSides(st, u)) b.push({ mode: 'line', label: `🌳 Line the ${Sim.SIDE_NAMES[side]} hedge`, ok: can, title: 'Its move: from the hedge it can fire through it', run: () => Sim.actLine(st, u, side) });
    if (u.halfShot) b.unshift({ mode: 'halfShot', label: '🎯 Fire on the move', ok: true, title: 'Half the dice, after moving' });
    return b;
  }

  function card() {
    const u = selected(), box = $('#card');
    box.innerHTML = '';
    if (!u || u.x === null) {
      box.innerHTML = '<div class="sub">Click one of your pieces on the table, or in the list below.</div>';
      return;
    }
    const strength = u.kind === 'company' ? `${u.platoons} section${u.platoons > 1 ? 's' : ''} (${u.platoons * 4} men)` : Sim.isTank(u) ? `${u.platoons} tank${u.platoons > 1 ? 's' : ''}` : '';
    const f = Sim.firepower(st, u);
    const dice = u.kind === 'captain' ? '' : `🎲 ${Math.round(f.soft * 10) / 10} dice vs men${f.hard ? `, ${Math.round(f.hard * 10) / 10} vs tanks` : ''}`;
    const status = u.shocked ? '<span class="pill bad">Shaken: rest or rally</span>' : u.acted ? '<span class="pill done">✓ Moved this hour</span>' : '<span class="pill ready">Ready</span>';
    box.append(el('div', 'name', `${u.name}${u.quality === 'elite' ? ' ★' : ''}`));
    box.append(el('div', 'sub', `${KIND[u.kind]}${u.attachedTo ? ` with ${Sim.unitById(st, u.attachedTo).name}` : ''}${Sim.hasCutters(u) ? ' · hedge cutters' : ''}`));
    const where = u.kind === 'captain' || u.kind === 'pak' ? '' : u.at ? `🌳 Lining the ${Sim.SIDE_NAMES[u.at]} hedge` : 'In the open';
    box.append(el('div', 'stats', [strength, dice, where, status].filter(Boolean).map(s => `<span>${s}</span>`).join('')));
    const acts = el('div'); acts.id = 'actions'; acts.style.marginTop = '6px';
    for (const a of actionButtons(u)) {
      const btn = el('button', view.mode === a.mode ? 'on' : '', a.label);
      btn.disabled = !a.ok; btn.title = a.title;
      btn.onclick = () => { if (a.run) { const r = a.run(); if (r.ok) view.log.push(...r.lines); view.mode = null; } else view.mode = view.mode === a.mode ? null : a.mode; refresh(); };
      acts.append(btn);
    }
    // Teams: join the company in their field, or leave it
    if (Sim.isTeam(u) && u.kind !== 'pak') {
      const co = st.units.find(c => c.side === 'us' && c.kind === 'company' && c.x !== null && Sim.adjacent(c, u));
      const btn = el('button', '', u.attachedTo ? '🔗 Leave the platoon' : '🔗 Join a platoon');
      btn.disabled = !(u.attachedTo || co) || !Sim.canAct(st, u);
      btn.title = u.attachedTo ? 'Work on its own again (its move)' : 'Join a rifle platoon next door: it moves into its field and goes with it (its move)';
      btn.onclick = () => { const r = Sim.actAttach(st, u, co); if (r.ok) view.log.push(...r.lines); refresh(); };
      acts.append(btn);
    }
    box.append(acts);
  }

  function hint() {
    const u = selected();
    const text = !view.mode ? (st.de ? 'The Germans are moving…' : '')
      : view.mode.startsWith('fire:') ? 'Click a field with Germans your troops can see.'
      : view.mode === 'halfShot' ? 'Moved. Click a red target to fire on it at half the dice, or Esc to hold fire.'
      : view.mode === 'shoot' ? 'Click a red target to fire on it. Esc cancels.'
      : view.mode === 'moveShoot' ? `Click a red-hatched field: ${u ? u.name : 'the piece'} moves there and can fire. Esc cancels.`
      : `Click a highlighted field for ${u ? u.name : 'the piece'}. Esc cancels.`;
    $('#hint').textContent = text;
  }

  function piecesList() {
    const box = $('#pieces');
    box.innerHTML = '<h2>Your pieces</h2>';
    const groups = {};
    for (const u of st.units) if (u.side === 'us' && u.x !== null) (groups[Sim.groupOf(u)] = groups[Sim.groupOf(u)] || []).push(u);
    const order = Object.keys(groups).sort((a, b) => (a === 'bn') - (b === 'bn') || (a === 'T') - (b === 'T') || a.localeCompare(b));
    for (const g of order) {
      const div = el('div', 'group');
      div.append(el('div', 'gname', `<span>${Sim.groupName(st, g)}</span>`));
      for (const u of groups[g]) {
        const tag = u.shocked ? '<span class="tag bad">shaken</span>' : u.acted ? '<span class="tag">✓ done</span>' : `<span class="tag">${u.kind === 'company' ? u.platoons + ' sec' : Sim.isTank(u) ? u.platoons + ' tanks' : ''}</span>`;
        const row = el('div', `piece${u.id === view.sel ? ' sel' : ''}${u.acted ? ' done' : ''}`, `<span>${u.name}${u.quality === 'elite' ? ' ★' : ''}</span>${tag}`);
        row.onclick = () => { view.sel = u.id; view.mode = null; refresh(); };
        div.append(row);
      }
      box.append(div);
    }
  }

  function update() {
    $('#clock').innerHTML = `<b>${Sim.hourText(st.turn)}</b> · hour ${st.turn}${TURNS ? ` of ${TURNS}` : ''} · ${START_DATE}`;
    $('#goal').textContent = `🎯 Take ${st.objective.name} and hold it at the end of an hour${TURNS ? `, by ${Sim.hourText(TURNS + 1)}` : ' (no time limit for now)'}.`;
    for (const which of ['mortars', 'artillery']) {
      const S = which === 'mortars' ? MORTARS : ARTILLERY, btn = $(`#fire-${which}`);
      btn.innerHTML = `${which === 'mortars' ? '💥 Mortars' : '💣 Guns'} · ${st.ammo[which]} left`;
      btn.title = `${S.name}: ${S.dice} dice on a field your troops can see${S.splash ? `, ${S.splash} on each field round it` : ''}. Once an hour, one load of ammunition`;
      btn.disabled = st.ammo[which] <= 0 || !!st.fired[which] || st.won || st.lost || !!st.de;
      btn.classList.toggle('on', view.mode === 'fire:' + which);
    }
    card(); hint(); piecesList();
    $('#log').innerHTML = view.log.map(l => `<li>${l}</li>`).join('');
    $('#report').innerHTML = st.report.map(l => `<li>${l}</li>`).join('');
    $('#end').disabled = st.won || st.lost || !!st.de;
  }

  let refresh = () => {};
  function init(onChange) {
    refresh = onChange;
    for (const which of ['mortars', 'artillery']) $(`#fire-${which}`).onclick = () => { view.mode = view.mode === 'fire:' + which ? null : 'fire:' + which; refresh(); };
  }

  return { init, setState, update, clickField, openMenu, closeMenu, spots, targets, view, selected, KIND };
})();
