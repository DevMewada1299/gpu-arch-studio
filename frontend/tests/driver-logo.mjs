import { createRequire } from 'module';
const require = createRequire('/Users/skanda/.npm/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
// Inspect the logo mark box: does it contain an <svg>?
const info = await page.evaluate(() => {
  const header = document.querySelector('header');
  const firstBox = header?.querySelector('div'); // logo wrapper
  const svg = header?.querySelector('svg');
  return {
    logoBoxClass: firstBox?.className || null,
    svgPresent: !!svg,
    svgTag: svg ? svg.outerHTML.slice(0, 120) : null,
    svgRect: svg ? svg.getBoundingClientRect() : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/logo-header.png', clip: { x: 0, y: 0, width: 520, height: 72 } });
await browser.close();
