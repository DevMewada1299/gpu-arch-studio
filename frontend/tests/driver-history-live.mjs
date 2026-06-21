import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'History' }).click();
await page.waitForTimeout(800);
const drawer = await page.locator('body').innerText();
// Real exp_ids are 8-hex; count experiment cards
const expIds = [...drawer.matchAll(/\b[0-9a-f]{8}\b/g)].map(m=>m[0]);
console.log('Real exp_ids in history drawer:', [...new Set(expIds)].length, [...new Set(expIds)].slice(0,5));
await page.screenshot({ path: '/tmp/int-5-history.png' });
// open first deep dive
await page.getByRole('button', { name: 'Deep dive' }).first().click();
await page.waitForTimeout(1500);
const modal = await page.locator('h2:has-text("Deep Dive ·")').count();
console.log('Deep Dive modal opened with real exp:', modal>0);
console.log('PAGE ERRORS:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
