import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Explore' }).click();
// Run to completion
await page.waitForTimeout(19000);
// Full frame
await page.screenshot({ path: '/tmp/step4-final-full.png' });
// Clip just the right agent panel (x ~980..1280)
await page.screenshot({ path: '/tmp/step4-agentpanel.png', clip: { x: 978, y: 56, width: 302, height: 844 } });
// Clip the left config panel to verify the proposal flowed back
await page.screenshot({ path: '/tmp/step4-configpanel.png', clip: { x: 0, y: 56, width: 264, height: 844 } });
await browser.close();
console.log('done');
