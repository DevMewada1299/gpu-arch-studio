import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/int-1-initial.png' });

// ── Manual run flow ──
await page.getByRole('button', { name: 'New Configuration' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Run Experiment' }).click();
// Wait for the run toast to reach "complete"
await page.waitForSelector('text=/Run complete/', { timeout: 40000 });
const toast = await page.locator('text=/Run complete/').innerText();
console.log('RUN TOAST:', toast.replace(/\s+/g,' ').trim());
await page.waitForTimeout(800);
// Read the dashboard IPC (should be real ~315, not mock 389)
const ipc = await page.locator('main').innerText();
const ipcMatch = ipc.match(/IPC[\s\S]{0,40}?(\d+\.\d+)/);
console.log('Dashboard IPC after run:', ipcMatch ? ipcMatch[1] : 'not found');
await page.screenshot({ path: '/tmp/int-2-after-run.png' });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
