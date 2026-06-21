import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// Header close-up
await page.screenshot({ path: '/tmp/of-1-header.png', clip: { x: 0, y: 0, width: 520, height: 64 } });

// Expand Memory so all sections show Other pills
await page.getByText('Memory', { exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/of-2-config.png', clip: { x: 0, y: 64, width: 340, height: 916 } });

// Click "Other" on the first field (SM Clusters is the first numeric; there are several "Other")
// Target SM Clusters: find the field by label then its Other button.
const others = page.getByRole('button', { name: 'Other', exact: true });
const count = await others.count();
console.log('Other pills found:', count);

// Click the SM Clusters Other (2nd Other overall: 1st is Benchmark). Click index 1.
await others.nth(1).click();
await page.waitForTimeout(300);
// Type a custom value into the revealed input
const input = page.locator('input[placeholder="Custom value"]').first();
await input.fill('99');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/of-3-custom.png', clip: { x: 0, y: 64, width: 340, height: 520 } });

// Read SM Clusters value back via the title? Instead verify input holds 99
const val = await input.inputValue();
console.log('Custom SM Clusters input value:', val);

// Now click a predefined option (30) to confirm it reverts/selects normally
await page.getByRole('button', { name: '30', exact: true }).first().click();
await page.waitForTimeout(300);
const stillOpen = await page.locator('input[placeholder="Custom value"]').count();
console.log('Custom input still open after picking predefined 30:', stillOpen > 0 ? 'yes(some field)' : 'no');

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
