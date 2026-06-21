// Drives the Explore flow: click Explore, capture mid-stream + final frames.
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

await page.getByRole('button', { name: 'Explore' }).click();
await page.waitForTimeout(2200); // mid-stream: agents thinking
await page.screenshot({ path: '/tmp/step4-streaming.png' });

// Wait for the full pass to finish (4 agents x ~text + proposal)
await page.waitForTimeout(16000);
await page.screenshot({ path: '/tmp/step4-final.png' });

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
