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

## Sessions

| # | Date | Length | What we did |
|---|------|--------|-------------|
| 1 | 2026-10-30 | about 4 hours | Prompts 1–6: rules, command points, reacting, tanks and hedge cutters, the look (pixel art to 3D tabletop), scales, river, villages, wire, six-move aim |
