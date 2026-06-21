import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

// 1. Home: two heroes side by side + top summary
await page.screenshot({ path: '/tmp/hl-1-home.png' });

// sanity: no permanent sidebar (no Configuration heading visible on home except in drawer)
const homeHasConfigHeading = await page.locator('main h2:has-text("Configuration")').count();
console.log('Permanent Configuration heading on home (should be 0):', homeHasConfigHeading);

// 2. Open Config left drawer
await page.getByRole('button', { name: 'New Configuration' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/hl-2-config-drawer.png' });
const runBtn = await page.getByRole('button', { name: 'Run Experiment' }).count();
console.log('Run Experiment button present:', runBtn);

// 3. Click Run Experiment -> should log run + close drawer
await page.getByRole('button', { name: 'Run Experiment' }).click();
await page.waitForTimeout(400);
const drawerClosed = (await page.getByRole('button', { name: 'Run Experiment' }).count()) === 0;
console.log('Config drawer closed after Run:', drawerClosed);

// 4. History still works + Deep dive modal still opens from History
await page.getByRole('button', { name: 'History' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Deep dive' }).first().click();
await page.waitForTimeout(700);
const modal = await page.locator('h2:has-text("Deep Dive ·")').count();
console.log('History Deep Dive modal opened (header "Deep Dive ·"):', modal);
await page.screenshot({ path: '/tmp/hl-3-history-deepdive-modal.png' });

console.log('LOGS_RUN:', (await page.evaluate(() => 'n/a')));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
