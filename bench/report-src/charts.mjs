// Charts as inline SVG, written here (no chart library): grouped bars and
// lines with confidence bands. Colours stay readable on light and dark pages.
import { esc } from './html.mjs';

// the categorical order validated by the dataviz method (its reference palette, light surface); series take them in this order
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];

// Grouped bars: categories along x, one bar per series in each group. values 0…max.
export function barChart({ categories, series, max = null, yLabel = '', width = 760, height = 260, percent = false }) {
  const left = 46, right = 10, top = 26, bottom = 54;
  const top0 = max ?? Math.max(1e-9, ...series.flatMap((s) => s.values.filter((v) => v !== null)));
  const plotW = width - left - right, plotH = height - top - bottom;
  const groupW = plotW / categories.length;
  const barW = Math.min(26, (groupW * 0.8) / series.length);
  const y = (v) => top + plotH - (v / top0) * plotH;
  const ticks = 5;
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`;
  for (let i = 0; i <= ticks; i++) {
    const v = (top0 * i) / ticks;
    svg += `<line class="gridline" x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 5}" y="${y(v) + 4}" text-anchor="end">${percent ? `${Math.round(v * 100)}%` : +v.toFixed(2)}</text>`;
  }
  categories.forEach((cat, g) => {
    const x0 = left + g * groupW + (groupW - barW * series.length) / 2;
    series.forEach((s, k) => {
      const v = s.values[g];
      if (v === null || v === undefined) return;
      svg += `<rect x="${x0 + k * barW}" y="${y(v)}" width="${barW - 2}" height="${top + plotH - y(v)}" fill="${s.color ?? PALETTE[k % PALETTE.length]}"><title>${esc(s.name)} · ${esc(cat)}: ${percent ? `${(v * 100).toFixed(1)} %` : v}</title></rect>`;
    });
    const words = String(cat).split(/(?<=,) | (?=\()/);
    words.forEach((w, i) => { svg += `<text x="${left + g * groupW + groupW / 2}" y="${top + plotH + 14 + i * 12}" text-anchor="middle">${esc(w)}</text>`; });
  });
  svg += `<line class="axis" x1="${left}" x2="${left}" y1="${top}" y2="${top + plotH}"/><line class="axis" x1="${left}" x2="${width - right}" y1="${top + plotH}" y2="${top + plotH}"/>`;
  if (yLabel) svg += `<text x="${left}" y="12">${esc(yLabel)}</text>`;
  let lx = left + 120;
  series.forEach((s, k) => {
    svg += `<rect x="${lx}" y="4" width="10" height="10" fill="${s.color ?? PALETTE[k % PALETTE.length]}"/><text x="${lx + 14}" y="13">${esc(s.name)}</text>`;
    lx += 24 + 7 * s.name.length;
  });
  return `${svg}</svg>`;
}

// Lines with 95 % bands: series [{ name, points: [{ x, y, lo, hi }] }], y 0…1.
export function lineChart({ series, xLabel = '', yLabel = '', width = 560, height = 280, yMax = 1, percent = true }) {
  const left = 46, right = 14, top = 26, bottom = 40;
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const plotW = width - left - right, plotH = height - top - bottom;
  const X = (v) => left + ((v - x0) / (x1 - x0 || 1)) * plotW;
  const Y = (v) => top + plotH - (v / yMax) * plotH;
  let svg = `<svg class="chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`;
  for (let i = 0; i <= 5; i++) {
    const v = (yMax * i) / 5;
    svg += `<line class="gridline" x1="${left}" x2="${width - right}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${left - 5}" y="${Y(v) + 4}" text-anchor="end">${percent ? `${Math.round(v * 100)}%` : v}</text>`;
  }
  for (const v of [...new Set(xs)]) svg += `<text x="${X(v)}" y="${top + plotH + 15}" text-anchor="middle">${v}</text>`;
  series.forEach((s, k) => {
    const color = s.color ?? PALETTE[k % PALETTE.length];
    const band = [...s.points.map((p) => `${X(p.x)},${Y(p.hi)}`), ...[...s.points].reverse().map((p) => `${X(p.x)},${Y(p.lo)}`)].join(' ');
    svg += `<polygon points="${band}" fill="${color}" opacity="0.15"/>`;
    svg += `<polyline points="${s.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
    for (const p of s.points) svg += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3" fill="${color}"><title>${esc(s.name)} at ${p.x}: ${(p.y * 100).toFixed(1)} % (${(p.lo * 100).toFixed(1)}–${(p.hi * 100).toFixed(1)})</title></circle>`;
  });
  svg += `<line class="axis" x1="${left}" x2="${left}" y1="${top}" y2="${top + plotH}"/><line class="axis" x1="${left}" x2="${width - right}" y1="${top + plotH}" y2="${top + plotH}"/>`;
  svg += `<text x="${left + plotW / 2}" y="${height - 4}" text-anchor="middle">${esc(xLabel)}</text><text x="${left}" y="12">${esc(yLabel)}</text>`;
  let lx = left + 140;
  series.forEach((s, k) => {
    svg += `<rect x="${lx}" y="4" width="10" height="10" fill="${s.color ?? PALETTE[k % PALETTE.length]}"/><text x="${lx + 14}" y="13">${esc(s.name)}</text>`;
    lx += 24 + 7 * s.name.length;
  });
  return `${svg}</svg>`;
}
