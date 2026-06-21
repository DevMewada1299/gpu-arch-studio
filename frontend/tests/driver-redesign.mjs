import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// 1. Default (idle) state
await page.screenshot({ path: '/tmp/rd-1-default.png' });

// 2. Expand Memory config section
await page.getByText('Memory', { exact: true }).first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/rd-2-config.png', clip: { x: 0, y: 64, width: 320, height: 836 } });

// 3. Start explore, capture mid-stream
await page.getByRole('button', { name: 'Explore' }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/rd-3-streaming.png' });

// 4. Let it finish
await page.waitForTimeout(16000);
await page.screenshot({ path: '/tmp/rd-4-complete.png' });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
