// Makes the picture of each battle for the opening dialog, in assets/maps: node tools/map-pictures.js
// Needs the game served at http://localhost:8768/ (python -m http.server 8768). A visible browser, one seed for each map
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'harrier-carrier-playwright-tests', 'node_modules', 'playwright'));
const SEEDS = { beach: 4, deep: 3, hedges: 5, farmland: 5, river: 3, town: 7, station: 6, paris: 8 };
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 25 });
  const page = await browser.newPage({ viewport: { width: 800, height: 560 } });
  await page.goto('http://localhost:8768/');
  await page.waitForTimeout(800);
  await page.click('#start-game');
  await page.waitForTimeout(400);
  for (const id of Object.keys(SEEDS)) {
    await page.evaluate(([seed, map]) => Game.restart(seed, 'none', map), [SEEDS[id], id]);
    // Pieces and scenery down, before the first tokens fly
    await page.waitForTimeout(420);
    const box = await page.evaluate(() => { const r = document.querySelector('#board').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
    await page.screenshot({ path: path.join(__dirname, '..', 'assets', 'maps', id + '.jpg'), type: 'jpeg', quality: 72, clip: box });
    console.log(id);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
