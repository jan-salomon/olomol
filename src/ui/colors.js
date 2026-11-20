// Colours beyond the palette: the ones used last (remembered in this
// browser), a larger choice by hue and lightness, and colours typed as text.

// One list for colours (atoms, bonds, arrows, text) and one for
// highlights and ring fills, which are light.
const RECENT_KEYS = { paint: 'olomol-colors', highlight: 'olomol-highlights' };
const RECENT = 8;

const recent = {};

// The colours picked last for `list` ('paint' or 'highlight'), newest first (#rrggbb).
export function recentColors(list = 'paint') {
  if (!recent[list]) {
    try {
      recent[list] = JSON.parse(localStorage.getItem(RECENT_KEYS[list]) ?? '[]').filter((c) => /^#[0-9a-f]{6}$/.test(c));
    } catch {
      recent[list] = [];
    }
  }
  return recent[list];
}

export function rememberColor(color, list = 'paint') {
  if (!color) return;
  recent[list] = [color, ...recentColors(list).filter((c) => c !== color)].slice(0, RECENT);
  try {
    localStorage.setItem(RECENT_KEYS[list], JSON.stringify(recent[list]));
  } catch {
    // private window: remembered until the page is closed
  }
}

// A colour typed as text (#c05, c05, #cc0055, rgb(204, 0, 85), teal) as
// #rrggbb, or null if it isn't one.
export function parseColor(text) {
  const s = text.trim().toLowerCase();
  if (/^#?[0-9a-f]{3}$/.test(s)) return `#${[...s.replace('#', '')].map((c) => c + c).join('')}`;
  if (/^#?[0-9a-f]{6}$/.test(s)) return `#${s.replace('#', '')}`;
  if (!s || typeof CSS === 'undefined' || !CSS.supports('color', s)) return null;
  // the browser's own reading of it (names, rgb(), hsl()), through a canvas
  const context = document.createElement('canvas').getContext('2d');
  context.fillStyle = '#000000';
  context.fillStyle = s;
  return /^#[0-9a-f]{6}$/.test(context.fillStyle) ? context.fillStyle : null;
}

// #rrggbb of a hue (degrees), saturation and lightness (0–1).
function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[0, 8, 4].map((n) => channel(n).toString(16).padStart(2, '0')).join('')}`;
}

// The larger choice, by list: rows from dark to light, twelve hues each,
// and greys; for highlights and ring fills only pastels, light enough for
// black bonds and labels on top.
export const COLOR_GRIDS = {
  paint: [
    ...[0.25, 0.35, 0.45, 0.6, 0.78].map((l) => Array.from({ length: 12 }, (_, k) => hsl(k * 30, l > 0.7 ? 0.75 : 0.85, l))),
    Array.from({ length: 12 }, (_, k) => hsl(0, 0, k / 11)),
  ],
  highlight: [
    ...[[0.95, 0.9], [0.9, 0.85], [0.85, 0.8], [0.8, 0.7]].map(([l, s]) => Array.from({ length: 12 }, (_, k) => hsl(k * 30, s, l))),
    Array.from({ length: 12 }, (_, k) => hsl(0, 0, 0.98 - k * 0.02)),
  ],
};
