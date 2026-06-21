import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// Open History drawer
await page.getByRole('button', { name: 'History' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/rd-5-drawer.png' });

// Select two completed experiments in the drawer
await page.getByText('exp-001', { exact: true }).click();
await page.getByText('exp-004', { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/rd-6-drawer-selected.png' });

// Open compare
await page.getByRole('button', { name: 'Compare' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/rd-7-compare.png' });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
