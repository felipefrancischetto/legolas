const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1410, height: 900 },
    deviceScaleFactor: 2,
  });
  const file = 'file://' + path.resolve(__dirname, 'biblioteca-pro.html');
  await page.goto(file, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.resolve(__dirname, 'biblioteca-pro.png'),
    fullPage: true,
  });
  await browser.close();
  console.log('OK');
})();
