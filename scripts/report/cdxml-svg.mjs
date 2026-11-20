// A CDXML file drawn as ChemDraw saved it, without Indigo or olomol: for the report of other programs'
// files (scripts/other-programs-report.mjs), as what the file looks like where it was made. Every atom where
// the file puts it, every label as written there (its <t> text, in its place), bonds by their order and
// display (wedges, hashes, bold, wavy, dashed), arrows from tail to head (curved ones as arcs), page text,
// rectangles and small ovals, in the file's colours. Approximate where ChemDraw is clever (where a double
// bond's second line goes, how far a bond stops short of a label), so only a reference, not ChemDraw.

// --- a small XML reader: { tag, attrs, children, text } ---
export function parseXml(text) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const pattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:-]+)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
  for (const m of text.matchAll(pattern)) {
    const [, close, tag, rawAttrs, selfClose, body] = m;
    const top = stack[stack.length - 1];
    if (body !== undefined) {
      top.text += unescape(body);
      continue;
    }
    if (!tag) continue;
    if (close) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of (rawAttrs ?? '').matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescape(a[2] ?? a[3]);
    const node = { tag, attrs, children: [], text: '' };
    top.children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

const nums = (value) => (value ?? '').trim().split(/\s+/).map(Number);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const all = (node, tag, out = []) => {
  for (const child of node.children) {
    if (child.tag === tag) out.push(child);
    all(child, tag, out);
  }
  return out;
};

// The file drawn: an SVG string.
export function cdxmlToSvg(text) {
  const xml = parseXml(text);
  const doc = xml.children.find((c) => c.tag === 'CDXML');
  if (!doc) throw new Error('no CDXML element');
  // colours: index 0 black, 1 white, then the colour table (ChemDraw's numbering); 3 is the usual foreground
  const table = all(doc, 'colortable')[0]?.children.filter((c) => c.tag === 'color').map((c) => `rgb(${['r', 'g', 'b'].map((k) => Math.round(255 * Number(c.attrs[k] ?? 0))).join(',')})`) ?? [];
  const palette = ['#000', '#fff', ...table];
  const colour = (index, fallback = '#000') => {
    const k = Number(index);
    if (!Number.isFinite(k)) return fallback;
    const c = palette[k] ?? fallback;
    return c === 'rgb(255,255,255)' && k !== 1 ? fallback : c; // (a white "foreground" from a template: drawn black)
  };
  const lineWidth = Number(doc.attrs.LineWidth ?? 0.6);
  const boldWidth = Number(doc.attrs.BoldWidth ?? 2);
  const out = [];
  const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (x, y, r = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    box.x1 = Math.min(box.x1, x - r); box.y1 = Math.min(box.y1, y - r);
    box.x2 = Math.max(box.x2, x + r); box.y2 = Math.max(box.y2, y + r);
  };

  // text runs: <s> with its face (32 subscript, 64 superscript, 96 a formula: its digits low), size, colour
  function textRuns(t, fallbackColour) {
    const [x, y] = nums(t.attrs.p);
    const lines = [[]];
    for (const s of t.children.filter((c) => c.tag === 's')) {
      const face = Number(s.attrs.face ?? 0);
      const size = Number(s.attrs.size ?? 10);
      const fill = colour(s.attrs.color, fallbackColour);
      const parts = s.text.split('\n');
      parts.forEach((part, k) => {
        if (k) lines.push([]);
        if (!part) return;
        const formula = (face & 96) === 96;
        const pieces = formula ? part.split(/(\d+)/).filter(Boolean).map((p) => ({ p, low: /^\d+$/.test(p) })) : [{ p: part, low: false }];
        for (const { p, low } of pieces) {
          lines[lines.length - 1].push({ text: p, size, fill, bold: Boolean(face & 1), italic: Boolean(face & 2),
            shift: low || (!formula && face & 32) ? 0.3 : !formula && face & 64 ? -0.4 : 0, small: low || (!formula && face & 96) });
        }
      });
    }
    return { x, y, lines, lineHeight: Number(t.attrs.LineHeight) || null };
  }
  function drawText(t, fallbackColour, { mask = false } = {}) {
    const { x, y, lines, lineHeight } = textRuns(t, fallbackColour);
    if (!Number.isFinite(x)) return;
    const align = t.attrs.Justification ?? t.attrs.LabelJustification;
    const anchor = align === 'Right' ? 'end' : align === 'Center' ? 'middle' : 'start';
    lines.forEach((runs, k) => {
      if (!runs.length) return;
      const size = Math.max(...runs.map((r) => r.size));
      const dy = k * (lineHeight && lineHeight > 1 ? lineHeight : size * 1.15);
      const spans = runs.map((r) => `<tspan fill="${r.fill}"${r.small ? ` font-size="${(r.size * 0.75).toFixed(2)}"` : ` font-size="${r.size}"`}${r.bold ? ' font-weight="700"' : ''}${r.italic ? ' font-style="italic"' : ''}${r.shift ? ` dy="${(r.shift * r.size).toFixed(2)}"` : ''}>${esc(r.text)}</tspan>${r.shift ? `<tspan dy="${(-r.shift * r.size).toFixed(2)}"></tspan>` : ''}`).join('');
      const width = runs.reduce((w, r) => w + r.text.length * (r.small ? 0.75 : 1) * r.size * 0.58, 0);
      const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
      if (mask) out.push(`<rect x="${(left - 0.8).toFixed(2)}" y="${(y + dy - size * 0.8).toFixed(2)}" width="${(width + 1.6).toFixed(2)}" height="${(size * 1.05).toFixed(2)}" fill="var(--paper, #fff)"/>`);
      out.push(`<text x="${x}" y="${(y + dy).toFixed(2)}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" xml:space="preserve">${spans}</text>`);
      grow(left, y + dy - size); grow(left + width, y + dy + size * 0.3);
    });
  }

  // the molecules: fragments (also inside groups), not the ones inside a node (a nickname's own atoms)
  const fragments = [];
  const walk = (node) => {
    for (const child of node.children) {
      if (child.tag === 'fragment') fragments.push(child);
      else if (child.tag !== 'n') walk(child);
    }
  };
  walk(doc);
  const labelsLater = [];
  for (const fragment of fragments) {
    const nodes = new Map();
    for (const n of fragment.children.filter((c) => c.tag === 'n')) nodes.set(n.attrs.id, n);
    // a bond to a nickname's attachment point inside it ends at the nickname
    const at = (id) => {
      const n = nodes.get(id);
      if (n) return nums(n.attrs.p);
      for (const outer of nodes.values()) for (const inner of all(outer, 'n')) if (inner.attrs.id === id) return nums(outer.attrs.p);
      return null;
    };
    const labelled = (id) => nodes.get(id)?.children.some((c) => c.tag === 't');
    for (const b of fragment.children.filter((c) => c.tag === 'b')) {
      const [p, q] = [at(b.attrs.B), at(b.attrs.E)];
      if (!p || !q) continue;
      const order = b.attrs.Order ?? '1';
      const display = b.attrs.Display ?? '';
      const stroke = colour(b.attrs.color);
      const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
      const length = Math.hypot(dx, dy) || 1;
      const [ux, uy] = [dx / length, dy / length];
      const [nx, ny] = [-uy, ux];
      grow(p[0], p[1]); grow(q[0], q[1]);
      const line = (a, c, extra = '') => out.push(`<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${c[0].toFixed(2)}" y2="${c[1].toFixed(2)}" stroke="${stroke}" stroke-width="${lineWidth}" stroke-linecap="round"${extra}/>`);
      // wedges: narrow at the begin atom (…Begin) or at the end (…End)
      const reversed = /End$/.test(display);
      const [tip, base] = reversed ? [q, p] : [p, q];
      const w = 2.2;
      if (/^Wedge(Begin|End)$/.test(display)) {
        out.push(`<polygon points="${tip[0]},${tip[1]} ${base[0] + nx * w},${base[1] + ny * w} ${base[0] - nx * w},${base[1] - ny * w}" fill="${stroke}"/>`);
        continue;
      }
      if (/^WedgedHash(Begin|End)$/.test(display) || display === 'Hash') {
        const steps = Math.max(3, Math.round(length / 2.2));
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          const half = display === 'Hash' ? w * 0.7 : w * f;
          const [cx, cy] = [tip[0] + (base[0] - tip[0]) * f, tip[1] + (base[1] - tip[1]) * f];
          line([cx + nx * half, cy + ny * half], [cx - nx * half, cy - ny * half]);
        }
        continue;
      }
      if (display === 'Wavy') {
        const waves = Math.max(2, Math.round(length / 3));
        let d = `M${p[0]},${p[1]}`;
        for (let k = 0; k < waves; k++) {
          const [a, c] = [k / waves, (k + 1) / waves];
          const side = k % 2 ? -2 : 2;
          d += ` Q${p[0] + dx * (a + c) / 2 + nx * side},${p[1] + dy * (a + c) / 2 + ny * side} ${p[0] + dx * c},${p[1] + dy * c}`;
        }
        out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"/>`);
        continue;
      }
      const dash = display === 'Dash' ? ' stroke-dasharray="1.5 1.5"' : '';
      if (display === 'Bold') out.push(`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${stroke}" stroke-width="${boldWidth}"/>`);
      const gap = 2;
      // (a double bond's second line: inside a ring, or to the side the file says; else either side)
      const side = b.attrs.DoublePosition === 'Left' ? -1 : 1;
      if (order === '2' || order === '1.5') {
        const centred = b.attrs.DoublePosition === 'Center' || labelled(b.attrs.B) || labelled(b.attrs.E);
        if (centred) {
          line([p[0] + nx * gap / 2, p[1] + ny * gap / 2], [q[0] + nx * gap / 2, q[1] + ny * gap / 2], dash);
          line([p[0] - nx * gap / 2, p[1] - ny * gap / 2], [q[0] - nx * gap / 2, q[1] - ny * gap / 2], order === '1.5' ? ' stroke-dasharray="1.5 1.5"' : dash);
        } else {
          if (display !== 'Bold') line(p, q, dash);
          const inset = 0.15 * length;
          line([p[0] + ux * inset + nx * gap * side, p[1] + uy * inset + ny * gap * side], [q[0] - ux * inset + nx * gap * side, q[1] - uy * inset + ny * gap * side], order === '1.5' ? ' stroke-dasharray="1.5 1.5"' : '');
        }
      } else if (order === '3') {
        line(p, q, dash);
        for (const s of [-1, 1]) line([p[0] + nx * gap * s, p[1] + ny * gap * s], [q[0] + nx * gap * s, q[1] + ny * gap * s]);
      } else if (display !== 'Bold') {
        line(p, q, dash);
      }
    }
    // labels over the bonds (each with the page's colour behind it, as ChemDraw stops a bond short of a label)
    for (const n of nodes.values()) {
      const t = n.children.find((c) => c.tag === 't');
      if (t) labelsLater.push([t, colour(n.attrs.color)]);
      else if (n.attrs.NodeType === undefined || n.attrs.NodeType === 'Element') {
        const [x, y] = nums(n.attrs.p);
        grow(x, y, 2);
      }
    }
  }
  for (const [t, c] of labelsLater) drawText(t, c, { mask: true });

  // arrows (ChemDraw 8+: <arrow>; older files: <graphic GraphicType="Line" ArrowType=…>, unless superseded)
  const arrowHead = (from, to, stroke, size = 5, half = false) => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const length = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / length, dy / length];
    const [bx, by] = [to[0] - ux * size, to[1] - uy * size];
    const w = size * 0.4;
    out.push(`<polygon points="${to[0]},${to[1]} ${bx + uy * w},${by - ux * w} ${half ? `${bx},${by}` : `${bx - uy * w},${by + ux * w}`}" fill="${stroke}"/>`);
  };
  for (const a of all(doc, 'arrow')) {
    const head = nums(a.attrs.Head3D);
    const tail = nums(a.attrs.Tail3D);
    if (!Number.isFinite(head[0]) || !Number.isFinite(tail[0])) continue;
    const stroke = colour(a.attrs.color);
    const dash = /Dash/.test(a.attrs.LineType ?? '') ? ' stroke-dasharray="3 2"' : '';
    const size = 5 * Number(a.attrs.HeadSize ?? 1000) / 1000;
    const angular = Number(a.attrs.AngularSize);
    grow(head[0], head[1], 4); grow(tail[0], tail[1], 4);
    let into = tail;
    let outOf = head;
    if (Number.isFinite(angular) && Math.abs(angular) > 1) {
      const centre = nums(a.attrs.Center3D);
      const r = Math.hypot(tail[0] - centre[0], tail[1] - centre[1]);
      const large = Math.abs(angular) > 180 ? 1 : 0;
      const sweep = angular > 0 ? 1 : 0;
      out.push(`<path d="M${tail[0]},${tail[1]} A${r},${r} 0 ${large} ${sweep} ${head[0]},${head[1]}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"${dash}/>`);
      // (the head along the arc's tangent at its end)
      const [vx, vy] = [head[0] - centre[0], head[1] - centre[1]];
      const t = sweep ? [-vy, vx] : [vy, -vx];
      into = [head[0] - t[0], head[1] - t[1]];
      outOf = [tail[0] + (sweep ? -1 : 1) * (tail[1] - centre[1]), tail[1] + (sweep ? 1 : -1) * (tail[0] - centre[0])];
    } else if (/Wavy/.test(a.attrs.LineType ?? '')) {
      const [dx, dy] = [head[0] - tail[0], head[1] - tail[1]];
      const length = Math.hypot(dx, dy) || 1;
      const [nx, ny] = [-dy / length, dx / length];
      const waves = Math.max(2, Math.round(length / 4));
      let d = `M${tail[0]},${tail[1]}`;
      for (let k = 0; k < waves; k++) {
        const [f, g] = [k / waves, (k + 1) / waves];
        const s = k % 2 ? -2 : 2;
        d += ` Q${tail[0] + dx * (f + g) / 2 + nx * s},${tail[1] + dy * (f + g) / 2 + ny * s} ${tail[0] + dx * g},${tail[1] + dy * g}`;
      }
      out.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${lineWidth}"/>`);
    } else {
      out.push(`<line x1="${tail[0]}" y1="${tail[1]}" x2="${head[0]}" y2="${head[1]}" stroke="${stroke}" stroke-width="${lineWidth}"${dash}/>`);
    }
    const halfHead = /Half/.test(a.attrs.ArrowheadHead ?? '');
    if (a.attrs.ArrowheadHead !== undefined ? a.attrs.ArrowheadHead !== 'None' && a.attrs.ArrowheadHead !== undefined : a.attrs.ArrowheadType !== undefined && a.attrs.ArrowheadTail === undefined) arrowHead(into, head, stroke, size, halfHead);
    if (a.attrs.ArrowheadTail && a.attrs.ArrowheadTail !== 'None') arrowHead(outOf, tail, stroke, size, /Half/.test(a.attrs.ArrowheadTail));
  }
  for (const g of all(doc, 'graphic')) {
    if (g.attrs.SupersededBy) continue;
    const b = nums(g.attrs.BoundingBox);
    const stroke = colour(g.attrs.color);
    if (g.attrs.GraphicType === 'Rectangle' && b.length === 4) {
      const [x1, x2, y1, y2] = [Math.min(b[0], b[2]), Math.max(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[1], b[3])];
      const type = g.attrs.RectangleType ?? '';
      const filled = /Filled/.test(type);
      out.unshift(`<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="${filled ? stroke : 'none'}" fill-opacity="${filled ? 0.18 : 0}" stroke="${filled && !/Dashed/.test(type) ? 'none' : stroke}" stroke-width="${lineWidth}"${/Dashed/.test(type) ? ' stroke-dasharray="3 2"' : ''}${/Round/.test(type) ? ' rx="4"' : ''}/>`);
      grow(x1, y1); grow(x2, y2);
    } else if ((g.attrs.GraphicType === 'Orbital' || g.attrs.GraphicType === 'Oval') && g.attrs.Center3D) {
      const c = nums(g.attrs.Center3D);
      const major = nums(g.attrs.MajorAxisEnd3D);
      const minor = nums(g.attrs.MinorAxisEnd3D);
      const [rx, ry] = [Math.hypot(major[0] - c[0], major[1] - c[1]), Math.hypot(minor[0] - c[0], minor[1] - c[1])];
      const filled = /Filled/.test(g.attrs.OvalType ?? g.attrs.OrbitalType ?? '');
      out.unshift(`<ellipse cx="${c[0]}" cy="${c[1]}" rx="${rx}" ry="${ry}" fill="${filled ? stroke : 'none'}" fill-opacity="${filled ? 0.35 : 0}" stroke="${stroke}" stroke-width="${lineWidth}"/>`);
      grow(c[0], c[1], Math.max(rx, ry));
    } else if (g.attrs.GraphicType === 'Line' && b.length === 4 && !g.attrs.SupersededBy) {
      out.push(`<line x1="${b[2]}" y1="${b[3]}" x2="${b[0]}" y2="${b[1]}" stroke="${stroke}" stroke-width="${lineWidth}"/>`);
      if (g.attrs.ArrowType && g.attrs.ArrowType !== 'NoHead') arrowHead([b[2], b[3]], [b[0], b[1]], stroke);
      grow(b[0], b[1]); grow(b[2], b[3]);
    } else if (g.attrs.GraphicType === 'Symbol' && b.length === 4) {
      const [x, y] = [b[0], b[1]];
      const symbol = { Plus: '+', Minus: '−', Electron: '•', LonePair: ':', Radical: '•', CirclePlus: '⊕', CircleMinus: '⊖' }[g.attrs.SymbolType] ?? '';
      if (symbol) out.push(`<text x="${x}" y="${y}" font-size="8" text-anchor="middle" font-family="Arial, sans-serif" fill="${stroke}">${symbol}</text>`);
    }
  }
  // "+" between molecules of a reaction scheme, and page text
  for (const t of doc.children.flatMap((c) => (c.tag === 'page' ? c.children : [c])).filter((c) => c.tag === 't')) drawText(t, colour(t.attrs.color));
  for (const group of all(doc, 'group')) for (const t of group.children.filter((c) => c.tag === 't')) drawText(t, colour(t.attrs.color));

  if (!Number.isFinite(box.x1)) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';
  const pad = 6;
  const [x, y, w, h] = [box.x1 - pad, box.y1 - pad, box.x2 - box.x1 + 2 * pad, box.y2 - box.y1 + 2 * pad];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${out.join('')}</svg>`;
}
