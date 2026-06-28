const { chromium } = require('playwright');
const fs = require('fs');
const TOKEN = process.env.ACCESS_TOKEN;
const BRANCH_ID = process.env.ACTIVE_BRANCH_ID;
const USER_JSON = fs.readFileSync(__dirname + '/user.json', 'utf8');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text().slice(0, 300)); });

  await page.goto('http://localhost:5173');
  await page.evaluate(([token, branchId, userJson]) => {
    localStorage.clear();
    localStorage.setItem('accessToken', token);
    localStorage.setItem('activeBranchId', branchId);
    localStorage.setItem('user', userJson);
  }, [TOKEN, BRANCH_ID, USER_JSON]);

  await page.goto('http://localhost:5173/products');
  await page.waitForTimeout(2000);
  console.log('Products page loaded ok, body length:', (await page.locator('body').innerText()).length);

  await page.goto('http://localhost:5173/purchase-invoice');
  await page.waitForTimeout(2000);
  console.log('Purchase page loaded ok, body length:', (await page.locator('body').innerText()).length);
  await page.screenshot({ path: __dirname + '/isolate-1.png', fullPage: false });

  await browser.close();
})();
