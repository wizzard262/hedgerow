// Hedgerow: the controls on the left: the clock, the company's fire support, the chosen piece and what it can do,
// the pieces by platoon, and what happened

const UI = (() => {
  let st;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  // What the player has chosen: a piece, and an action waiting for a field to be clicked
  const view = { sel: null, mode: null };

  const KIND = { company: 'Rifle platoon', captain: 'Captain', sherman: 'Sherman 75mm', firefly: 'Sherman 76mm', mg: '.50 cal team', bazooka: 'Bazooka team', sniper: 'Sniper team',
                 pz4: 'Panzer IV', panther: 'Panther', m8: 'M8 Greyhound armoured car', stuart: 'M5 Stuart light tank', puma: 'Puma armoured car', mg42: 'MG 42 team', schreck: 'Panzerschreck team', pak: 'PaK 40 anti-tank gun', bunker_mg: 'MG bunker', bunker_gun: 'PaK 40 bunker',
                 // Dunkirk, 1940 (Steve)
                 matilda: 'Matilda II', carrier: 'Universal Carrier (Bren)', lorry: 'Lorry of men for the boats', boys: 'Boys anti-tank rifle team', pz1: 'Panzer I', pz2: 'Panzer II', pz3: 'Panzer III', sdkfz231: 'Sd.Kfz. 231 armoured car',
                 // Stalingrad, 1942 (Steve)
                 t34: 'T-34/76', kv2: 'KV-2 heavy tank (152 mm)', t35: 'T-35 heavy tank (five turrets)', kingtiger: 'King Tiger (Tiger II)', m10: 'M10 Wolverine tank destroyer', m36: 'M36 Jackson tank destroyer', tiger1: 'Tiger I heavy tank', ferdinand: 'Ferdinand tank destroyer', t70: 'T-70 light tank', kv1: 'KV-1 heavy tank', t34s: 'T-34/76', t26: 'T-26 light tank', t28: 'T-28 medium tank (three turrets)', t38: 'T-38 tankette', aerosan: 'RF-8-GAZ-98 aerosan (propeller sled)', vickers6t: 'Vickers 6-ton (Finnish)', bofors37: 'Bofors 37 mm anti-tank gun', lahti: 'Lahti 20 mm anti-tank rifle team', pz38t: 'Panzer 38(t) light tank', jagdpanther: 'Jagdpanther tank destroyer', hetzer: 'Hetzer tank destroyer', m18: 'M18 Hellcat tank destroyer', jumbo: 'Sherman Jumbo (M4A3E2)', m24: 'M24 Chaffee light tank', stug3: 'StuG III Ausf. F assault gun', pz4f2: 'Panzer IV F2 (long 7.5 cm)', flak88: '8.8 cm Flak 36' };
  // What a piece is, in words: a rifle platoon with submachine guns is a section of submachine gunners (Steve)
  const kindName = u => (u.arms === 'smg' ? 'Submachine-gun section' : KIND[u.kind]);

  function setState(s) { st = s; view.sel = null; view.mode = null; view.support = null; }

  // The other side, for the words and the checks: the side the player isn't
  const enemy = () => Sim.enemyOf(st.human);
  const foes = () => Sim.sideName(st, enemy());
  // One of a side, as a word before a noun: 'American', 'British', 'German'
  const adjective = side => ({ Americans: 'American', British: 'British', Soviets: 'Soviet', Germans: 'German', Finns: 'Finnish' })[Sim.sideName(st, side)];

  // ---------- Your mortars and artillery, off the board ----------
  // Clicking one chooses it like a piece (Steve): its targets show at once if it can fire this round
  const canFire = which => Sim.canFire(st, which);
  function selectSupport(which) {
    view.sel = null;
    view.support = which;
    view.supportSide = st.human;
    view.mode = canFire(which) ? 'fire:' + which : null;
  }
  // The other side's gun clicked (Steve, 2026-11-23): ringed on the table and its card shows what it is, as their pieces do
  function inspectGun(side, which) {
    view.sel = null;
    view.mode = null;
    view.support = which;
    view.supportSide = side;
  }
  // The gun chosen or being looked at, either side's, for its white ring; null if none
  function chosenGun() {
    if (!view.support) return null;
    return { side: view.supportSide, which: view.support };
  }
  // A click off the table (Steve, 2026-11-15: the bomber could not be put down without another gun to pick): the gun
  // chosen is put down, its token still unused. True if there was one
  function dropSupport() {
    if (!view.support) return false;
    view.support = null;
    view.mode = null;
    return true;
  }
  // For the rings under the guns
  function supportState() {
    const out = {};
    for (const which of ['mortars', 'artillery', 'bomber']) out[which] = { ready: canFire(which), present: st.ammo[st.human][which] > 0 };
    return out;
  }
  const selected = () => (view.sel ? Sim.unitById(st, view.sel) : null);
  // A gun's name and its state, for its menu and its card
  // (the map can rename the guns, Steve: Dunkirk's destroyers)
  const GUN_ICONS = { mortars: '💥', artillery: '💣' };
  function gunTitle(side, which) {
    if (which === 'bomber') return `✈️ ${Sim.bomberName(side)} bomber`;
    return `${GUN_ICONS[which]} ${Sim.gunStats(which, side).name}`;
  }
  // (either side's, Steve 2026-11-23: st.fired says 'held' for one that held fire)
  function gunState(side, which) {
    const bomber = which === 'bomber';
    // Nothing left
    if (st.ammo[side][which] <= 0) return `<span class="pill bad">${bomber ? 'Flown' : 'No rounds'}</span>`;
    const used = st.fired[side][which];
    // Still to have its go this round
    if (!used) return '<span class="pill ready">Ready</span>';
    const held = bomber ? 'Stayed away' : 'Held fire';
    const fired = bomber ? 'Flown' : 'Fired';
    return `<span class="pill done">✓ ${used === 'held' ? held : fired} this round</span>`;
  }
  // What the bomber does, one fact a line
  function bomberFacts(side) {
    const runs = st.ammo[side].bomber;
    const facts = [`${runs} run${runs === 1 ? '' : 's'} left`];
    // The compass only spins when it can fly, and only for your own
    if (side === st.human && canFire('bomber')) facts.push(`🧭 Flies ${COMPASS_POINTS[Sim.bomberHeading(st, st.human)]}`);
    facts.push(`💣 ${BOMBER.need}+ on each piece under it, ${side === st.human ? 'yours' : 'theirs'} too`);
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
    const kind = { charge: 'charge', moveShoot: 'hatch', shoot: 'shoot', halfShot: 'shoot', hullMg: 'shoot', rally: 'rally' }[view.mode];
    let list = [];
    if (view.mode === 'charge') list = Sim.chargeSpots(st, u);
    if (view.mode === 'moveShoot') list = Sim.moveShootSpots(st, u);
    if (view.mode === 'shoot' || view.mode === 'halfShot') list = fields(Sim.targets(st, u, view.mode === 'halfShot'));
    // The T-35's hull machine guns (Steve): the men it could fire on
    if (view.mode === 'hullMg') list = fields(Sim.hullMgTargets(st, u));
    if (view.mode === 'rally') list = fields(Sim.rallyTargets(st, u));
    // A charge into a field the Germans hold is a hand-to-hand fight: marked differently
    const marked = uniq(list).map(p => Object.assign(p, { kind: view.mode === 'charge' && Sim.at(st, p.x, p.y, enemy()).length ? 'assault' : kind }));
    // Move & shoot: only the areas it could fire from are hatched (Steve)
    // (those with a shot at close range differently, Steve)
    // (and those where a Hail Mary is the only shot, in weaker red, Steve)
    if (view.mode === 'moveShoot') for (const p of marked) shotAreas(u, p);
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

  // A Move & shoot field's areas, for its hatching: those it could fire from, those at close range, those with only a
  // Hail Mary. The same for both sides' pieces (Steve, 2026-11-21: the Germans' were hatched all over). Returns the spot
  function shotAreas(u, p) {
    p.cells = Sim.shootCells(st, u, p.x, p.y);
    p.closeCells = Sim.closeCells(st, u, p.x, p.y);
    p.hailCells = Sim.hailMaryCells(st, u, p.x, p.y);
    return p;
  }

  // Where a piece could go (Steve: the Germans show the same as yours): red hatching for Move & shoot (fields it could
  // fire from), the rest a Charge; into the enemy's field, a fight
  function moveSpotsFor(u) {
    const enemy = u.side === 'us' ? 'de' : 'us';
    // (area by area, as yours: crossed for close range, pale for a Hail Mary, Steve 2026-11-21)
    const shootAfter = Sim.moveShootSpots(st, u).map(p => shotAreas(u, { x: p.x, y: p.y, kind: 'hatch' }));
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
    // The T-35's hull machine guns (Steve): men only, their own dice
    if (view.mode === 'hullMg') {
      return Sim.hullMgTargets(st, u).map(t => {
        t.needNow = Sim.needFor(st, u, t);
        t.needWhy = Sim.needWhy(st, u, t);
        return t;
      });
    }
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
    // The T-35's hull machine guns: then its move, if it still has it
    if (view.mode === 'hullMg') {
      const fired = Sim.actHullMg(st, u, t);
      if (fired.ok) view.mode = Sim.canAct(st, u) ? 'go' : null;
      return fired.ok;
    }
    const r = view.mode === 'halfShot' ? Sim.actHalfShot(st, u, t) : Sim.actShoot(st, u, t);
    if (r.ok) view.mode = null;
    return r.ok;
  }

  // The best target for a shooter in a field: tanks for anti-tank weapons, otherwise the infantry
  function pickTarget(u, x, y) {
    const all = view.mode === 'hullMg' ? Sim.hullMgTargets(st, u) : Sim.targets(st, u, view.mode === 'halfShot');
    const ts = all.filter(t => t.x === x && t.y === y);
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
    // (the T-35's hull machine guns)
    if (view.mode === 'hullMg') return Sim.canHullMg(st, u) && Sim.hullMgTargets(st, u).includes(t) ? Sim.piecesToAsk(st, 'shot', t.x, t.y, t) : null;
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
    if (view.mode !== 'shoot' && view.mode !== 'halfShot' && view.mode !== 'hullMg') return null;
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
      else if (view.mode === 'hullMg') r = Sim.actHullMg(st, u, pickTarget(u, x, y));
      else if (view.mode === 'rally') r = Sim.actRally(st, u, Sim.rallyTargets(st, u).find(t => t.x === x && t.y === y));
      if (r && r.ok) {
        // After moving with Move & shoot, offer the half-dice shot straight away, with red targets on who can be hit
        if (how === 'moveShoot' || how === 'line' || (how === 'charge' && spot.kind === 'line')) {
          view.mode = u.halfShot ? 'halfShot' : null;
        } else if (view.mode === 'hullMg') view.mode = Sim.canAct(st, u) ? 'go' : null;
        else view.mode = null;
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
    if (u.down && u.acted) return `<span class="pill bad">☂️ ${inCover}</span>`;
    if (u.ambush) return '<span class="pill ready">🪤 In ambush</span>';
    const moved = '<span class="pill done">✓ Moved this round</span>';
    // Shaken: it says so, and whether it has moved this round as well (Steve, 2026-11-21)
    if (u.shocked) return `<span class="pill bad">${shaken}</span>${u.acted ? ' ' + moved : ''}`;
    if (u.acted) return moved;
    return '<span class="pill ready">Ready</span>';
  }

  // Why a piece takes no orders (Dunkirk, Steve): aboard a boat, or a lorry driving itself to one. '' otherwise
  function ownWay(u) {
    if (Sim.isAboard(st, u)) return `Aboard a ${Sim.boatKind(st, u.y)}: it sails at the end of the round`;
    if (u.auto) return 'A lorry-load of men for the boats: it drives itself to a boat at the start of each round';
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
      const acts = actionButtons(u).filter(a => ['ambush', 'cover', 'skip', 'skipShot', 'rally', 'selfRally', 'hullMg', 'holdMg'].includes(a.mode));
      for (const a of acts) {
        const b = el('button', '', a.label);
        b.disabled = !a.ok; b.title = a.title || '';
        b.onclick = ev => {
          ev.stopPropagation();
          view.sel = u.id;
          if (a.run) { a.run(); view.mode = null; }
          else view.mode = a.mode;
          closeMenu(); refresh();
          // Rallied itself (its move) with its hull MGs still to fire: straight on to them
          if (a.mode === 'selfRally') offerHullMg(u);
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
    menu.append(el('div', 'mhead', `<b>${gunTitle(st.human, which)}</b><span>${gunState(st.human, which)}</span>`));
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

  // A tank with hull MGs that has just used its move (Steve, 2026-11-20: after it rallied itself it couldn't shoot): its
  // red targets for the hull MGs up at once, and its menu by it with Hull MGs and Hold MG fire
  function offerHullMg(u) {
    // Only with its move gone and the MGs still able to fire
    if (Sim.canAct(st, u) || !Sim.canHullMg(st, u)) return;
    // The red targets for the hull MGs
    view.sel = u.id;
    view.mode = 'hullMg';
    refresh();
    // Its menu by the piece on the table
    const box = document.querySelector('#board').getBoundingClientRect();
    const spot = Board.pieceScreen(u);
    openMenu([u], spot.x - box.left, spot.y - box.top, box);
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
    const choices = [['ask-stay', '🧍 Stand fast', false], ['ask-pull', '☂️ Take cover', true]];
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
    placeMenuNow(menu, left, top, box, extra);
    // Once the table has drawn the targets' red score bubbles (the frame after the piece was picked), placed again
    // clear of them too (Steve: the menu covered a target's red bubble)
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!menu.hidden) placeMenuNow(menu, left, top, box, extra); }));
  }
  // Where the menu was last placed from, to place it again if a red bubble turns up under it
  let menuPlaced = null;
  // A red score bubble has come up under the menu (Steve, 2026-11-24): the menu moves clear of it
  function keepMenuClear() {
    const menu = document.querySelector('#menu');
    if (!menu || menu.hidden || !menuPlaced) return;
    const { left, top, box, extra } = menuPlaced;
    if (onARedBubble(menu, box)) placeMenuNow(menu, left, top, box, extra);
  }
  // Is this box on the page (the menu, the hover box) over a red score bubble? box: the table's own on the page
  function onARedBubble(el, box) {
    const mine = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    return redBubbleRects(box, Board.shownLabels()).some(b => Labels.boxOnBox(mine, b));
  }
  function placeMenuNow(menu, left, top, box, extra) {
    menuPlaced = { left, top, box, extra };
    const w = menu.offsetWidth, h = menu.offsetHeight;
    // What it must not cover: each lit field, the targets, pieces to rally and score bubbles (these matter most), and
    // the piece itself
    const blocked = litFieldRects(box).concat(extra.map(b => ({ ...b, weight: MENU_WEIGHT.important })));
    blocked.push({ x: left - 20, y: top - 20, w: 40, h: 40, weight: MENU_WEIGHT.important });
    // Further out round the piece, and the table's corners last, until a spot covers nothing (see Labels.menuSpot)
    const best = Labels.menuSpot({ w, h }, { x: left, y: top }, blocked, box);
    menu.style.left = best.x + 'px';
    menu.style.top = best.y + 'px';
    drawTail(best, left, top);
  }

  // The fields lit up for the chosen piece (moves, charges, targets, the pieces the captain can rally) and the targets'
  // score bubbles, as boxes on the screen inside the table's box
  // How much it matters to keep each kind clear (Steve: the menu covered pieces to rally and targets)
  // (Steve, 2026-11-24: with every field round it lit it still covered a red bubble, as a small bubble counted for less
  // than a big field: now any field goes first)
  const MENU_WEIGHT = { field: 1, important: 40 };
  // These targets' red score bubbles, as boxes inside the table's box
  function redBubbleRects(box, list) {
    return list.map(t => Board.labelBox(t)).map(b => ({ ...b, x: b.x - box.left, y: b.y - box.top, weight: MENU_WEIGHT.important }));
  }
  function litFieldRects(box) {
    const aims = targets();
    // A field as a box on the screen: its four corners on the table, seen through the camera
    const rect = (f, weight) => {
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([dx, dy]) => Board.screenPoint(f.x + dx, f.y + dy));
      const xs = corners.map(p => p.x - box.left), ys = corners.map(p => p.y - box.top);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), weight };
    };
    const fields = spots().map(f => rect(f, MENU_WEIGHT.field));
    // The targets and the pieces to rally, counted more
    const pieces = aims.concat(rallies()).map(f => rect(f, MENU_WEIGHT.important));
    // Each target's score bubble, and any other on the table now (the computer's aim, Steve 2026-11-24)
    const scored = aims.filter(t => t.needNow);
    const alsoShown = Board.shownLabels().filter(t => !scored.includes(t));
    const bubbles = redBubbleRects(box, scored.concat(alsoShown));
    return fields.concat(pieces, bubbles);
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
    // Anyone who could take cover under fire can do it on its own token too (Steve, 2026-11-24: holding the goal, say)
    const ducks = !Sim.isTank(u) && !PIECES[u.kind].fixed;
    if (ducks) b.push({ mode: 'cover', label: '☂️ Take cover', ok: Sim.canTakeCover(st, u), title: 'Give up its move: its men get down, and every shot or shell at it needs two more for the rest of the round', run: () => Sim.actTakeCover(st, u) });
    // (the PaK just moved within its field has used its move: it has No ambush instead, below)
    if (!u.mayAmbush) b.push({ mode: 'skip', label: '⏭️ Skip turn', ok: canSkip, title: 'Give up its move this round (the token is used)', run: () => Sim.actSkip(st, u) });
    // The PaK has just moved within its field and needn't lie in ambush: the token is done
    if (u.mayAmbush && !u.halfShot) b.push({ mode: 'skipShot', label: '⏭️ No ambush', ok: true, title: 'Don\'t lie in ambush; the token is used', run: () => Sim.actSkipShot(st, u) });
    // Moved with Move & shoot and not wanting to fire (Steve: no Pass button): skip the shot, and the token is done
    // (moved within its field it could fire or lie in ambush, Steve: one button gives up both)
    // The T-35's hull machine guns (Steve): a shot of their own once a round, before or after its move; after it, they can
    // be held so the token ends
    if (Sim.hullMgDice(u)) {
      b.push({ mode: 'hullMg', label: '🔫 Hull MGs', ok: Sim.canHullMg(st, u), title: `Its small turrets' machine guns: ${Sim.hullMgDice(u)} dice at men, a shot of their own once a round, before or after its move` });
      if (!Sim.canAct(st, u) && Sim.canHullMg(st, u)) b.push({ mode: 'holdMg', label: '⏭️ Hold MG fire', ok: true, title: 'Don\'t fire the hull machine guns this round; the token is used', run: () => Sim.actHoldMg(st, u) });
    }
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
      add('charge', fight ? '⚔️ Charge (hand to hand)' : '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, `Up to three fields without shooting (men climbing a ${Sim.hedgeWord()} or cutting wire use one more); hand to hand if the enemy holds the field it ends in`);
      // (submachine gunners as far as a Charge, Steve)
      add('moveShoot', '➡️ Move & shoot', Sim.moveShootSpots(st, u).length > 0, `Up to ${u.arms === 'smg' ? 'three' : 'two'} fields to where it can fire (the red-hatched fields), then fire needing one more on the dice`);
      add('shoot', '🎯 Shoot', Sim.targets(st, u).length > 0, 'Fire with every die');
    } else if (u.kind === 'captain') {
      // The four actions (Steve): Charge, Move & shoot, Shoot, Rally. The captain does all four
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, `Up to three fields, no shooting (climbing a ${Sim.hedgeWord()} uses one more)`);
      // (after two rallies only a charge is left, Steve)
      add('moveShoot', '➡️ Move & shoot', Sim.mayFire(u) && Sim.moveShootSpots(st, u).length > 0, 'Up to three fields (his submachine gun: as far as a Charge) to where he can fire (the red-hatched fields), then fire needing one more on the dice');
      add('shoot', '🎯 Shoot', Sim.mayFire(u) && Sim.targets(st, u).length > 0, `His submachine gun: ${PIECES[u.kind].soft} dice, at close range only`);
      // Rallying isn't his move (Steve): two rallies if he stays put or charges (before, after or either side of the
      // charge), one if he shoots or moves and shoots (before or after). Only with someone in reach to rally
      if (Sim.captainCanRally(st, u)) b.push({ mode: 'rally', label: '📣 Rally', ok: true, title: 'Get a piece that took cover up and moving, or steady a shaken one (himself too), up to three fields away. Two rallies a round if he stays put or charges, one if he shoots or moves and shoots. Skip turn to stop before using them all' });
    } else {
      // Bazooka and Panzerschreck teams go one field further (Steve)
      const further = PIECES[u.kind].extraMove > 0;
      const chargeFields = further ? 'four' : 'three';
      const moveFields = further ? 'three' : 'two';
      add('charge', '⚔️ Charge', Sim.chargeSpots(st, u).length > 0, `Up to ${chargeFields} fields, no shooting (climbing a ${Sim.hedgeWord()} uses one more)`);
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
  function picture(box, side, kind, elite = false, arms = '') {
    box.className = 'with-pic';
    const img = el('img', 'pic');
    img.src = Board.portrait(side, kind, elite, arms);
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
  // Is a field one the chosen piece can charge into to fight hand to hand (an enemy there)?
  function chargesInto(x, y) {
    if (!view.mode || !['go', 'charge'].includes(view.mode)) return false;
    const charge = spots().some(p => p.x === x && p.y === y && (p.act === 'charge' || view.mode === 'charge') && p.kind !== 'line');
    return charge && Sim.at(st, x, y, enemy()).length > 0;
  }

  // How strong a piece is, in words for the panel
  function strengthWords(u) {
    if (u.kind === 'company' || Sim.isLorry(u)) return `${u.platoons} section${u.platoons > 1 ? 's' : ''} (${u.platoons * MEN_A_BASE} men)`;
    if (Sim.isTank(u)) return `${u.platoons} tank${u.platoons > 1 ? 's' : ''}`;
    return PIECES[u.kind].men ? `${PIECES[u.kind].men} men` : '';
  }

  function card() {
    const u = selected(), box = $('#card');
    box.innerHTML = '';
    // A gun chosen: what it is, rounds left, whether it can fire this round, and (yours) its Fire button
    if (!u && view.support) {
      const which = view.support, side = view.supportSide, S = Sim.gunStats(which, side);
      // Yours to command, or only looked at (Steve, 2026-11-23: the other side's)
      const mine = side === st.human && st.mode !== 'none';
      picture(box, side, which);
      box.append(el('div', 'name', gunTitle(side, which)));
      const nation = mine ? '' : `${adjective(side)} · `;
      box.append(el('div', 'sub', nation + (which === 'bomber' ? 'Off the board' : `${S.name}, off the board`)));
      // What a mission does, one fact a line (Steve): where it can fire, the dice on the field, and the blast round it
      // (German mortars drop on the one piece, Steve: the differences between the sides stay)
      const onOnePiece = which === 'mortars' && side === 'de';
      const diceFact = onOnePiece ? `🎲 ${S.dice} dice on the one piece` : `🎲 ${S.dice} dice on each ${Sim.sideName(st, Sim.enemyOf(side)).slice(0, -1)} piece there`;
      const does = which === 'bomber' ? bomberFacts(side) : [`${st.ammo[side][which]} rounds left`, `🎯 Fires on a piece ${mine ? 'your' : 'their'} troops can see`, diceFact];
      // One anti-tank die: artillery as any other hit, mortars only shaking a tank (Steve)
      if (which === 'mortars') does.push(`🛡️ ${S.hard} die on a tank: only shakes it, or kills it if already shaken`);
      if (which === 'artillery') does.push(`🛡️ ${S.hard} die on a tank`);
      if (which !== 'bomber' && S.splash) does.push(`💥 ${S.splash} die on every piece in the 4 fields next to it, including ${mine ? 'your' : 'their'} own`);
      box.append(el('div', 'stats', [...does, gunState(side, which)].map(s => `<span>${s}</span>`).join('')));
      // The other side's: just what it is, no actions
      if (!mine) return;
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
      const theirs = st.human === 'us' ? 'a German' : `a${/^[AEIOU]/.test(adjective('us')) ? 'n' : ''} ${adjective('us')}`;
      const words = st.mode === 'none' ? 'Click any piece on the table to see what it is.' : `Click one of your pieces on the table (or ${theirs} one to see what it is).`;
      box.innerHTML = `<div class="sub">${words}</div>`;
      return;
    }
    // Its picture on the left (Steve), for your pieces and the Germans'
    picture(box, u.side, u.kind, u.quality === 'elite', u.arms);
    const strength = strengthWords(u);
    const f = Sim.firepower(st, u);
    // Against men: see Sim.menDice (a tank: its machine guns and its gun's high explosive)
    // A captain's submachine gun reaches close range only (Steve)
    const closeOnly = Sim.closeRangeOnly(u) ? ' (SMG: close range only)' : '';
    // (as rolled: less than one die is one, Steve)
    // (the T-35's hull machine guns, Steve: a shot of their own)
    const hull = Sim.hullMgDice(u) ? `, hull MGs ${Sim.hullMgDice(u)} at men (own shot)` : '';
    // (Molotov cocktails, Steve 2026-11-21: a die for each section still standing, hand to hand)
    const molotov = Sim.molotovNeed(u) ? `, 🔥 ${u.platoons} vs tanks (Molotovs: Charge, hand to hand, ${Sim.molotovNeed(u)}+)` : '';
    // (a machine-gun team, Steve 2026-11-21: on its card, that it can move and lie in ambush on the same go)
    // (the anti-tank guns too, Steve 2026-11-27; the 88 never moves, it turns)
    const movedWord = PIECES[u.kind].emplaced ? 'turning' : 'moving';
    const mgAmbush = Sim.movesThenAmbushes(u) ? `🪤 After ${movedWord} it lies in ambush by itself (no shot after ${movedWord})` : '';
    const dice = `🎲 ${Sim.menDiceShown(u, f)} dice vs men${closeOnly}${f.hard ? `, ${Sim.diceShown(f.hard)} vs tanks` : ''}${molotov}${hull}`;
    // A tank's armour (Steve): what it adds to the score anti-tank dice need
    const armour = Sim.isTank(u) ? `🛡️ Armour +${Sim.armourOf(u)}` : '';
    const inCover = `Taking cover: +2 cover; ${u.kind === 'captain' ? 'no rallies until next round' : 'the captain can get it up'}`;
    const status = statePill(u, inCover, 'Shaken: +1 to hit, half moves');
    box.append(el('div', 'name', `${u.name}${u.quality === 'elite' ? ' ★' : ''}`));
    // Elite troops say so (Steve): Rangers or Fallschirmjäger, one less needed to hit
    const eliteName = u.side === 'de' ? 'Fallschirmjäger' : Sim.armyOf(st) === 'us' ? 'Rangers' : 'Guards';
    const elite = u.quality === 'elite' ? ` · <b class="elite">Elite</b> (${eliteName}: −1 to hit)` : '';
    const nation = u.side === st.human && st.mode !== 'none' ? '' : `${adjective(u.side)} · `;
    // (no "hedge cutters" here, Steve 2026-11-27: every tank drives through hedges)
    box.append(el('div', 'sub', `${nation}${kindName(u)}${elite}`));
    const where = `📍 At ${Sim.placeName(u.at)}`;
    box.append(el('div', 'stats', [strength, dice, armour, mgAmbush, where, status].filter(Boolean).map(s => `<span>${s}</span>`).join('')));
    // Aboard a boat, or a lorry driving itself: no orders to give
    const own = ownWay(u);
    if (own) box.append(el('div', 'sub', own));
    // What marks it out (Steve, 2026-11-27: small gun, fast and so on), one line each, at the very bottom of the card
    const traitList = Sim.traitLines(u);
    const traits = el('div', 'traits', traitList.map(s => `<div>${s}</div>`).join(''));
    if (traitList.length) box.append(traits);
    // The enemy's piece: just what it is (Steve), no actions
    if (u.side !== st.human || st.mode === 'none' || own) return;
    const acts = el('div'); acts.id = 'actions'; acts.style.marginTop = '6px';
    // (Ambush and Take cover are in the piece's pop-up menu only, Steve: the panel has no room for more buttons)
    for (const a of actionButtons(u).filter(o => !['ambush', 'cover'].includes(o.mode))) {
      const btn = el('button', view.mode === a.mode ? 'on' : '', a.label);
      btn.disabled = !a.ok; btn.title = a.title;
      btn.onclick = () => { if (a.run) { a.run(); view.mode = null; } else view.mode = view.mode === a.mode ? null : a.mode; refresh(); };
      acts.append(btn);
    }
    // The buttons go above the markers, so these stay at the bottom
    box.insertBefore(acts, traitList.length ? traits : null);
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
      : view.mode === 'hullMg' ? 'Hull machine guns: click a red target (men only) to fire on it. Esc cancels.'
      : view.mode === 'rally' ? `Bright green: pieces he can rally; click one. Pale green: how far he reaches (${RALLY_RANGE} fields). Esc cancels.`
      : view.mode === 'go' ? `${targets().length ? 'Red targets: shoot from here. ' : ''}Red hatching: Move & shoot (crossed: close range; pale: only a Hail Mary from there). Other marked fields: Charge. ${st.human === 'us' ? 'Blue: the village. ' : ''}Click where in the field to stand: a corner, an edge (lining its ${Sim.hedgeWord()}) or the middle. Or use the menu.`
      : view.mode === 'charge' ? `${st.human === 'us' ? 'Blue hatching: the village to take. ' : ''}Click where in a field to go: by a ${Sim.hedgeWord()} to line it (green: cover), or the middle for the open. Bright red fields are held by the ${foes()}: a hand-to-hand fight. Its own field (green): line another ${Sim.hedgeWord()}. Esc cancels.`
      : view.mode === 'moveShoot' ? `Click where in a red-hatched field to go (by a ${Sim.hedgeWord()} to line it, green: cover; crossed red: close range): ${u ? u.name : 'the piece'} moves there and can fire. Esc cancels.`
      : `Click a highlighted field for ${u ? u.name : 'the piece'}. Esc cancels.`;
    $('#hint').textContent = text;
  }

  // The goal on a map with nothing to take (Steve: the beach): destroy every piece of the other side
  function goalWithout() {
    // (each side by its name on this map: the Soviets and the Finns in the Winter War, Steve)
    const us = Sim.sideName(st, 'us'), de = Sim.sideName(st, 'de');
    // Two robots playing
    if (st.mode === 'none') return `🎯 Two robots: the ${us} must destroy every one of the ${de}, the ${de} every one of the ${us}. Click any piece to see what it is.`;
    // Playing the 'de' side
    if (st.human === 'de') return `🎯 Destroy every ${adjective('us')} piece on the table (guns and bomber off it don't count).`;
    // Playing the 'us' side
    return `🎯 Destroy every one of the ${de} on the table${TURNS ? `, within ${TURNS} rounds` : ' (no time limit for now)'}. There is no goal to take here.`;
  }

  // The goal at Dunkirk (Steve): get enough away on the boats, or stop them; with the count so far
  function goalEvacuate() {
    const E = st.map.evacuate;
    const count = `${st.evac.saved} of ${E.need} away so far.`;
    if (st.mode === 'none') return `🎯 Two robots: the British must get ${E.need} sections away on the little ships within ${E.rounds} rounds, the Germans stop them. ${count}`;
    if (st.human === 'de') return `🎯 Stop the British getting ${E.need} sections away within ${E.rounds} rounds: shoot the lorries, or reach the coast road. ${count}`;
    return `🎯 Hold the Germans off the coast road while the lorries take the men to the boats: ${E.need} sections away within ${E.rounds} rounds wins; a German on the road loses. ${count}`;
  }

  // ---------- The banner (Steve, 2026-11-16) ----------
  // News in big letters over the table, in the goal's lettering, for BANNER_FOR milliseconds each, one after another:
  // reinforcements arriving, paratroopers or supplies dropping
  const BANNER_FOR = 4000;
  let bannerShown = 0, bannerGame = null, bannerBusy = false;
  function banner() {
    // A new game: nothing of the last one's is shown
    if (bannerGame !== st) { bannerGame = st; bannerShown = 0; }
    const list = st.announce || [];
    if (bannerBusy || bannerShown >= list.length) return;
    const next = list[bannerShown++];
    const box = $('#banner');
    // The big line, then any smaller ones under it, each kept whole on its own line
    box.innerHTML = '';
    for (const line of [next.text].concat(next.more || [])) {
      const div = document.createElement('div');
      div.textContent = line;
      if (line !== next.text) div.className = 'sub';
      box.append(div);
    }
    box.classList.add('on');
    bannerBusy = true;
    // Gone after its time, then the next one, if any
    setTimeout(() => { box.classList.remove('on'); setTimeout(() => { bannerBusy = false; banner(); }, 500); }, BANNER_FOR);
  }

  function update() {
    const rounds = st.evac ? st.map.evacuate.rounds : TURNS;
    $('#clock').innerHTML = `<b>Round ${st.turn}</b>${rounds ? ` of ${rounds}` : ''} · ${st.map.name}`;
    $('#goal').textContent = st.evac ? goalEvacuate() : st.noGoal ? goalWithout()
      : st.mode === 'none'
      ? `🎯 Two robots: the ${Sim.sideName(st, 'us')} attack ${st.objective.name}, the Germans hold it. Click any piece to see what it is.`
      : st.human === 'de'
      ? `🎯 Destroy every ${adjective('us')} piece on the table (guns and bomber off it don't count). Don't let them hold ${st.objective.name} for a whole round.`
      : `🎯 Take ${st.objective.name} and hold it for the whole of the next round, or destroy every German${TURNS ? `, within ${TURNS} rounds` : ' (no time limit for now)'}.`;
    card(); hint(); bag(); banner();
  }

  // ---------- The bag of tokens, right of the button ----------
  // Green with a gold star for each American token still in the bag (left), grey with a black cross for each German one
  // (right); the round beside them in big letters
  const TOKEN = {
    us: '<span class="tok us">★</span>',
    // The Soviets (Steve): red with a yellow star
    su: '<span class="tok su">★</span>',
    // The British (Steve: a proper Union Jack on the token)
    uk: '<span class="tok uk"><svg viewBox="15 0 30 30" preserveAspectRatio="xMidYMid slice"><path d="M0,0v30h60v-30z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="2.5"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></svg></span>',
    timer: '<span class="tok timer" title="Timer: drawn, it ends the round"><svg viewBox="0 0 20 20"><path d="M5 2h10M5 18h10M6.5 2C5 7 9.6 8 9.6 10S5 13 6.5 18M13.5 2C15 7 10.4 8 10.4 10S15 13 13.5 18" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>',
    de: '<span class="tok de"><svg viewBox="0 0 20 20"><path d="M7 2h6v5h5v6h-5v5H7v-5H2V7h5z" fill="#111" stroke="#eee" stroke-width="1.4"/></svg></span>',
    // The Finns (Steve, 2026-11-16): the blue cross on white
    fi: '<span class="tok fi"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9.3" fill="#f2f2ee" stroke="#b9c3d0" stroke-width="1"/><path d="M2 8.3h16v3.4H2zM6.6 2h3.4v16H6.6z" fill="#173c84"/></svg></span>',
  };
  function bag() {
    // While the round's tokens fly back in, only those home so far. When the timer has ended the round, the tokens
    // never drawn are still in the bag (Steve)
    const left = st.leftInBag ? Object.assign({ timer: 0 }, st.leftInBag) : null;
    const b = view.bagShown || left || st.bag || { us: 0, de: 0 };
    $('#bag-us').innerHTML = TOKEN[Sim.armyOf(st)].repeat(b.us);
    // (each side's tokens on its own side of the screen, Steve: the Germans on the left at Stalingrad)
    $('#bagbox').classList.toggle('flipped', !!st.map.flip);
    $('#bag-de').innerHTML = TOKEN[Sim.deArmyOf(st)].repeat(b.de);
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
    init, setState, update, asksForShot, asksForField, clickField, openMenu, openGunMenu, openAsk, closeMenu, litFieldRects, keepMenuClear, onARedBubble, chargesInto,
    inspect, actsOn, spots, moveSpotsFor, targets, shootTarget, rallies, rallyTarget, view, selected,
    selectSupport, inspectGun, chosenGun, dropSupport, supportState, flyToken, returnTokens, KIND,
  };
})();
