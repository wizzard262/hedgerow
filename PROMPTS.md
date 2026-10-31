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

## Sessions

| # | Date | Length | What we did |
|---|------|--------|-------------|
| 1 | 2026-10-30 | about 10.5 hours | Prompts 1–64: rules, command points, reacting, tanks and hedge cutters, the look (pixel art to 3D tabletop), scales, river, villages, wire, six-move aim; one captain, piece menus, hedges stop moves, MG team model; bazooka teams, two-field charges; red targets; who has acted; company level; lining hedges, longer sight, the captain's guidon; one unit a field, no time limit; tracers and shells, greyed out, no activation tokens, Move & shoot hatching; tanks through hedges, charges for all; no plain move; teams and captain with a platoon, no attaching; one piece at a time; charging through friends; range, cover and moving +1 each; words off the target, tanks turn and recoil; rallying; MGs can't move and fire; easier targets; Move & shoot one action; tanks impervious to small arms; more gaps; no charging through houses; MGs fire five; hand to hand shown; sounds; select and move sounds; running and tank sounds; twisty wire, tank boom, a cleaner panel, better running; bigger dice with a tag; louder, more real sounds; distant battle; shells arcing in and explosions; Sherman and Firefly named; dice cleared on the next pick; fire support targets; real recordings; tank HE hits the whole field; 3+ to hit, pinned not stopped, 50/50 wounds; further moves, climbing hedges; click where in the field, cover shown, more orchards; routes shown, why a shot needs what it needs; flush roofs, lines of sight; pieces stay till hit, the captain shoots; mortars and artillery off the board; take cover; captain rallies twice, two pins kill; bazookas and tanks kill, longer reach, tanks as cover, no Break through, wire for tanks only, hopping hedges; who is aiming at whom; blue hatching on the village |
