// Confirms business logic is unchanged after the redesign.
import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
const errors = [];
page.on('console', m => { logs.push(m.text()); if (m.type()==='error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Change benchmark to gemm + a config value, then RUN -> should log config+benchmark
await page.getByRole('button', { name: 'gemm', exact: true }).click();
await page.getByRole('button', { name: '60', exact: true }).first().click(); // SM Clusters 60
await page.getByRole('button', { name: 'Run' }).click();
await page.waitForTimeout(200);

// Container selector toggle still works
await page.locator('header button', { hasText: 'Container' }).first().click();
await page.waitForTimeout(200);
await page.getByText('gpgpu-sim-2', { exact: true }).click();
await page.waitForTimeout(150);
const contLabel = await page.locator('header button', { hasText: 'Container' }).first().innerText();
await page.keyboard.press('Escape');
await page.mouse.click(720, 450);

// Explore -> logs EXPLORE with containers, proposal flows back to config
await page.getByRole('button', { name: 'Explore' }).click();
await page.waitForTimeout(19000);

const runLog = logs.find(l => l.startsWith('RUN'));
const exploreLog = logs.find(l => l.startsWith('EXPLORE'));
console.log('RUN log present:', !!runLog, '->', runLog || '');
console.log('EXPLORE log present:', !!exploreLog, '->', exploreLog || '');
console.log('Container label after toggle:', contLabel.replace(/\n/g,' '));

// After explore, config rail should show LRR selected (proposal flowed back)
const lrrSelected = await page.getByRole('button', { name: 'LRR', exact: true }).evaluate(
  el => el.className.includes('bg-white') && el.className.includes('shadow')
);
console.log('Proposal flowed back (LRR active in config):', lrrSelected);
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
