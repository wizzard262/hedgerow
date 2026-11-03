// Hedgerow: the controls on the left: the clock, the company's fire support, the chosen piece and what it can do,
// the pieces by platoon, and what happened

const UI = (() => {
  let st;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  // What the player has chosen: a piece, and an action waiting for a field to be clicked
  const view = { sel: null, mode: null, log: [] };

  const KIND = { company: 'Rifle platoon', captain: 'Captain', sherman: 'Sherman', firefly: 'Firefly', mg: '.50 cal team', bazooka: 'Bazooka team', sniper: 'Sniper team',
                 pz4: 'Panzer IV', panther: 'Panther', mg42: 'MG 42 team', schreck: 'Panzerschreck team', pak: 'PaK 40 anti-tank gun' };

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
      // Its own field: another area of it (Steve: its move, and it may fire after)
      const inside = Sim.lineSides(st, u).length ? [{ x: u.x, y: u.y, kind: 'line', act: 'line' }] : [];
      return shootAfter.concat(charges, inside);
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
    // Rallying: every field the captain's voice reaches, faintly, round the pieces he can rally (Steve)
    if (view.mode === 'rally') marked.push(...rallyReach(u, marked));
    // A rifle platoon that can reach the village to take: that field in blue hatching (Steve), so it's clear
    if (u.kind === 'company' && ['charge', 'moveShoot'].includes(view.mode)) {
      for (const p of marked) if (p.x === st.objective.x && p.y === st.objective.y && p.kind !== 'line') p.kind = 'goal';
    }
    return marked;
  }

  // Where a piece could go (Steve: the Germans show the same as yours): red hatching for Move & shoot (fields it could
  // fire from), the rest a Charge; into the enemy's field, a fight
  function moveSpotsFor(u) {
    const enemy = u.side === 'us' ? 'de' : 'us';
    const shootAfter = Sim.moveShootSpots(st, u).map(p => ({ x: p.x, y: p.y, kind: 'hatch' }));
    const charges = Sim.chargeSpots(st, u).filter(p => !shootAfter.some(q => q.x === p.x && q.y === p.y))
      .map(p => ({ x: p.x, y: p.y, kind: Sim.at(st, p.x, p.y, enemy).length ? 'assault' : 'charge' }));
    return shootAfter.concat(charges);
  }

  // The pieces the chosen piece could shoot now, to mark with red targets: while choosing Shoot, or the shot of a Move & shoot.
  // Each with the score its dice need (shown on the target)
  function targets() {
    // Mortars or guns chosen: every German piece in a field they can be called on to, with the score their dice need
    if (view.mode && view.mode.startsWith('fire:')) {
      const inReach = st.units.filter(t => t.side === 'de' && t.x !== null && Sim.canCallFire(st, t.x, t.y));
      return inReach.map(t => {
        t.needNow = Sim.shellNeed(st, t);
        t.needWhy = Sim.shellWhy(st, t);
        // Artillery: your own pieces in a field next to it would be in the blast
        const friendsNear = view.mode === 'fire:artillery' && st.units.some(f => f.side === 'us' && f.x !== null && Math.abs(f.x - t.x) + Math.abs(f.y - t.y) === 1);
        if (friendsNear) t.needWhy = t.needWhy.concat(['⚠ your men in the blast']);
        return t;
      });
    }
    const u = selected();
    if (!u) return [];
    // Just picked and it can shoot from where it stands (Steve): its targets show straight away, a click fires
    const shootFromHere = view.mode === 'go' && Sim.canAct(st, u) && actionButtonsFor(u).some(a => a.mode === 'shoot' && a.ok);
    if (!['shoot', 'halfShot'].includes(view.mode) && !shootFromHere) return [];
    const moving = view.mode === 'halfShot';
    return Sim.targets(st, u, moving).map(t => {
      t.needNow = Math.min(6, Sim.needFor(st, u, t, moving) + Sim.armourOf(t));
      t.needWhy = Sim.needWhy(st, u, t, moving);
      return t;
    });
  }

  // The fields within RALLY_RANGE of the captain (counted along the fields, as the rule does), less those already marked
  function rallyReach(cap, marked) {
    const reach = [];
    for (let y = cap.y - RALLY_RANGE; y <= cap.y + RALLY_RANGE; y++) {
      for (let x = cap.x - RALLY_RANGE; x <= cap.x + RALLY_RANGE; x++) {
        // Off the table, or further than he reaches
        if (!Sim.inside(x, y) || Math.abs(x - cap.x) + Math.abs(y - cap.y) > RALLY_RANGE) continue;
        // A piece he can rally there is marked already
        if (marked.some(p => p.x === x && p.y === y)) continue;
        reach.push({ x, y, kind: 'reach' });
      }
    }
    return reach;
  }

  // The pieces the chosen captain can rally now, himself included, for blue targets on the table (Steve)
  function rallies() {
    const u = selected();
    // Only the captain, in your move, not while he is aiming a shot
    if (!u || u.kind !== 'captain' || st.de) return [];
    if (view.mode && !['go', 'rally'].includes(view.mode)) return [];
    // Nobody in reach, or no rallies left: no targets
    if (!Sim.captainCanRally(st, u)) return [];
    return Sim.rallyTargets(st, u);
  }

  // Rally the piece under a blue target
  function rallyTarget(t) {
    const u = selected();
    const r = Sim.actRally(st, u, t);
    if (!r.ok) return false;
    view.log.push(...r.lines);
    // If he hasn't moved yet, his moves show again
    view.mode = Sim.canAct(st, u) ? 'go' : null;
    return true;
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
    // Both ways shown: a click on the very area another of your pieces stands in, one that can still act, picks it
    // instead. A click on a free area moves there, beside whoever else is in the field (Steve: it picked the other
    // piece, and the move couldn't be made)
    const there = Sim.occupant(st, x, y, side);
    const onReady = there && there.side === 'us' && there !== u && Sim.canAct(st, there);
    if (view.mode === 'go' && spot && spot.kind !== 'assault' && onReady) spot = null;
    // Which action the click means
    const how = view.mode === 'go' && spot ? spot.act : view.mode;
    let r = null;
    if (view.mode && spot) {
      if (view.mode.startsWith('fire:')) r = Sim.actFire(st, view.mode.slice(5), x, y);
      else if (how === 'line' || (how === 'charge' && spot.kind === 'line')) r = Sim.actLine(st, u, side);
      else if (how === 'charge') r = Sim.actCharge(st, u, x, y, side);
      else if (how === 'moveShoot') r = Sim.actMoveShoot(st, u, x, y, side);
      else if (view.mode === 'breach') r = Sim.actBreach(st, u, x, y);
      else if (view.mode === 'shoot') r = Sim.actShoot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'halfShot') r = Sim.actHalfShot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'rally') r = Sim.actRally(st, u, Sim.rallyTargets(st, u).find(t => t.x === x && t.y === y));
      if (r && r.ok) {
        view.log.push(...r.lines);
        // After moving with Move & shoot, offer the half-dice shot straight away, with red targets on who can be hit
        if (how === 'moveShoot' || how === 'line' || (how === 'charge' && spot.kind === 'line')) {
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
    // Moved with Move & shoot and still to fire (Steve): picked again, its red targets show again
    if (picked.side === 'us' && picked.halfShot) view.mode = 'halfShot';
    else if (picked.side === 'us' && Sim.canAct(st, picked)) view.mode = 'go';
    return [picked];
  }

  // The menu by a piece on the table: for each of your pieces in the field, its name and state and the actions it can take now
  function openMenu(pieces, left, top, box) {
    const menu = document.querySelector('#menu');
    menu.innerHTML = '';
    for (const u of pieces) {
      const state = u.down && u.acted ? '<span class="pill bad">Taking cover</span>' : u.shocked ? '<span class="pill bad">Shaken</span>' : u.acted ? '<span class="pill done">✓ Moved this round</span>' : '<span class="pill ready">Ready</span>';
      menu.append(el('div', 'mhead', `<b>${u.name}${u.quality === 'elite' ? ' ★' : ''}</b><span>${state}</span>`));
      // Charge, Move & shoot and Shoot are done by clicking the lit fields and red targets, so the menu leaves them out (Steve)
      const acts = actionButtons(u).filter(a => !['charge', 'moveShoot', 'shoot'].includes(a.mode));
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
      if (!acts.some(a => a.ok)) menu.append(el('div', 'mnote', u.shocked ? 'Shaken: it has moved this round; the captain can rally it' : 'It has moved this round'));
      else if (u.shocked) menu.append(el('div', 'mnote', 'Shaken: it needs one more to hit and moves or charges half as far until it rallies'));
      if (acts.some(a => a.ok) && !u.acted && u.kind !== 'pak' && !Sim.chargeSpots(st, u).length) {
        // Boxed in: say why it can't charge, and how to get out
        menu.append(el('div', 'mnote', 'Nowhere to charge to: every way is blocked'));
      }
    }
    menu.hidden = false;
    placeMenu(menu, left, top, box);
  }
  // The menu by one of your guns on the table (Steve): its name and state, and Skip turn. Firing is a click on a red target
  function openGunMenu(which, left, top, box) {
    const menu = document.querySelector('#menu');
    menu.innerHTML = '';
    // Its state: ready, out of rounds, or already fired this hour
    const state = canFire(which) ? '<span class="pill ready">Ready</span>' : st.ammo[which] <= 0 ? '<span class="pill bad">No rounds</span>' : '<span class="pill done">✓ Fired this round</span>';
    menu.append(el('div', 'mhead', `<b>${which === 'mortars' ? '💥 US mortars' : '💣 US artillery'}</b><span>${state}</span>`));
    // Skip turn: hold fire this round, using the token
    const skip = el('button', '', '⏭️ Skip turn');
    skip.disabled = !canFire(which);
    skip.onclick = ev => { ev.stopPropagation(); skipGun(which); closeMenu(); };
    menu.append(skip);
    // Ready: say how to fire
    if (canFire(which)) menu.append(el('div', 'mnote', 'Click a red target to fire'));
    menu.hidden = false;
    placeMenu(menu, left, top, box);
  }

  // A gun holds fire this round, using the token (from its menu or the panel)
  function skipGun(which) {
    const r = Sim.skipSupport(st, which);
    if (r.ok) view.log.push(...r.lines);
    view.mode = null;
    refresh();
  }

  function closeMenu() {
    const m = document.querySelector('#menu'); if (m) m.hidden = true;
    const tail = document.querySelector('#menu-tail'); if (tail) tail.style.display = 'none';
  }

  // "Take cover?" (Steve): just the two choices, in a word bubble by the piece being fired on (no dialog)
  function openAsk(t, onAnswer) {
    const menu = document.querySelector('#menu');
    menu.innerHTML = '';
    // Stand fast, or take cover (ids kept for the screenshot tool)
    const choices = [['ask-stay', '🧍 Stand fast', false], ['ask-pull', '🪖 Take cover', true]];
    for (const [id, label, pull] of choices) {
      const b = el('button', '', label);
      b.id = id;
      b.onclick = ev => { ev.stopPropagation(); closeMenu(); onAnswer(pull); };
      menu.append(b);
    }
    menu.hidden = false;
    // By the piece, clear of the shot's score bubble
    const box = document.querySelector('#board').getBoundingClientRect();
    const p = Board.pieceScreen(t);
    const score = t.needNow ? [Board.labelBox(t)].map(b => ({ ...b, x: b.x - box.left, y: b.y - box.top })) : [];
    placeMenu(menu, p.x - box.left, p.y - box.top, box, score);
  }

  // Put the menu where it covers none of the fields you can move to or shoot at (Steve), trying spots round the
  // piece nearest first, and point a word-bubble tail from it back to the piece. extra: more boxes to keep clear of
  function placeMenu(menu, left, top, box, extra = []) {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    // What it must not cover: each lit field, and the piece itself
    const blocked = litFieldRects(box).concat(extra);
    blocked.push({ x: left - 20, y: top - 20, w: 40, h: 40 });
    // Spots round the piece: right, left, below, above, then the corners, each a little further out if they're all taken
    let best = null;
    for (const gap of [24, 90, 180, 300]) {
      const tries = [[left + gap, top - h / 2], [left - gap - w, top - h / 2], [left - w / 2, top + gap], [left - w / 2, top - gap - h],
        [left + gap, top + gap], [left - gap - w, top + gap], [left + gap, top - gap - h], [left - gap - w, top - gap - h]];
      for (const [x, y] of tries) {
        // Kept inside the table's box
        const spot = { x: Math.max(6, Math.min(box.width - w - 6, x)), y: Math.max(6, Math.min(box.height - h - 6, y)), w, h };
        const covered = blocked.reduce((sum, b) => sum + overlap(spot, b), 0);
        if (!best || covered < best.covered) best = { ...spot, covered };
        if (!covered) break;
      }
      if (!best.covered) break;
    }
    menu.style.left = best.x + 'px';
    menu.style.top = best.y + 'px';
    drawTail(best, left, top);
  }

  // The fields lit up for the chosen piece (moves, charges, targets) and the targets' score bubbles, as boxes on the
  // screen inside the table's box
  function litFieldRects(box) {
    const aims = targets();
    const fields = spots().concat(aims).map(f => {
      // The field's four corners on the table, seen through the camera
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([dx, dy]) => Board.screenPoint(f.x + dx, f.y + dy));
      const xs = corners.map(p => p.x - box.left), ys = corners.map(p => p.y - box.top);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    });
    // Each target's score bubble, moved into the table's box
    const bubbles = aims.filter(t => t.needNow).map(t => Board.labelBox(t)).map(b => ({ ...b, x: b.x - box.left, y: b.y - box.top }));
    return fields.concat(bubbles);
  }

  // How much of two boxes overlap (an area in pixels)
  function overlap(a, b) {
    const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return across > 0 && down > 0 ? across * down : 0;
  }

  // The bubble's tail: a triangle from the menu's nearest edge to the piece, drawn under the menu so they join up
  function drawTail(m, px, py) {
    const tail = document.querySelector('#menu-tail');
    // The point on the menu's edge nearest the piece
    const ex = Math.max(m.x, Math.min(m.x + m.w, px)), ey = Math.max(m.y, Math.min(m.y + m.h, py));
    // Clicked on the menu's own spot: no tail needed
    if (Math.hypot(px - ex, py - ey) < 8) { tail.style.display = 'none'; return; }
    // The tail's base runs along that edge, a little inside the menu so no seam shows
    const sideways = ex === m.x || ex === m.x + m.w;
    const half = 14, inset = 3;
    const baseX = sideways ? ex + (ex === m.x ? inset : -inset) : Math.max(m.x + half + 8, Math.min(m.x + m.w - half - 8, ex));
    const baseY = sideways ? Math.max(m.y + half + 8, Math.min(m.y + m.h - half - 8, ey)) : ey + (ey === m.y ? inset : -inset);
    const a = sideways ? [baseX, baseY - half] : [baseX - half, baseY], b = sideways ? [baseX, baseY + half] : [baseX + half, baseY];
    tail.querySelector('polygon').setAttribute('points', `${a.join(',')} ${px},${py} ${b.join(',')}`);
    tail.style.display = 'block';
  }

  // ---------- The left-hand panel ----------

  function actionButtons(u) {
    const b = actionButtonsFor(u);
    // Everyone can skip a turn (Steve): it gives up its move this round, using the token
    const canSkip = Sim.canAct(st, u) || (u.kind === 'captain' && Sim.canRally(st, u));
    b.push({ mode: 'skip', label: '⏭️ Skip turn', ok: canSkip, title: 'Give up its move this round (the token is used)', run: () => Sim.actSkip(st, u) });
    // Moved with Move & shoot and not wanting to fire (Steve: no Pass button): skip the shot, and the token is done
    if (u.halfShot) b.push({ mode: 'skipShot', label: '⏭️ Skip the shot', ok: true, title: 'Don\'t fire after moving; the token is used', run: () => Sim.actSkipShot(st, u) });
    return b;
  }

  function actionButtonsFor(u) {
    const can = Sim.canAct(st, u);
    const b = [];
    const add = (mode, label, ok, title) => b.push({ mode, label, ok: can && ok, title });
    // A shaken piece can still act (moving and charging half as far), or use its move to try to rally itself
    if (Sim.canSelfRally(st, u)) {
      b.push({ mode: 'selfRally', label: '📣 Rally itself', ok: true, title: 'Its move: it shakes it off (a rally always works)', run: () => Sim.actSelfRally(st, u) });
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
      // Only when there is someone in reach to rally, himself included (Steve: no Rally button otherwise)
      if (Sim.captainCanRally(st, u)) b.push({ mode: 'rally', label: '📣 Rally', ok: true, title: 'Get a piece that took cover up and moving, or steady a shaken one (himself too), up to three fields away. Two rallies a round if he stays put, one if he moves or shoots' });
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

  // The piece's picture at the left of the panel (Steve)
  function picture(box, side, kind, elite = false) {
    box.className = 'with-pic';
    const img = el('img', 'pic');
    img.src = Board.portrait(side, kind, elite);
    img.alt = '';
    box.append(img);
  }

  // Show a German piece in the panel (Steve): it is ringed on the table and its card shows what it is
  function inspect(u) {
    view.sel = u.id;
    view.mode = null;
    view.support = null;
  }

  // Does a click in this field carry out the chosen piece's action (a lit field for it)?
  function actsOn(x, y) {
    return !!view.mode && spots().some(p => p.x === x && p.y === y);
  }

  function card() {
    const u = selected(), box = $('#card');
    box.innerHTML = '';
    // A gun chosen: what it is, rounds left, whether it can fire this hour, and its Fire button
    if (!u && view.support) {
      const which = view.support, S = which === 'mortars' ? MORTARS : ARTILLERY;
      picture(box, 'us', which);
      const status = canFire(which) ? '<span class="pill ready">Ready</span>' : st.ammo[which] <= 0 ? '<span class="pill bad">No rounds</span>' : '<span class="pill done">✓ Fired this round</span>';
      box.append(el('div', 'name', which === 'mortars' ? '💥 US mortars' : '💣 US artillery'));
      box.append(el('div', 'sub', `${S.name}, off the board`));
      // What a mission does, one fact a line (Steve): where it can fire, the dice on the field, and the blast round it
      const does = [`${st.ammo[which]} rounds left`, '🎯 Fires on a field your troops can see', `🎲 ${S.dice} dice on each German piece there`];
      if (S.splash) does.push(`💥 ${S.splash} die on every piece in the 4 fields next to it, including your own`);
      box.append(el('div', 'stats', [...does, status].map(s => `<span>${s}</span>`).join('')));
      const acts = el('div'); acts.id = 'actions';
      const fire = el('button', view.mode === 'fire:' + which ? 'on' : '', '🎯 Fire');
      fire.disabled = !canFire(which);
      fire.onclick = () => { view.mode = view.mode === 'fire:' + which ? null : 'fire:' + which; refresh(); };
      acts.append(fire);
      // Skip turn (Steve): hold fire this round, using the token
      const skip = el('button', '', '⏭️ Skip turn');
      skip.disabled = !canFire(which);
      skip.onclick = () => skipGun(which);
      acts.append(skip);
      box.append(acts);
      return;
    }
    if (!u || u.x === null) {
      box.className = '';
      box.innerHTML = '<div class="sub">Click one of your pieces on the table (or a German one to see what it is).</div>';
      return;
    }
    // Its picture on the left (Steve), for your pieces and the Germans'
    picture(box, u.side, u.kind, u.quality === 'elite');
    const strength = u.kind === 'company' ? `${u.platoons} section${u.platoons > 1 ? 's' : ''} (${u.platoons * MEN_A_BASE} men)` : Sim.isTank(u) ? `${u.platoons} tank${u.platoons > 1 ? 's' : ''}` : PIECES[u.kind].men ? `${PIECES[u.kind].men} men` : '';
    const f = Sim.firepower(st, u);
    // Against men: its own dice and half its anti-tank ones (see Sim.menDice)
    const dice = `🎲 ${Math.round(Sim.menDice(f) * 10) / 10} dice vs men${f.hard ? `, ${Math.round(f.hard * 10) / 10} vs tanks` : ''}`;
    // A tank's armour (Steve): what it adds to the score anti-tank dice need
    const armour = Sim.isTank(u) ? `🛡️ Armour +${Sim.armourOf(u)}` : '';
    const status = u.down && u.acted ? '<span class="pill bad">Taking cover: the captain can get it up</span>' : u.shocked ? '<span class="pill bad">Shaken: +1 to hit, half moves</span>' : u.acted ? '<span class="pill done">✓ Moved this round</span>' : '<span class="pill ready">Ready</span>';
    box.append(el('div', 'name', `${u.name}${u.quality === 'elite' ? ' ★' : ''}`));
    // Elite troops say so (Steve): Rangers or Fallschirmjäger, one less needed to hit
    const elite = u.quality === 'elite' ? ` · <b class="elite">Elite</b> (${u.side === 'us' ? 'Rangers' : 'Fallschirmjäger'}: −1 to hit)` : '';
    box.append(el('div', 'sub', `${u.side === 'de' ? 'German · ' : ''}${KIND[u.kind]}${elite}${Sim.hasCutters(u) ? ' · hedge cutters' : ''}`));
    const where = u.kind === 'pak' ? '' : `📍 At ${Sim.placeName(u.at)}`;
    box.append(el('div', 'stats', [strength, dice, armour, where, status].filter(Boolean).map(s => `<span>${s}</span>`).join('')));
    // A German piece: just what it is (Steve), no actions
    if (u.side !== 'us') return;
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
    const text = !view.mode ? (st.drawn === 'de' ? 'German token: a German piece moves…' : st.drawn === 'us' ? (st.activeId ? 'Finish its move (or Skip in its menu).' : 'Your token: pick one piece and give it its move (or Skip turn in its menu).') : 'Drawing a token…')
      : view.mode.startsWith('fire:') ? 'Click a red target, or a field with Germans your troops can see.'
      : view.mode === 'halfShot' ? 'Moved. Click a red target to fire on it (one more needed on the move), or Esc to hold fire.'
      : view.mode === 'shoot' ? 'Click a red target to fire on it. Esc cancels.'
      : view.mode === 'rally' ? `Bright green: pieces he can rally; click one. Pale green: how far he reaches (${RALLY_RANGE} fields). Esc cancels.`
      : view.mode === 'go' ? `${targets().length ? 'Red targets: shoot from here. ' : ''}Red hatching: Move & shoot. Other marked fields: Charge. Blue: the village. Click where in the field to stand: a corner, an edge (lining its hedge) or the middle. Or use the menu.`
      : view.mode === 'charge' ? 'Blue hatching: the village to take. Click where in a field to go: by a hedge to line it (green: cover), or the middle for the open. Bright red fields are held by the Germans: a hand-to-hand fight. Its own field (green): line another hedge. Esc cancels.'
      : view.mode === 'moveShoot' ? `Click where in a red-hatched field to go (by a hedge to line it, green: cover): ${u ? u.name : 'the piece'} moves there and can fire. Esc cancels.`
      : `Click a highlighted field for ${u ? u.name : 'the piece'}. Esc cancels.`;
    $('#hint').textContent = text;
  }

  function update() {
    $('#clock').innerHTML = `<b>Round ${st.turn}</b>${TURNS ? ` of ${TURNS}` : ''} · ${START_DATE}`;
    $('#goal').textContent = `🎯 Take ${st.objective.name} and hold it at the end of a round, or destroy every German${TURNS ? `, within ${TURNS} rounds` : ' (no time limit for now)'}.`;
    card(); hint(); bag();
  }

  // ---------- The bag of tokens, right of the button ----------
  // Green with a gold star for each American token still in the bag (left), grey with a black cross for each German one
  // (right); the round beside them in big letters
  const TOKEN = {
    us: '<span class="tok us">★</span>',
    timer: '<span class="tok timer" title="Timer: drawn, it ends the round"><svg viewBox="0 0 20 20"><path d="M5 2h10M5 18h10M6.5 2C5 7 9.6 8 9.6 10S5 13 6.5 18M13.5 2C15 7 10.4 8 10.4 10S15 13 13.5 18" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
    de: '<span class="tok de"><svg viewBox="0 0 20 20"><path d="M7 2h6v5h5v6h-5v5H7v-5H2V7h5z" fill="#111" stroke="#eee" stroke-width="1.4"/></svg></span>',
  };
  function bag() {
    // While the round's tokens fly back in, only those home so far. When the timer has ended the round, the tokens
    // never drawn are still in the bag (Steve)
    const left = st.leftInBag ? Object.assign({ timer: 0 }, st.leftInBag) : null;
    const b = view.bagShown || left || st.bag || { us: 0, de: 0 };
    $('#bag-us').innerHTML = TOKEN.us.repeat(b.us);
    $('#bag-de').innerHTML = TOKEN.de.repeat(b.de);
    // The timer token, between the two sides' tokens (Steve)
    $('#bag-timer').innerHTML = b.timer ? TOKEN.timer + '<span class="timer-label">TIMER</span>' : '';
    $('#round').textContent = `ROUND ${st.turn}`;
  }

  // A new round (Steve): a small token flies back from each piece a token activated into the bag in the bar; the bar
  // counts them in as they land. done once the last is home
  function returnTokens(done) {
    // In the bag before any fly home: the tokens never drawn last round (none in the first), and the timer if it
    // didn't come out (Steve: only the tokens that activated someone fly back)
    const back = st.returning || { first: true };
    const kept = side => back.first ? 0 : Math.min(back.left[side], st.bag[side]);
    const timerKept = !back.first && !back.timerOut && st.bag.timer ? st.bag.timer : 0;
    view.bagShown = { us: kept('us'), de: kept('de'), timer: timerKept };
    bag();
    // The middle of each side's place in the bar
    const spot = id => { const r = $(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const ends = { us: spot('#bag-us'), de: spot('#bag-de'), timer: spot('#bag-timer') };
    // Each one home: one more in the bar
    const landed = side => { view.bagShown[side]++; bag(); };
    Board.returnTokens(st, ends, landed, () => { view.bagShown = null; bag(); done(); });
    // Draw the table, so the coins start flying (it only draws when something has changed)
    refresh();
  }

  // The token drawn: a thick coin flies from its place in the bar to the table above that side's artillery (see Board)
  function flyToken(side, done) {
    const grid = $(side === 'us' ? '#bag-us' : side === 'timer' ? '#bag-timer' : '#bag-de').getBoundingClientRect();
    Board.flyToken(side, grid.left + grid.width / 2, grid.top + grid.height / 2, done);
  }

  let refresh = () => {};
  function init(onChange) {
    refresh = onChange;
  }

  return { init, setState, update, clickField, openMenu, openGunMenu, openAsk, closeMenu, inspect, actsOn, spots, moveSpotsFor, targets, shootTarget, rallies, rallyTarget, view, selected, selectSupport, supportState, flyToken, returnTokens, KIND };
})();
