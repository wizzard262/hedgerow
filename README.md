# Hedgerow

**Play it:** https://wizzard262.github.io/hedgerow/

Normandy, 11 July 1944. Your American rifle company fights through the bocage, field by field, to take a village and hold it, or to destroy every German on the field. It is a 3D tabletop wargame in the browser, made with Claude Code.

- **Human or robot, each side**: the game starts by asking who commands the Americans and who the Germans: play either side against the computer, two players on one screen, or watch two robots. As the Germans you win by destroying every American piece on the table
- **A campaign of eight battles**, in order across France in summer 1944, each with its picture and date; play any of them: Beach landing (landing craft in a moving sea, four fields of wrecked sand, tank traps, and U-shaped concrete bunkers that are hard from the front and easy from the sides), Deep bocage, Hedge country, Open farmland, River crossing, Crossroads town, Train station (a railway yard full of engines, carriages and goods wagons) and Paris (a new maze of cobbled streets each game, and the Eiffel Tower to capture). Most change the pieces, guns or bomber runs as well as the ground
- **Two bonus battles**, top right of the New game choice, outside the campaign: Dunkirk, 1940 (coming soon) and Stalingrad (TBC). They can't be played yet
- **The blind bag**: each round, a token for every piece goes in a bag (the tokens used last round fly back in off the pieces they activated; the ones never drawn stay in), plus one black timer token. Draw one at a time: on yours, pick a piece and give it its move; on theirs, a German piece moves; the timer ends the round at once
- **Your company**: three rifle platoons, the captain, machine-gun, bazooka and sniper teams, Sherman 75mm and 76mm tanks, with mortars and artillery off the board. Against Fallschirmjäger, MG 42s, a PaK 40, Panzer IVs, Panthers and their own guns
- **Charge, Move & shoot, Shoot, Rally**: pick a piece and where it can go shows at once. Each field is nine areas: click the area it should stand in, a corner, an edge (lining that hedge) or the middle; big pieces (tanks, platoons) take a 2×2 block in a corner
- **Dice on the table**: 3+ to hit, one more for cover, a small target, long range, moving or being shaken; two more in houses. Every hit shakes; a hit on a shaken piece kills
- **No crowding**: a tank stands alone; a field holds one platoon and two smaller pieces, or four smaller pieces
- **Hedges** slow men (they climb over) and block the view; tanks drive through them. Only tanks get through barbed wire
- **Take cover**: a piece fired on can get down (+2 to hit it), at the cost of its move
- **Hand to hand**: a charge into the enemy is a fight to the finish, blow for blow, attacker first
- The game ends the moment one side has nothing left
- Sound effects: real recordings (CC0 and public domain, see `assets/audio/CREDITS.md`) and sounds made in the browser

## Run it yourself

Serve the folder and open it in a browser with WebGL:

```
python -m http.server 8768
```

Then go to http://localhost:8768/. Tests: `node tools/test.js`. The full design history is in `PROMPTS.md`, also shown in the game as a page (the Prompts link beside the version).
