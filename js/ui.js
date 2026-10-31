// Hedgerow: the controls on the left: the clock, the company's fire support, the chosen piece and what it can do,
// the pieces by platoon, and what happened

const UI = (() => {
  let st;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  // What the player has chosen: a piece, and an action waiting for a field to be clicked
  const view = { sel: null, mode: null, log: [] };

  const KIND = { company: 'Rifle platoon', captain: 'Captain', sherman: 'Sherman section', firefly: 'Firefly section', mg: 'Machine-gun team', bazooka: 'Bazooka team', sniper: 'Sniper team',
                 pz4: 'Panzer IV section', panther: 'Panther section', mg42: 'MG 42 team', schreck: 'Panzerschreck team', pak: 'PaK 40 anti-tank gun' };

  function setState(s) { st = s; view.sel = null; view.mode = null; view.log = []; view.support = null; }

  // ---------- Your mortars and artillery, off the board ----------
  // Clicking one chooses it like a piece (Steve): its targets show at once if it can fire this hour
  const canFire = which => Sim.canFire(st, which);
  function selectSupport(which) {
    view.sel = null;
    view.support = which;
    view.mode = canFire(which) ? 'fire:' + which : null;
  }
  // For the rings under the guns
  function supportState() {
    const out = {};
    for (const which of ['mortars', 'artillery']) out[which] = { ready: canFire(which), chosen: view.support === which, present: st.ammo[which] > 0 };
    return out;
  }
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
    // Just picked (Steve): where it can go, both ways at once. Red hatching is Move & shoot; the other marked fields are
    // a Charge. The field clicked decides which
    if (view.mode === 'go') {
      if (!Sim.canAct(st, u)) return [];
      view.mode = 'moveShoot';
      const shootAfter = spots().map(p => Object.assign(p, { act: 'moveShoot' }));
      view.mode = 'charge';
      const charges = spots().filter(p => p.kind !== 'line' && !shootAfter.some(q => q.x === p.x && q.y === p.y)).map(p => Object.assign(p, { act: 'charge' }));
      view.mode = 'go';
      return shootAfter.concat(charges);
    }
    const fields = list => list.map(p => ({ x: p.x, y: p.y }));
    const uniq = list => list.filter((p, i) => list.findIndex(q => q.x === p.x && q.y === p.y) === i);
    const kind = { charge: 'charge', moveShoot: 'hatch', shoot: 'shoot', halfShot: 'shoot', rally: 'rally', breach: 'breach' }[view.mode];
    let list = [];
    if (view.mode === 'charge') list = Sim.chargeSpots(st, u);
    if (view.mode === 'moveShoot') list = Sim.moveShootSpots(st, u);
    if (view.mode === 'shoot' || view.mode === 'halfShot') list = fields(Sim.targets(st, u, view.mode === 'halfShot'));
    if (view.mode === 'rally') list = fields(Sim.rallyTargets(st, u));
    if (view.mode === 'breach') list = Sim.breachSpots(st, u);
    // A charge into a field the Germans hold is a hand-to-hand fight: marked differently
    const marked = uniq(list).map(p => Object.assign(p, { kind: view.mode === 'charge' && Sim.at(st, p.x, p.y, 'de').length ? 'assault' : kind }));
    // Charging: its own field is marked too, to go and line another of its hedges (the old Line a hedge, Steve: implicit)
    if (view.mode === 'charge' && Sim.canAct(st, u) && Sim.lineSides(st, u).length) marked.push({ x: u.x, y: u.y, kind: 'line' });
    // A rifle platoon that can reach the village to take: that field in blue hatching (Steve), so it's clear
    if (u.kind === 'company' && ['charge', 'moveShoot'].includes(view.mode)) {
      for (const p of marked) if (p.x === st.objective.x && p.y === st.objective.y && p.kind !== 'line') p.kind = 'goal';
    }
    return marked;
  }

  // The pieces the chosen piece could shoot now, to mark with red targets: while choosing Shoot, or the shot of a Move & shoot.
  // Each with the score its dice need (shown on the target)
  function targets() {
    // Mortars or guns chosen: every German piece in a field they can be called on to, with the score their dice need
    if (view.mode && view.mode.startsWith('fire:')) {
      const inReach = st.units.filter(t => t.side === 'de' && t.x !== null && Sim.canCallFire(st, t.x, t.y));
      return inReach.map(t => {
        const inVillage = Sim.tileType(t.x, t.y) === 'village';
        t.needNow = TO_HIT + (inVillage ? COVER.village : 0);
        t.needWhy = inVillage ? [`−${COVER.village} cover`] : [];
        // Artillery: your own pieces in a field next to it would be in the blast
        const friendsNear = view.mode === 'fire:artillery' && st.units.some(f => f.side === 'us' && f.x !== null && Math.abs(f.x - t.x) + Math.abs(f.y - t.y) === 1);
        if (friendsNear) t.needWhy = t.needWhy.concat(['⚠ your men in the blast']);
        return t;
      });
    }
    const u = selected();
    if (!u || !['shoot', 'halfShot'].includes(view.mode)) return [];
    const moving = view.mode === 'halfShot';
    return Sim.targets(st, u, moving).map(t => {
      t.needNow = Math.min(6, Sim.needFor(st, u, t, moving) + (Sim.isTank(t) ? PIECES[t.kind].armour : 0));
      t.needWhy = Sim.needWhy(st, u, t, moving);
      return t;
    });
  }

  // Fire on a target chosen by its red cross-hair
  function shootTarget(t) {
    // Mortars or guns: the fire mission lands on the target's field
    if (t && view.mode && view.mode.startsWith('fire:')) {
      const fired = Sim.actFire(st, view.mode.slice(5), t.x, t.y);
      if (fired.ok) { view.log.push(...fired.lines); view.mode = null; }
      return fired.ok;
    }
    const u = selected();
    if (!u || !t) return false;
    const r = view.mode === 'halfShot' ? Sim.actHalfShot(st, u, t) : Sim.actShoot(st, u, t);
    if (r.ok) { view.log.push(...r.lines); view.mode = null; }
    return r.ok;
  }

  // The best target for a shooter in a field: tanks for anti-tank weapons, otherwise the infantry
  function pickTarget(u, x, y) {
    const ts = Sim.targets(st, u, view.mode === 'halfShot').filter(t => t.x === x && t.y === y);
    const f = Sim.firepower(st, u);
    ts.sort((a, b) => ((Sim.isTank(b) ? f.hard : f.soft) - (Sim.isTank(a) ? f.hard : f.soft)));
    return ts[0] || null;
  }

  // ---------- Clicking the table ----------

  // A click on the table: carry out the chosen action on a highlighted field, or choose the piece clicked (one piece,
  // not the whole field). Returns that piece, for its menu
  function clickField(x, y, picked, side) {
    if (st.won || st.lost || st.de) return null;
    const u = selected();
    let spot = spots().find(p => p.x === x && p.y === y);
    // Both ways shown: a click on a field where more of your pieces stand picks one of them instead
    if (view.mode === 'go' && spot && spot.kind !== 'assault' && Sim.at(st, x, y, 'us').some(o => o !== u)) spot = null;
    // Which action the click means
    const how = view.mode === 'go' && spot ? spot.act : view.mode;
    let r = null;
    if (view.mode && spot) {
      if (view.mode.startsWith('fire:')) r = Sim.actFire(st, view.mode.slice(5), x, y);
      else if (how === 'charge' && spot.kind === 'line') r = Sim.lineSides(st, u).includes(side) ? Sim.actLine(st, u, side) : null;
      else if (how === 'charge') r = Sim.actCharge(st, u, x, y, side);
      else if (how === 'moveShoot') r = Sim.actMoveShoot(st, u, x, y, side);
      else if (view.mode === 'breach') r = Sim.actBreach(st, u, x, y);
      else if (view.mode === 'shoot') r = Sim.actShoot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'halfShot') r = Sim.actHalfShot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'rally') r = Sim.actRally(st, u, Sim.rallyTargets(st, u).find(t => t.x === x && t.y === y));
      if (r && r.ok) {
        view.log.push(...r.lines);
        // After moving with Move & shoot, offer the half-dice shot straight away, with red targets on who can be hit
        if (how === 'moveShoot') {
          if (u.halfShot) view.mode = 'halfShot';
          else { view.mode = null; view.log.push(`No Germans in reach for ${u.name} to shoot from here.`); }
        } else view.mode = null;
      }
      return null;
    }
    // Otherwise the one piece clicked: if it can move, show where (both ways) straight away
    view.mode = null;
    view.support = null;
    if (!picked) { view.sel = null; return null; }
    view.sel = picked.id;
    if (picked.side === 'us' && Sim.canAct(st, picked)) view.mode = 'go';
    return [picked];
  }

  // The menu by a piece on the table: for each of your pieces in the field, its name and state and the actions it can take now
  function openMenu(pieces, left, top, box) {
    const menu = document.querySelector('#menu');
    menu.innerHTML = '';
    for (const u of pieces) {
      const state = u.down && u.acted ? '<span class="pill bad">Taking cover</span>' : u.shocked ? '<span class="pill bad">Shaken</span>' : u.acted ? '<span class="pill done">✓ Moved this hour</span>' : '<span class="pill ready">Ready</span>';
      menu.append(el('div', 'mhead', `<b>${u.name}${u.quality === 'elite' ? ' ★' : ''}</b><span>${state}</span>`));
      const acts = actionButtons(u);
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
      if (!acts.some(a => a.ok)) menu.append(el('div', 'mnote', u.shocked ? 'Shaken: it has moved this hour; it can rest, or the captain can rally it' : 'It has moved this hour'));
      else if (u.shocked) menu.append(el('div', 'mnote', 'Shaken (pinned): it needs one more to hit and can\'t charge until it rallies'));
      else if (!u.acted && !u.shocked && u.kind !== 'pak' && !Sim.chargeSpots(st, u).length) {
        // Boxed in: say why it can't charge, and how to get out
        menu.append(el('div', 'mnote', 'Nowhere to charge to: every way is blocked'));
      }
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
    const b = actionButtonsFor(u);
    // Everyone can skip a turn (Steve): it gives up its move this round, using the token
    const canSkip = Sim.canAct(st, u) || (u.kind === 'captain' && Sim.canRally(st, u));
    b.push({ mode: 'skip', label: '⏭️ Skip turn', ok: canSkip, title: 'Give up its move this round (the token is used)', run: () => Sim.actSkip(st, u) });
    return b;
  }

  function actionButtonsFor(u) {
    const can = Sim.canAct(st, u);
    const b = [];
    const add = (mode, label, ok, title) => b.push({ mode, label, ok: can && ok, title });
    // A shaken piece can still act (but not charge), or use its move to try to rally itself
    if (Sim.canSelfRally(st, u)) {
      b.push({ mode: 'selfRally', label: '📣 Rally itself', ok: true, title: `Its move: a ${Math.round(SELF_RALLY[u.quality || 'standard'] * 100)}% chance to shake it off (the captain does better)`, run: () => Sim.actSelfRally(st, u) });
    }
    if (u.kind === 'company' || Sim.isTank(u)) {
      const fight = Sim.chargeSpots(st, u).some(p => Sim.at(st, p.x, p.y, 'de').length);
      add('charge', fight ? '⚔️ Charge (hand to hand)' : '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, 'Up to three fields without shooting (men climbing a hedge or cutting wire use one more); hand to hand if the Germans hold the field it ends in');
      add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, 'Up to two fields to where it can fire (the red-hatched fields), then fire needing one more on the dice');
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
    } else if (u.kind === 'captain') {
      // The four actions (Steve): Charge, Move & shoot, Shoot, Rally. The captain does all four
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, 'Up to three fields, no shooting (climbing a hedge uses one more)');
      add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, 'Up to two fields to where he can fire (the red-hatched fields), then fire needing one more on the dice');
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'His HQ fires: one die');
      // Rallying isn't his move: two rallies if he stays put, one if he moves or shoots (before or after)
      b.push({ mode: 'rally', label: '📣 Rally', ok: Sim.canRally(st, u) && Sim.rallyTargets(st, u).length > 0, title: 'Get a piece that took cover up and moving, or steady a shaken one (himself too), up to three fields away. Two rallies an hour if he stays put, one if he moves or shoots' });
    } else {
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, 'Up to three fields, no shooting (climbing a hedge uses one more)');
      // Machine guns can't move and fire: they Charge to a new spot, then Shoot next hour
      if (u.kind !== 'mg' && u.kind !== 'mg42') add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, 'Up to two fields to where it can fire (the red-hatched fields), then fire needing one more on the dice');
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
    }
    // Line another hedge of its field, to fire through it
    // Move & shoot is one action (Steve): after the move, the same button picks the target
    if (u.halfShot) {
      const i = b.findIndex(a => a.mode === 'moveShoot');
      if (i >= 0) b.splice(i, 1);
      b.unshift({ mode: 'halfShot', label: '➡️ Move & shoot', ok: true, title: 'Moved: now click a red target (one more needed on the dice)' });
    }
    return b;
  }

  function card() {
    const u = selected(), box = $('#card');
    box.innerHTML = '';
    // A gun chosen: what it is, rounds left, whether it can fire this hour, and its Fire button
    if (!u && view.support) {
      const which = view.support, S = which === 'mortars' ? MORTARS : ARTILLERY;
      const status = canFire(which) ? '<span class="pill ready">Ready</span>' : st.ammo[which] <= 0 ? '<span class="pill bad">No rounds</span>' : '<span class="pill done">✓ Fired this hour</span>';
      box.append(el('div', 'name', which === 'mortars' ? '💥 US mortars' : '💣 US artillery'));
      box.append(el('div', 'sub', `${S.name}, off the board`));
      box.append(el('div', 'stats', [`${st.ammo[which]} rounds left`, `🎲 ${S.dice} dice on a field your troops can see${S.splash ? `, ${S.splash} on each field round it (yours too)` : ''}`, status].map(s => `<span>${s}</span>`).join('')));
      const acts = el('div'); acts.id = 'actions';
      const fire = el('button', view.mode === 'fire:' + which ? 'on' : '', '🎯 Fire');
      fire.disabled = !canFire(which);
      fire.onclick = () => { view.mode = view.mode === 'fire:' + which ? null : 'fire:' + which; refresh(); };
      acts.append(fire);
      // Skip turn (Steve): hold fire this round, using the token
      const skip = el('button', '', '⏭️ Skip turn');
      skip.disabled = !canFire(which);
      skip.onclick = () => { const r = Sim.skipSupport(st, which); if (r.ok) view.log.push(...r.lines); view.mode = null; refresh(); };
      acts.append(skip);
      box.append(acts);
      return;
    }
    if (!u || u.x === null) {
      box.innerHTML = '<div class="sub">Click one of your pieces on the table.</div>';
      return;
    }
    const strength = u.kind === 'company' ? `${u.platoons} section${u.platoons > 1 ? 's' : ''} (${u.platoons * 4} men)` : Sim.isTank(u) ? `${u.platoons} tank${u.platoons > 1 ? 's' : ''}` : '';
    const f = Sim.firepower(st, u);
    const dice = `🎲 ${Math.round(f.soft * 10) / 10} dice vs men${f.hard ? `, ${Math.round(f.hard * 10) / 10} vs tanks` : ''}`;
    const status = u.down && u.acted ? '<span class="pill bad">Taking cover: the captain can get it up</span>' : u.shocked ? '<span class="pill bad">Shaken: −1 to hit, no charging</span>' : u.acted ? '<span class="pill done">✓ Moved this hour</span>' : '<span class="pill ready">Ready</span>';
    box.append(el('div', 'name', `${u.name}${u.quality === 'elite' ? ' ★' : ''}`));
    box.append(el('div', 'sub', `${KIND[u.kind]}${Sim.hasCutters(u) ? ' · hedge cutters' : ''}`));
    const where = u.kind === 'pak' ? '' : `📍 At ${Sim.placeName(u.at)}`;
    box.append(el('div', 'stats', [strength, dice, where, status].filter(Boolean).map(s => `<span>${s}</span>`).join('')));
    const acts = el('div'); acts.id = 'actions'; acts.style.marginTop = '6px';
    for (const a of actionButtons(u)) {
      const btn = el('button', view.mode === a.mode ? 'on' : '', a.label);
      btn.disabled = !a.ok; btn.title = a.title;
      btn.onclick = () => { if (a.run) { const r = a.run(); if (r.ok) view.log.push(...r.lines); view.mode = null; } else view.mode = view.mode === a.mode ? null : a.mode; refresh(); };
      acts.append(btn);
    }
    box.append(acts);
  }

  function hint() {
    const u = selected();
    const text = !view.mode ? (st.drawn === 'de' ? 'German token: a German piece moves…' : st.drawn === 'us' ? (st.activeId ? 'Finish its move, or Done.' : 'Your token: pick one piece and give it its move (or Pass).') : 'Drawing a token…')
      : view.mode.startsWith('fire:') ? 'Click a red target, or a field with Germans your troops can see.'
      : view.mode === 'halfShot' ? 'Moved. Click a red target to fire on it (one more needed on the move), or Esc to hold fire.'
      : view.mode === 'shoot' ? 'Click a red target to fire on it. Esc cancels.'
      : view.mode === 'go' ? 'Red hatching: Move & shoot. Other marked fields: Charge. Blue: the village. Click where in the field to stand: a corner, an edge (lining its hedge) or the middle. Or use the menu.'
      : view.mode === 'charge' ? 'Blue hatching: the village to take. Click where in a field to go: by a hedge to line it (green: cover), or the middle for the open. Bright red fields are held by the Germans: a hand-to-hand fight. Its own field (green): line another hedge. Esc cancels.'
      : view.mode === 'moveShoot' ? `Click where in a red-hatched field to go (by a hedge to line it, green: cover): ${u ? u.name : 'the piece'} moves there and can fire. Esc cancels.`
      : `Click a highlighted field for ${u ? u.name : 'the piece'}. Esc cancels.`;
    $('#hint').textContent = text;
  }

  function update() {
    $('#clock').innerHTML = `<b>${Sim.hourText(st.turn)}</b> · hour ${st.turn}${TURNS ? ` of ${TURNS}` : ''} · ${START_DATE}`;
    $('#goal').textContent = `🎯 Take ${st.objective.name} and hold it at the end of an hour, or destroy every German${TURNS ? `, by ${Sim.hourText(TURNS + 1)}` : ' (no time limit for now)'}.`;
    card(); hint(); bag();
    // The bar's button: Pass on an American token (Done once its piece has moved)
    $('#end').disabled = st.won || st.lost || st.drawn !== 'us';
    $('#end').textContent = st.activeId ? 'Done ▶' : 'Pass ▶';
  }

  // ---------- The bag of tokens, right of the button ----------
  // Green with a gold star for each American token still in the bag (left), grey with a black cross for each German one
  // (right); the round beside them in big letters
  const TOKEN = {
    us: '<span class="tok us">★</span>',
    de: '<span class="tok de"><svg viewBox="0 0 20 20"><path d="M7 2h6v5h5v6h-5v5H7v-5H2V7h5z" fill="#111" stroke="#eee" stroke-width="1.4"/></svg></span>',
  };
  function bag() {
    const b = st.bag || { us: 0, de: 0 };
    $('#bag-us').innerHTML = TOKEN.us.repeat(b.us);
    $('#bag-de').innerHTML = TOKEN.de.repeat(b.de);
    $('#round').textContent = `ROUND ${st.turn}`;
  }

  // The token drawn: a thick coin flies from its place in the bar to the table above that side's artillery (see Board)
  function flyToken(side, done) {
    const grid = $(side === 'us' ? '#bag-us' : '#bag-de').getBoundingClientRect();
    Board.flyToken(side, grid.left + grid.width / 2, grid.top + grid.height / 2, done);
  }

  let refresh = () => {};
  function init(onChange) {
    refresh = onChange;
  }

  return { init, setState, update, clickField, openMenu, closeMenu, spots, targets, shootTarget, view, selected, selectSupport, supportState, flyToken, KIND };
})();
