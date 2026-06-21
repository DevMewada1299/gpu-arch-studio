// Ad-hoc UI driver for manual verification. Drives the running dev server
// with Playwright and captures screenshots + console errors.
import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const out = process.argv[2] || '/tmp/screen.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200); // let recharts animate in
await page.screenshot({ path: out });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
