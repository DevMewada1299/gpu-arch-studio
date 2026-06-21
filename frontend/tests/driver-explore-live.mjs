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

await page.getByRole('button', { name: 'Explore' }).click();

// Wait for first analysis to populate a card
await page.waitForFunction(() => document.body.innerText.includes('bandwidth isn') || document.body.innerText.includes('latency-tolerant') || document.body.innerText.includes('Compute-bound') || document.body.innerText.includes('Iteration'), { timeout: 30000 }).catch(()=>{});
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/int-3-explore-mid.png' });
const mid = await page.locator('body').innerText();
console.log('Recall banner shown:', /Recalled \d+ relevant/.test(mid));
console.log('Iteration indicator:', (mid.match(/Iteration \d+/)||['none'])[0]);

// Wait for converged
await page.waitForFunction(() => document.body.innerText.includes('Converged') || document.body.innerText.includes('Pareto frontier'), { timeout: 90000 }).catch(()=>{});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/int-4-explore-converged.png' });
const fin = await page.locator('body').innerText();
console.log('Converged shown:', fin.includes('Converged') || fin.includes('Pareto frontier'));
console.log('Pareto frontier line:', (fin.match(/Pareto frontier · \d+ configs/)||['none'])[0]);
console.log('Best experiment present:', /Best experiment:/.test(fin));

console.log('NON-CONTAINER ERRORS:', errors.filter(e => !e.includes('/containers')).join(' | ') || 'none');
await browser.close();
