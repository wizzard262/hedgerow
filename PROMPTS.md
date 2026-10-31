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

## Sessions

| # | Date | Length | What we did |
|---|------|--------|-------------|
| 1 | 2026-10-30 | about 10.5 hours | Prompts 1–84: rules, command points, reacting, tanks and hedge cutters, the look (pixel art to 3D tabletop), scales, river, villages, wire, six-move aim; one captain, piece menus, hedges stop moves, MG team model; bazooka teams, two-field charges; red targets; who has acted; company level; lining hedges, longer sight, the captain's guidon; one unit a field, no time limit; tracers and shells, greyed out, no activation tokens, Move & shoot hatching; tanks through hedges, charges for all; no plain move; teams and captain with a platoon, no attaching; one piece at a time; charging through friends; range, cover and moving +1 each; words off the target, tanks turn and recoil; rallying; MGs can't move and fire; easier targets; Move & shoot one action; tanks impervious to small arms; more gaps; no charging through houses; MGs fire five; hand to hand shown; sounds; select and move sounds; running and tank sounds; twisty wire, tank boom, a cleaner panel, better running; bigger dice with a tag; louder, more real sounds; distant battle; shells arcing in and explosions; Sherman and Firefly named; dice cleared on the next pick; fire support targets; real recordings; tank HE hits the whole field; 3+ to hit, pinned not stopped, 50/50 wounds; further moves, climbing hedges; click where in the field, cover shown, more orchards; routes shown, why a shot needs what it needs; flush roofs, lines of sight; pieces stay till hit, the captain shoots; mortars and artillery off the board; take cover; captain rallies twice, two pins kill; bazookas and tanks kill, longer reach, tanks as cover, no Break through, wire for tanks only, hopping hedges; who is aiming at whom; blue hatching on the village; moves shown on picking a piece; win by wiping out the Germans, artillery friendly fire; full-screen table, bottom bar; score in a word bubble; no shooting at 7+; longer ranges, a sniper; fire support by clicking the guns; German artillery; rules in two columns, not at the start; nine places in a field, guns lower; the blind bag; guns in the bag, Skip turn; pointed bubble arrows; the token as a coin, three times bigger |
| 2 | 2026-10-31 | about 6 hours | Prompts 85–118: small targets, houses +2, small houses round the square, stop at a wipe-out; shaken token on the base, shaken not pinned; captain's blue rally targets; no river; taking cover halves the dice; no pick-up sound; the timer token; brown German bases, Germans greyed out; no glare, rounds not hours; tokens fly back into the bag; one round per base, the rocket, tanks turn then fire in turn; tanks face the nearest enemy, side by side; no Pass button; hand to hand to the finish; take cover in a word bubble; rally offered after the captain moves; villages and orchards seen only at their edge; a clearer timer token, a matt coin; no crowding in a field, no token sound; German cards and pictures, shaken half moves, sounds back, timer in the middle, bubbles below at the top, bombers; the prompts page; German pick sounds, hops, the timer hovering, louder bombers; moved pieces green for yours, grey for theirs; the guns hop too; the elite token explained, each tank recoils on its own; hand to hand shown blow by blow, tinted only when the move is complete; the timer never first; German tanks back |
