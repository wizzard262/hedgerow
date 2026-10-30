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

## Sessions

| # | Date | Length | What we did |
|---|------|--------|-------------|
| 1 | 2026-10-30 | about 7 hours | Prompts 1–21: rules, command points, reacting, tanks and hedge cutters, the look (pixel art to 3D tabletop), scales, river, villages, wire, six-move aim; one captain, piece menus, hedges stop moves, MG team model; bazooka teams, two-field charges; red targets; who has acted; company level; lining hedges, longer sight, the captain's guidon; one unit a field, no time limit; tracers and shells, greyed out, no activation tokens, Move & shoot hatching; tanks through hedges, charges for all; no plain move |
