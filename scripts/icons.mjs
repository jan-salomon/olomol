// Renders the app icon (public/icons/icon.svg) as the PNG files the app
// manifest and phones want. Run once after changing the icon:
//   node scripts/icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const square = svg.replace(/(<rect[^>]*) rx="\d+"/, '$1 rx="0"'); // maskable, and for iOS (which rounds the corners itself)
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
const page = await browser.newPage();
for (const [file, size, picture] of [['icon-192.png', 192, svg], ['icon-512.png', 512, svg], ['maskable-512.png', 512, square], ['apple-touch-icon.png', 180, square]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${picture.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.locator('svg').screenshot({ path: `public/icons/${file}`, omitBackground: true });
  console.log(`public/icons/${file}`);
}
await browser.close();
