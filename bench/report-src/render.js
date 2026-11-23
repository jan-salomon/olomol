// The report's drawing code: olomol's own renderer (buildScene, sceneToSVG)
// and link maker (linkTo), bundled by make-report.mjs into one script
// (report/olomol-render.js) that works from file:// with no server.
import { buildScene, DEFAULT_SETTINGS } from '../../src/render/scene.js';
import { sceneToSVG } from '../../src/render/svg.js';
import { linkTo } from '../../src/io/link.js';
import { docFromJSON } from '../lib/docjson.mjs';

const SCALE = 40;

// Shapes drawn over a drawing, in drawing units (bond lengths, y down):
// { atom: id, r, color } a ring round an atom; { circle: [x, y], r, color };
// { line: [[x, y], …], color, width }; { dot: [x, y], color, r }.
function overlayMarkup(doc, overlays, k) {
  const at = (id) => doc.atoms.get(id);
  return overlays.map((o) => {
    const color = o.color ?? '#d40000';
    if (o.atom !== undefined && at(o.atom)) {
      const a = at(o.atom);
      return `<circle cx="${a.x * k}" cy="${a.y * k}" r="${(o.r ?? 0.42) * k}" fill="none" stroke="${color}" stroke-width="${o.width ?? 2.2}" opacity="0.85"/>`;
    }
    if (o.circle) return `<circle cx="${o.circle[0] * k}" cy="${o.circle[1] * k}" r="${(o.r ?? 0.3) * k}" fill="none" stroke="${color}" stroke-width="${o.width ?? 2}" opacity="0.85"/>`;
    if (o.dot) return `<circle cx="${o.dot[0] * k}" cy="${o.dot[1] * k}" r="${(o.r ?? 0.08) * k}" fill="${color}" opacity="0.9"/>`;
    if (o.line) return `<polyline points="${o.line.map(([x, y]) => `${(x * k).toFixed(1)},${(y * k).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${o.width ?? 3}" stroke-linecap="round" opacity="0.7"/>`;
    return '';
  }).join('');
}

function extend(svg, extra) {
  return svg.replace(/<\/svg>$/, `${extra}</svg>`);
}

window.olomolRender = {
  // An SVG string of a drawing (docToJSON form), with overlays on top.
  svg(json, { overlays = [] } = {}) {
    const doc = docFromJSON(json);
    const scene = buildScene(doc, DEFAULT_SETTINGS);
    let svg = sceneToSVG(scene, { scale: SCALE, margin: 0.5, background: '#ffffff' });
    // overlays may reach outside the drawing: grow the view box to hold them
    if (overlays.length) {
      const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
      let [x, y, w, h] = m.slice(1).map(Number);
      const pts = overlays.flatMap((o) => (o.line ?? [o.circle ?? o.dot ?? (o.atom !== undefined && doc.atoms.get(o.atom) ? [doc.atoms.get(o.atom).x, doc.atoms.get(o.atom).y] : null)]).filter(Boolean));
      for (const [px, py] of pts) {
        const [sx, sy] = [px * SCALE, py * SCALE];
        const pad = 0.5 * SCALE;
        if (sx - pad < x) { w += x - (sx - pad); x = sx - pad; }
        if (sy - pad < y) { h += y - (sy - pad); y = sy - pad; }
        if (sx + pad > x + w) w = sx + pad - x;
        if (sy + pad > y + h) h = sy + pad - y;
      }
      svg = svg.replace(m[0], `viewBox="${x} ${y} ${w} ${h}"`).replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.ceil(w)}" height="${Math.ceil(h)}"`)
        .replace(/<rect x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="[\d.]+" fill="#ffffff"\/>/, `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>`);
      svg = extend(svg, overlayMarkup(doc, overlays, SCALE));
    }
    return svg;
  },
  // The link that opens the drawing in olomol at `base`.
  link(json, base) {
    return linkTo(docFromJSON(json), { settings: DEFAULT_SETTINGS, title: 'benchmark case', base });
  },
};
