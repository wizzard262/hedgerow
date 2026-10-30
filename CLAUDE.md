# Hedgerow

Local repo `C:\DEV\Repositories\GitHub\hedgerow` (not on GitHub yet: ask Steve before creating the repo or pushing). A browser game: July 1944, an American battalion fights through the Normandy bocage to take a village in six moves. Shown as a wargame table in 3D (three.js): flocked mat, foam hedges, a river with bridges, villages, painted miniatures and model tanks, dice for every shot.

- After every prompt about the game, add a short summary of it to [PROMPTS.md](PROMPTS.md), with any assumptions made
- At the end of each session, record its length in the **Sessions** table at the bottom of PROMPTS.md (keep that table last)
- After each change to the game, save a numbered screenshot in `screenshots/` (`06-short-name.png`, …), taken in a visible browser, then add it to `screenshots/list.json`
  - Serve the game with `python -m http.server 8768` in this folder, then `node tools/shot.js <name> [hours to play]`. It borrows Playwright from `..\harrier-carrier-playwright-tests`
- Run `node tools/test.js` before every commit (headless checks of the rules)
- After a rules change, run `node tools/sweep.js ""` (150 games with a simple attacking bot): the bot should win roughly 25–60% (a person plays better than it) and doing nothing never
- Plain JavaScript, classic scripts loaded in order (no modules); three.js r128 from cdnjs
  - `js/data.js` the map and every number to tune; `js/sim.js` the rules (no DOM); `js/models.js` the 3D models; `js/board3d.js` the table, camera and picking; `js/ui.js` the left-hand panel; `js/main.js` start-up, input and the German hour
- The version number (`#ver` in `index.html`) goes up by 1 with every commit to the game: `git rev-list --count HEAD` + 1. Put the same number on every script link (`js/ui.js?v=2`)
- Scales on the table (Steve): men 1:54, tanks 1:76, houses 1:144; four men to a platoon base, three platoons move together as a company, tanks in pairs; loose formations that shuffle when they move. Whole board on the table, one fixed slanted camera, no fog of war
