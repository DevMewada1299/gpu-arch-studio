import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Explore' }).click();
await page.waitForTimeout(19000);
// Scroll the agent panel (right aside) to the bottom to reveal Orchestrator
await page.evaluate(() => {
  const asides = document.querySelectorAll('aside');
  const right = asides[asides.length - 1];
  right.scrollTop = right.scrollHeight;
});
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/step4-orchestrator.png', clip: { x: 978, y: 56, width: 302, height: 844 } });
await browser.close();
console.log('done');
