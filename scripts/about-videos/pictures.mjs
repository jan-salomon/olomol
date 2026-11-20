// The about page's two pictures (public/about/app.webp, help.webp), at 1440 × 820 as the page shows them:
// the window with Help's Friedel–Crafts example opened as a drawing, and Help itself with that example and
// the tip of its first curved arrow.   OLOMOL_URL=http://localhost:5179/ node pictures.mjs <out dir>
// (PNGs; as WebP for the page: python3 -c "from PIL import Image; Image.open('app.png').save('app.webp', quality=82, method=6)")
import { chromium } from 'playwright';
import { APP } from './lib.mjs';
const [out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 820 }, locale: 'en-GB', colorScheme: 'light' });
const address = new URL(APP);
address.searchParams.set('test', '');
address.searchParams.set('lang', 'en');
await page.goto(address.href);
await page.waitForFunction(() => window.olomolTest);
await page.addStyleTag({ content: '.empty-hint { display: none !important; }' });
await page.getByTestId('help').click();
await page.locator('.examples-window').getByText('Friedel–Crafts acylation', { exact: false }).first().click();
await page.waitForTimeout(1200);
// the tip of its first curved arrow (benzene's, to the acylium ion): the pointer along it until Help names it
const drawing = await page.evaluate(() => {
  const svg = [...document.querySelectorAll('.examples-window svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
  const r = svg.getBoundingClientRect();
  return [r.x, r.y, r.width, r.height];
});
let found = false;
for (let fy = 0.08; fy < 0.6 && !found; fy += 0.02) {
  for (let fx = 0.05; fx < 0.4 && !found; fx += 0.01) {
    await page.mouse.move(drawing[0] + fx * drawing[2], drawing[1] + fy * drawing[3]);
    found = await page.locator('.examples-window').getByText('Curved arrow (A)', { exact: false }).first().isVisible().catch(() => false);
  }
}
if (!found) console.log('no curved arrow found to point at');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/help.png` });
// opened as a drawing, fitted, nothing selected, the pointer away
await page.getByTestId('example-open').click();
await page.waitForTimeout(800);
await page.evaluate(() => { olomol.clearSelection(); olomol.setTool({ name: 'select' }); });
await page.mouse.move(1430, 600);
await page.waitForTimeout(4500); // (the "is your drawing now" notice gone)
await page.screenshot({ path: `${out}/app.png` });
await browser.close();
