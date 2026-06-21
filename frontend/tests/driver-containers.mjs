// Drives Step 6: open container dropdown, toggle, verify count + outside-click close.
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

// Default should show "1 Container" (one idle container in mock)
const initialLabel = await page.locator('header button', { hasText: 'Container' }).first().innerText();
console.log('INITIAL LABEL:', initialLabel.replace(/\n/g,' '));

// Open dropdown
await page.locator('header button', { hasText: 'Container' }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/step6-dropdown-open.png' });

// Toggle the busy container on (gpgpu-sim-2)
await page.getByText('gpgpu-sim-2', { exact: true }).click();
await page.waitForTimeout(200);
const afterLabel = await page.locator('header button', { hasText: 'Container' }).first().innerText();
console.log('AFTER TOGGLE LABEL:', afterLabel.replace(/\n/g,' '));
await page.screenshot({ path: '/tmp/step6-both-selected.png' });

// Click outside to close
await page.mouse.click(640, 450);
await page.waitForTimeout(200);
const dropdownVisible = await page.getByText('Parallel Containers').isVisible().catch(() => false);
console.log('DROPDOWN OPEN AFTER OUTSIDE CLICK:', dropdownVisible);

console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
