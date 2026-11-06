# Hedgerow: the prompts

How the game was made: each prompt, what was built, and the assumptions made.

## 1. The idea

- Steve: what kind of game works at a lower level in the bocage, still maybe division level, like an O group, with sectors and command points; might have to be top down
- Proposed a division-level orders game round the O group; Steve chose to build it at company level instead (below)

## 2. The first rules

- Steve: artillery and mortars are the only things short of ammunition; reinforcements arrive. A battalion is three companies; companies of three platoons, of different quality (one elite, two standard). A Sherman platoon and a Firefly platoon of two tanks each. MG and bazooka teams attach to a company. Pieces can be shocked and need rest or rallying; each company has a captain who moves into rallying distance. Each company gets orders each turn and can save them. US against Germans. Moves: charge (no shooting), move and shoot at half power, shoot, rally. Controls on the left, board on the right
- Built: the rules in `js/sim.js`, a field grid with hedges on the edges, lanes and a hamlet, a headless bot and balance sweep
- Assumption: Fireflies kept for the Americans as asked (historically British; the US equivalent was the 76 mm Sherman)

## 3. Command points and reacting

- Steve: when fired on, a piece whose company has a point left can spend it to try (not always succeed) to withdraw and take less damage, so there are choices in the enemy's turn. With full points only about two thirds of the pieces should act each turn
- Points per company: two thirds of its pieces an hour (fractions carry over), saved up to 3; each piece acts once an hour. In the German hour the game stops and asks "Pull back?" (60%, elite 75%: it falls back a field and takes half the hits)

## 4. German armour, hedge cutters

- Steve: the Germans similarly armed, with Panzer IVs and Panthers. Shermans and Panzer IVs have hedge cutters and go through a hedge, making a hole; other tanks and infantry can do the same but struggle and take a turn
- Panzerschreck teams for the Germans; the Panther's armour needs one more on the dice. Cutter tanks drive through and leave a gap; Fireflies, Panthers and companies can Break through (their whole hour); infantry climbing a hedge can't shoot that hour

## 5. The look

- Several rounds: pixel art like Stardew Valley, then muted and smooth, then "much more like a photograph, a 3/4 view from the top", then "more like a tabletop wargame" with Steve's photo of his own table (the Sherman in it was toppled)
- Settled on real 3D with three.js: wooden table, flocked mat, clump-foam hedges, model tanks and painted figures, dice. Camera E (slanted, the whole board) chosen; models more detailed and bigger
- Scales (Steve): a 4-inch tank on a 4-foot table; men 1:54, tanks 1:76, houses 1:144. Four men to a platoon base on a flocked base, three platoons move together as a company, tanks in pairs; formations loose, shuffling when they move
- Whole board on the table, no fog of war

## 6. The map and the aim

- Steve: lanes, rivers with bridges, fields; small villages that hold one company or one tank platoon in the yard; barbed-wire fences that tanks flatten; pieces start at random in the first 20% of their side, in cover if they can; the aim is to occupy a village in six moves
- Map: a river with two stone bridges, two villages (one is the objective each game), hamlets, orchards, lanes. The German garrison starts dug in round the objective (assumption: otherwise nobody would be defending it in six moves); the rest of the Germans start at the east end and march to posts round it
- Shooting is now real dice: 5+ to hit, +1 behind a hedge or in a village, elite −1
- Balance: the bot wins about 40% within six moves; doing nothing never wins

## 7. One captain, a menu, hedges that stop you

- Steve: Move & shoot only worked when there was nothing to shoot; there's no point in a captain for each company as they are one to one: just one captain who can use his move to rally; clicking a unit should open a menu of its options; I can charge through a hedge, so what's the point of Break through: Break through should be a shorter move, like Move & shoot; MG teams should be three men on one base with a tripod gun, to be more obvious
- Moving and shooting now always offers the half-dice shot (climbing no longer stopped it)
- One captain for the battalion (battalion points): Move, or use his move to Rally a piece in his field or the next. Companies earn a point an hour for themselves, plus two thirds for each attached team; the tank company two thirds a platoon
- Clicking your piece on the table opens a menu by it: each of your pieces in that field, its state and points, and the actions it can take now
- Hedges now stop Charge and Move & shoot into an empty field (only Shermans and Panzer IVs drive through). Break through takes any other piece through a hedge or wire into the next field, leaving a gap, with no shooting. Charging across a hedge is still allowed to assault Germans behind it (they get the hedge bonus). The Germans break through on the march when they must
- More gaps in the hedges (30%) so the six moves are possible; the bot wins about 30%, doing nothing never
- MG teams: three men (gunner, loader, ammunition carrier with boxes) round a tripod-mounted gun on one big base

## 8. Bazooka teams and longer charges

- Steve: bazooka teams like the MG teams: two men on one base, a big obvious bazooka, the other man with a big suitcase-like bag; a charge moves twice as far as Move & shoot
- Bazooka and Panzerschreck teams: the gunner with a big tube (the Panzerschreck with its blast shield), the loader in front with a big square bag of rockets
- Charge now reaches up to two fields; the second can be an assault. Move & shoot stays one field
- Fixed: the German helmet showed only its inside (it now looks like a Stahlhelm)
- Balance: the bot wins about 38%

## 9. Red targets

- Steve: once I've moved, how do I shoot, and how do I see who I can shoot? We need a red target over whoever can be shot when the move is done
- After Move & shoot the game goes straight to "Fire on the move": a red cross-hair floats over every German piece in reach, with a red ring on the table under it; click one to fire at half the dice, or Esc to hold fire. The same red targets show when choosing Shoot
- If nobody is in reach after the move, "This hour" says so instead

## 10. Who has acted

- Steve: make it more obvious, in the menu and on the piece, who has moved
- On the table: a green ring under every piece that can still act this hour; a grey ring and a big grey ✓ token by every piece that has
- In the menu and the panel: a green "Ready · 2 points", grey "✓ Done this hour" or red "Shaken" badge; pieces that have acted are struck through in the list

## 11. Company level

- Steve: it's not battalion level, is it? That would be three companies of three platoons; this is a company, so three platoons
- Steve chose: company level, names only. You command a rifle company: 1st (elite), 2nd and 3rd Platoons, each three section bases of four men, with 4th Platoon arriving later; the captain is the company commander; "Battalion" is now Company HQ; tanks come in sections of two; the Germans are Züge. Rules, numbers and map unchanged (the code still calls a rifle platoon `company`)

## 12. Lining the hedges

- Steve: a piece at a hedge can fire through it without penalty; a piece away from the hedge shooting at an opponent lining it gets a cover penalty; if both are away from the hedge they can't shoot each other; if both are at the hedge both shoot with the cover penalty
- Each piece now either lines one hedge of its field or stands in the open. Moving into a field leaves it lining the far hedge (the way it was going); both sides start lining the hedge towards the enemy. A new action, "Line the … hedge", moves a piece to another hedge of its field (its move for the hour). On the table the pieces stand close to the hedge they line
- The German pieces with nobody to shoot line the hedge facing any American just across one

## 13. Moving and shooting, and seeing further

