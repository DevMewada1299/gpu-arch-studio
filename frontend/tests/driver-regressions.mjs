import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// Header — verify full text present in DOM
const h1text = (await page.locator('header h1').innerText()).replace(/\s+/g,' ').trim();
console.log('HEADER TEXT:', JSON.stringify(h1text));
await page.screenshot({ path: '/tmp/rg-1-header.png', clip: { x: 0, y: 0, width: 460, height: 64 } });

// Expand Memory so every selector is visible
await page.getByText('Memory', { exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/rg-2-config.png', clip: { x: 0, y: 64, width: 340, height: 916 } });

// Check for horizontal overflow in any segmented grid
const overflow = await page.evaluate(() => {
  const grids = [...document.querySelectorAll('aside .grid')];
  return grids.map(g => ({ scrollW: g.scrollWidth, clientW: g.clientWidth }))
              .filter(d => d.scrollW > d.clientW + 1);
});
console.log('Overflowing grids:', overflow.length, JSON.stringify(overflow));

// Open Other on Benchmark (first Other) to confirm input + no overflow
await page.getByRole('button', { name: 'Other', exact: true }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/rg-3-benchmark-other.png', clip: { x: 0, y: 64, width: 340, height: 240 } });

// Narrow viewport responsiveness check for header
await page.setViewportSize({ width: 900, height: 800 });
await page.waitForTimeout(300);
const h1narrow = (await page.locator('header h1').innerText()).replace(/\s+/g,' ').trim();
console.log('HEADER @900px:', JSON.stringify(h1narrow));
await page.screenshot({ path: '/tmp/rg-4-header-narrow.png', clip: { x: 0, y: 0, width: 460, height: 64 } });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
