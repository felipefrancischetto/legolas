const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1410, height: 820 },
    deviceScaleFactor: 2,
  });
  const file = 'file://' + path.resolve(__dirname, 'biblioteca-melhorada.html');
  await page.goto(file, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600); // let fonts settle
  await page.screenshot({
    path: path.resolve(__dirname, 'biblioteca-melhorada.png'),
    fullPage: true,
  });
  await browser.close();
  console.log('OK');
})();
