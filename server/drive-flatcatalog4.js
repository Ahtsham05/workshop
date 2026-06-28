const { chromium } = require('playwright');
const fs = require('fs');
const TOKEN = process.env.ACCESS_TOKEN;
const BRANCH_ID = process.env.ACTIVE_BRANCH_ID;
const USER_JSON = fs.readFileSync(__dirname + '/user.json', 'utf8');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  page.on('response', async (res) => {
    if (res.url().includes('/variants')) {
      console.log('VARIANTS RESP:', res.status(), (await res.text()).slice(0, 400));
    }
  });

  await page.goto('http://localhost:5173');
  await page.evaluate(([token, branchId, userJson]) => {
    localStorage.clear();
    localStorage.setItem('accessToken', token);
    localStorage.setItem('activeBranchId', branchId);
    localStorage.setItem('user', userJson);
  }, [TOKEN, BRANCH_ID, USER_JSON]);

  await page.goto('http://localhost:5173/purchase-invoice');
  await page.waitForTimeout(3000);

  await page.locator('text=Select supplier').first().click();
  await page.waitForTimeout(500);
  await page.locator('[role="option"], [cmdk-item]').first().click();
  await page.waitForTimeout(500);

  await page.locator('text=Select Product').first().click();
  await page.waitForTimeout(500);
  await page.keyboard.type('Toshiba');
  await page.waitForTimeout(1200);
  await page.locator('text=Toshiba — 12').first().click();
  await page.waitForTimeout(2500);

  const itemRow = page.locator('text=Toshiba — 12').locator('xpath=ancestor::div[contains(@class,"rounded-xl")]').first();
  const box = await itemRow.boundingBox();
  await page.screenshot({ path: __dirname + '/flat-7-itemrow.png', clip: { x: box.x, y: box.y, width: Math.min(box.width, 900), height: box.height + 80 } });

  await browser.close();
})();
