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

// Header brand
const h1 = (await page.locator('header h1').innerText()).replace(/\s+/g,' ').trim();
console.log('HEADER:', JSON.stringify(h1));
await page.screenshot({ path: '/tmp/rs-1-header.png', clip: { x: 0, y: 0, width: 520, height: 64 } });

// Expand Memory so all selectors visible
await page.getByText('Memory', { exact: true }).first().click();
await page.waitForTimeout(300);

// Helper: report any wrapped/overflowing seg rows
async function checkRows(label) {
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('aside .seg-row')];
    return rows.map(row => {
      const top0 = row.children[0]?.getBoundingClientRect().top;
      // wrapped if any child sits on a different row (top differs)
      const wrapped = [...row.children].some(c => Math.abs(c.getBoundingClientRect().top - top0) > 1);
      return { wrapped, overflow: row.scrollWidth > row.clientWidth + 1, n: row.children.length };
    });
  });
  const wrapped = r.filter(x => x.wrapped).length;
  const overflow = r.filter(x => x.overflow).length;
  console.log(`[${label}] rows=${r.length} wrapped=${wrapped} overflow=${overflow}`);
  return { wrapped, overflow };
}

// Default width (380)
await checkRows('default-380');
await page.screenshot({ path: '/tmp/rs-2-config-default.png', clip: { x: 0, y: 64, width: 400, height: 560 } });

// Drag the resize handle to NARROW (~300)
const handle = page.locator('div[role="separator"]');
const box = await handle.boundingBox();
await page.mouse.move(box.x + 3, box.y + 200);
await page.mouse.down();
await page.mouse.move(300, box.y + 200, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const asideW1 = await page.evaluate(() => document.querySelector('aside').getBoundingClientRect().width);
console.log('After drag narrow, aside width =', Math.round(asideW1));
await checkRows('narrow-300');
await page.screenshot({ path: '/tmp/rs-3-config-narrow.png', clip: { x: 0, y: 64, width: 360, height: 560 } });

// Drag to WIDE (~520)
const box2 = await handle.boundingBox();
await page.mouse.move(box2.x + 3, box2.y + 200);
await page.mouse.down();
await page.mouse.move(520, box2.y + 200, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);
const asideW2 = await page.evaluate(() => document.querySelector('aside').getBoundingClientRect().width);
console.log('After drag wide, aside width =', Math.round(asideW2));
await checkRows('wide-520');
await page.screenshot({ path: '/tmp/rs-4-config-wide.png', clip: { x: 0, y: 64, width: 560, height: 560 } });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
