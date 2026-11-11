// Hedgerow: the controls on the left: the clock, the company's fire support, the chosen piece and what it can do,
// the pieces by platoon, and what happened

const UI = (() => {
  let st;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  // What the player has chosen: a piece, and an action waiting for a field to be clicked
  const view = { sel: null, mode: null };

  const KIND = { company: 'Rifle platoon', captain: 'Captain', sherman: 'Sherman 75mm', firefly: 'Sherman 76mm', mg: '.50 cal team', bazooka: 'Bazooka team', sniper: 'Sniper team',
                 pz4: 'Panzer IV', panther: 'Panther', m8: 'M8 Greyhound armoured car', puma: 'Puma armoured car', mg42: 'MG 42 team', schreck: 'Panzerschreck team', pak: 'PaK 40 anti-tank gun', bunker_mg: 'MG bunker', bunker_gun: 'PaK 40 bunker',
                 // Dunkirk, 1940 (Steve)
                 matilda: 'Matilda II', carrier: 'Universal Carrier (Bren)', boys: 'Boys anti-tank rifle team', pz1: 'Panzer I', pz2: 'Panzer II', pz3: 'Panzer III', sdkfz231: 'Sd.Kfz. 231 armoured car' };

  function setState(s) { st = s; view.sel = null; view.mode = null; view.support = null; }

  // The other side, for the words and the checks: the side the player isn't
  const enemy = () => Sim.enemyOf(st.human);
  const foes = () => Sim.sideName(st, enemy());
  // One of a side, as a word before a noun: 'American', 'British', 'German'
  const adjective = side => ({ Americans: 'American', British: 'British', Germans: 'German' })[Sim.sideName(st, side)];

  // ---------- Your mortars and artillery, off the board ----------
  // Clicking one chooses it like a piece (Steve): its targets show at once if it can fire this round
  const canFire = which => Sim.canFire(st, which);
  function selectSupport(which) {
    view.sel = null;
    view.support = which;
    view.mode = canFire(which) ? 'fire:' + which : null;
  }
  // For the rings under the guns
  function supportState() {
    const out = {};
    for (const which of ['mortars', 'artillery', 'bomber']) out[which] = { ready: canFire(which), chosen: view.support === which, present: st.ammo[st.human][which] > 0 };
    return out;
  }
  const selected = () => (view.sel ? Sim.unitById(st, view.sel) : null);
  // A gun's name and its state, for its menu and its card
  // (the map can rename the guns, Steve: Dunkirk's destroyers)
  const GUN_ICONS = { mortars: '💥', artillery: '💣' };
  function gunTitle(side, which) {
    if (which === 'bomber') return `✈️ ${BOMBER_NAMES[side]} bomber`;
    return `${GUN_ICONS[which]} ${Sim.gunStats(which, side).name}`;
  }
  function gunState(which) {
    if (canFire(which)) return '<span class="pill ready">Ready</span>';
    if (st.ammo[st.human][which] <= 0) return `<span class="pill bad">${which === 'bomber' ? 'Flown' : 'No rounds'}</span>`;
    return `<span class="pill done">✓ ${which === 'bomber' ? 'Stayed away' : 'Fired'} this round</span>`;
  }
  // What the bomber does, one fact a line
  function bomberFacts() {
    const runs = st.ammo[st.human].bomber;
    const facts = [`${runs} run${runs === 1 ? '' : 's'} left`];
    // The compass only spins when it can fly
    if (canFire('bomber')) facts.push(`🧭 Flies ${COMPASS_POINTS[Sim.bomberHeading(st, st.human)]}`);
    facts.push(`💣 ${BOMBER.need}+ on each piece under it, yours too`);
    return facts;
  }

  // ---------- Which fields an action can use ----------

  function spots() {
    const u = selected();
    // The bomber: a click anywhere on the board sends it; nothing is lit (Steve), the line under the pointer says it all
    if (view.mode === 'fire:bomber') return Sim.bomberAims().map(f => ({ x: f.x, y: f.y, kind: 'unlit' }));
    if (view.mode && view.mode.startsWith('fire:')) {
      const out = [];
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (Sim.canCallFire(st, x, y) && Sim.at(st, x, y, enemy()).length) out.push({ x, y, kind: 'fire' });
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
      const chargeAll = spots().filter(p => p.kind !== 'line');
      // A Move & shoot field's other areas (no shot from there) are a Charge, if it can charge there
      for (const p of shootAfter) p.canCharge = chargeAll.some(q => q.x === p.x && q.y === p.y);
      const charges = chargeAll.filter(p => !shootAfter.some(q => q.x === p.x && q.y === p.y)).map(p => Object.assign(p, { act: 'charge' }));
      view.mode = 'go';
      // Its own field: another area of it (Steve: its move, and it may fire after)
      const inside = Sim.lineSides(st, u).length ? [{ x: u.x, y: u.y, kind: 'line', act: 'line' }] : [];
      return shootAfter.concat(charges, inside);
    }
    const fields = list => list.map(p => ({ x: p.x, y: p.y }));
    const uniq = list => list.filter((p, i) => list.findIndex(q => q.x === p.x && q.y === p.y) === i);
    const kind = { charge: 'charge', moveShoot: 'hatch', shoot: 'shoot', halfShot: 'shoot', rally: 'rally' }[view.mode];
    let list = [];
    if (view.mode === 'charge') list = Sim.chargeSpots(st, u);
    if (view.mode === 'moveShoot') list = Sim.moveShootSpots(st, u);
    if (view.mode === 'shoot' || view.mode === 'halfShot') list = fields(Sim.targets(st, u, view.mode === 'halfShot'));
    if (view.mode === 'rally') list = fields(Sim.rallyTargets(st, u));
    // A charge into a field the Germans hold is a hand-to-hand fight: marked differently
    const marked = uniq(list).map(p => Object.assign(p, { kind: view.mode === 'charge' && Sim.at(st, p.x, p.y, enemy()).length ? 'assault' : kind }));
    // Move & shoot: only the areas it could fire from are hatched (Steve)
    // (those with a shot at close range differently, Steve)
    // (and those where a Hail Mary is the only shot, in weaker red, Steve)
    if (view.mode === 'moveShoot') for (const p of marked) { p.cells = Sim.shootCells(st, u, p.x, p.y); p.closeCells = Sim.closeCells(st, u, p.x, p.y); p.hailCells = Sim.hailMaryCells(st, u, p.x, p.y); }
    // Charging: its own field is marked too, to go and line another of its hedges (the old Line a hedge, Steve: implicit)
    if (view.mode === 'charge' && Sim.canAct(st, u) && Sim.lineSides(st, u).length) marked.push({ x: u.x, y: u.y, kind: 'line' });
    // Rallying: every field the captain's voice reaches, faintly, round the pieces he can rally (Steve)
    if (view.mode === 'rally') marked.push(...rallyReach(u, marked));
    // A rifle platoon or the captain that can reach the village to take: that field in blue hatching (Steve), so it's clear
    // (only the Americans have to take it)
    if (st.human === 'us' && !st.noGoal && Sim.takesGoal(u) && ['charge', 'moveShoot'].includes(view.mode)) {
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
    // The bomber aims at a field, not at a piece
    if (view.mode === 'fire:bomber') return [];
    // Mortars or guns chosen: every enemy piece your side can see that they can be called on to, with the score their dice need
    if (view.mode && view.mode.startsWith('fire:')) {
      const inReach = st.units.filter(t => t.side === enemy() && t.x !== null && Sim.canCallFire(st, t.x, t.y) && Sim.sees(st, st.human, t));
      return inReach.map(t => {
        t.needNow = Sim.shellNeed(st, t);
        t.needWhy = Sim.shellWhy(st, t);
        // Artillery: your own pieces in a field next to it would be in the blast
        const friendsNear = view.mode === 'fire:artillery' && st.units.some(f => f.side === st.human && f.x !== null && Math.abs(f.x - t.x) + Math.abs(f.y - t.y) === 1);
        if (friendsNear) t.needWhy = t.needWhy.concat(['⚠ your men in the blast']);
        return t;
      });
    }
    const u = selected();
    if (!u) return [];
    // Just picked and it can shoot from where it stands (Steve): its targets show straight away, a click fires
    const shootFromHere = view.mode === 'go' && Sim.canAct(st, u) && actionButtonsFor(u).some(a => a.mode === 'shoot' && a.ok);
    if (!['shoot', 'halfShot'].includes(view.mode) && !shootFromHere) return [];
    // (after moving within its own field, no moving penalty, Steve)
    const moving = view.mode === 'halfShot' && Sim.shotOnTheMove(u);
    return Sim.targets(st, u, moving).map(t => {
      t.needNow = Sim.needFor(st, u, t, moving) + Sim.armourOf(t);
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
    if (!u || u.kind !== 'captain' || st.computer) return [];
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
    // If he hasn't moved yet, his moves show again
    view.mode = Sim.canAct(st, u) ? 'go' : null;
    return true;
  }

  // Fire on a target chosen by its red cross-hair
  function shootTarget(t) {
    // Mortars or guns: the fire mission lands on the target's field
    if (t && view.mode && view.mode.startsWith('fire:')) {
      const fired = Sim.actFire(st, view.mode.slice(5), t.x, t.y, t);
      if (fired.ok) view.mode = null;
      return fired.ok;
    }
    const u = selected();
    if (!u || !t) return false;
    const r = view.mode === 'halfShot' ? Sim.actHalfShot(st, u, t) : Sim.actShoot(st, u, t);
    if (r.ok) view.mode = null;
    return r.ok;
  }

  // The best target for a shooter in a field: tanks for anti-tank weapons, otherwise the infantry
  function pickTarget(u, x, y) {
    const ts = Sim.targets(st, u, view.mode === 'halfShot').filter(t => t.x === x && t.y === y);
    const f = Sim.firepower(st, u);
    ts.sort((a, b) => ((Sim.isTank(b) ? f.hard : f.soft) - (Sim.isTank(a) ? f.hard : f.soft)));
    return ts[0] || null;
  }

  // ---------- Two humans: who is asked before a shot (Steve) ----------

  // The pieces to ask before firing on the target under a red cross-hair; null if that isn't a shot the player can make now
  function asksForShot(t) {
    if (view.mode && view.mode.startsWith('fire:')) {
      const which = view.mode.slice(5);
      return canFire(which) ? Sim.piecesToAsk(st, which, t.x, t.y, t) : null;
    }
    const u = selected();
    if (!u) return null;
    const moving = view.mode === 'halfShot';
    const can = moving ? u.halfShot : Sim.canAct(st, u) && Sim.mayFire(u);
    if (!can || !Sim.targets(st, u, moving).includes(t)) return null;
    return Sim.piecesToAsk(st, 'shot', t.x, t.y, t);
  }

  // The same for a click on a lit field: a gun or the bomber on that field, or a shot at the best target in it; null if the
  // click isn't one of those
  function asksForField(x, y) {
    if (!view.mode || !spots().some(p => p.x === x && p.y === y)) return null;
    if (view.mode.startsWith('fire:')) {
      const which = view.mode.slice(5);
      if (!canFire(which)) return null;
      return Sim.piecesToAsk(st, which, x, y, Sim.at(st, x, y, enemy())[0]);
    }
    if (view.mode !== 'shoot' && view.mode !== 'halfShot') return null;
    const t = pickTarget(selected(), x, y);
    return t ? Sim.piecesToAsk(st, 'shot', x, y, t) : null;
  }

  // ---------- Clicking the table ----------

  // A click on the table: carry out the chosen action on a highlighted field, or choose the piece clicked (one piece,
  // not the whole field). Returns that piece, for its menu
  function clickField(x, y, picked, side) {
    if (st.won || st.lost || st.computer) return null;
    const u = selected();
    let spot = spots().find(p => p.x === x && p.y === y);
    // Both ways shown: a click on the very area another of your pieces stands in, one that can still act, picks it
    // instead. A click on a free area moves there, beside whoever else is in the field (Steve: it picked the other
    // piece, and the move couldn't be made)
    const there = Sim.occupant(st, x, y, side);
    const onReady = there && there.side === st.human && there !== u && Sim.canAct(st, there);
    if (view.mode === 'go' && spot && spot.kind !== 'assault' && onReady) spot = null;
    // Which action the click means. On a Move & shoot field, an area it couldn't fire from is a Charge there (if it can
    // charge there), or nothing
    let how = view.mode === 'go' && spot ? spot.act : view.mode;
    if (spot && spot.cells && how === 'moveShoot' && !spot.cells.includes(side || 'c')) {
      how = view.mode === 'go' && spot.canCharge ? 'charge' : null;
      if (!how) spot = null;
    }
    let r = null;
    if (view.mode && spot) {
      if (view.mode.startsWith('fire:')) r = Sim.actFire(st, view.mode.slice(5), x, y);
      else if (how === 'line' || (how === 'charge' && spot.kind === 'line')) r = Sim.actLine(st, u, side);
      else if (how === 'charge') r = Sim.actCharge(st, u, x, y, side);
      else if (how === 'moveShoot') r = Sim.actMoveShoot(st, u, x, y, side);
      else if (view.mode === 'shoot') r = Sim.actShoot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'halfShot') r = Sim.actHalfShot(st, u, pickTarget(u, x, y));
      else if (view.mode === 'rally') r = Sim.actRally(st, u, Sim.rallyTargets(st, u).find(t => t.x === x && t.y === y));
      if (r && r.ok) {
        // After moving with Move & shoot, offer the half-dice shot straight away, with red targets on who can be hit
        if (how === 'moveShoot' || how === 'line' || (how === 'charge' && spot.kind === 'line')) {
          view.mode = u.halfShot ? 'halfShot' : null;
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
    if (picked.side === st.human && picked.halfShot) view.mode = 'halfShot';
    else if (picked.side === st.human && Sim.canAct(st, picked)) view.mode = 'go';
    return [picked];
  }

  // A piece's state as a badge: the first that fits. The menu has the short words, the panel the long ones
  function statePill(u, inCover, shaken) {
    if (u.down && u.acted) return `<span class="pill bad">${inCover}</span>`;
    if (u.ambush) return '<span class="pill ready">🪤 In ambush</span>';
    if (u.shocked) return `<span class="pill bad">${shaken}</span>`;
    if (u.acted) return '<span class="pill done">✓ Moved this round</span>';
    return '<span class="pill ready">Ready</span>';
  }

  // Why a piece takes no orders (Dunkirk, Steve): aboard a boat, or stragglers running for one on their own. '' otherwise
  function ownWay(u) {
    if (Sim.isAboard(st, u)) return 'Aboard a little ship: it sails at the end of the round';
    if (u.auto) return 'Stragglers: they run for the boats on their own at the start of each round';
    return '';
  }

  // The menu by a piece on the table: for each of your pieces in the field, its name and state and the actions it can take now
  function openMenu(pieces, left, top, box) {
    const menu = document.querySelector('#menu');
    menu.innerHTML = '';
    for (const u of pieces) {
      const state = statePill(u, 'Taking cover', 'Shaken');
      menu.append(el('div', 'mhead', `<b>${u.name}${u.quality === 'elite' ? ' ★' : ''}</b><span>${state}</span>`));
      // Moving and shooting are done by clicking the lit areas and red targets, so the menu only ever has Skip and Rally
      // (Steve: never Move & shoot, not even its shot after the move)
      const acts = actionButtons(u).filter(a => ['ambush', 'skip', 'skipShot', 'rally', 'selfRally'].includes(a.mode));
      for (const a of acts) {
        const b = el('button', '', a.label);
        b.disabled = !a.ok; b.title = a.title || '';
        b.onclick = ev => {
          ev.stopPropagation();
          view.sel = u.id;
          if (a.run) { a.run(); view.mode = null; }
          else view.mode = a.mode;
          closeMenu(); refresh();
        };
        menu.append(b);
      }
      // A captain in cover: why there is no Rally (Steve)
      const own = ownWay(u);
      if (own) menu.append(el('div', 'mnote', own));
      else if (u.kind === 'captain' && u.down) menu.append(el('div', 'mnote', 'In cover: he can\'t rally anyone until next round'));
      else if (!acts.some(a => a.ok)) menu.append(el('div', 'mnote', u.shocked ? 'Shaken: it has moved this round; the captain can rally it' : 'It has moved this round'));
      else if (u.shocked) menu.append(el('div', 'mnote', 'Shaken: it needs one more to hit and moves or charges half as far until it rallies'));
      if (acts.some(a => a.ok) && !u.acted && !PIECES[u.kind].fixed && !Sim.chargeSpots(st, u).length) {
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
    // Its state: ready, out of rounds, or already fired this round
    menu.append(el('div', 'mhead', `<b>${gunTitle(st.human, which)}</b><span>${gunState(which)}</span>`));
    // Skip turn: hold fire this round, using the token
    const skip = el('button', '', '⏭️ Skip turn');
    skip.disabled = !canFire(which);
    skip.onclick = ev => { ev.stopPropagation(); skipGun(which); closeMenu(); };
    menu.append(skip);
    // Ready: say how to fire
    if (canFire(which)) menu.append(el('div', 'mnote', which === 'bomber' ? 'Point anywhere on the board, and click' : 'Click a red target to fire'));
    menu.hidden = false;
    placeMenu(menu, left, top, box);
  }

  // A gun holds fire this round, using the token (from its menu or the panel)
  function skipGun(which) {
    Sim.skipSupport(st, which);
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

  // The fields lit up for the chosen piece (moves, charges, targets, the pieces the captain can rally) and the targets'
  // score bubbles, as boxes on the screen inside the table's box
  function litFieldRects(box) {
    const aims = targets();
    const fields = spots().concat(aims, rallies()).map(f => {
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
    // Any piece can lie in ambush instead (Steve): it gives up its move and waits, until it fires or the round ends
    b.push({ mode: 'ambush', label: '🪤 Ambush', ok: Sim.canAmbush(st, u), title: 'Give up its move and wait: it fires as soon as an enemy moves or shoots in its sight, if it can hit on 6 or less. Ends with the round', run: () => Sim.actAmbush(st, u) });
    // (the PaK just moved within its field has used its move: it has No ambush instead, below)
    if (!u.mayAmbush) b.push({ mode: 'skip', label: '⏭️ Skip turn', ok: canSkip, title: 'Give up its move this round (the token is used)', run: () => Sim.actSkip(st, u) });
    // The PaK has just moved within its field and needn't lie in ambush: the token is done
    if (u.mayAmbush && !u.halfShot) b.push({ mode: 'skipShot', label: '⏭️ No ambush', ok: true, title: 'Don\'t lie in ambush; the token is used', run: () => Sim.actSkipShot(st, u) });
    // Moved with Move & shoot and not wanting to fire (Steve: no Pass button): skip the shot, and the token is done
    // (moved within its field it could fire or lie in ambush, Steve: one button gives up both)
    if (u.halfShot) b.push({ mode: 'skipShot', label: u.mayAmbush ? '⏭️ Neither' : '⏭️ Skip the shot', ok: true, title: u.mayAmbush ? 'Neither fire nor lie in ambush; the token is used' : "Don't fire after moving; the token is used", run: () => Sim.actSkipShot(st, u) });
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
      const fight = Sim.chargeSpots(st, u).some(p => Sim.at(st, p.x, p.y, enemy()).length);
      add('charge', fight ? '⚔️ Charge (hand to hand)' : '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, 'Up to three fields without shooting (men climbing a hedge or cutting wire use one more); hand to hand if the enemy holds the field it ends in');
      add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, 'Up to two fields to where it can fire (the red-hatched fields), then fire needing one more on the dice');
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
    } else if (u.kind === 'captain') {
      // The four actions (Steve): Charge, Move & shoot, Shoot, Rally. The captain does all four
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, 'Up to three fields, no shooting (climbing a hedge uses one more)');
      // (after two rallies only a charge is left, Steve)
      add('moveShoot', '➡️ Move & shoot', Sim.mayFire(u) && Sim.moveShootSpots(st, u).length > 0, 'Up to two fields to where he can fire (the red-hatched fields), then fire needing one more on the dice');
      add('shoot', '🎯 Shoot', Sim.mayFire(u) && Sim.targets(st, u).length > 0, `His submachine gun: ${PIECES[u.kind].soft} dice, at close range only`);
      // Rallying isn't his move (Steve): two rallies if he stays put or charges (before, after or either side of the
      // charge), one if he shoots or moves and shoots (before or after). Only with someone in reach to rally
      if (Sim.captainCanRally(st, u)) b.push({ mode: 'rally', label: '📣 Rally', ok: true, title: 'Get a piece that took cover up and moving, or steady a shaken one (himself too), up to three fields away. Two rallies a round if he stays put or charges, one if he shoots or moves and shoots. Skip turn to stop before using them all' });
    } else {
      // Bazooka and Panzerschreck teams go one field further (Steve)
      const further = PIECES[u.kind].extraMove > 0;
      const chargeFields = further ? 'four' : 'three';
      const moveFields = further ? 'three' : 'two';
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, `Up to ${chargeFields} fields, no shooting (climbing a hedge uses one more)`);
      // Machine guns can't move and fire: they Charge to a new spot, then Shoot next round
      if (u.kind !== 'mg' && u.kind !== 'mg42') add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, `Up to ${moveFields} fields to where it can fire (the red-hatched fields), then fire needing one more on the dice`);
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
    }
    // Line another hedge of its field, to fire through it
    // Move & shoot is one action (Steve): after the move, the same button picks the target
    if (u.halfShot) {
      const i = b.findIndex(a => a.mode === 'moveShoot');
      if (i >= 0) b.splice(i, 1);
      // (moved only within its own field: nothing more needed, Steve)
      const extra = Sim.shotOnTheMove(u) ? 'one more needed on the dice' : 'moved within its field: nothing more needed';
      b.unshift({ mode: 'halfShot', label: '➡️ Move & shoot', ok: true, title: `Moved: now click a red target (${extra})` });
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

  // How strong a piece is, in words for the panel
  function strengthWords(u) {
    if (u.kind === 'company') return `${u.platoons} section${u.platoons > 1 ? 's' : ''} (${u.platoons * MEN_A_BASE} men)`;
    if (Sim.isTank(u)) return `${u.platoons} tank${u.platoons > 1 ? 's' : ''}`;
    return PIECES[u.kind].men ? `${PIECES[u.kind].men} men` : '';
  }

  function card() {
    const u = selected(), box = $('#card');
    box.innerHTML = '';
    // A gun chosen: what it is, rounds left, whether it can fire this round, and its Fire button
    if (!u && view.support) {
      const which = view.support, S = Sim.gunStats(which, st.human);
      picture(box, st.human, which);
      box.append(el('div', 'name', gunTitle(st.human, which)));
      box.append(el('div', 'sub', which === 'bomber' ? 'Off the board' : `${S.name}, off the board`));
      // What a mission does, one fact a line (Steve): where it can fire, the dice on the field, and the blast round it
      // (German mortars drop on the one piece, Steve: the differences between the sides stay)
      const onOnePiece = which === 'mortars' && st.human === 'de';
      const diceFact = onOnePiece ? `🎲 ${S.dice} dice on the one piece` : `🎲 ${S.dice} dice on each ${foes().slice(0, -1)} piece there`;
      const does = which === 'bomber' ? bomberFacts() : [`${st.ammo[st.human][which]} rounds left`, '🎯 Fires on a piece your troops can see', diceFact];
      // One anti-tank die: artillery as any other hit, mortars only shaking a tank (Steve)
      if (which === 'mortars') does.push(`🛡️ ${S.hard} die on a tank: only shakes it, or kills it if already shaken`);
      if (which === 'artillery') does.push(`🛡️ ${S.hard} die on a tank`);
      if (which !== 'bomber' && S.splash) does.push(`💥 ${S.splash} die on every piece in the 4 fields next to it, including your own`);
      box.append(el('div', 'stats', [...does, gunState(which)].map(s => `<span>${s}</span>`).join('')));
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
      const theirs = st.human === 'us' ? 'a German' : st.evac ? 'a British' : 'an American';
      const words = st.mode === 'none' ? 'Click any piece on the table to see what it is.' : `Click one of your pieces on the table (or ${theirs} one to see what it is).`;
      box.innerHTML = `<div class="sub">${words}</div>`;
      return;
    }
    // Its picture on the left (Steve), for your pieces and the Germans'
    picture(box, u.side, u.kind, u.quality === 'elite');
    const strength = strengthWords(u);
    const f = Sim.firepower(st, u);
    // Against men: its own dice and half its anti-tank ones (see Sim.menDice)
    // A captain's submachine gun reaches close range only (Steve)
    const closeOnly = PIECES[u.kind].closeOnly ? ' (SMG: close range only)' : '';
    const dice = `🎲 ${Math.round(Sim.menDice(f) * 10) / 10} dice vs men${closeOnly}${f.hard ? `, ${Math.round(f.hard * 10) / 10} vs tanks` : ''}`;
    // A tank's armour (Steve): what it adds to the score anti-tank dice need
    const armour = Sim.isTank(u) ? `🛡️ Armour +${Sim.armourOf(u)}` : '';
    const inCover = `Taking cover: +2 cover; ${u.kind === 'captain' ? 'no rallies until next round' : 'the captain can get it up'}`;
    const status = statePill(u, inCover, 'Shaken: +1 to hit, half moves');
    box.append(el('div', 'name', `${u.name}${u.quality === 'elite' ? ' ★' : ''}`));
    // Elite troops say so (Steve): Rangers or Fallschirmjäger, one less needed to hit
    const eliteName = u.side === 'de' ? 'Fallschirmjäger' : st.evac ? 'Guards' : 'Rangers';
    const elite = u.quality === 'elite' ? ` · <b class="elite">Elite</b> (${eliteName}: −1 to hit)` : '';
    const nation = u.side === st.human && st.mode !== 'none' ? '' : `${adjective(u.side)} · `;
    box.append(el('div', 'sub', `${nation}${KIND[u.kind]}${elite}${Sim.hasCutters(u) ? ' · hedge cutters' : ''}`));
    const where = `📍 At ${Sim.placeName(u.at)}`;
    box.append(el('div', 'stats', [strength, dice, armour, where, status].filter(Boolean).map(s => `<span>${s}</span>`).join('')));
    // Aboard a boat, or stragglers on their own: no orders to give
    const own = ownWay(u);
    if (own) box.append(el('div', 'sub', own));
    // The enemy's piece: just what it is (Steve), no actions
    if (u.side !== st.human || st.mode === 'none' || own) return;
    const acts = el('div'); acts.id = 'actions'; acts.style.marginTop = '6px';
    // (Ambush is in the piece's pop-up menu only, Steve: the panel has no room for a fifth button)
    for (const a of actionButtons(u).filter(o => o.mode !== 'ambush')) {
      const btn = el('button', view.mode === a.mode ? 'on' : '', a.label);
      btn.disabled = !a.ok; btn.title = a.title;
      btn.onclick = () => { if (a.run) { a.run(); view.mode = null; } else view.mode = view.mode === a.mode ? null : a.mode; refresh(); };
      acts.append(btn);
    }
    box.append(acts);
  }

  function hint() {
    const u = selected();
    const computerToken = st.drawn && Sim.isRobot(st, st.drawn);
    const theirToken = st.drawn ? `${adjective(st.drawn)} token: a ${adjective(st.drawn)} piece moves…` : '';
    // Two humans (Steve): whose token it is, as they share the screen
    const yours = st.mode === 'both' ? `${adjective(st.human)} player, your token` : 'Your token';
    const myToken = st.activeId ? 'Finish its move (or Skip in its menu).' : `${yours}: pick one piece and give it its move (or Skip turn in its menu).`;
    const noAction = computerToken ? theirToken : st.drawn === st.human ? myToken : 'Drawing a token…';
    const text = !view.mode ? noAction
      : view.mode === 'fire:bomber' ? 'Point anywhere on the board to see the line; click to send the bomber through.'
      : view.mode.startsWith('fire:') ? `Click a red target, or a field with ${foes()} your troops can see.`
      : view.mode === 'halfShot' ? `Moved. Click a red target to fire on it (${selected() && !Sim.shotOnTheMove(selected()) ? 'moved within its field: nothing more needed' : 'one more needed on the move'}), or Esc to hold fire.`
      : view.mode === 'shoot' ? 'Click a red target to fire on it. Esc cancels.'
      : view.mode === 'rally' ? `Bright green: pieces he can rally; click one. Pale green: how far he reaches (${RALLY_RANGE} fields). Esc cancels.`
      : view.mode === 'go' ? `${targets().length ? 'Red targets: shoot from here. ' : ''}Red hatching: Move & shoot (crossed: close range; pale: only a Hail Mary from there). Other marked fields: Charge. ${st.human === 'us' ? 'Blue: the village. ' : ''}Click where in the field to stand: a corner, an edge (lining its hedge) or the middle. Or use the menu.`
      : view.mode === 'charge' ? `${st.human === 'us' ? 'Blue hatching: the village to take. ' : ''}Click where in a field to go: by a hedge to line it (green: cover), or the middle for the open. Bright red fields are held by the ${foes()}: a hand-to-hand fight. Its own field (green): line another hedge. Esc cancels.`
      : view.mode === 'moveShoot' ? `Click where in a red-hatched field to go (by a hedge to line it, green: cover; crossed red: close range): ${u ? u.name : 'the piece'} moves there and can fire. Esc cancels.`
      : `Click a highlighted field for ${u ? u.name : 'the piece'}. Esc cancels.`;
    $('#hint').textContent = text;
  }

  // The goal on a map with nothing to take (Steve: the beach): destroy every piece of the other side
  function goalWithout() {
    // Two robots playing
    if (st.mode === 'none') return '🎯 Two robots: the Americans must destroy every German, the Germans hold out. Click any piece to see what it is.';
    // Playing the Germans
    if (st.human === 'de') return "🎯 Destroy every American piece on the table (guns and bomber off it don't count), or hold out.";
    // Playing the Americans
    return `🎯 Destroy every German on the table${TURNS ? `, within ${TURNS} rounds` : ' (no time limit for now)'}. There is no goal to take here.`;
  }

  // The goal at Dunkirk (Steve): get enough away on the boats, or stop them; with the count so far
  function goalEvacuate() {
    const E = st.map.evacuate;
    const count = `${st.evac.saved} of ${E.need} away so far.`;
    if (st.mode === 'none') return `🎯 Two robots: the British must get ${E.need} pieces away on the little ships within ${E.rounds} rounds, the Germans stop them. ${count}`;
    if (st.human === 'de') return `🎯 Stop the British getting ${E.need} pieces away on the little ships within ${E.rounds} rounds. ${count}`;
    return `🎯 Get ${E.need} pieces away on the little ships within ${E.rounds} rounds: move men onto a boat in the surf; it sails at the end of the round. Tanks and carriers can't go. ${count}`;
  }

  function update() {
    const rounds = st.evac ? st.map.evacuate.rounds : TURNS;
    $('#clock').innerHTML = `<b>Round ${st.turn}</b>${rounds ? ` of ${rounds}` : ''} · ${st.map.name}`;
    $('#goal').textContent = st.evac ? goalEvacuate() : st.noGoal ? goalWithout()
      : st.mode === 'none'
      ? `🎯 Two robots: the Americans attack ${st.objective.name}, the Germans hold it. Click any piece to see what it is.`
      : st.human === 'de'
      ? `🎯 Destroy every American piece on the table (guns and bomber off it don't count). Don't let them hold ${st.objective.name} for a whole round.`
      : `🎯 Take ${st.objective.name} and hold it for the whole of the next round, or destroy every German${TURNS ? `, within ${TURNS} rounds` : ' (no time limit for now)'}.`;
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
    const home = Sim.tokensHome(st);
    const timerKept = !back.first && !back.timerOut && st.bag.timer ? st.bag.timer : 0;
    view.bagShown = { us: home.us.kept, de: home.de.kept, timer: timerKept };
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

  return {
    init, setState, update, asksForShot, asksForField, clickField, openMenu, openGunMenu, openAsk, closeMenu,
    inspect, actsOn, spots, moveSpotsFor, targets, shootTarget, rallies, rallyTarget, view, selected,
    selectSupport, supportState, flyToken, returnTokens, KIND,
  };
})();