- Steve: Move & shoot still happens and I can't shoot
- The reason: you could only shoot into the next field, or two fields along a gap-free line, so after a move there was almost never anyone in reach. Pieces now see and shoot up to three fields over open fields and lanes; villages, hamlets and orchards in between block the view, and so does any hedge except the one the shooter or the target lines. Beyond the next field: one more on the dice
- Captains no longer get red targets (they can't shoot)

## 14. One captain

- Steve: only one captain, with a flag, for the whole company
- There is one: the company captain (company HQ). He now carries a tall blue company guidon so he is easy to find on the table

## 15. One unit to a field, no time limit

- Steve: only one unit per square unless it's hand-to-hand combat; don't limit to six moves, we can't complete the game: leave it unlimited for now
- One unit to a field for each side. A team joins a rifle platoon from the field next door (it moves in and goes with it); leaving puts it in a free field next door. The German garrison has a field each round the village (the PaK 40 now beside it)
- No time limit (TURNS = 0): the game ends when the village is taken and held at the end of an hour, or the company has no rifle platoons left. The clock runs on past midnight
- The test bot (capped at 20 hours) wins about 73%, in about 7 hours; doing nothing never wins

## 16. Tracers and shells

- Steve: shooting needs a graphic of tracer bullets and muzzle flash; tank on tank is a shell, but on men it is high explosive
- Every shot now plays on the table: a muzzle flash at the shooter, then red tracer (American) or green tracer (German) streaking to the target, a stream for machine guns, a few for rifles; tanks and guns fire one white-hot shell, which strikes armour in a bright spark or bursts as high explosive with fire and smoke among men; bazookas and Panzerschrecks fly a rocket with a smoke trail. Bullets kick up dust; mortar and artillery fire bursts as high explosive

## 17. Greyed out

- Steve: grey out a piece that has had its move
- A piece that has moved this hour turns grey on the table until the next hour (the ✓ token is gone)

## 18. No activation tokens

- Steve: lose the tokens to activate: it's one move per turn per piece
- Command points are gone: every piece moves (acts) once an hour. Pulling back in the German hour now costs the piece its next move. The mortars and the guns each fire once an hour (while the ammunition lasts); a team joining or leaving a platoon uses its move

## 19. Move & shoot only where you can shoot

- Steve: don't allow Move & shoot if you can't shoot; if you can, put red hatching on the move that allows the shot
- Move & shoot now only offers the fields from which the piece will have someone to fire at, red-hatched on the table; if there are none, the button is off. Plain moves into empty fields are Charges (up to two fields)
- The test bot (capped at 20 hours) wins about 79%, in about 7 hours

## 20. Tanks through hedges, charges for everyone

- Steve: tanks have both Charge and Break through; let's say all tanks just break through; Charge for all pieces is twice a movement
- Every tank (Firefly and Panther too) now drives straight through a hedge as part of its move or charge, leaving a gap; tanks no longer have a separate Break through
- Every piece can Charge, twice a move (up to two fields): teams and the captain too. Only rifle platoons and tanks can end a charge in a hand-to-hand fight; teams and the captain charge into empty fields

## 21. No plain move

- Steve: there is no Move: it's Charge, Move & shoot, Shoot or Rally
- The plain Move is gone from the menus. The captain Charges or Rallies; a team on its own Charges, Moves & shoots or Shoots; a team with a platoon moves with it and can Shoot. (Break through and Line a hedge stay, for getting through hedges and wire and lining them)

## 22. Teams and the captain with a platoon

- Steve: the bazooka and MG teams and the captain can occupy a platoon's position
- They can now stand in the same field as a rifle platoon (up to three with it). Otherwise it is still one unit to a field; tanks always have a field to themselves
- Steve: forget attaching to a platoon. Gone: teams always move on their own (the German MG teams start in their platoons' fields instead)

## 23. One piece at a time

- Steve: select only one piece at a time, not a square, so we see only one piece's menu at a time
- A click now picks the one model under the pointer (or the nearest piece in that field if it misses the models); the menu shows just that piece, and a white ring goes round it instead of the field

## 24. Charging through friends

- Steve: pieces can move through others with a charge: a tank can move through a friendly unit and vice versa, the same with infantry
- A two-field charge can now pass through a field held by your own pieces on the way; it can't stop there

## 25. Range, cover and moving

- Steve: long range is less effective, as is firing into cover, as is firing on the move
- Steve chose: the same for all three: each adds one to the score the dice need (they stack; a 6 always hits). Firing on the move now rolls full dice but needs one more (it used to be half the dice). Each red target now shows the score needed ("5+", "6")

## 26. Words off the target, tanks that turn and recoil

- Steve: show the words coming off the characters, miss or hit and the fire's effect, like "miss, hit, wound" for three shots from a platoon; make tanks turn and recoil to fire
- Every shot now sends words floating up off the target: "Hit!" or "Miss" for each die in turn, then what it did, bigger: Missed, No effect, Pinned, Section lost, Tank knocked out, Wiped out (and "Pulled back" first if it got away)
- A tank or anti-tank gun turns to face what it fires at and rocks back with the recoil; it keeps facing that way until it moves

## 27. Rallying

- Steve: pieces can self-rally, or the captain has a rally range of three squares and can rally friendlies
- A shaken piece can now use its move to "Rally itself" (50%, elite 65%). The captain's Rally reaches any shaken friendly piece up to three fields away (70%, elite 90%). Resting an hour unhit still recovers it

## 28. Machine guns don't fire on the move

- Steve: machine guns cannot move and fire
- MG teams no longer have Move & shoot: they Charge to a new spot, then Shoot from there the next hour

## 29. Clicking a target behind a building

- Steve: make it easier to hit the red circle to shoot when the enemy is in cover behind a building
- A click now fires on the red cross-hair nearest the pointer on the screen (within a thumb's width), wherever the click lands, even on a house in front. The cross-hair under the pointer grows, so it's clear which one a click will fire on

## 30. Move & shoot is one action

- Steve: it's just Move & shoot, no "Fire on the move"
- The separate "Fire on the move" button is gone. After the move, the piece's menu still shows Move & shoot (lit), and the red targets are up straight away: click one to finish the action

## 31. Tanks shrug off small arms

- Steve: tanks are impervious to infantry and MG
- Rifle platoons and MG teams can no longer fire on tanks (no red targets on them) and their hits never shake a tank; only bazookas, Panzerschrecks, anti-tank guns, tanks and the artillery can. Infantry can't charge a field held only by tanks

## 32. More gaps; an organic board later

- Steve: make more gaps in the hedges, and draw an organic, non-grid board, with pathfinding to allow free movement
- More gaps now: 45% of the edges between fields are gaps (was 30%)
- The organic board was costed: about 1–2 hours to draw curving, irregular fields over the hidden squares; about 5–7 hours for true free movement with pathfinding (every rule reworked for distances). Steve put both on his to-do list for later

## 33. No charging through houses

- Steve: you can't charge through a house
- A two-field charge can't pass through a village or hamlet field (it can still charge into one and stop there)
- Fixed on the way: a charge that passed through friends and was then beaten back could end up sharing their field; it now ends back where it started

## 34. Twice the squares (left for later)

- Steve: make double the squares and twice the move distance; then: leave it for now: with pathfinding coming later there's no point
- Nothing changed; it goes with the organic board and free movement on the to-do list

## 35. Machine guns fire five

- Steve: an MG can't move (and fire) but fires five bullets
- MG teams (American and MG 42) now fire 5 dice. Steve chose: they still Charge to a new spot, but never Move & shoot

## 36. Why it can't move; hand to hand

- Steve: sometimes a piece can only shoot and not move; and can we move into hand-to-hand combat?
- Why: a piece boxed in by hedges, wire or friends has no Charge; it has to Break through first. The menu now says so ("Hedges or wire all round…: Break through to get out")
- Hand to hand: a rifle platoon or tank charges into a field the Germans hold. The menu now says "Charge (hand to hand)" when it can reach Germans, and those fields are bright red on the table (the hint line explains). Teams and the captain can't fight hand to hand, and infantry can't charge a field of tanks alone

## 37. Sounds

- Steve: let's have some rifle, machine gun, bazooka, tank, mortar and artillery sounds
- Sounds made on the spot with the browser's Web Audio (no sound files): rifle cracks, a machine-gun rattle, a bazooka's whoosh, a tank gun's boom, a mortar's thunk, artillery's incoming whistle, and on landing: bullets kicking up dirt, a clang on armour, or a high-explosive burst. They follow the pictures' timing. 🔊 at the top turns them off and on (remembered on this computer); sound starts after the first click, as browsers require

## 38. Select and move sounds

- Steve: select and move noises like the ones in Future City Battle
- Copied Future City Battle's own recordings (pieceUp.mp3 when you pick a piece, pieceSlide.mp3 when a piece moves) into `assets/audio/`. Picking one of your pieces plays the pick-up; any piece changing field (yours or the Germans') plays the slide

## 39. Running and tank sounds

- Steve: keep the select noise, but for men a running noise and for tanks a tank noise
- The pick-up stays. Moving now sounds like what moved: men running (boots on soft ground, kit rattling), or a tank's engine growl and track clatter. The slide recording is no longer used (removed)

## 40. Twisty barbed wire

- Steve: make the barbed wire more twisty
- The strands now kink and wander with little barbs along them, and a loose coil of concertina wire rolls along the foot of each fence

## 41. A tank ka-boom

- Steve: more of a tank ka-boom noise for shooting
- Tank and anti-tank guns now crack, then a deep boom and blast, then an echo rolling back off the hedges

## 42. Nothing under End the hour

- Steve: lose all the text below End the hour
- Gone: the "This hour" log, the "Last hour" report and the list of your pieces. The version number sits by the title now

## 43. A better running noise

- Steve: a better running noise
- Now four men's boots at slightly different paces, each step a heel thud and a crunch of grit, with kit rattling, fading as they go

## 44. What the dice show

- Steve: what do the dice show? Then: yes, add a label, and make the dice bigger
- They are the real rolls of the last three shots. Now nearly twice the size, six to a row in the target's field, with a tag: who fired, the score each die needed, and the hits ("1st Platoon · needs 5+ · 2 hits"); blue for ours, grey for the Germans'. Bright dice hit, dark ones missed

## 45. Louder, more real battle sounds

- Steve: tanks need a loud engine, a ka-boom; different rifle shots for infantry and the machine guns; realistic sounds
- Every shot now has a crack, a bark, a thump and an echo; riflemen fire single shots at their own pace; the American .30-cal chugs about eight rounds a second, the German MG 42 rips at twenty; the tank engine is a loud growl with cylinder chug, exhaust and clanking tracks, pitched so small speakers can play it; a compressor lets the big guns be loud without cracking. Still made in the browser, not recordings

## 46. A battle in the distance

- Steve: some background battle ambience
- Every few seconds, far off and muffled: guns rumbling, shells landing, a machine-gun burst or a few rifle shots. The 🔊 button turns it off with the rest

## 47. Mortars and artillery arcing in, and real explosions

- Steve: mortars and artillery must be heard coming and seen arcing in to hit; tanks on men, artillery and mortars show explosions
- A mortar mission: a pop far off, then each bomb drops almost straight down from over its own side of the table, whistling, glowing, with a smoke trail. Artillery: a distant thud, then shells on a longer, flatter curve, whistling louder as they come. Each burst: a white flash, a fireball, a blast ring across the ground, clods of earth thrown up and falling back, and a column of smoke that rises and thins over about three seconds. A tank's high explosive on men and a bazooka rocket burst the same way, smaller

## 48. Sherman and Firefly by name; do bigger tanks do more damage?

- Steve: label the US tanks Sherman and Firefly; do each army's bigger tanks do more damage?
- The tank sections are now "Sherman pair" and "Firefly pair" (like the Germans' "Panzer IV pair" and "Panther pair")
- Bigger guns roll more dice, not bigger hits: against tanks a pair rolls Sherman 2, Panzer IV 3, Firefly 4, Panther 6, and each hit knocks out a tank; the Panther's armour also needs one more to hit it. Against men they are much alike (Sherman, Firefly 2, Panzer IV 2–3, Panther 3)

## 49. Clear the dice on the next pick

- Steve: remove the hit count on the dice when the next piece is selected
- Picking the next piece clears the dice and their tags off the table; the next shot brings new ones

## 50. Targets for the mortars and guns

- Steve: when guns or mortars are selected, show the pieces they can target highlighted
- Choosing 💥 Mortars or 💣 Guns now puts a red target over every German piece in reach (seen by your troops, with none of yours in the field), with the score the dice need (5+, or 6 in a village). Click a target, or the field, to fire

## 51. Real recordings

- Steve chose: use real recordings (free to use) for realistic sounds
- Rifles, both machine guns, tank guns and explosions are now real recordings (CC0 or public domain; who made them is in assets/audio/CREDITS.md), slowed a little and given a deep thump under the big ones. No CC0 tank engine was found, so the engine, the whistles, mortars firing, bazookas, men running and armour struck are still made in the browser. The distant battle uses the recordings too, muffled

## 52. Do all shots need a 6? Tanks' high explosive hits the whole field

- Steve: do all shots need a 6? And: a tank on men does an area attack, like the mortars or artillery
- No: 5 or 6 hits in the open, but cover, long range and firing on the move each need one more, so a target lining a hedge or in a village needs a 6 (and a 6 always hits). The Germans mostly sit in cover, so in 60 test games about 6 in 10 American shots needed a 6
- A tank firing on men now hits every piece on foot in the field (a platoon and the teams with it), each rolling the tank's dice, like a mortar. Not the captain, as with the mortars

## 53. 3+ to hit (v34); pinned, not stopped; a coin toss to wound

- Steve: 3+ to hit, +1 for moving, long range or cover. If hit it's shaken: this doesn't stop it acting, but it is −1 to its shooting while pinned and it can't charge. After a hit it's 50/50 whether it wounds
- Dice now hit on 3+ (one more each for cover, long range, firing on the move, and being shaken; elite one less; the Panther's armour one more; a 6 always hits)
- Every hit pins (shakes) the target. Then a coin toss for each hit: heads, it wounds: a rifle platoon loses a section, a team is gone, a tank is knocked out (tanks still only by anti-tank hits)
- A shaken piece can act as usual, except Charge, and it shoots needing one more. Rallying (itself, or the captain) or resting an hour clears it. The Germans play by the same rules
- Steve kept the made-in-the-browser tank engine (no CC BY-SA recording)

## 54. Further moves; men climb hedges, tanks destroy them (v35)

- Steve: allow one more field per move and one more per charge; don't box me in on break through as much; men just climb the hedge losing one move, tanks destroy it
- Move & shoot now goes up to two fields, a Charge up to three. Men climb a hedge bank (it stays) or cut through wire as part of a move, using one more move; tanks drive through hedges (leaving a gap) and flatten wire at no extra cost. Routes still pass through friends but not stop there, and don't go on through villages or hamlets
- So pieces aren't boxed in by hedges any more. Break through stays: one field through a hedge, leaving a gap for others

## 55. Click where in the field; cover shown; more orchards (v36)

- Steve: where I click in a square decides where the piece goes in it, so I can move up to a hedge; remove the Line hedge move, it's implicit; highlight cover as we move into it. And: I like the orchards as cover, a few more
- Charge and Move & shoot now go where you click: near a hedge, the piece lines it; in the middle, it stands in the open. While choosing, a bright green bar shows the hedge it would line and a label says "Cover: hedge", "Cover: houses", "Cover: trees" or "In the open"
- The Line a hedge buttons are gone: in Charge, the piece's own field is marked green too; click one of its hedges to line it (its move for the hour)
- Pieces lining a hedge now stand right up against it
- Orchards are cover now (one more needed to hit, like houses), and there are four more of them

## 56. No moving or firing through houses; why a shot needs what it needs (v36)

- Steve: no one can move through a house or fire through it. And: note when shooting if −1 for cover, long range, moving
- The rules already stopped both (routes can end in a village or hamlet but not go on through one; villages, hamlets and orchards in between block the view, now checked by a test over 20 games). But a piece making a longer move used to slide straight across the table, over the houses: now it goes through each field of its route in turn
- The red score on each target now says why under it: "−1 cover · −1 long range · −1 moving", and "−1 shaken", "−1 armour" (Panther) or "+1 elite" where they apply

## 57. Tiny roof overhang; lines of sight

- Steve: make the roof overhang tiny so we can see better, and see the line of sight between
- Roofs now sit almost flush with the walls (they used to stick out well past them front and back), so pieces in the yard and the view past the houses show
- When a piece is shooting, a dashed red line runs from it to each target it can see; the one under the pointer is brighter

## 58. Pieces stay until the shot lands; the captain can shoot

- Steve: don't remove pieces before they're hit (when destroyed). And: the captain can shoot
- A piece that is wiped out, or loses a section or a tank, now keeps its look until the bullets, shell or bomb actually arrive; then it goes
- The captain now has Move & shoot and Shoot as well as Charge and Rally: his HQ fires one die. The Germans still can't target him

## 59. Mortars and artillery off the board (v39)

- Steve: call the guns Artillery. Put a mortar and an artillery gun for each side, of WW2 type, off the board at top left (US) and top right (German); shots come from those models; beside each, rounds to its shot count
- The 💣 Guns button is now 💣 Artillery
- Beyond the top-left corner: an American 81 mm M1 mortar team and a 105 mm M2A1 howitzer with crew, in olive drab. Beyond the top-right: a German 8 cm GrW 34 mortar team and a 10.5 cm leFH 18 howitzer in dark yellow camouflage. Each has its name on the table
- Mortar bombs and shells now fly from those models in a high arc to the target, with a flash and smoke at the muzzle
- Beside each stands its pile of rounds: shells in rows of three, mortar bombs in rows of four, one for every shot left (the German artillery has none: the Germans only have their mortar in the rules for now)

## 60. Take cover, not pull back (v40)

- Steve: change "pull back" to "take cover": don't slide back; all figures crouch and are in cover for the rest of the round, and miss the next turn, unless the captain can revive them with his move
- When a piece is fired on in the German hour, the question is now "Take cover?". If yes, it stays where it is, every figure crouches, and one more is needed to hit it for the rest of that German hour (always works; it no longer halves the hits)
- It misses its move next hour (still crouched), unless the captain uses his move to Rally it (up to three fields away): that gets it up and moving at once, no dice. Then it stands up again
- Also: the off-board guns and their rounds are bigger, their names readable, and the arcs a little lower so they stay on screen

## 61. The captain's rallies; two pins kill (v41)

- Steve: the captain can rally twice if he doesn't move (himself included), once if he moves or shoots, and either before or after the shot. And: two pins = kill, a second pin on a pinned piece kills it
- Rally is no longer the captain's move: two rallies an hour if he neither moves nor shoots, one if he does (before or after). He can rally himself. His green ring stays while he still has a rally to use
- Every hit pins; on a piece already pinned, a hit kills: a section of a platoon, a whole team, or a tank. The first hit on an unpinned piece still pins it with a coin toss to wound as well. The Germans play by the same rule

## 62. Bazookas and tanks kill; longer reach; tanks as cover; no Break through; wire; hopping hedges (v41)

- Steve: a bazooka hit on infantry is a kill, not a pin, as it's powerful; same with a tank. MGs and tanks have longer range. Tanks are cover for infantry. There's no Break through now, it's just a Charge. When men charge over a hedge they hop up over it (and still lose a move). Only tanks get through barbed wire
- Every hit on men from a bazooka, Panzerschreck, tank gun or the PaK kills (a section or a team); against tanks they still pin, with the coin toss to knock one out
- Long range starts beyond two fields for machine guns, tanks and the PaK (beyond one for everyone else)
- Men are in cover (one more to hit) when a tank stands in a field between them and the shooter, or beside them in their own field
- The Break through buttons are gone: pieces climb hedges as part of a Charge or Move & shoot (one more move), and hop up over the hedge on the table as they cross
- Barbed wire now stops men completely: only tanks get through, flattening it, which opens the way

## 63. Who is aiming at whom (v41)

- Steve: show a line of who is shooting at whom for the take cover question; I need to know who is aiming at whom
- While "Take cover?" is asked, the German shooter's field is marked, a dashed red line of fire runs from it to your piece, and your piece has a red cross-hair with the score the Germans need and why ("4+ · −1 cover"). For German mortars the line comes from their mortar off the board

## 64. Blue hatching on the village to take (v41)

- Steve: make it clear with blue hatching when a valid piece is moving onto the capture goal
- When a rifle platoon (the only piece that can take the village) is choosing a Charge or Move & shoot and can reach the village, that field shows blue stripes instead of the usual mark; the hint line says so

## 65. Moves shown as soon as a piece is picked (v42)

- Steve: show the Charge and Move & shoot positions by default when a piece is selected; the move defines which was chosen (onto red hatching it's Move & shoot)
- Clicking one of your pieces that can still move now shows both at once: red-hatched fields for Move & shoot, the other fields for a Charge (bright red: hand to hand; blue: the village). Clicking a field does that action, standing where you clicked. The menu still opens for Shoot, Rally and the rest; Esc clears the marks
- A click on a field where more of your pieces stand picks that piece instead (to join a platoon's field, use Charge from the menu)
- The names of the off-board guns are bigger

## 66. Win by destroying the Germans; artillery friendly fire (v42)

- Steve: destroying all the opposition is a win (so we can carry on with no infantry). Artillery can hit friendly pieces in its blast radius
- Winning: hold the village at the end of an hour, or have no Germans left on the field at the end of an hour. Losing rifle platoons no longer ends the game: it ends only when nothing of the company is left
- Artillery: the shells that fall on the fields round the target now hit your own pieces there too ("⚠️ friendly fire" in the report). When choosing an artillery target, a target with your men next to it says "⚠ your men in the blast"

## 67. Fill the screen; controls along the bottom; guns behind the back lines (v43)

- Steve: fill the screen, put the toolbar horizontal at the bottom, put the mortars and artillery behind their back lines, and spread the board to the full width and height with the thinnest table border above and below
- The controls are now one bar along the bottom (title and clock, fire support, the chosen piece with its buttons, the hint, End the hour); the table fills the rest of the screen
- The camera moves in as close as it can: the board fills the height, with only a sliver of table above and below
- The mortars and artillery stand behind each side's back line near the top: the Americans' left of the board, facing it, the Germans' right; their rounds are piled behind them. Shells still fly from them

## 68. Score in a word bubble (v44)

- Steve: the shoot indicator summary blocks the view: put it in a word bubble about three squares away with a pointed tail
- The score and its reasons ("4+ · −1 cover · −1 long range") now sit in a red word bubble about three fields from the target (up the board for targets in the near half, down it for the far half), with a pointed tail and a thin line running to the target's cross-hair

## 69. Elite 2+; no shooting at 7+ (v45)

- Steve: so an elite can get to 2+. And what do we do about 7+ or more? Options? Steve chose: can't shoot at 7+
- Yes, elite troops at close range at a target in the open need 2+ (3, less one), the easiest any shot gets; a 1 always misses
- A shot that would need 7 or more can't be taken: that target gets no red cross-hair, Move & shoot only goes where a shot of 6 or less is possible, the Germans follow the same rule, and a tank's blast spares pieces it would need 7+ to hit. (It used to count as 6+, so a 6 always hit)

## 70. Longer rifle range; MGs and tanks to 6; a sniper (v46)

- Steve: increase rifle range by one field, it's too short (chose: both further sight and long range starting later). MGs and tanks should exceed rifles by two, so 6 max range. Add a sniper who can see the full range of the board and ignores cover and long range
- Rifle platoons (and the captain) now see and shoot 4 fields, long range beyond 2. Machine guns, tanks and the PaK: 6 fields, long range beyond 4. Bazookas and Panzerschrecks stay at 3, long range beyond 1. Hedges, houses and trees still block the view
- New piece: a US sniper team (a kneeling sniper with a long scoped rifle and a spotter with binoculars). He sees as far as the board goes; cover, taking cover and long range don't help his target, so he needs just 3+ (one die). The red target bubble says "sniper: no cover or range"

## 71. Fire support by clicking the guns (v47)

- Steve: remove fire support from the toolbar at the bottom; clicking the pieces activates them like any other piece
- The Fire support box is gone from the bar. Click your mortars or artillery on the table (left of the board): they're chosen like a piece, a ring under each shows whether it can still fire this hour (green) or not (grey), and if it can, its red targets show at once. The bar shows its rounds left, its dice and a Fire button

## 72. German artillery with its rounds; no rounds, no gun (v48)

- Steve: the German artillery needs to show its shells like the Allies'; if it's at zero for a round, the piece doesn't appear on the table
- The Germans now have artillery in the rules: a 10.5 cm battery, 6 dice and 1 on each field round the target (theirs too), 2 rounds to start and one more every 4 hours. Once an hour it shells the Americans it can see with the most men in and round the field, never next to its own men. You're asked "Take cover?" with a line from the German guns, as with their mortar
- Its rounds are piled beside it like ours. Any mortar or gun (either side) with no rounds left isn't on the table until more arrive

## 73. Rules: not at the start, two columns (v49)

- Steve: don't show the instructions on startup; when they're opened, make them two columns of text with no scrolling
- The game opens straight on the table; How to play (top of the bar) opens the rules, now wide, in two columns, all on the screen at once

## 74. Nine places in a field; guns lower (v50)

- Steve: when moving pieces let me choose where in the square they end up, so I can push them against a hedge: any corner, the middle of an edge or the centre, where other pieces allow it. And: bring the mortars and artillery two squares down the screen
- A field now has nine places: four corners, four edge middles and the centre. Where you click is where the piece goes (a ring shows the place, green bars the hedges it would line). Against an edge it lines that hedge; in a corner it lines both; the centre is the open. If another piece already stands there, it takes the nearest free place; pieces sharing a field (a platoon and its teams) always stand in different places. On the table each piece now stands at its own place
- To move to another place in its own field: Charge, then click there in its own field (its move for the hour)
- The mortars and artillery of both sides moved two fields down the side of the board

## 75. The blind bag (v51)

- Steve: the game should be ordered by a random token draw from a blind bag containing each side's pieces (US 7, German 4, say); keep drawing one at a time, that side takes a move, until all tokens are drawn (a destroyed piece's token is removed); then round 2. Shorten the info bar and right of the button show a grid of green circles with a gold star for the Allies and grey tokens with a black cross for Germany, US stacked left, Germany right. Each turn one is drawn at random, grows to about a field's size, floats to the middle of the board and disappears. Next to the grid in big letters: ROUND 5, etc
- Each round the bag holds a token for every piece on the table that can still move. One is drawn at a time: on a green token you pick one piece and give it its move (or Pass); on a grey one a German piece moves (one with a target first), with their mortar and artillery firing on their first token of the round. A piece destroyed, or one that loses its move by taking cover, takes a token out. An empty bag ends the round (the hour): the village and win checks, then the next round
- The bar is shorter; right of the button (now Pass, or Done once the piece has moved) the tokens left in the bag are shown, American left, German right, with ROUND n in big letters. Each drawn token grows to about a field's size and floats to the middle of the table, then fades
- Your mortars and artillery can fire on any of your tokens without using it up. Taking cover now loses this round's move if the piece still has one (otherwise next round's)
- (The test player still plays whole hours, so its win rate isn't comparable any more)

## 76. Guns in the bag; Skip turn (v52)

- Steve: if the mortars and artillery run out of shots they come out of the token pool; their menu has Skip turn, as we may not want to use them; everyone can skip a turn
- Each side's mortars and artillery now have a token each in the bag while they have rounds; out of rounds, no token. On one of your tokens you can choose them and Fire (that uses the token) or Skip turn. The Germans' guns move on their tokens the same way (they fire when they have a target)
- Every piece's menu has Skip turn: it gives up its move this round and the token is used (Pass in the bar still uses a token without tying it to a piece)

## 77. Pointed bubble arrows; the dice tag as a long bubble; arcs for the guns (v53)

- Steve: make the word bubble's arrow pointier, a triangle not just a line; the same for the blue panel by the dice (put it in a long word bubble). And: make the mortar and artillery shot lines an arc
- The score bubble's arrow is now a long red triangle, wide at the bubble and coming to a point at the target's cross-hair
- The tag by each shot's dice is now a long one-line word bubble (who fired · score needed · hits), a little up the board from the dice, with the same kind of pointed arrow down to them; blue for ours, grey for the Germans'
- Mortar and artillery lines of fire are arcs now (Steve): a dashed curve from the gun off the board to the target, the way the rounds fly, both for the Germans' "Take cover?" and when you choose a target for your own mortars or artillery
- Also fixed: a sound could be asked to start a hair before the audio clock's zero, which stopped it

## 78. The token as a coin on the table (v54)

- Steve: each side's move token flies from its storage list to land on the table above that player's artillery, sits on the table, and disappears when the move is complete; as it flies it arcs up and back down, growing then shrinking; on the table it's about twice the size of a one-man base; make it 3D, with depth like a thick coin
- The drawn token is now a thick 3D coin (green with a gold star, or grey with a black cross). It leaves its place in the bar, arcs up over the table turning over as it goes (growing as it rises, shrinking as it drops) and lands flat above that side's artillery, about twice the size of a one-man base, with the pick-up sound. It stays there while that move is made, then shrinks away

## 79. A bigger token on the table (v55)

- Steve: make the token on the table three times the radius
- The coin on the table is now three times the radius (about a field across); it lands a little higher up the side so it clears the artillery, and grows a little less in flight

## 80. What the Germans do; target bubbles kept apart (v57)

- Steve: some Germans still move and don't tell me what they are doing. And: try not to let several red target bubbles hide other targets
- (Started by another session, finished here.) Each German move now shows on the table: an orange ring round the piece (or their gun off the board) and a grey word bubble with its name and what it does ("Fires on 2nd Platoon", "Marches to its post", "Lines the hedge facing…", "Holds its ground", "Shells…"), kept for a couple of seconds after the move
- The red score bubbles are now placed together: each tries spots two or three fields round its target and takes the first that covers no other target's cross-hair and no other bubble, and stays on the screen (otherwise the one with least in the way)

## 81. Sharing a field; words not clipped (v57)

- Steve: I still can't move a piece into a space with another of mine that has moved in it. And: some text like "Tank knocked out" is clipped
- Your pieces can now share a field much more freely: at most one rifle platoon and one tank pair, and four pieces in all, each at its own place (a team or the captain no longer needs a platoon there, and tanks and infantry can stand together, so the tanks give the men cover). Never with the enemy except hand to hand; a dug-in gun stands alone
- The words that float off a target are as wide as they need to be, so "Tank knocked out" and the like fit

## 82. Tanks can't take cover; README (v59)

- Steve: tanks cannot take cover
- A tank fired on is no longer offered "Take cover?"; it just takes the fire
- The README now says what the game is and where to play it (wizzard262.github.io/hedgerow), for the GitHub repo

## 83. Score bubbles stacked; on GitHub (v61)

- Steve: make the red word bubbles stack the text, not all on one line: one row per modifier. And: push this to a GitHub repo "hedgerow" and add it to the Harrier Carrier website home page and portfolio
- The red score bubble now has the score on top and one row under it for each modifier ("−1 cover: hedge", "−1 long range", …), so it is narrow instead of wide
- The game is on GitHub (github.com/wizzard262/hedgerow) and playable at wizzard262.github.io/hedgerow

## 84. No reinforcements (v62)

- Steve: no reinforcements should appear; keep it as it is at the start of the game
- Nobody arrives during the game any more, on either side: no 4th Platoon, extra teams or replacements for you, no Panzer IVs, Panthers or 4. Zug for the Germans. (The list is still in data.js, empty, if they're wanted back.) The rules no longer mention them

## 85. Small targets, hard cover, houses round the square, stop at a wipe-out (v63)

- Steve: small target +1 (2 or fewer men): sniper, captain and bazooka, not the MG (3 men). Stop the game if all the opponents or all the friendlies are destroyed; don't finish the round. Houses are hard cover, +2. Make the buildings smaller, about figure height, several on each side of the square with gaps between; don't let pieces stand under a building. Strange tokens, little yellow stars: misplaced shaken markers?
- A piece of two men or fewer (sniper, bazooka and Panzerschreck teams, the captain) needs one more to hit, sniper shots included; the label says "−1 small target". (Assumed: shells, which hit the whole field, ignore it. The captain still can't be fired on, as before.)
- Villages and hamlets give +2 (shells on the village too)
- The game ends the moment one side has no pieces left, mid-round: no more tokens, the result shows at once
- Houses: two small houses (about as tall as a figure) along each side of a village or hamlet field, gaps between, fronts facing in; pieces in those fields keep to the yard in the middle, so none stands under a house (they stand closer together there). The hamlet's yard wall went
- The yellow stars were the elite marker of 1st Platoon, drawn nearly a field away from it (and the shaken marker at the field's corner). Both now ride on the piece's base (see 86)

## 86. The shaken token on the base; shaken, not pinned (v63)

- Steve: put the red shaken token on the base edge, or on the back of a tank; it was at the edge of the square. Always call it shaken, not pinned
- The red ! token sits on the back edge of the piece's first base, or on a tank's back deck, and moves with it; it keeps its colour when the piece is greyed out. The elite ★ sits on the side edge of the platoon's base
- Every "pinned" on screen and in the rules now says shaken

## 87. The captain's rally targets (v63)

- Steve: don't show or wait for a captain's rally if nobody (himself included) in reach can be rallied. When the captain is chosen, mark the pieces he can rally, himself too, with a blue target circle
- No Rally button with nobody to rally, and his token no longer waits for a rally nobody needs (nor is an American token held for it)
- Picking the captain puts a blue ring and blue cross-hair on each piece he can rally; clicking one rallies it

## 88. No river (v63)

- Steve: remove the river for now; it ruins the Germans' strategy
- The river and its bridges are off the map (open fields and lanes instead); the code for them stays for later

## 89. Taking cover halves the dice (v63)

- Steve: taking cover halves damage: half the attacking dice, an odd one left over a 50/50 chance
- A piece taking cover no longer needs one more to hit: every shot at it (and mortar or artillery fire) rolls half the dice, and an odd die left over rolls on a coin toss. The label says "½ dice: taking cover"

## 90. No pick-up sound for the moves (v63)

- Steve: remove the piece-sliding sound when the move indicators spin out
- Picking a piece (or your guns) no longer plays the pick-up sound. (The drawn token still makes it as it lands)

## 91. The timer token (v63)

- Steve: add one black token with a white sand-timer in the blind bag (between the green and grey tokens); drawn, it resets the round
- One black timer token goes in the bag each round, shown between the two sides' tokens in the bar. When it is drawn it flies to the table between the two sides' artillery and the round ends there and then; the rest of the tokens go back unused and a new round starts

## 92. Brown German bases; Germans greyed out too (v63)

- Steve: Germans have brown bases, Americans green. Grey out the Germans as each piece completes its turn, like the Americans
- German figure bases (platoons, teams, mortars) are brown earth, American ones green flock
- A German piece greys out once its token's move is done, until the next round

## 93. No bright glare; rounds, not hours (v63)

- Steve: don't add the bright light fade on the table on the left side (keep all shadows). There are no hours, just rounds
- The wooden table is matt now, so the lamp's shine no longer shows as a bright patch; the lamp and its shadows are unchanged
- Everything on screen says round, not hour: the bar shows "Round n", results say which round, the rules talk of rounds

## 94. Tokens fly back into the bag (v63)

- Steve: when a new round starts, a token flies from each piece, with a short overlapping delay between tokens on each side, back into the token display, like the token coming out but a third of the size
- At the start of every round (the first too) a small coin rises off each piece and each gun with rounds and arcs into its side's tokens in the bar, one after another with an overlap, both sides at once, then the timer; the bar counts them in as they land, and the first token is drawn once all are home

## 95. One round from each base; the bazooka's rocket; tanks turn then fire one at a time (v63)

- Steve: each base shoots one bullet (sniper, captain; a bazooka a rocket with a roar and flames that explodes on impact), but the MG fires 5. Tanks turn at medium speed to aim before shooting, then one shell from each tank, like the bazooka's, one at a time
- A rifle platoon sends one tracer from each of its sections' bases, the sniper, captain and bazooka one, an MG team five
- The bazooka's rocket flies with flames at its tail, smoke behind it and a back-blast at the tube, a louder roar, and explodes where it lands
- Tanks turn more slowly onto the target, wait until they face it, then each tank fires one shell (trailing smoke) in turn, each with its own flash, sound and burst

## 96. Tanks face the nearest enemy and stand side by side; no Pass button (v63)

- Steve: a tank's move always ends facing the nearest visible enemy (or the enemy's side of the board if none; at random if two are as near). Tanks side by side don't overlap. The Pass button in the bottom panel isn't needed: each piece shows Skip
- After every move a tank turns to the nearest enemy it can see (east for the Americans, west for the Germans with nobody in sight; a tie picked at random)
- A tank pair stands side by side across the way it faces, far enough apart not to overlap (one left: in the middle)
- The Pass button and the Enter key are gone: each piece's menu has Skip turn, and after a Move & shoot a "Skip the shot" button ends the token without firing
- Balance (the test player still plays whole rounds, not tokens): it now wins 99% in about 4 rounds (was 78%); doing nothing never wins

## 97. Hand to hand to the finish (v63)

- Steve: hand-to-hand combat should be both sides pushing at each other in turn, attacker first, inflicting damage, and the surviving bases fight on until one side remains. Shaken doesn't count, and doesn't remain at the end of the fight
- A charge into the enemy's field is now a fight to the finish: the attacker strikes, then the defenders, and so on. Every base still standing rolls a die (3+; the attacker needs one more against men behind the hedge it crossed or in houses; elite one less), each hit takes off a base (rifle platoons and tanks first, teams and the captain last; only tanks and anti-tank weapons can hurt tanks). The winner is the side with anyone left; a winning attacker takes the field. Nobody falls back any more
- Being shaken makes no difference in the fight, and every survivor comes out of it no longer shaken
- (Assumed: only the charging piece fights for the attacker, tanks next door no longer help; if neither side can hurt the other the attacker stays back.) Balance: the test player wins 99% in about 3.7 rounds

## 98. Stand fast or Take cover in a word bubble (v64)

- Steve: Stand fast or Take cover should offer just that choice, in a word bubble on the attacked piece; remove the other dialog
- The "Under fire" dialog is gone: a word bubble by the piece being fired on holds just two buttons, Stand fast and Take cover, placed clear of the shot's score bubble; the rest of the table waits until one is picked
- Also fixed: the shot's red target and line of fire sometimes didn't show while the question waited (the table wasn't redrawn after the German token landed)

## 99. Rally only when someone can be rallied; offered after the captain moves (v64)

- Steve: Rally doesn't appear as an option unless a unit can be rallied now (itself or by the captain). If the captain moves and can rally, it is offered
- Rally itself shows only for a shaken piece that hasn't moved; the captain's Rally only with someone in reach to rally (as in 87)
- After the captain charges, moves and shoots, or shoots, and can still rally someone, his menu opens again by him with Rally, and the blue targets show who

## 100. Villages and orchards block the view like hedges (v64)

- Steve: the orchard can't be seen through, and neither can the village. A hedge can be seen through by a unit at the hedge, and a unit at the hedge can be seen; otherwise it can't be seen through (this also applies to units at the edge or corner of a hedge)
- Villages, hamlets and orchards still block the view across them, and now their edges work like hedges: a piece at the edge (along that side, or in a corner on it) sees out and can be seen; a piece in the middle of the field can't see out or be seen. No hedge cover from those edges (the houses and trees are the field's own cover)
- Hedges as before: seen through only by a piece lining them, and a piece lining one can be seen across it. Balance: the test player wins 99% in about 4 rounds

## 101. The timer token easier to see; the coin not washed out (v65)

- Steve: I don't see the black token. The green token on the table is still washed out by the lighting
- The timer token in the bar is bigger than the others, black with a pale rim and a soft glow, with TIMER under it
- The drawn token's coin is matt now (no shine from the lamp), so its green and gold stay rich on the table; it still takes light and shadow

## 102. No crowding in a field; no sound for the token (v66)

- Steve: to stop pieces crowding, only one tank piece (2 tanks) can occupy a field; any other field can have up to one platoon and two smaller pieces, or four smaller pieces; no two platoons in the same field. And: we still have the piece-move sound for the token flying out: remove it
- A tank pair now stands alone in its field (so men no longer shelter beside a tank in the same field; behind one, in a field in between, still counts). Otherwise a field holds one rifle platoon with up to two smaller pieces (teams, the captain), or up to four smaller pieces. A dug-in gun still stands alone. Both sides, at the start and in every move
- The drawn token lands on the table without the pick-up sound
- Balance: the test player now wins 87% in about 6 rounds (was 99% in 4)

## 103. Look at a German piece; pictures in the panel (v67)

- Steve: let me highlight a German piece and see its info in the bottom panel. For a highlighted piece, ours or German, show the piece's picture on the left of the panel
- Clicking a German piece (when the click isn't your chosen piece's charge or shot) rings it and shows its card in the bottom panel: name, kind, strength, dice, where it stands and whether it has moved; no actions
- Every piece's card, and your mortars' and artillery's, now has a picture of its model at the left, made from the same 3D models as the table

## 104. Shaken: half moves, never stopped (v67)

- Steve: does shaken prevent a move? It should be −1 to shoot and half move or charge, always
- A shaken piece can always move and charge now, but only half as far (rounded down, at least one field: Charge 1, Move & shoot 1); it still needs one more to hit. It can charge into hand to hand too

## 105. Sounds: picking a piece, and moves for both sides (v67)

- Steve: the select-piece sound should still play for selecting a piece, and move sounds (tank, walk) for both Germans and Americans
- The pick-up sound is back when you choose a piece, your guns, or a German piece to look at (still none as the drawn token lands). Men running and tanks driving already sound for both sides' moves

## 106. The timer token lands in the middle of the board (v67)

- Steve: the timer token stops not in the centre of the board but a couple of squares above it
- The drawn timer token now lands in the middle of the board

## 107. Word bubbles near the top of the screen hang below (v67)

- Steve: a word bubble for a piece in the top row can disappear off the top of the screen; it should appear below it
- The German move bubble and the dice tag hang below the piece (tail pointing up) when above it they would reach the top of the screen; they also slide in from the left and right edges

## 108. Bombers in the distant battle (v67)

- Steve: put some bombers flying past in the ambient battlefield sound
- Every minute or two a flight of heavy bombers drones over, far off: sixteen engines beating against each other with a rumble of air, swelling and fading as they cross from one side to the other, the pitch dropping a little as they pass (made in the browser, no file)

## 109. The prompts as a page (v68)

- Steve: put a link next to the version for the prompts, opening in a new page
- A Prompts link beside the version number in the bar opens prompts.html in a new tab: this file shown as a page in the game's colours, with a link back to the game

## 110. The Germans' picks and moves sound like yours; pieces hop when picked (v69)

- Steve: the computer's German piece selection and movement should play the sounds as for the Americans. Selected pieces bounce up slightly and back down when selected
- When a German token comes out, the piece the computer picks plays the pick-up sound and gets its orange ring, then a moment later it moves (men running and tanks driving, as for yours)
- Any piece picked, yours, a German one you click to look at, or the computer's German pick, hops up a little and drops back

## 111. The timer token hovers over the board; louder bombers (v69)

- Steve: the timer piece must stop above the board when flipped. And: the bomber sound in the ambience
- The drawn timer token now stops in the air over the middle of the board (its shadow on the table under it), so it hides nothing; its sand-glass stands upright
- The bombers are easier to hear: they come over soon after the start and then every half a minute to a minute, straight to the speakers (not through the muffled far-off battle), with more of the engines' growl so they carry on small speakers

## 112. Your moved pieces light green, the Germans' grey (v70)

- Steve: American pieces used this turn should be a light green, not grey, so we can tell German and American apart
- A piece of yours that has moved this round (and your mortars or artillery once they have fired) now turns pale green; a German piece that has moved, or their guns once fired, still turns grey

## 113. The guns hop when picked too (v71)

- Steve: artillery and mortars obey the same bounce-when-selected behaviour
- Your mortars or artillery hop when you click them, and the Germans' hop (with the pick-up sound) when the computer picks them on a German token

## 114. The elite token explained; each tank recoils with its own shot (v72)

- Steve: what is the small yellow token on some Americans? (Keep it, explain it in the rules.) And: each tank recoils individually with its shot
- The small gold ★ token is the elite marker, on the side of one base of an elite platoon (1st Platoon, and the Germans' 1. Fallschirmjäger-Zug). How to play now says so: elite troops need one less to hit, in shooting and hand to hand, and rally more easily
- A tank pair firing: each tank rocks back with the recoil of its own shell, one after the other, instead of both at once

## 115. Hand to hand shown blow by blow (v73)

- Steve: did we do the hand-to-hand push-each-other behaviour? (The rules, yes, in 97; nothing showed on the table.) Show each exchange. And: even pieces that have moved or are taking cover take part in hand to hand
- On the table each blow now plays in turn, about a second each, attacker first: the striking side's bases lunge at the other side, Hit! or Miss rises over them for each die with a puff of dust, and each base a hit takes drops away; at the end "Field taken!", "Overrun!" or "Charge beaten" over the field. Pieces lost in the fight stay on the table until their last base goes
- The next token waits until the fight has been shown
- Every defender in the field fights, whether it has moved or is taking cover (it already did; now tested)

## 116. Tinted only when the move is complete (v73)

- Steve: pieces only go light green or grey when their move is completed
- A piece is tinted only once its token is over: not while one of yours still has its shot after a Move & shoot or the captain a rally to come, not while a German is making its move, and not while its fight or shot is still being shown. (Steve also asked whether the Germans go grey: they do)

## 117. The timer is never first out of the bag (v74)

- Steve: the timer can't be the first token out of the bag
- The timer token only joins the draw once a piece's token has come out that round (with nothing else left in the bag, it comes out as before)

## 118. German tanks back (v75)

- Steve: do we never see German tanks now? Put them back in
- They only ever came as reinforcements, which went in 84. Now the Germans start with a Panzer IV pair and a Panther pair on the table, in their own end of the board, moving up towards the nearest Americans
- Balance: the test player now wins 53% in about 7 rounds (was 88%)

## 119. Pieces in a village see out and are seen (v76)

- Steve: if I'm at a hedge and Germans are in the village I can see them, and vice versa
- Undoes part of 100: the edges of villages, hamlets and orchards no longer block the view. A piece in one sees out and is seen wherever it stands in it; nobody sees across one; hedges as before (seen through only by a piece lining them, and a piece lining one can be seen)
- Balance: the test player wins 46% in about 7 rounds

## 120. A German captain with a red flag (v77)

- Steve: do the Germans not have a captain? Give them one with a red flag
- The Germans now have a Hauptmann (company HQ) with a red flag on his pole, in the objective with the garrison. On his token he rallies the nearest shaken German within three fields (himself too), with the same chances as yours; with nobody to rally he fires or holds his ground. Like yours, he can't be fired on, and fights if his field is charged

## 121. The Germans move by your rules (v78)

- Steve: the Germans, like the Americans, don't knock down a hedge; all game behaviours are the same for both sides
- German pieces no longer break through hedges and wire. They move by the same rules as yours: as far as a Charge (three moves, half when shaken), men climbing hedge banks for one more move (the hedge stays) and stopped by barbed wire, tanks driving through hedges (leaving a gap) and over wire, passing through friends but not houses; the table shows the way they went
- Balance: the test player now wins 29% in about 7.5 rounds (the Germans reach their posts and your men faster)

## 122. A rally shows whether it worked (v78)

- Steve: the captain rallied a tank but it didn't lose the red token or become unshaken
- A rally can fail (a standard piece 70%, elite 90% with the captain; 50% or 65% on its own), and the log that said so isn't on the screen. Now every rally, yours or the German captain's, floats words up off the piece: "Rallied!" in green (the red token goes) or "Still shaken" in red

## 123. Tanks don't fight hand to hand; men fall back from a tank (v79)

- Steve: tanks can't fight hand to hand. If a tank charges troops, the troops retreat
- Only rifle platoons charge into hand to hand now. A tank can still charge a field of enemy men: they fall back to the field next to them furthest from the tank that they could move into (no wire, room for them, no enemies there), "Falls back" floating off them, and the tank takes the field; a piece with nowhere to go is overrun. A tank can't charge other tanks or a dug-in gun. The German AI's charges are rifle platoons only

## 124. Captains can be shot and shelled (v79)

- Steve: (the German captain can't be shot or shelled) yes, he dies like all others
- Both captains are ordinary targets now: fired on (a small target, one more to hit), shelled by mortars and artillery, caught in a tank's high-explosive burst, and one wound kills his HQ. Your captain can take cover when fired on, like the others
- Balance: the test player wins 29% in about 5.5 rounds

## 125. Only a rally clears shaken, and it always works (v80)

- Steve: rally is the only way to remove shaken and always removes shaken. Turn end does not remove shaken
- A rally never fails now: the captain's (yours or the German's) and a piece rallying itself. "Rallied!" floats off the piece every time
- Shaken no longer wears off at the end of a round (both sides), and (assumed, from "the only way") it lasts through a hand-to-hand fight too, undoing that part of 97

## 126. The end waits for the last shot (v80)

- Steve: wait to show the Americans / Germans wiped out message until they are actually hit by the shot
- The end-of-game message now waits until the table has shown every shot landing and every fight, then a moment more

## 127. Elite gold band; German tanks grey (v80)

- Steve: a gold edge ring on the bases of elite units, both sides, and remove the token on the base. Make the German tanks grey
- Elite pieces (1st Platoon, 1. Fallschirmjäger-Zug) have a gold band round the edge of every base; the ★ token is gone (the ★ after the name stays). The Panzer IVs and Panthers are panzer grey; the German howitzer keeps its camouflage

## 128. A cleaner sand-glass (v80)

- Steve: a better sand timer icon: just the top and bottom with the bulge in the middle
- The timer token (in the bar and on the coin) is now the two bars and the glass bulging out between them, pinched at the waist; no crossing lines, no sand

## 129. The PaK 40: three crew, turns to fire (v80)

- Steve: 3 men on the PaK 40, and it turns to shoot in the correct direction
- The PaK has a crew of three (gunner at the sight, loader, one at the trail). It swings round onto its target before firing, as a tank does, and stays facing that way

## 130. Fire support never comes back (v80)

- Steve: artillery, bomber and mortar never replenish (the bomber is a new piece we'll add later)
- Mortars and artillery, both sides, start with their rounds and get no more. (Bombers: not yet in the game)

## 131. The table a little lower (v80)

- Steve: the top of the board is slightly out of sight; bring the whole board down slightly, better to lose a little at the bottom
- The whole picture is moved down 5% of the screen's height (clicks and labels move with it)

## 132. Is the timer random? (v80)

- Steve: is the timer really random, it often comes last; the timer has the same odds as all the other pieces left in the bag
- Checked: it already does. Each draw, every token left in the bag (the timer included) is equally likely; the only exception is that the timer can't be the very first draw (prompt from session 2). Over 300 simulated rounds it came out last 13 times, against 12 expected by chance. A test now checks this

## 133. Two fields longer, the village at the back (v80)

- Steve: the board can be 2 squares longer; put the target village right back in the German area
- The board is 12 fields long (was 10). Both villages, Saint-Jean and La Haye, are now at the back of the German end (fields 11 and 12), so the German garrison starts there; the hamlets moved towards the middle
- Balance: the test player now wins 13% in about 13 rounds (was 29% in 5.5); doing nothing never wins

## 134. Picked again after Move & shoot: its targets come back (v81)

- Steve (passed on from another session): reselecting the active piece after a move, but before it shoots, should highlight the enemy pieces it can shoot again
- Clicking the piece again while its Move & shoot shot is still to come puts its red targets back on the table

## 135. One tank to a tank unit (v81)

- Steve: every tank unit should be 1 tank, not 2
- The Sherman, the Firefly, the Panzer IV and the Panther are each one tank now (named without "pair"), with that one tank's dice
- Balance: the test player wins 9% in about 13 rounds (was 13%); doing nothing never wins

## 136. Tanks drive in curves, and never spin a whole turn (v81)

- Steve: a single tank should drive in normal driving arcs. Tanks sometimes spin a full 360 when they move or shoot; they shouldn't
- A moving tank now turns a little at a time towards where it is going and drives forward the way it faces (slowing while it turns, turning on the spot if the way is behind it), so it goes round in curves instead of sliding sideways. Once there it turns to face the nearest enemy as before
- Every turn on the table (tanks, the PaK, everyone) now goes the short way round, so nothing spins a whole turn

## 137. Shaken after winning hand to hand (v81)

- Steve: still lose shaken after winning hand to hand
- Checked: since v80 the rules keep shaken after a fight (40 of 40 test fights). The page was probably still v79 from the browser's cache just after the push; a refresh (Ctrl+F5) loads the new version

## 138. Never "pinned", always shaken (v81)

- Steve: we don't say pinned anywhere any more, it's just shaken
- The last "Pinned" (a colour name in the table's code) and the test names now say shaken. (Older prompts in this file still quote "pinned" as it was said then)

## 139. The villages three fields nearer (v82)

- Steve: the German villages are now too far back; bring them forward 3 squares
- Saint-Jean and La Haye now stand on fields 8 and 9 of 12 (three fields in from the German end, was 11 and 12); the fields behind them are open fields, an orchard and a hamlet. The German garrison starts round the village, the rest at the back as before
- Balance: the test player wins 17% in about 9 rounds (was 9% in 13)

## 140. Only the used tokens fly back (v83)

- Steve: when tokens fly back at the end of a round, only those that were activated by a token fly back (correction: they don't need to have moved, only been activated)
- At a new round, a token flies back into the bag only from each piece or gun a token activated last round (moved, fired, rallied or skipped). The tokens never drawn stay in the bag in the bar, and stay there when the timer ends the round. The timer flies back only if it came out. If the bag gains more (a piece that took cover, say), the extra come from the side's other pieces. The first round, the whole bag flies in as before

## 141. The game no longer stalls at the start (v84)

- Found while checking: since v81 the first round's tokens never flew into the bag (the table only redraws when something changes, and nothing did once the tanks stopped gliding for ever), so the first token was never drawn. Fixed: the table redraws as the tokens set off. v81–v83 were never pushed

## 142. The Germans show their aim first (v84)

- Steve: before the Germans shoot, they show the same targeting and info as the Americans. Both sides behave identically, except we don't see the Germans' pop-up menu (Skip turn etc.)
- Before a German piece fires, the table shows what yours does: red targets on every piece it could hit, each with its score and why, the one it picked picked out, a line of fire to it; then it fires (or asks Stand fast / Take cover first). Their mortars and artillery show their target and blast the same way

## 143. The red label reads top to bottom (v84)

- Steve: the red label should read 3+, +1 small target, +1 long range, then 5+ (large)
- The label now lists the start (3+), then each thing that makes it harder as +1 (elite −1), a line, then the score in big figures at the bottom. Everywhere else that said −1 for those now says +1

## 144. Taking cover on the dice tag (v84)

- Steve: if the target takes cover, the grey info box should say so and adjust the numbers
- The tag by the dice now says "taking cover: 3 of 6 dice" (the dice it really rolled, of those it would have faced standing), for shots, mortars and artillery, both sides

## 145. The last roll in the corner (v84)

- Steve: show the dice result for a roll at the top corner above the artillery; the right dice count and numbers, each hitting die with a yellow glow border
- Each side's last roll shows in a small panel at the top corner of the table above its artillery (yours left, the Germans' right), once the shot has landed: who fired at whom, the score and hits, and every die with its pips; the hits ringed in a yellow glow, the misses faded. (Assumed: one panel a side, the Germans' above theirs)

## 146. The American MG is the .50 cal (v84)

- Steve: refer to the American MG as the ".50 cal"
- The American machine-gun team is called ".50 cal" (in the menus, cards and log), and the rules say so

## 147. Seeing has no limit (v84)

- Steve: line of sight is the full length of the board: two pieces at opposite edges with nothing blocking can see each other, for the mortars for example, even if a piece has moved already
- Any piece sees as far as the board goes where nothing blocks the view (hedges, villages, orchards as before), moved this round or not, and that is enough to call fire on a field, both sides. Shooting with a piece's own weapon still reaches only its range (rifles 4, MGs and tanks 6, bazookas 3)

## 148. Orchards (v84)

- Steve: a couple more trees in orchards, staggered more at random; the grass underneath darker, tufty, mixed shades
- Six trees an orchard (was four), each pushed off its spot at random, a little different in size; the orchard floor is a darker grass of mixed shades covered in tufts

## 149. Three men a base; elite camouflage; Fallschirmjäger (v84)

- Steve: three infantry a base; elite squads, German and American, in camouflage; the Germans can look like Fallschirmjäger paratroopers; black helmets
- Every section base has three men (was four). Elite platoons wear camouflage (the Americans two-tone green and brown spots, the Germans a splinter pattern). Every German wears the paratrooper's grey-green jump smock, longer over the hips, and the round, rimless paratrooper's helmet in black. (Assumed: black helmets for the Germans)

## 150. The elite ring shows (v84)

- Steve: do the elites have a yellow ring round the bases? I can't see it
- They did, but it was thin and dull. It is now brighter gold, taller, with a flat gold rim round the top edge of each base, so it shows from above

## 151. The red dice in the corner (v85–v86)

- Steve: the dice of the last attack in the top corner should be the same red dice that sat on the table, and they should not appear on the board elsewhere; they appear for all attacks; they only appear when a shot happens, to show the result, and stay until the active player chooses a piece
- The red dice no longer go in the target's field. Every attack's dice (shots, mortars, artillery and each blow of a hand-to-hand fight, both sides) land in the top corner of the table above the attacking side's artillery once the attack has struck: six to a row, bigger than before, with the tag over them (who rolled, the score needed, the hits, taking cover). Hits are outlined in yellow on a glow, misses dimmed; up to three rolls a side stacked. They go as soon as the next piece (or gun) is chosen, yours or the Germans'. The HTML panel from 145 is gone

## 152. The Germans show where they can go (v85)

- Steve: the Germans show the same move indicators as yours (the fields they can move to and shoot from)
- When a German piece is picked, the table marks its fields for a moment, as yours: red hatching where a Move & shoot could fire from, the rest a Charge, a fight where it would charge into your field; then it moves

## 153. Villages, hamlets and orchards: one rule, different cover (v86)

- Steve: villages and orchards are basically the same: seen into and out of, not through (you can see from a village into the next field if it's an orchard). Only the cover differs: two enemies inside the same village or orchard get no cover; an orchard +1 for every piece from every weapon; a village +2, except a tank +1 and mortars or artillery +1. Tidy the code so both are the same with slightly different cover rules
- One table (PLACE_COVER) now holds each place's cover for men, a tank and shells, and one function gives it: village and hamlet +2 men / +1 tank / +1 shells, orchard +1 / +1 / +1; none against an enemy inside the same one (its fields joined together). Sight was already the same for all three. The labels and the field tooltip say so. (Assumed: a hamlet counts as a village)

## 154. Tanks snagged on barbed wire (v86)

- Steve: a move penalty for a tank over barbed wire? A 1 in 3 chance of getting snagged: it stops, but the wire is destroyed so no further effect
- A tank driving over wire on its way (Charge or Move & shoot, both sides) gets snagged one time in three: it stops in that field (it can still fire after a Move & shoot); the wire is flattened either way

## 155. Rangers and Fallschirmjäger; round bases (v86)

- Steve: only the elite Germans wear the Fallschirmjäger outfit, on the board and in the info panel; the elite Americans are Rangers, in brown I think: accurate but noticeably different. Each infantry base is round, with 3 men
- 1st Platoon are Rangers: a brown jacket and trousers, the orange Ranger diamond on the back of the helmet. 1. Fallschirmjäger-Zug wear the camouflage jump smock and the black rimless helmet; the other Germans are back in field grey with the flared helmet. Every section base is round with three men in a triangle. The info panel's picture shows elite troops as they are, gold band included

## 156. One shot a base, five from an MG, sounds too (v86)

- Steve: each base fires 1 shot except the MG, which fires 5, in the graphics and the sounds
- The tracers already went one a base (five from an MG); now the sounds match: a rifle shot for each base that fires, five rounds for the .50 cal or the MG 42

## 157. Why the bazooka showed 0 dice against men (v86)

- Steve: it says the bazooka has zero dice vs men, this can't be right, what is it?
- It rolls one die at men: half its two anti-tank dice (and every hit kills). The panel only counted its own anti-infantry dice; it now shows the real number (one place, Sim.menDice, used by the panel and the shot)

## 158. "Elite" in the info panel (v86)

- Steve: write elite in the info panel when an elite piece is selected
- Under the name: "Elite (Rangers: −1 to hit)" or "Elite (Fallschirmjäger: −1 to hit)" in gold

## 159. Each tank's armour, in the panel and on the label (v87)

- Steve: in the info panel write the armour each tank has; it should also appear in the label when shooting at them: 3+, +1 armour, 4+ (big)
- Every tank's panel says "🛡️ Armour +1" (the Panther) or "+0" (the others). The red label already said "+1 armour" for shots at the Panther; now mortars and artillery on it do too, and their dice need it (only their anti-tank dice roll against a tank). One helper (Sim.armourOf) gives a tank's armour everywhere

## 160. No hedges round villages and orchards (v87)

- Steve: don't place hedges against the edges of villages or orchards
- No hedge (and so no wire) grows on any edge of a village, hamlet or orchard field. (Assumed: hamlets too, as they follow the village rules.) Balance: the test player wins 22% in about 9 rounds

## 161. Nine areas a field (v88)

- Steve: each field is basically 9 mini squares (areas), so a move can take a piece to any of them; the 8 edge areas give hedge protection if against one or more hedges. Most pieces take 1 area, the PaK 40 2, tanks and platoons of 2 or 3 sections 4 (a platoon down to 1 section takes 1). These rules supersede the old ones on who can share a field. A piece can move to another area within its own field. Clicking the area to move to sometimes picked a piece already there instead, so the move couldn't be made: fix it. Come back with radio options if this causes contradictions
- Asked (big pieces in the middle would have blocked all four edges, 5 areas, not 4): Steve picked a 2×2 block; the PaK on any 2 areas side by side; a move inside the field uses the piece's move but it may still fire (+1 for moving); keep hamlets
- Every field is now a 3×3 grid of areas. A tank or a platoon of 2–3 sections takes a 2×2 block in a corner (the corner, its two edges and the middle), so it always lines the hedges of its corner; the PaK two areas side by side; everyone else one. Pieces share a field while their areas don't overlap (one big piece a field; small pieces in the free areas). Clicking an area moves there (the nearest place the piece fits); only a click on the very area another of your ready pieces stands in picks that piece. A piece's own field is marked when it is picked: click another area of it to move there, then it may fire. The Germans use the same rules
- Balance: the test player wins 17% in about 8 rounds

## 162. Hamlet and village (v88)

- Steve: what is the difference between a hamlet and a village?
- In play none now (same sight, cover and no hedges). A village is a gravel square ringed by houses and can be the objective; a hamlet is a few houses round a grass yard and never is. Steve chose to keep both

## 163. Seeing round the end of a hedge (v89)

- Steve: an MG in the bottom-right corner of field X, with field Y to its right whose bottom edge has hedge Z: as each field is 3×3 areas, he sees past the first third of Z at an angle. Clarified: he sees into W (below Y) along the 45° line through it and below it, 6 of its 9 areas but not the top-right 3, and the line goes on at 45° to the edge of the board. A piece in W's top-left area touching the hedge sees him back and neither gets cover; any other piece on the 45° line can see and shoot him but Z covers him; pieces below the line see him with no cover. Any piece in a corner; both ways (Z covers both on the 45° line); a big piece from whichever of its areas does best
- Line of sight is now straight lines between area middles. Each hedge is three thirds; a third blocks a line that crosses it unless the piece at either end stands against that third (a target against it is in cover, +1). A line exactly through a field's corner isn't blocked; a hedge ending at that corner gives both +1 unless either touches that hedge at the corner. Villages, hamlets and orchards in between still block; tanks in between still shelter men beyond. This also makes lining a hedge work by thirds: a piece sees across only the third its area touches
- Balance: the test player wins 39% in about 8 rounds (was 17%)

## 164. A big piece can hide in the middle (v90)

- Steve: so a tank can't hide in the middle of a field bounded by 4 hedges, unseen by every piece not touching a hedge? Asked: let big pieces stand in the middle as well? Steve: yes
- A tank or a platoon of 2–3 sections can stand in a 2×2 corner block as before, or in the middle of the field: there it stands in the centre only, keeps the four edge areas clear (only the corners left for small pieces) and touches no hedge, so pieces across the hedges don't see it (nor it them) unless they stand against the hedge. At the start big pieces stand in the middle
- Balance: the test player wins 39% in about 8 rounds

## 165. The captain's rallies (v91)

- Steve: the captain still activates but strangely can't move, still has a rally? His rules: he can rally up to 2 times if he stays still or charges; if he moves and shoots he can only rally once, before or after the Move & shoot. Charging he can rally twice then charge, once then charge then once, or charge then twice (or charge and skip the rallies). So a captain not wanting all his rallies must pick Skip in the menu
- After two rallies he could no longer act at all (that was the old rule); now he can still charge, but not shoot or move and shoot. Two rallies a round if he stays put or charges, in any order; one if he shoots or moves and shoots (before or after it); moving to another area of his field counts as a Move & shoot. His token stays with him until he has used what he may or picks Skip turn, which also gives up the rallies left. (Assumed: Shoot without moving counts like Move & shoot, one rally, as before)

## 166. The Germans take cover (v91)

- Steve: do the Germans ever take cover? They should when it's tactically advisable
- They didn't (only you were asked). Now a German piece fired on, or shelled, that still has its move this round takes cover when it is wise: a shaken one (one more hit kills) as soon as a hit is likely, a weakened one against a fair volley (one hit expected), a whole one only against a heavy one (about two hits expected). It gets down (half the dice at it) and loses its move, as yours do
- Balance: the test player wins 17% in about 8.5 rounds (was 39%)

## 167. Corner to corner (v92)

- Steve: two fields directly diagonal to each other let pieces see each other along the 45° line (villages, hamlets and orchards too), but not through a hedge unless touching its corner
- A line through the point where four fields meet runs on between the diagonal fields, as before; but where a hedge ends at that point it now gets past only if one of the two pieces stands in a corner area at that very point (then the hedge covers both, +1, unless either touches it there). Lines from the middle of a field past the end of a hedge are blocked

## 168. Tanks block sight (v93)

- Steve: the 45° line also applies to sitting at the back of a tank's corner, the edge of a tank acting like the hedge; otherwise tanks block line of sight through the areas they occupy. Asked about the old tank cover: blocking only (no more +1 behind or beside a tank); a tank in the middle blocks only its centre area
- Any tank (either side) blocks every line through the areas it stands in. A line just past a tank's corner gets by only for a piece in an area touching that corner; both then get +1 ("tank's corner" on the label), unless either is right beside that side of the tank there. The old +1 for men behind or beside a tank is gone
- Balance: the test player wins 17% in about 8.6 rounds

## 169. Only the areas it can fire from are hatched (v94)

- Steve: a field shown red-hatched because a piece can shoot from it lets the piece move to an area it can't shoot from; of the 9 areas only those that can be shot from must be hatched
- A Move & shoot field is now marked area by area: red hatching on each area a click would leave it able to fire from, a Charge's wash on the others where it can charge there. A click on a hatched area is a Move & shoot; on another area of that field a Charge (or nothing, using the Move & shoot button)

## 170. One arrow to each red label, no crossings (v94)

- Steve: the red bubbles show two arrows, their own short one and a bigger, longer one: remove the short one and have the long one come out from behind the box; when many show (a mortar's targets, say), don't cross the arrows, ring them round, each nearest the piece it points to
- The red label has no tail now; the long arrow starts behind the middle of the bubble. After the bubbles are placed, any two whose arrows cross swap places until none do

## 171. Taking cover is +2 (v95)

- Steve: a piece that has taken cover should say +1 cover in its info panel, and anyone targeting it gets +1 on their label (3+, +1 take cover, 4+). Asked whether that replaces the half dice: Steve answered +2
- Taking cover no longer halves the dice: every shot or shell at the piece needs two more for the rest of the round. The red label says "+2 take cover", the info panel "Taking cover: +2 cover", the dice tag "taking cover". (Assumed: it replaces the half dice; the sniper ignores it, as he ignores all cover)
- Balance: the test player wins 13% in about 10.5 rounds

## 172. A tank's dice (v95)

- Steve: a tank shooting is not showing dice
- A tank turns before it fires, so its shot lands late; by then the next token had often been drawn, which cleared the list of attacks, and its dice were never put in the corner. The rolls are now kept until they are shown, and the next token waits until every shot has landed

## 173. The captain greyed out when done (v95)

- Steve: the captain has moved but hasn't turned light green (light grey for the Germans); he looks selectable
- A captain who only rallied never counted as having moved, so he looked ready and could even take another token. Now whatever a token's piece did, it is done when its token passes, shows as moved, and gets no second token

## 174. The piece menu: only Skip and Rally (v95)

- Steve: Move & shoot should never appear in a piece's menu; it should only ever be Skip / Rally; Move & shoot is always chosen on the board
- After a Move & shoot move the menu showed "Move & shoot" again (for the shot). The menu now only ever has Skip turn, Skip the shot, Rally and Rally itself

## 175. Mortar and artillery dice (v96)

- Steve: when a mortar or artillery fires, what should we show for its dice? Options? Steve chose a row per piece hit
- Each piece a mission catches has its own row of dice in the corner, with a tag naming it ("Our artillery → 2. Zug · needs 4+ · 2 hits"); the stack is as long as the mission, up to the top of the screen. Every other shot's tag names its target too. German artillery now says so (it said German mortars)

## 176. Past the corner of a village, hamlet or orchard (v96)

- Steve: did we say the 45° rule also lets pieces at the corner of a village, hamlet or orchard see through at 45°, like hedges? We hadn't; Steve chose: the same as a hedge end
- A line that only touches the corner of a village, hamlet or orchard beside it gets by only if one of the two pieces stands in a corner area at that point, and both then get +1 ("+1 village's corner" on the label). Lines through the field stay blocked
- Balance: the test player wins 14% in about 10.5 rounds

## 177. Red bubbles clear of the other targets (v97)

- Steve: when many targets show, a red box or its arrow should not cover any other targetable piece
- Each target now tries 80 spots ringing it (near first). The choice weighs what is in the way: a box or arrow on another target counts most, then boxes on boxes, arrows through boxes and crossing arrows, then distance; each bubble looks again until none wants to move. js/labels.js does this with no 3D, so it has its own test. It is worked out once for each set of targets, not every frame
- Checked in a browser on 10 games with the hedges removed (up to 10 targets): no box on another target, no boxes overlapping, no arrows crossing. Still left: 2 arrows clipped another target, and where two pieces stand so close their cross-hairs overlap (usually the German captain and MG in the village) an arrow's point lands on the neighbour, which no bubble position can fix

## 178. Assumptions confirmed

- Steve confirmed: +2 replaces the halved dice; the sniper ignores taking cover; a captain who shoots without moving gets 1 rally; moving to another area of his own field counts as firing, so 1 rally

## 179. Cross-hairs nudged apart (v98)

- Steve chose: where two pieces stand so close that their cross-hairs overlap, spread the cross-hairs
- Cross-hairs that would sit on another's cross-hair or base are nudged apart on the screen, with a thin red line down to their own piece; the pieces stay put. The bubbles are also tried in several orders, keeping whichever leaves the least in the way
- Checked in a browser on 10 games with the hedges removed (up to 10 targets): no box on another target, no boxes overlapping, no arrows crossing, no arrow point on a neighbour. Still left: in most of those crowded set-ups one arrow clips another target in the tight cluster in the village

## 180. Only the tokens used fly home (v98)

- Steve: pieces not used this round when the timer comes up still returned a token to the bag; if only 3 pieces moved and then the timer was drawn, only 3 tokens should fly back, from those pieces
- Tokens fly home only from pieces and guns a token activated. Any other token in the new bag is already there, none flying from a piece that didn't act (a piece that took cover, say, used to send one). One list (Sim.tokensHome) decides, for the table and the bar

## 181. Into a village at any angle (v99)

- Steve: a piece moved to the bottom-right of an orchard and looked diagonally into a village holding a 3-section platoon: touching a village corner, should we see in? Then: from the side we see all the pieces in a village, so the same from the corner: all in it but not through, and all in the village can see out and see us. In fact the piece need not be in corner contact: it has full line of sight into but not through a village at any angle or distance
- Then: if we are at 45° to village X and another village Y is next to it, we can't see through Y to see all of X, only what we can see directly (asked with the areas numbered, Steve confirmed 3 hidden, 6 seen)
- So straight lines decide. A field of village, hamlet or orchard at either end of the line is open: all its areas can be seen from any angle or distance, and those in it see out, keeping their cover. Any such field in between blocks, including the next field of the same village. From the corner at 45° with a village beside the line, the 3 areas behind that village are hidden, the other 6 seen
- Balance: the test player wins 14% in about 10.5 rounds

## 182. "The same village" means the same field (v100)

- Asked whether two enemies in the same village get no cover across the whole joined block or only in one field; Steve: only the same field
- A piece in the next field of a block of village fields keeps its house cover (+2 men, +1 a tank). Only an enemy in the very same field gets none, which in practice means hand to hand
- Balance: the test player wins 7% in about 7.3 rounds (was 14% in 10.5), so the Germans in the village are now much harder to shift

## 183. A tidy-up: errors and waste (v101)

- Steve: can you look at tidying the game, errors and inefficiencies? Also, while it was going on: we are still not always seeing dice; a shot at 7 after taking cover still cost a section; once a piece has taken cover it can't move and it wears off next round; a figure disappeared before a mortar had shot it
- Errors fixed. A German who took cover never got up again (since v91, so +2 for the rest of the game), which made the Germans far too hard. A German mortar bomb didn't say who it was at, so its target vanished before it landed. Taking cover that puts the score at 7 or more now stops the shot: no dice, nothing lost (a 6 used to hit). New game during a move left the old game's timers running, which could draw tokens twice. A piece the captain gets up lost its token from the bag, and so could cost another piece its go
- Dice: they now appear even if nothing else is moving on the table (a fight could end with its dice never drawn), the next token waits 2.5 seconds so they can be read, and mortars show no target on a tank as they roll nothing at one
- Waste: the marks on the table were rebuilt every frame and never freed, about 1,700 objects a second while targets showed (now flat); moves and targets are worked out when the game changes, not every frame
- Dead code gone: groups, attached teams, plain moves and Break through, none of them in the game any more; old wording in comments
- The test player now plays as the page does, token by token, with every piece (it used to play whole hours, with only platoons and tanks). So its numbers are not comparable with before: it now wins 38% in about 11 rounds

## 184. Germans in cover stay put (v102)

- Steve: the captain getting a piece up from cover is fine as it is, but a German piece ran along in cover, which is not correct
- A German who took cover could never get up (183), so from then on it moved crouched, in later rounds. That was fixed in v101; now a German down in cover gets no move, checked over whole games. The one way it still leaves its field is being driven out by a tank: it is then up and running, not crouched

## 185. Just "cover" on the label (v103)

- Steve: instead of +1 hamlet, village or orchard, say +1 cover
- The red label says "+2 cover" or "+1 cover" for a village, hamlet or orchard, and "+1 corner" for a line past the corner of one

## 186. Hail Mary (v104)

- Steve: taking cover must not stop the shot: if you commit to the shot and the opponent ducks, the shot completes and fails. In fact any shot past 6 in the whole game is a HAIL MARY: throw a 6, then follow up with another 6 to hit, so about a 3% long shot. Asked: from 7 up (6+ stays a plain 6), and any target in reach can be chosen. Also: +1 corner should say +1 cover too
- A shot needing 7 or more is no longer refused: every target a weapon can see and reach has a cross-hair, the red label says HAIL MARY, and each die that throws a 6 throws again, only a second 6 hitting; both throws show in the corner. A target ducking after the shot is committed can turn it into one. Shots, mortars and artillery, both sides. The Germans take one only when they have nothing better to do
- Balance: the test player wins 35% in about 10.6 rounds

## 187. A better frame rate (v105)

- Steve: can we improve the frame rate?
- Every model was many small parts, each drawn on its own, twice a frame (once for its shadow): over 5,400 draws a frame. Now each piece, and the fields, houses and trees, are merged into one mesh for each material (about 600 draws). Shadows are worked out only while something moves. The marks on the table are built when something changes, and between times only the cross-hairs pulse. The sharpest screens are drawn at 1.5 times, not 2
- Measured in the same test window: from about 15 frames a second to 60-70 (as fast as that screen shows), with memory steady, while playing and with targets showing. No change to the rules

## 188. Checks, and a bomber estimate (no change)

- Steve: don't say +1 hamlet, it must be +1 cover: did we do this? Yes, v103 (the corner label too in v104)
- Steve: 6+ should be a long shot, named Hail Mary: did we do this? Yes in v104, but from 7 up, as Steve chose then: 6+ stays a plain 6. Asked again whether 6+ should change
- Steve: a bomber: a B-17 / Ju 88 below the mortars with a token; a 16-way compass spin when picked (the same result if picked again that round); pick any field round the edge; it flies straight through that field, a bomb at 5+ on each piece in each field it crosses. Asked if it fits the rules and how long: it fits, with six things to settle (how many runs; do cover and take cover add to the 5+; what a hit does, as one die at 5+ is far weaker than a mortar's four at 3+; which fields a slanted line counts; skipping after the spin; take-cover bubbles along the line), about 2-3 hours. Not built yet

## 189. Bazookas go further (v106)

- Steve: the bazooka can move one space further, he's got to get to the tank: on Move & shoot and Charge
- Move & shoot three fields, Charge four. Shaken, half of that, as for everyone. (Assumed: the Panzerschreck too, as both sides behave the same)
- Balance: the test player wins 38% in about 10.8 rounds; doing nothing wins 0%

## 190. The bomber (v107)

- Steve picked: not pushing yet; 6+ stays a plain 6; build the bomber with a hit that works like a mortar's
- Each side has one, a B-17 or a Ju 88 on a flying stand below its mortars, with its own token and one run a game. Picked, a 16-point compass spins above the board (picked again it spins to the same direction; a new round spins afresh). Every edge field lights up; pointing at one draws the line; clicking sends it in from off the screen, straight through that field and off the other side, with its own loud engine sound
- One bomb, one die, on every piece in every field the line crosses (a clipped corner counts, a touched corner doesn't), either side: 5+, plus the same cover, armour and take cover as against shells. A hit shakes, a coin toss says if it wounds; on a tank, it counts as an anti-tank die
- Skip turn uses the token and keeps the run. Your pieces under a German bomber's line are each asked Stand fast or Take cover before it arrives. (Assumed: a side's own men under its own bomber aren't asked, as under its own artillery; the computer flies only a line catching at least 2 more enemies than its own, each of those counting 1.5)
- Played in a visible browser, both bombers, by real clicks: no errors. Balance: the test player wins 35% in about 10.9 rounds; doing nothing wins 0%

## 191. Ambush (v108)

- Steve: any piece (not the bomber, artillery or mortars) can go into ambush, from the same pop-up menu as Skip turn. It shoots the first enemy that moves into sight and can be hit on 6 or less. Pieces in sight when it goes in aren't shot unless they move or shoot. When it has fired it turns normal light green or grey, finished for the round. It doesn't carry over to the next round. Asked how to mark it: Steve picked a pulsing amber ring only
- Steve on the timing: it shoots as soon as it can, anywhere along a piece's move; the piece carries on if not killed, stops if shaken, and can still shoot if not charging. Asked if that is consistent: yes
- A dashed amber ring pulses under the piece, either side. It checks at setting off, at each field along the way, on arriving, on moving within a field, and after a shot. Each ambusher fires once; a piece on the move can't take cover, as it has already used its move
- (Assumed: a hit on a piece already shaken also stops it; shaken in a field of friends it can only pass through, it stops at the next field it can, as for a wire snag; a stopped charge gets no fight; a piece it can't hurt doesn't set it off, nor a shot needing 7 or more, and it keeps waiting; driven out by a tank it stops waiting; the captain gives up his rallies, as when he skips; the Germans lie in wait when they have no shot and nowhere to go; Ambush is in the pop-up menu only, as the panel has no room for a fifth button)
- Balance: the test player, which never uses ambush itself, wins 32% in about 11.2 rounds; doing nothing wins 0%

## 192. Could the player be the Germans, or two players? (question, nothing built)

- Steve asked how much work it would be, hoping both sides work the same, then asked for it to go on the to-do list
- Found: shooting, moving, cover, hand to hand and ambush are shared. The player's moves only work for the Americans, the Germans run on separate computer logic, and a player's shot fires at once while only the German computer's shots stop to ask the target
- Found as well: mortars (US 4 dice on the whole field, 6 rounds; German 3 dice on one piece, 8 rounds), artillery rounds (3 v 2), Bazooka v Panzerschreck (2 v 2.5), no Move & shoot for the German computer, and the Germans win only by wiping out the company
- Estimate: two players on one screen about 2–3 h; playing the Germans about 2–3 h more; online about 3–5 h more, with a small relay service

## 193. The rules as tables (no change)

- Steve: list the basic rules in tables. Given in the chat from js/data.js and How to play

## 194. How to play catches up (v109)

- Steve: do these two apply: the bomber's token in the bag, and the PaK killing men outright? Yes, both were already in the rules; How to play now says so. No change to the rules

## 194b. Holes in the rules? (question, nothing built)

- Steve: are there any holes in the game logic? Checked against v108 with test games: a game can go on for ever (4 of 60 still unfinished after 60 rounds); German men charge across barbed wire (Americans can't); a machine gun, or a captain with no shots left, can move inside its field and then fire; an ambush firing doesn't set off another ambush; when a bomb kills the last of both sides, whoever is hit first decides it; under German artillery only the main target is asked about taking cover; shaken Germans never rally themselves

## 195. The Germans Move & shoot (v110)

- Steve: the Germans never move and shoot, and they need to. Weapon differences between the sides stay as they are, as they are easy numbers to change later
- A German piece with no shot where it stands now uses the same Move & shoot as yours: up to two fields, then it fires needing +1. It picks the place with the shot it most wants, nearer its goal if that is close. The shot is aimed first, showing "+1 moving", and the word bubble says "Moves up, fires on …". Lining a hedge can now fire too, as yours can
- It goes on a token after pieces with a shot, before pieces with neither. An ambush can stop it, as yours
- (Assumed: a piece standing in the objective doesn't leave it this way; other pieces may leave their posts to fire and march back later; a piece with a shot where it stands takes that rather than moving; proper shots only, no Hail Mary on the move; machine guns and the PaK don't Move & shoot, as yours don't)
- Balance, before the number changes below: the test player falls from 32% to 18%, in about 10.1 rounds; doing nothing wins 0%

## 196. Longer ranges, mortars on tanks, less artillery (v110)

- Steve: bazooka and Panzerschreck teams shoot 4 fields, not 3; tanks 7, not 6; artillery 5 dice, not 6, both sides. No balance test, by request
- Steve: all mortars have 1 anti-tank die, which only shakes a tank, or knocks it out if it is already shaken. Your mortars can now target a tank
- (Assumed: long range starts where it did, beyond 1 field for those teams and beyond 4 for tanks; the PaK stays at 6; the German mortar fires first on a shaken tank, then a platoon, and on an unshaken tank only with nothing else; the Panther's armour counts against the die, as with artillery)

## 197. Closing the holes (v111)

- Steve picked all of them: the Germans follow the same rules, machine gun and captain shots, the ambush chain, game endings and a draw
- German men no longer charge across barbed wire. Every American the German artillery will fall on is asked Stand fast or Take cover in turn, then it fires once. A shaken German uses its move to rally itself, unless it has a shot and its captain is within 3 fields
- Moving inside its field: a machine gun, or a captain with no shot left, can't fire after
- An ambush firing sets off any enemy ambush that can see it, each firing once
- A mission or bomb taking the last of both sides is a draw. You lose at the end of a round with no rifle platoon left and nothing left that can hurt the German tanks (a piece with anti-tank dice, or mortars, artillery or bomber with some left)
- Not a hole after all: the German mortars. A piece next to a field always counts as seeing it, for both sides, and they only fire next to a German. Taken back
- Played in a visible browser: both pieces asked under shells; a draw by real clicks; no errors. Test player, 60 rounds at most: 2 of 60 still unfinished (was 4). Balance: the test player wins 11% in about 11.9 rounds (v110 alone: 15% in about 10.6); doing nothing wins 0%

## 198. Burning wrecks (v112)

- Steve: when a tank is destroyed, a fire like Future City Battle's but less blocky. The tank stays, blocks line of sight, and we can take cover at its corner. If it dies in a village or hamlet field, how can a full 3-base platoon still occupy it? Also blacked out and scorched
- Asked what room a wreck should take, as every 2×2 block needs the field's centre, so a full 2×2 wreck would shut platoons and tanks out for good, and the objective is one field. Steve picked three squares, centre free, in every field
- A knocked-out tank stays as a wreck in its corner: that corner and the two edges beside it. A full platoon or a tank fits at the opposite corner. It blocks sight through its squares, with the same corner rule as a live tank (+1 past it from a piece touching that corner)
- One wreck to a field: a second clears the older one away, so there is always room. A tank that dies in the middle of a field rolls to a corner nobody stands in
- The look (js/fire.js): soft painted flames in three fires on the hull, as on the Future City wreck, black smoke, a flickering glow, a burnt patch on the ground, and a hull scorched black with patches of rust and ash, sitting a little askew. It stays in its paint until the shot that kills it lands
- (Assumed: flames burn hard to the end of the next round, then small flames and thin smoke for the rest of the game; the wreck squares up to the nearest quarter turn; in a yard a platoon stands further out to clear the hull; hover on the field names the wreck; the score label still says "tank's corner")
- Played in a visible browser: a real shot from one tank killing another, burning, smouldering, a new game with nothing left over; 60 frames a second with three fires; no errors. Balance: the test player wins 13% in about 11.8 rounds (v111: 11% in about 11.9); doing nothing wins 0%

## 199. Big screens on small machines (v113)

- Steve: on a low-power Surface laptop with a 4K screen it ran poorly; in a smaller window it was good
- The table is now drawn with at most about 4 million pixels (about 2560×1600) and stretched to fill the window; ordinary windows, up to that size, look exactly as before
- If frames stay slow while the table is moving (the middle of 40 frames over 40 ms, about 25 a second), it draws with fewer pixels, in steps, down to 1.2 million. It stays there until the page is reloaded
- With only fires moving it draws about 30 frames a second, not 60, so a wreck doesn't keep a laptop's graphics chip flat out all game
- (Assumed: softer pictures are a fair price on a slow machine, no setting for it, nothing remembered between visits; the numbers are PIXELS in data.js)
- Tried in a visible browser at 3840×2160: 4.0 million pixels from the start; frames made slow on purpose took it down to 1.2 million in about 16 seconds; clicks still land on the right piece; no errors. Not yet tried on the real laptop

## 200. Playing as the Germans (v114)

- Steve: playing as the Germans. They win by killing all the Americans, not counting their artillery, mortars and bomber
- New game now asks which side you command; the side is remembered on the computer, and Play again keeps it (see 201: the game now starts by asking too)
- Win as the Germans: every American piece on the table gone, whatever guns they have left. You lose if a rifle platoon of theirs holds the village at the end of a round, or if every German is destroyed. A draw works as before
- The computer plays the Americans with a new attacking player in sim.js (americanAct): the captain rallies; a rifle platoon charges an empty village, or storms it or any other field when it has more bases there; otherwise fire, line a hedge, Move & shoot, or march on its goal (platoons the village, the captain after his strongest platoon, the rest the nearest German). Nothing but a rifle platoon stops in the village, so it stays free for them
- It shows its moves as the German computer does: the token, the ring, the word bubble, the aim; your pieces are asked Stand fast or Take cover under its shots, shells and bomber
- Weapon differences stay (Steve, 2026-11-04): you get the German guns and rounds. German mortars drop on one piece, three dice, eight rounds; American mortars on the whole field, four dice, six rounds
- In the code: st.human is the player's side, st.computer (was st.de) the computer's token in play. st.won still means the Americans won and st.lost the Germans did, on either side
- (Assumed: the Americans still win only as before; playing the Germans the "company can no longer win" loss doesn't apply, so you must finish them off, as Steve asked; playing the Americans it still does; no rule or number changed; the camera stays where it is, so the Germans fight from the right; the village's blue hatching only shows for the Americans)
- Played in a visible browser as the Germans with real clicks: the pop-up, moves, the mortars, Stand fast and Take cover, the win with American guns left, the loss of the village, Play again and a reload keeping the side, then back to the Americans; no errors. Tests: 150 pass, 15 of them new
- Balance as the Americans is unchanged: the test player wins 13% in about 11.8 rounds; doing nothing wins 0%. As the Germans, 150 games of up to 20 rounds with a simple test player who mostly stays put and shoots: the test player wins 30%, the American computer 58% in about 8.9 rounds, 12% unfinished; doing nothing wins 0%. Not yet played by a person, so no balance change made

## 201. The game starts by asking which side (v115)

- Steve: start the game with the dialog to choose your side, German or US
- The page opens on the table with nothing moving, and asks; the side you had last is lit, and there is no Cancel until a game has started. New game still asks; Play again keeps the side

## 202. The captain's menu over his rally targets (v115)

- Steve: captain cannot rally if taken cover
- Tried both sides with real clicks: a captain down in cover could rally. But a click on a blue target could do nothing, because the captain's own menu sat on top of it (it kept clear of lit fields and red targets, not blue ones). The menu now keeps clear of them too; rallied 12 times out of 12 afterwards, both by the blue target and by the Rally button
- Steve's words could also mean a new rule, so he was asked: he chose the rule (see 204). The menu fix stands, for rallies from out of cover

## 203. The PaK moves within its field (v115)

- Steve: allow the PaK 40 to move within its allotted field; let it move and ambush on the same go; when it moves make it face out of its square, 45 degrees out of a corner or straight out of a side, eight directions; in the centre, just the direction it came from to get there
- On its token the PaK can move to another place in its field: its own field lights up and a click there moves it. It never leaves the field
- It faces out of the area clicked, one of eight ways, until it next fires. A click on any of the eight areas always moves it, even one it already stands on, so every way can be faced. Sent to the middle it takes the pair of areas nearest where it was, and faces the way it came, to the nearest of the eight
- After the move its menu opens with **Ambush** or **No ambush**, on the same token
- (Assumed: it can't fire after moving, as a machine gun can't, Steve didn't ask for that; "the direction it came from" means it points back where it was, not on the way it was going; the German computer's PaK can do the same, Steve's rule that both sides play alike: with no shot from where it stands it moves to a place in the field that has one, faces out and lies in ambush)
- Played in a visible browser with real clicks: all eight areas and the middle, close-ups of the drawn gun, Ambush and No ambush; no errors. Tests: 154 pass. Balance as the Americans: the test player wins 13% in about 11.8 rounds; doing nothing wins 0%. As the Germans: the test player wins 30%, the American computer 58% in about 8.9 rounds, 12% unfinished; doing nothing wins 0%. All as before

## 204. A captain in cover can't rally (v116)

- Steve chose it as a rule: a captain who has taken cover can't rally anyone, himself included, on either side, until the cover wears off next round
- His menu says why, and his panel says no rallies until next round. A captain out of cover can still get other pieces up from their cover

## 205. Close range and the captains' submachine guns (v116)

- Steve: give both captains a submachine gun, 3 shots but only at close range. Everyone gets −1 on the dice needed at close range: 4 of the areas across, 1⅓ of a big square. Show the red hatching differently to indicate this. It applies to all but mortar, bomber and artillery
- Close range: the nearest areas of the two pieces no more than four areas apart in a straight line. One less on the dice for every shot, the sniper's too; "−1 close range" on the red label. A target at close range is never at long range as well (it could be for a bazooka, two fields off, edge to edge)
- A Move & shoot: areas where it would have a shot at close range have crossed red hatching, the others the old stripes
- Each captain throws three dice at men at close range; the panel says so
- (Assumed: the same rifle sound; hand-to-hand dice don't change; the computer's pieces get the −1 and the guns too, and prefer such shots a little)
- Played in a visible browser with real clicks, both sides: three dice close, one die two fields off, the labels, the hatching; no errors. Balance as the Americans: the test player wins 13% in about 13.1 rounds (was 11.8); doing nothing wins 0%. As the Germans: the test player wins 24%, the American computer 60% in about 8.5 rounds, 16% unfinished after 20 rounds; doing nothing wins 0%
- To watch: an elite platoon in the open at close range, standing still, needs 1+ (3, −1 elite, −1 close): every die hits

## 206. Moved colours by army (v116)

- Steve: the grey and green washouts for the USA and the Germans seem the wrong way round now
- v114 made them yours green, theirs grey, so playing the Germans swapped them. Now moved Americans are always light green and moved Germans grey, pieces and guns, whichever side you play

## 207. Captains shoot at close range only; a 1 always misses (v117)

- Steve: a captain can't shoot beyond close range at all (205 had kept his one die there). He throws three dice at close range and has no target further off
- Steve picked it from three choices: an elite platoon standing still at close range in the open added up to 1+, so every die hit. No shot now needs less than 2+: a 1 always misses
- Steve: don't confuse a player doing the maths in the score box. It adds up: 3+, −1 elite, −1 close range, +1 a 1 always misses, 2+
- Steve said to forget his report of a hit on a 5 under artillery (6,742 shell rolls in test games never hit below the score they needed)
- Balance as the Americans: the test player wins 13% in about 12.4 rounds; doing nothing wins 0%. As the Germans: the test player wins 27%, the American computer 57% in about 8.4 rounds, 16% unfinished after 20 rounds; doing nothing wins 0%

## 208. Human or robot, each side: all four variations (v118)

- Steve: when choosing sides make both USA and German selectable as robot or human, so we can play all four variations. He picked all of it from the choices
- The opening question (and New game) has a row for each side: Human or Robot, then Start. What was picked last is lit and remembered; Play again keeps it
- **Two humans** share the screen, token by token, and the panel says whose token it is. A shot at the other player's piece stops first and asks by the piece, Stand fast or Take cover; artillery, mortars and the bomber ask every piece of theirs they will fall on, in turn. Then the dice. A German player must still destroy every American
- **Two robots** play it out while you watch, each with its own computer player and nobody asked anything; any piece clicked only shows what it is. A draw after 30 rounds (ROBOT_ROUNDS in data.js), so a game can't run for ever
- In the code: `st.mode` is 'us', 'de', 'both' or 'none'; `Sim.isRobot(st, side)` says who plays a side; with two humans `st.human` changes with each token
- (Assumed: a shot from an ambush doesn't stop to ask, as ambushes never have; with two humans or two robots the end message names the winner, not "you"; the robots go at the same pace as the computer does against you)
- Played in a visible browser with real clicks: the choices, both players' tokens, a shot and Take cover, artillery asking two pieces, the American win, Play again, two robots moving on both sides to the draw, a reload remembering it, and a human German against the robot; no errors. Tests: 169 pass. Two robots, 150 games: the Americans win 31%, all by taking the village, the Germans 69%, no draws, about 11.5 rounds

## 209. Shots drawn in order (v119)

- Steve: why do pieces sometimes move and then get shot? I shot at a platoon, the platoon then moves to the hedge and is shot. And: I ambushed, and the target disappeared before being shot. He chose to keep the ambush rule and fix the drawing
- A platoon down to one section takes one area instead of a block, so it stands somewhere else; the rules work that out as the shot is fired, and the table moved it straight away. A piece being shot now stays where it stands until the shot lands; a survivor then moves to its new place
- An ambush on a piece on the move: the rules work it all out at once, then the table drew the move and the shot together. Now the piece goes to where it was seen, stops, the shot lands, and it carries on (or stops, or dies, there). Killed on the way, it no longer vanishes where it started
- Measured in a visible browser, the piece at the moment the shot lands: where it set off, the field it was passing, or where it arrived, as the case may be; killed on the way or on arriving, there and still showing; a platoon losing a section still in its old place. No rule changed

## 210. The PaK round the large village (v119)

- Steve: let the PaK 40 in the large four-field village move all around it
- Its other fields light up as a Charge does; a click goes straight there, even across the corner, into any with room and no enemy. It faces as it does moving within a field, the middle of another field facing back the way it came, can't fire after, and can lie in ambush on the same go. In the small village or an open field it stays in its field
- (Assumed: one go reaches any field of the village; the German computer's PaK can do it too, when that is where a shot is: both sides play alike)
- Played in a visible browser with real clicks, no errors. Tests: 171 pass

## 211. Tank shots sound like the bazooka (v120)

- Steve: change the tank shot noise to match the bazooka
- Every tank, both sides, now fires with the bazooka's launch and roar, one for each shell. (Assumed: the PaK 40 keeps its cannon, as Steve said tank; what a shell does when it lands sounds as before)

## 212. A tidy (v121)

- Steve: look at the game for efficiency and good code structure, then picked the tidy with no splitting of files. A round's rules take about 28% less time; drawing was already fast (about 5.4 ms a frame)
- Gone: code nothing used (canStep, the log nobody read, reinforcements, the "power" of a shot that was always 1); rounds, not hours, in the names; the old German-hour helpers moved into the tests
- One way to store each side's ammunition and what it has fired (st.ammo.us, st.ammo.de, st.fired.us, st.fired.de); shared pieces for what both computer players do, the distance between fields, the areas of a field, a piece's badge, the test player's guns; the worst long lines broken up
- Faster: line of sight keeps its hedge keys and works out what is in the way once a look
- tools/check-page.js: the browser checks, kept in the repo
- Proved no rule changed: 300 test games, all five ways of playing, seed by seed, ended exactly as before. Tests: 172 pass; the browser check, no errors. Balance from v120: as the Americans the test player wins 13% in about 11.8 rounds; as the Germans 27%, the American computer 57%, 16% unfinished; two robots: the Germans 71%, the Americans 29%, about 11.6 rounds
- Found while proving it, and left for Steve to decide: a German gun or bomber that fired in one round had no token in the next round's bag, while an American one did (see 213)

## 213. German guns get their token (v122)

- Steve picked the fix: a German gun or bomber that fired used to miss the next round's bag, so it could only fire every other round; the American ones didn't. The marks of what has fired are now cleared for both sides before the bag is filled
- Balance, 150 games: as the Americans the test player wins 14% in about 11.8 rounds (was 13%); as the Germans 32% (was 27%), the American computer 52%, 16% unfinished; two robots: the Germans 71%, the Americans 29%, about 11.5 rounds. Tests: 173 pass

## 214. More maps (v123)

- Steve: some more maps, four of them, chosen in the opening dialog or at random. The others should vary the pieces and positions to make them interesting; sometimes two bomber runs
- Besides the usual Hedge country, unchanged (300 test games ended exactly as before):
  - River crossing: two bridges the only way over. The Americans have 2 bomber runs and a fourth artillery round; the Germans an extra MG 42 and no Panther
  - Crossroads town: a town each side of the crossroads, both sides starting further forward. The Germans have a second PaK 40 and no Panzer IV; the Americans a third tank
  - Open farmland: few hedges and long shots. An extra tank each, and 2 bomber runs each
  - Deep bocage: hedges nearly everywhere. A fourth American platoon and second bazooka, a sixth German platoon and second Panzerschreck; no Firefly, no Panther
- The opening dialog has a row of maps and Random, and says what each one changes; it is remembered. Computer players and the test player now walk by the bridges on a river map (walkDistance)
- (Assumed: "sometimes two bomber runs" means on some maps, not by chance in a game; all the maps are the same size; the village names are made up)
- The bridge (Steve: wider, more arched, rustic, stone): a wide humped road the length of the field over one low arch, rough-cut blocks with moss, a ring of wedge stones, buttresses and uneven parapets. Pieces stand up on the road; what is marked in its field shows through. A tank knocked out on a bridge rolls to a corner, partly over the edge
- Balance, 60 games each: Hedge country: test American 18%, test German 32%, two robots the Germans 73%. River crossing: 38%, 13%, the Americans 73%. Crossroads town: 23%, 25%, the Americans 53%. Open farmland: 5%, 45%, the Germans 75%. Deep bocage: 15%, 18%, even. No change made until a person has played them. Tests: 179 pass; the browser check, no errors

## 215. Paris, barns, a duck pond, reeds and cobbles (v124)

- Steve: a level that is a tight city of just village pieces and lanes with random maze roads, called Paris; cobbled streets, not lanes. Little squares with a café and a fountain: the café is its own building, blocks line of sight like a tank, and takes a few of the nine areas. A duck pond and a few barns on the farm level, acting like the café. Reeds along the river here and there. A few more cobbled streets on the other maps
- Paris: a new maze each game from the game's dice, every street joined to every other, with a few more streets so there is more than one way round. Three little squares. No hedges or wire. No Firefly and no Panther; a second bazooka for the Americans, an extra MG 42 for the Germans. The village to take is a block of houses on a street, towards the German end
- A café or a barn takes the three areas along one side of its field, leaving a block free for a platoon or a tank, and blocks the view as a tank does, corners and all. A fountain (one area) or a duck pond (three) can't be stood on, but can be seen over. Four barns and the pond on Open farmland
- Cobbles: the streets of Paris, flagstones in its squares, and on every other map a lane is cobbled where it runs beside a village or hamlet. Only to look at. Reeds along both banks, here and there
- (Assumed: as anywhere, men can still go into a block of houses, one field a go, so the maze slows them rather than walling them in; a square has no cover of its own; the café faces any way, so one with its front to the far side shows its roof; "a few bars" was a slip for barns, as Steve confirmed)
- Hedge country plays exactly as before (300 test games). Tests: 183 pass; the browser check, no errors. Balance, 60 games each: Paris: test American 17%, test German 32%, two robots the Americans 55%. Open farmland now: 7%, 35%, the Germans 67%

## 216. Tanks go further on the road (v125)

- Steve: tanks move and charge one space more if the full move starts, stays and ends on the road: road or lane, either or a mix of both
- A Charge goes four fields instead of three, a Move & shoot three instead of two, both sides, the computer's too. Road or lane: a lane, a crossroads, a bridge, a street, or a square on the streets
- (Assumed: not a shaken tank, as it goes half as far)
- Tests: 184 pass; played in a visible browser, no errors. Balance, 60 games each, test American / test German / two robots: Hedge country 17% / 38% / the Germans 70%. River crossing 42% / 15% / the Americans 73%. Crossroads town 22% / 25% / the Americans 58%. Open farmland 8% / 28% / the Germans 67%. Paris 20% / 33% / the Americans 58%. Deep bocage 17% / 20% / the Germans 53%

## 217. Cafés and barns of different lengths, some in the middle (v126)

- Steve: make the cafés and barns not all the full square length; put some in the centre of the square, not just the edges
- A café in Paris is along a whole side (three areas), along part of a side (two), or in the middle (the centre and one area beside it), one way in three each. Open farmland has one barn along a whole side, one along part of a side, and two in the middle
- With a building in the middle every block a platoon or a tank needs is taken, so only smaller pieces can stop there; big ones go past it. Garrisons don't start in such a field
- Hedge country plays exactly as before (300 test games). Tests: 185 pass. Balance, 40 games each, test American / test German / two robots: Open farmland 13% / 28% / the Germans 65%; Paris 23% / 33% / the Americans 50%, the Germans 48%

## 218. Things just to look at (v127)

- Steve picked them from a list of ideas: cows, sheep, parachutes in trees, lamp posts, poster columns and market stalls, with no effect on the rules
- Cows and sheep in some plain fields, more of them on the farm; parachutes caught in the trees of some orchards; lamp posts and poster columns at the corners of Paris's streets; one or two market stalls in its squares. Each game has its own, worked out without touching the game's dice (js/scenery.js)
- (Assumed: cows, sheep and stalls would stand in a piece's way, so they vanish while a piece is in their field and come back when it leaves; no sound for them)
- 300 test games ended exactly as before. Tests: 186 pass

## 219. No parachutes (v128)

- Steve: the white tree top in the orchard looks poor; remove it. The parachutes are gone

## 220. The train station (v129)

- Steve: a train station level: villages, and everything else tracks, several of them, with joining pieces where they merge. Many trucks interspersed on the tracks, a few signal boxes, signals and other things. The track has no effect on movement. All the items block and are static, like a tank or a café. One or two engines, but mostly carriages and goods wagons, some loaded with coal, wheat and so on
- Each yard field has a track along its north row of areas and one along its south, with slanting pieces joining them, in new places each game. On the tracks, in new places each game: one or two steam engines (the full length of a field), carriages, and goods wagons: closed vans, tanks, and open wagons of coal, wheat or timber. They take two or three areas along their track. Between the tracks: signal boxes, signals, water towers and coal heaps, one area each
- All of them block the view as a tank does and can't be stood on, with a block free beside them for a platoon or a tank. The tracks themselves are open ground: not a road for a tank either. No hedges or wire. The usual pieces on both sides
- (Assumed: "trucks" are railway wagons; "cola" is coal)
- Hedge country plays exactly as before (300 test games). Tests: 188 pass; the browser check, no errors. Balance, 40 games: Train station test American 8% | test German 38%, American computer 57%, unfinished 5% | robots: Americans 20%, Germans 80%, draws 0%, 11.0 rounds

## 221. Signals don't block the view (v130)

- Steve: signals do not block line of sight. A signal still takes its area, but pieces can see and shoot past it

## Sessions

| # | Date | Length | What we did |
|---|------|--------|-------------|
| 1 | 2026-10-30 | about 10.5 hours | Prompts 1–84: rules, command points, reacting, tanks and hedge cutters, the look (pixel art to 3D tabletop), scales, river, villages, wire, six-move aim; one captain, piece menus, hedges stop moves, MG team model; bazooka teams, two-field charges; red targets; who has acted; company level; lining hedges, longer sight, the captain's guidon; one unit a field, no time limit; tracers and shells, greyed out, no activation tokens, Move & shoot hatching; tanks through hedges, charges for all; no plain move; teams and captain with a platoon, no attaching; one piece at a time; charging through friends; range, cover and moving +1 each; words off the target, tanks turn and recoil; rallying; MGs can't move and fire; easier targets; Move & shoot one action; tanks impervious to small arms; more gaps; no charging through houses; MGs fire five; hand to hand shown; sounds; select and move sounds; running and tank sounds; twisty wire, tank boom, a cleaner panel, better running; bigger dice with a tag; louder, more real sounds; distant battle; shells arcing in and explosions; Sherman and Firefly named; dice cleared on the next pick; fire support targets; real recordings; tank HE hits the whole field; 3+ to hit, pinned not stopped, 50/50 wounds; further moves, climbing hedges; click where in the field, cover shown, more orchards; routes shown, why a shot needs what it needs; flush roofs, lines of sight; pieces stay till hit, the captain shoots; mortars and artillery off the board; take cover; captain rallies twice, two pins kill; bazookas and tanks kill, longer reach, tanks as cover, no Break through, wire for tanks only, hopping hedges; who is aiming at whom; blue hatching on the village; moves shown on picking a piece; win by wiping out the Germans, artillery friendly fire; full-screen table, bottom bar; score in a word bubble; no shooting at 7+; longer ranges, a sniper; fire support by clicking the guns; German artillery; rules in two columns, not at the start; nine places in a field, guns lower; the blind bag; guns in the bag, Skip turn; pointed bubble arrows; the token as a coin, three times bigger |
| 2 | 2026-10-31 | about 7 hours | Prompts 85–124: small targets, houses +2, small houses round the square, stop at a wipe-out; shaken token on the base, shaken not pinned; captain's blue rally targets; no river; taking cover halves the dice; no pick-up sound; the timer token; brown German bases, Germans greyed out; no glare, rounds not hours; tokens fly back into the bag; one round per base, the rocket, tanks turn then fire in turn; tanks face the nearest enemy, side by side; no Pass button; hand to hand to the finish; take cover in a word bubble; rally offered after the captain moves; villages and orchards seen only at their edge; a clearer timer token, a matt coin; no crowding in a field, no token sound; German cards and pictures, shaken half moves, sounds back, timer in the middle, bubbles below at the top, bombers; the prompts page; German pick sounds, hops, the timer hovering, louder bombers; moved pieces green for yours, grey for theirs; the guns hop too; the elite token explained, each tank recoils on its own; hand to hand shown blow by blow, tinted only when the move is complete; the timer never first; German tanks back; pieces in a village see out; a German captain; Germans move by your rules, rallies shown; tanks drive men back, captains can die |
| 3 | 2026-11-03 | about 11 hours | Prompts 125–187: rallies always work and are the only cure for shaken; the end waits for the last shot; elite gold band, grey German tanks; a cleaner sand-glass; PaK crew of three that turns to fire; no more ammo; the table lower; the timer checked fair; a longer board with the villages at the back; targets back on reselecting; one tank a unit; tanks drive in curves, no spinning; shaken, never pinned; the villages three fields nearer; only used tokens fly back; no stall at the start; the Germans show their aim; the label top to bottom; taking cover on the tag; the last roll in the corner; the .50 cal; seeing the whole board; orchards; three men a base, camouflage, Fallschirmjäger; a brighter elite ring; the red dice in the corner; German move fields; one cover rule for houses and trees; wire snags tanks; Rangers, round bases; shots and sounds a base; bazooka dice; Elite in the panel; tank armour shown; no hedges round villages and orchards; nine areas a field; sight by areas and hedge thirds; big pieces hide in the middle; the captain's rallies; the Germans take cover; corner to corner sight; tanks block sight; hatching by area; one arrow a label; take cover +2; tank dice; the captain done; menu Skip and Rally; a row of dice per piece shelled; corners of villages and orchards; bubbles clear of other targets; cross-hairs apart; only used tokens fly home; villages seen into at any angle; same village means same field; a tidy-up; Hail Mary; frame rate |
| 4 | 2026-11-05 | about an hour | Prompts 198–199: burning wrecks: flames, smoke, a scorched hull, a wreck that blocks sight and leaves room for a platoon; big screens on small machines |
| 5 | 2026-11-06 | about 6.5 hours | Prompts 200–221: playing as the Germans: the game asks which side at the start and under New game, the American computer attacks, the Germans win by destroying every American piece on the table; the captain's menu kept off his rally targets; the PaK moves within its field, faces out of its square, and can lie in ambush on the same go; a captain in cover can't rally; close range, −1 for every shot, with crossed hatching; the captains' submachine guns, close range only; a 1 always misses; moved colours by army; human or robot for each side, all four variations; shots drawn in order; the PaK round the large village; tank shots sound like the bazooka; a tidy; German guns get their token; more maps and a stone bridge; Paris, barns, a duck pond, reeds and cobbles; tanks go further on the road; cafés and barns of different lengths; things just to look at; the train station |
