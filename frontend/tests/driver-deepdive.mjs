import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

// Main page should still render with new mock shapes (occupancy etc.)
await page.screenshot({ path: '/tmp/dd-1-main.png' });

// Open History drawer
await page.getByRole('button', { name: 'History' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/dd-2-history.png' });

// Click Deep dive on exp-001
await page.getByRole('button', { name: 'Deep dive' }).first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/dd-3-deepdive-top.png' });

// Scroll the deep-dive to capture lower sections
await page.evaluate(() => {
  const scroller = document.querySelector('.max-h-\\[92vh\\]');
  if (scroller) scroller.scrollTop = 520;
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/dd-4-deepdive-mid.png' });

await page.evaluate(() => {
  const scroller = document.querySelector('.max-h-\\[92vh\\]');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
});
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/dd-5-deepdive-bottom.png' });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
