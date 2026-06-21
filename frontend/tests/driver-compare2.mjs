import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByText('exp-001', { exact: true }).click();
await page.getByText('exp-004', { exact: true }).click();
await page.getByRole('button', { name: 'Compare →' }).click();
await page.waitForTimeout(600);
// Scroll modal to bottom to reveal the Orchestrator delta analysis
await page.evaluate(() => {
  const scroller = document.querySelector('.max-h-\\[88vh\\]');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/step5-delta-analysis.png' });
await browser.close();
console.log('done');
