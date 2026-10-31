// Takes a screenshot of the game in a visible browser: node tools/shot.js <name> [hours to play] [width] [height]
// Needs the game served at http://localhost:8768/ (python -m http.server 8768)
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'harrier-carrier-playwright-tests', 'node_modules', 'playwright'));
(async () => {
  const [name = 'test', hours = '0', width = '1600', height = '950'] = process.argv.slice(2);
  const browser = await chromium.launch({ headless: false, slowMo: 40 });
  const page = await browser.newPage({ viewport: { width: +width, height: +height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8768/');
  await page.waitForTimeout(2500);
  await page.click('#help [data-close]');
  // Each hour: end it, answering every "take cover?" with Stand fast
  for (let h = 0; h < +hours; h++) {
    await page.click('#end');
    for (let k = 0; k < 40; k++) {
      await page.waitForTimeout(400);
      if (await page.isVisible('#ask')) await page.click('#ask-stay');
      else if (!(await page.evaluate(() => !!Game.state.de))) break;
    }
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
