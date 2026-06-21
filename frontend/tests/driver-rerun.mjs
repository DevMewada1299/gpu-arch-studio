// Verify Explore works after refactor + re-running resets the panel cleanly.
import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// First explore — let it complete
await page.getByRole('button', { name: 'Explore' }).click();
await page.waitForTimeout(19000);
const firstText = await page.locator('aside').last().innerText();
console.log('FIRST PASS has Orchestrator proposal:', firstText.includes('PROPOSED NEXT CONFIG'));

// Re-run Explore — panel should reset (Memory back to thinking/empty briefly)
await page.getByRole('button', { name: 'Explore' }).click();
await page.waitForTimeout(1500);
const midText = await page.locator('aside').last().innerText();
console.log('AFTER RERUN proposal cleared mid-stream:', !midText.includes('PROPOSED NEXT CONFIG'));
console.log('AFTER RERUN in-progress shown:', midText.includes('exploration in progress'));

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
