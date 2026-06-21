// Drives Step 5: select two history rows, open the compare modal.
import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Click two completed rows (exp-001 baseline and exp-004 best)
await page.getByText('exp-001', { exact: true }).click();
await page.getByText('exp-004', { exact: true }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/step5-selected.png' });

// Try clicking a running row — should NOT select
await page.getByText('exp-005', { exact: true }).click();
await page.waitForTimeout(200);

// Open compare
await page.getByRole('button', { name: 'Compare →' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/step5-compare-modal.png' });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
