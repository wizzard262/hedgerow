// Hedgerow: start-up, input, drawing the table, and the rounds: tokens drawn from a blind bag one at a time, each side
// moving one piece a token (the Germans with their "take cover?" questions)

window.Game = (() => {
  const G = {};
  let st, hover = null, hotTarget = null, dirty = true;
  // viewChanged: what is marked on the table has changed, not just the cross-hairs' pulse. gameChanged: the game itself has
  let viewChanged = true, gameChanged = true;
  function redraw() { dirty = true; viewChanged = true; }
  // The German move just made ({ id or gun, what }), kept on the table for COMPUTER_MOVE_SHOWN ms after its token ends
  let shownMove = null;
  const COMPUTER_MOVE_SHOWN = 2200;
  const $ = s => document.querySelector(s);
  const board = $('#board');

  // Timers for the game in play: a new game drops those of the last one (they drew a second chain of tokens)
  let gameNumber = 0;
  function later(fn, ms) {
    const game = gameNumber;
    setTimeout(() => { if (game === gameNumber) fn(); }, ms);
  }

  // Who plays each side: asked when the page opens and under New game, and remembered on this computer (see Sim.newGame)
  const MODE_KEY = 'hedgerow-side';
  const MODES = ['us', 'de', 'both', 'none'];
  function rememberedMode() {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      return MODES.includes(saved) ? saved : 'us';
    } catch (e) { return 'us'; }
  }
  function rememberMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* not remembered: this game still plays that way */ }
  }

  // A fresh table, with nothing moving yet
  function setTable(seed, mode, mapId) {
    gameNumber++;
    drawing = false; computerPicked = null; shownMove = null; resultWaiting = false; asking = false;
    Board.reset();
    st = Sim.newGame(seed, mode, mapId);
    G.state = st;
    UI.closeMenu();
    UI.setState(st);
  }

  // Which map (Steve): one of MAPS, or a new one at random each game; asked with the sides, and remembered on this computer
  const MAP_KEY = 'hedgerow-map';
  function rememberedMap() {
    try {
      const saved = localStorage.getItem(MAP_KEY);
      return saved === 'random' || MAPS.some(m => m.id === saved) ? saved : 'random';
    } catch (e) { return 'random'; }
  }
  function rememberMap(choice) {
    try { localStorage.setItem(MAP_KEY, choice); } catch (e) { /* not remembered: this game still plays it */ }
  }
  let chosenMap = rememberedMap();
  // The map for a game: the one chosen, or one picked at random
  function mapFor(choice) {
    if (choice !== 'random') return choice;
    return MAPS[Math.floor(Math.random() * MAPS.length)].id;
  }

  // mode: who plays each side; left out, as now. mapId: one of MAPS or 'random'; left out, as chosen
  function start(seed, mode, mapId) {
    setTable(seed, mode || st.mode, mapFor(mapId || chosenMap));
    gameStarted = true;
    Sim.startRound(st);
    changed();
    // The first round's tokens fly into the bag once the pieces are on the table
    later(() => UI.returnTokens(() => later(drawNext, 400)), 700);
  }

  // Something changed: the panel now, the table on the next frame. If that was the American token's piece finishing its
  // move, the next token is drawn
  let drawing = false;
  function changed() {
    UI.update();
    redraw();
    gameChanged = true;
    viewStale = true;
    if (!drawing && Sim.activationOver(st)) {
      drawing = true;
      Sim.passToken(st);
      UI.view.mode = null;
      UI.update();
      Board.clearToken();
      // (a hand-to-hand fight still being shown on the table is seen to the end first)
      later(() => { drawing = false; drawNext(); }, 700 + Board.busyFor());
    }
  }

  // The fields your shot at the target under the pointer would land on, when it can hit more than one piece:
  // mortars the whole field, artillery the field and the four next to it, a tank's high explosive at men the whole field
  function blastFor(shooter, target) {
    // The bomber: its line through the edge field under the pointer
    if (UI.view.mode === 'fire:bomber') {
      const onEdge = hover && Sim.bomberEdges().some(f => f.x === hover.x && f.y === hover.y);
      if (!onEdge) return [];
      const line = Sim.bomberLine(hover.x, hover.y, Sim.bomberHeading(st, st.human));
      return line.map(f => ({ x: f.x, y: f.y, main: true }));
    }
    // Nothing under the pointer, or it has left the table
    if (!target || target.x === null) return [];
    const mode = UI.view.mode || '';
    // German mortars drop on the one piece (Steve: the differences between the sides stay)
    if (mode === 'fire:mortars' && st.human === 'de') return [];
    // Mortars or artillery chosen
    if (mode.startsWith('fire:')) return Sim.shellFields(mode.slice(5), target.x, target.y, st.human);
    // A tank shooting at men: its burst catches every other enemy piece on foot in that field
    if (shooter && Sim.isTank(shooter) && !Sim.isTank(target)) return [{ x: target.x, y: target.y, main: true }];
    // Every other weapon hits only the one piece
    return [];
  }

  // The compass to show now, and which way it points: your bomber being aimed, or theirs on its token; null if neither
  function compassNow() {
    if (UI.view.mode === 'fire:bomber') return Sim.bomberHeading(st, st.human);
    const move = st.computer && st.computer.move;
    if (move && move.gun === 'bomber') return Sim.bomberHeading(st, Sim.computerSide(st));
    return null;
  }

  // The bomber's line to draw on the table: under your pointer while you aim, or the one theirs has chosen
  function flightLineNow() {
    if (UI.view.mode === 'fire:bomber') {
      const onEdge = hover && Sim.bomberEdges().some(f => f.x === hover.x && f.y === hover.y);
      return onEdge ? { x: hover.x, y: hover.y, heading: Sim.bomberHeading(st, st.human) } : null;
    }
    const run = st.computer && st.computer.run;
    return run ? { x: run.x, y: run.y, heading: Sim.bomberHeading(st, Sim.computerSide(st)) } : null;
  }

  // Draw the table whenever something changed or pieces are still gliding; place the hamlet's name over it
  let viewStale = true, shownSpots = [], shownTargets = [];
  function frame() {
    if (dirty) {
      // (they take some working out, and only change when the game does: not every frame)
      if (viewStale) { shownSpots = UI.spots(); shownTargets = UI.targets(); viewStale = false; }
      const spots = shownSpots.slice();
      let targets = shownTargets;
      // The shooter, for the lines of sight to its targets
      // (just picked, a piece that can shoot from where it stands shows its targets too)
      const aiming = ['shoot', 'halfShot'].includes(UI.view.mode) || (UI.view.mode === 'go' && targets.length > 0);
      let shooter = aiming ? UI.selected() : null, mortarAim = null, aimWhich = null;
      // The fields a shot that hits more than one piece would land on, shown round its target (Steve)
      let blast = blastFor(shooter, hotTarget);
      // The German's chosen target while it aims (see below), shown like the one under your pointer
      let aimedAt = null;
      // During the German move, show who is aiming at whom (Steve): the shooter's field, a line of fire to the target,
      // its red cross-hair with the score needed. German mortars: the line comes from their mortar off the board.
      // Aiming (before it fires): every target it could hit, with its score and why, as yours show (Steve)
      // A German piece just picked: where it could go, as yours show (Steve)
      if (computerPicked && st.computer) spots.push(...UI.moveSpotsFor(Sim.unitById(st, computerPicked)));
      const planned = st.computer && (st.computer.ask || st.computer.aim);
      let others = [];
      // Their bomber: the edge fields while it chooses (as yours show), then its line, and any piece of yours asked
      const bombing = planned && (planned.bomber || planned.bombed);
      const deBomber = st.computer && st.computer.move && st.computer.move.gun === 'bomber';
      if (deBomber && !st.computer.run && !st.computer.ask && !st.computer.aim) spots.push(...Sim.bomberEdges().map(f => ({ x: f.x, y: f.y, kind: 'fire' })));
      if (bombing && st.computer.run) {
        const line = Sim.bomberLine(st.computer.run.x, st.computer.run.y, Sim.bomberHeading(st, Sim.computerSide(st)));
        blast = line.map(f => ({ x: f.x, y: f.y, main: true }));
        if (planned.bombed) {
          const t = Sim.unitById(st, planned.target);
          t.needNow = Sim.bombNeed(st, t);
          t.needWhy = Sim.bombWhy(st, t);
          targets = [t];
        }
      }
      if (planned && !bombing) {
        const shot = planned, t = Sim.unitById(st, shot.target), s = shot.shooter && Sim.unitById(st, shot.shooter);
        if (s) spots.push({ x: s.x, y: s.y, kind: 'charge' });
        spots.push({ x: t.x, y: t.y, kind: 'shoot' });
        if (s) {
          // (a shot after a move needs one more, and says so)
          const moving = !!shot.moving;
          t.needNow = Sim.needFor(st, s, t, moving) + Sim.armourOf(t);
          t.needWhy = Sim.needWhy(st, s, t, moving);
          shooter = s;
          // A German tank's high explosive: the whole field
          blast = Sim.isTank(s) && !Sim.isTank(t) ? [{ x: t.x, y: t.y, main: true }] : [];
          // Still aiming: the other pieces it could have fired on, each with its score
          if (st.computer.aim) others = Sim.targets(st, s).filter(o => o.id !== t.id).map(o => {
            o.needNow = Sim.needFor(st, s, o, moving) + Sim.armourOf(o);
            o.needWhy = Sim.needWhy(st, s, o, moving);
            return o;
          });
        } else {
          t.needNow = Sim.shellNeed(st, t);
          t.needWhy = Sim.shellWhy(st, t);
          mortarAim = t;
          aimWhich = shot.artillery ? 'artillery' : 'mortars';
          // Shells on a whole field: where they will fall. German mortars drop on the one piece only
          // (a piece asked may not be the target: they fall round the target)
          const shelling = st.computer.shelling;
          blast = shelling ? Sim.shellFields(shelling.which, shelling.x, shelling.y, Sim.computerSide(st)) : [];
        }
        targets = [t, ...others];
        // The one it picked stands out, as the target under your pointer does
        if (st.computer.aim && others.length) aimedAt = t;
      }
      // Green rings under pieces that can still act this round, grey under those that have
      const ready = st.computer || st.won || st.lost || st.mode === 'none' ? null : u => Sim.canAct(st, u) || Sim.captainCanRally(st, u);
      const guns = st.computer || st.won || st.lost || st.mode === 'none' ? null : UI.supportState();
      // Something done during the draw (a token landing starts the Germans' move) asks for another draw: keep that
      dirty = false;
      const same = !viewChanged, stateChanged = gameChanged;
      viewChanged = false; gameChanged = false;
      const mode = UI.view.mode || '';
      const more = Board.render(st, {
        same, stateChanged, spots, hover, targets, ready, shooter, mortarAim, aimWhich, guns, blast,
        selected: UI.selected(),
        hotTarget: aimedAt || hotTarget,
        rallies: UI.rallies(),
        computerMove: (st.computer && st.computer.move) || shownMove,
        fireFrom: mode.startsWith('fire:') ? mode.slice(5) : null,
        compass: compassNow(),
        flightLine: flightLineNow(),
      });
      if (more) dirty = true;
      const p = Board.screenPoint(st.objective.x + 0.5, st.objective.y, 0.35), r = board.getBoundingClientRect();
      Object.assign($('#label').style, { left: p.x - r.left + 'px', top: p.y - r.top + 'px' });
      $('#label').textContent = `🎯 ${st.objective.name}`;
    }
    requestAnimationFrame(frame);
  }

  function fit() {
    const r = board.getBoundingClientRect();
    Board.resize(Math.max(200, r.width), Math.max(200, r.height));
    redraw();
  }

  // ---------- The bag ----------

  // Draw the next token: it grows and floats to the middle of the table, then that side moves. An empty bag ends the round
  function drawNext() {
    // One side wiped out: the game stops at once (Steve: the round isn't finished)
    if (st.won || st.lost) return showResult();
    // Shots still flying (a tank turns before it fires), or their dice only just down: the next token waits, so every
    // roll can be read
    const flying = Math.max(Board.busyFor(), Board.diceLeft());
    if (flying > 0) { later(drawNext, flying + 150); return; }
    const side = Sim.drawToken(st);
    if (!side) return nextRound();
    // Two humans: the last player's choice goes with their token
    if (st.mode === 'both') { UI.view.sel = null; UI.view.support = null; UI.view.mode = null; }
    changed();
    // The timer token (Steve): it lands on the table, and the round ends at once
    if (side === 'timer') {
      UI.flyToken(side, () => later(() => { Board.clearToken(); nextRound(); }, 900));
      return;
    }
    UI.flyToken(side, () => {
      if (Sim.isRobot(st, side)) return chooseComputer();
      // No American piece able to move on it: the token is used up
      if (!Sim.humanCanMove(st)) { Sim.passToken(st); Board.clearToken(); changed(); later(drawNext, 600); return; }
      changed();
    });
  }

  // The bag is empty (or the timer came out): the round ends, then a new one starts with a full bag
  function nextRound() {
    Sim.endRound(st);
    changed();
    if (st.won || st.lost) return showResult();
    Sim.startRound(st);
    changed();
    // Every piece's token flies back into the bag (Steve), then the first is drawn
    UI.returnTokens(() => later(drawNext, 400));
  }

  // Pass on an American token (no button for it now, Steve: each piece has Skip turn; the screenshot tool still uses it)
  function pass() {
    if (st.won || st.lost || st.computer || st.drawn !== st.human) return;
    UI.closeMenu();
    UI.view.mode = null;
    Sim.passToken(st);
    Board.clearToken();
    changed();
    later(drawNext, 400);
  }

  // The computer picks its German piece as you would (Steve): the pick-up sound and the ring round it, then a moment
  // later it moves (its moving sounds are the same as yours: men running, tanks driving)
  // (and, as yours show when picked, where it could go: Steve)
  const COMPUTER_PICK_PAUSE = 1300;
  let computerPicked = null;           // the German piece picked, until it moves: its moves show on the table
  function chooseComputer() {
    const move = st.computer && st.computer.move;
    // A piece, or their mortars or artillery off the board
    if (move && move.id) { Sound.play('select'); Board.bounce(Sim.unitById(st, move.id)); computerPicked = move.id; }
    if (move && move.gun) { Sound.play('select'); Board.bounceGun(Sim.computerSide(st), move.gun); }
    // The dice of the last attack go once the next piece is chosen (Steve), theirs as yours
    Board.clearDice();
    changed();
    later(runComputer, COMPUTER_PICK_PAUSE);
  }

  // The German piece moves; before it fires, its targets show as yours do (Steve), then if it fires on a piece that
  // could take cover, ask first
  const COMPUTER_AIM_SHOWN = 1400;
  // A Move & shoot: the piece gets there before its shot is aimed at for that long
  const COMPUTER_ARRIVES = 1100;
  function runComputer() {
    computerPicked = null;
    const r = Sim.computerStep(st, true);
    if (r.aim) {
      changed();
      const arriving = r.aim.moving ? COMPUTER_ARRIVES : 0;
      later(runComputer, COMPUTER_AIM_SHOWN + arriving + Board.busyFor());
      return;
    }
    if (r.ask) return ask(r.ask);
    // Keep what it did on the table a moment after the token ends, so you can see it (Steve)
    shownMove = st.computer && st.computer.move;
    Sim.endComputerToken(st);
    changed();
    // The Germans' move wiped one side out: the game is over
    if (st.won || st.lost) return showResult();
    later(() => { shownMove = null; redraw(); Board.clearToken(); later(drawNext, 400); }, COMPUTER_MOVE_SHOWN + Board.busyFor());
  }

  // A piece of yours under fire: Stand fast or Take cover, in a word bubble by it (Steve: no dialog)
  function ask(shot) {
    const t = Sim.unitById(st, shot.target);
    UI.closeMenu();
    changed();
    // Once the table shows the shot (its score bubble placed), put the choice by the piece
    requestAnimationFrame(() => requestAnimationFrame(() => UI.openAsk(t, answer)));
  }

  function answer(pull) {
    Sim.answer(st, pull);
    changed();
    // A moment to see the dice before the Germans carry on
    later(runComputer, 350);
  }

  // The game is over: the message waits until the table has shown the last shot landing (Steve: it came up before the
  // last piece was hit), then a moment more to see it
  const RESULT_PAUSE = 900;
  let resultWaiting = false;
  function showResult() {
    // Called once for the end, however many ways it is reached
    if (resultWaiting) return;
    resultWaiting = true;
    // Two frames, so the table has started showing the shots, then until they land
    requestAnimationFrame(() => requestAnimationFrame(() => later(openResult, Board.settledIn() + RESULT_PAUSE)));
  }

  function openResult() {
    resultWaiting = false;
    const twoAlike = st.mode === 'both' || st.mode === 'none';
    const ending = twoAlike ? plainEnding() : st.mode === 'de' ? germanEnding() : americanEnding();
    $('#result-title').textContent = ending.title;
    $('#result-text').textContent = ending.text;
    $('#result').hidden = false;
  }

  // How it ended with no one player to win or lose it: two humans, or two robots
  function plainEnding() {
    if (st.draw) return { title: '🤝 A draw', text: st.report[0] };
    if (st.lost) return { title: '🏆 The Germans win', text: st.report[0] };
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    return { title: germansLeft ? `🏆 The Americans take ${st.objective.name}` : '🏆 The Americans win', text: st.report[0] };
  }

  // How it ended for a player commanding the Americans: a side wiped out, the village taken, or time run out
  function americanEnding() {
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    const usLeft = st.units.some(u => u.side === 'us' && u.x !== null);
    const winTitle = germansLeft ? `🏆 ${st.objective.name} is ours` : '🏆 The Germans are wiped out';
    const loseTitle = usLeft ? '⌛ The attack has failed' : '💀 The company is wiped out';
    return { title: st.draw ? '🤝 A draw' : st.won ? winTitle : loseTitle, text: st.report[0] };
  }

  // How it ended for a player commanding the Germans: every American piece gone (their guns off the table don't count),
  // or the village lost, or every German gone
  function germanEnding() {
    if (st.draw) return { title: '🤝 A draw', text: st.report[0] };
    const round = Sim.roundText(st.turn);
    if (st.lost) return { title: '🏆 The American company is destroyed', text: `🏆 Nothing is left of the Americans on the table, in ${round}. The attack has failed.` };
    const germansLeft = st.units.some(u => u.side === 'de' && u.x !== null);
    if (germansLeft) return { title: `💀 ${st.objective.name} has fallen`, text: `💀 The Americans took ${st.objective.name} and held it at the end of ${round}.` };
    return { title: '💀 Your company is wiped out', text: `💀 Every German on the field is destroyed, in ${round}.` };
  }

  // ---------- Input ----------

  // Two humans (Steve): each piece under fire is asked in turn, Stand fast or Take cover, by the other player; then the shot
  let asking = false;
  function askThenFire(pieces, fire) {
    if (!pieces.length) { asking = false; fire(); return; }
    asking = true;
    const t = pieces.shift();
    UI.closeMenu();
    changed();
    requestAnimationFrame(() => requestAnimationFrame(() => UI.openAsk(t, pull => {
      if (pull) Sim.takeCover(st, t);
      askThenFire(pieces, fire);
    })));
  }

  board.addEventListener('click', e => {
    if (e.target.closest('#menu')) return;
    // Waiting for Stand fast or Take cover: the rest of the table waits too
    if ((st.computer && st.computer.ask) || asking) return;
    // Two robots: nothing to command, any piece clicked just shows what it is
    if (st.mode === 'none') {
      const piece = Board.pieceUnder(st, e.clientX, e.clientY);
      if (piece) { Sound.play('select'); Board.bounce(piece); UI.inspect(piece); changed(); }
      return;
    }
    const enemy = Sim.computerSide(st);
    UI.closeMenu();
    // The captain rallying: the blue target nearest the click (Steve)
    const rallied = Board.targetAt(UI.rallies(), e.clientX, e.clientY);
    if (rallied && UI.rallyTarget(rallied)) { changed(); return; }
    // Shooting: the red cross-hair nearest the click, even one over a house
    const aimed = Board.targetAt(UI.targets(), e.clientX, e.clientY);
    const shotAsks = aimed ? UI.asksForShot(aimed) : null;
    if (shotAsks) {
      askThenFire(shotAsks, () => {
        if (UI.shootTarget(aimed)) hotTarget = null;
        changed();
        offerRally();
        if (st.won || st.lost) showResult();
      });
      return;
    }
    // Your mortars or artillery off the board: choose them like a piece
    const gun = !st.computer && Board.gunAt(e.clientX, e.clientY, st.human);
    if (gun) {
      Sound.play('select'); Board.bounceGun(st.human, gun); Board.clearDice(); UI.selectSupport(gun);
      // Picked again: the compass spins again, to the same direction (Steve)
      if (gun === 'bomber') Board.respinCompass();
      changed();
      // Its menu by the click, with Skip turn (Steve)
      const r = board.getBoundingClientRect();
      UI.openGunMenu(gun, e.clientX - r.left, e.clientY - r.top, r);
      return;
    }
    const f = Board.fieldAt(e.clientX, e.clientY);
    if (!f) return;
    // The enemy's piece clicked, when the click isn't the chosen piece's action: ring it and show what it is (Steve).
    // Its model under the pointer, or the nearest of them in a field with none of yours
    const under = Board.pieceUnder(st, e.clientX, e.clientY);
    const foeField = !Sim.at(st, f.x, f.y, st.human).length && Sim.at(st, f.x, f.y, enemy).length;
    const foe = under && under.side === enemy ? under : !under && foeField ? Board.pieceAt(st, e.clientX, e.clientY, enemy) : null;
    if (foe && !UI.actsOn(f.x, f.y)) { Sound.play('select'); Board.bounce(foe); UI.inspect(foe); changed(); return; }
    // A click on a lit field that fires: the other player is asked first, then the click goes through
    const clicked = { x: e.clientX, y: e.clientY };
    const fieldAsks = UI.asksForField(f.x, f.y);
    if (fieldAsks && fieldAsks.length) { askThenFire(fieldAsks, () => clickOnField(f, clicked)); return; }
    clickOnField(f, clicked);
  });

  // A click on a field: the chosen piece's action there, or the piece under the pointer chosen
  function clickOnField(f, clicked) {
    // The one piece under the pointer (the nearest in the field if the click misses the models)
    const mine = UI.clickField(f.x, f.y, Board.pieceAt(st, clicked.x, clicked.y, st.human), f.side);
    changed();
    // Your pieces there: open their menu by the click
    // Picking the next piece clears the last shots' dice off the table
    // The pick-up sound as you choose it (Steve)
    if (mine) { Sound.play('select'); Board.bounce(mine[0]); Board.clearDice(); const r = board.getBoundingClientRect(); UI.openMenu(mine, clicked.x - r.left, clicked.y - r.top, r); $('#tip').style.display = 'none'; }
    else offerRally();
    if (st.won || st.lost) showResult();
  }

  // The captain has moved or fired and can still rally someone (himself too): offer it straight away (Steve), his menu
  // with Rally by him and blue targets on who he can rally
  function offerRally() {
    const cap = UI.selected();
    // The PaK has just moved within its field: its menu by it, to lie in ambush on the same go (Steve)
    if (cap && cap.mayAmbush && st.activeId === cap.id) {
      const box = board.getBoundingClientRect(), spot = Board.pieceScreen(cap);
      UI.openMenu([cap], spot.x - box.left, spot.y - box.top, box);
      return;
    }
    // Only the captain, after his move, on his own token, with someone to rally
    if (!cap || cap.kind !== 'captain' || !cap.acted || st.activeId !== cap.id || !Sim.captainCanRally(st, cap)) return;
    const r = board.getBoundingClientRect(), p = Board.pieceScreen(cap);
    UI.openMenu([cap], p.x - r.left, p.y - r.top, r);
  }
  board.addEventListener('mousemove', e => {
    // The cross-hair under the pointer grows, so it is clear which target a click will fire on
    const hot = Board.targetAt(viewStale ? UI.targets() : shownTargets, e.clientX, e.clientY);
    if ((hot && hot.id) !== (hotTarget && hotTarget.id)) { hotTarget = hot; redraw(); }
    const f = Board.fieldAt(e.clientX, e.clientY);
    const sameField = f && hover && f.x === hover.x && f.y === hover.y;
    if ((sameField && f.side === hover.side) || (!f && !hover)) return;
    hover = f; redraw();
    if (!sameField && $('#menu').hidden) tooltip(e, f);
  });
  board.addEventListener('mouseleave', () => { hover = null; redraw(); $('#tip').style.display = 'none'; });

  // What is in a field, on hover
  function tooltip(e, f) {
    const tip = $('#tip');
    if (!f) { tip.style.display = 'none'; return; }
    const NAMES = { field: 'Field', orchard: 'Orchard', village: 'Village', hamlet: 'Hamlet', river: 'River', street: 'Street', square: 'Square', bridge: 'Bridge', laneEW: 'Lane', laneNS: 'Lane', crossroads: 'Crossroads' };
    const here = Sim.at(st, f.x, f.y);
    const lines = here.map(u => `${u.side === 'us' ? 'US' : 'German'} · ${u.name}${u.kind === 'company' ? ` · ${u.platoons} sections` : ''}${u.ambush ? ' · in ambush' : ''}${u.shocked ? ' · shaken' : ''}`);
    // A wreck in the field: it is there to be hidden behind
    if (Sim.wreckAt(st, f.x, f.y)) lines.push('Burnt-out tank: blocks the view, +1 cover past its corner');
    // A café, a barn, a fountain or a pond: what it takes, and whether it blocks the view
    for (const thing of Sim.featuresAt(st, f.x, f.y)) lines.push(thing.blocksView ? `${thing.name}: blocks the view, +1 cover past its corner` : `${thing.name}: nobody can stand there`);
    const t = Sim.tileType(f.x, f.y);
    // Houses and trees: their cover (see PLACE_COVER), and the view
    const place = PLACE_COVER[t];
    const cover = place ? `${t === 'orchard' ? 'Trees' : 'Houses'}: +${place.men} to hit men here, +${place.tank} a tank, +${place.shells} with mortars or artillery; none for an enemy in this same field. Seen into and out of, never through` : t === 'river' ? 'Nothing can cross except at a bridge' : '';
    // A village field takes the name of the nearest village
    const village = t === 'village' ? st.map.villages.slice().sort((a, b) => (Math.abs(a.x - f.x) + Math.abs(a.y - f.y)) - (Math.abs(b.x - f.x) + Math.abs(b.y - f.y)))[0].name : null;
    tip.innerHTML = `<b>${village || NAMES[t]}</b>${cover ? `<br><span style="color:var(--muted)">${cover}</span>` : ''}${lines.length ? '<br>' + lines.join('<br>') : ''}`;
    const r = board.getBoundingClientRect();
    Object.assign(tip.style, { display: 'block', left: Math.min(r.width - 290, e.clientX - r.left + 14) + 'px', top: e.clientY - r.top + 14 + 'px' });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !(st.computer && st.computer.ask) && !asking) { UI.view.mode = null; UI.closeMenu(); changed(); }
  });
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
  // Who plays each side (Steve: human or robot, all four variations); what they had last is lit. Before the first game
  // there is nothing to cancel back to
  let gameStarted = false;
  const picked = { us: 'human', de: 'robot' };
  function lightSides() {
    for (const side of ['us', 'de']) for (const who of ['human', 'robot']) $(`#${side}-${who}`).className = picked[side] === who ? 'on' : '';
  }
  function askSide() {
    const mode = st.mode;
    picked.us = mode === 'us' || mode === 'both' ? 'human' : 'robot';
    picked.de = mode === 'de' || mode === 'both' ? 'human' : 'robot';
    lightSides();
    lightMap();
    $('#newgame [data-close]').hidden = !gameStarted;
    $('#newgame').hidden = false;
  }
  $('#new-btn').onclick = askSide;
  for (const side of ['us', 'de']) for (const who of ['human', 'robot']) {
    $(`#${side}-${who}`).onclick = () => { picked[side] = who; lightSides(); };
  }
  // A button for each map, and Random; what the one lit does is said under them
  function lightMap() {
    for (const b of document.querySelectorAll('#map-choice button')) b.className = b.dataset.map === chosenMap ? 'on' : '';
    const map = MAPS.find(m => m.id === chosenMap);
    $('#map-note').textContent = map ? map.note : 'A different map each game.';
  }
  for (const choice of [{ id: 'random', name: 'Random' }, ...MAPS]) {
    const b = document.createElement('button');
    b.id = 'map-' + choice.id;
    b.dataset.map = choice.id;
    b.textContent = choice.name;
    b.onclick = () => { chosenMap = choice.id; lightMap(); };
    $('#map-choice').append(b);
  }
  // The four variations, from the two choices
  function pickedMode() {
    if (picked.us === 'human') return picked.de === 'human' ? 'both' : 'us';
    return picked.de === 'human' ? 'de' : 'none';
  }
  $('#start-game').onclick = () => {
    const mode = pickedMode();
    $('#newgame').hidden = true;
    rememberMode(mode);
    rememberMap(chosenMap);
    start(undefined, mode);
  };
  $('#newgame [data-close]').onclick = () => { $('#newgame').hidden = true; };
  $('#again-btn').onclick = () => { $('#result').hidden = true; start(); };
  window.addEventListener('resize', fit);

  // ---------- Start ----------
  Board.init(board);
  UI.init(changed);
  // The table waits behind the question (Steve: the game starts by asking which side)
  setTable(undefined, rememberedMode(), mapFor(chosenMap));
  changed();
  askSide();
  fit();
  // The rules don't open at the start (Steve): How to play opens them
  requestAnimationFrame(frame);

  G.pass = pass;
  G.restart = start;
  G.refresh = changed;
  return G;
})();
