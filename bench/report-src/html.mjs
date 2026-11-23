// Small helpers for the report's HTML, written in Node.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// "97.3 % (96.9–97.6)"
export const pct = (w, digits = 1) => (!w || w.p === null || w.p === undefined ? '–' : `${(100 * w.p).toFixed(digits)} %`);
export const ci = (w, digits = 1) => (!w || w.p === null || w.p === undefined ? '' : `${(100 * w.lo).toFixed(digits)}–${(100 * w.hi).toFixed(digits)} %`);
export const pctCi = (w, digits = 1) => (!w || w.p === null ? '–' : `${pct(w, digits)} <span class="muted small">(${ci(w, digits)}; ${w.k}/${w.n})</span>`);
export const num = (v, digits = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(digits));

export function table(columns, rows, { numeric = [] } = {}) {
  return `<table><tr>${columns.map((c, i) => `<th class="${numeric.includes(i) ? 'num' : ''}">${c}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${numeric.includes(i) ? 'num' : ''}">${v}</td>`).join('')}</tr>`).join('')}</table>`;
}

// A minimal Markdown to HTML (headings, lists, code blocks, inline code, bold, links, paragraphs), for the findings page.
export function markdown(text) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  let list = null;
  let code = null;
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of text.split('\n')) {
    if (code !== null) {
      if (line.startsWith('```')) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    if (line.startsWith('```')) { flush(); code = []; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = line.match(/^\s*([-*]|\d+\.)\s+(.*)/);
    if (li) {
      if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; }
      const kind = /\d/.test(li[1]) ? 'ol' : 'ul';
      if (list !== kind) { if (list) out.push(`</${list}>`); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (list && /^\s+/.test(line)) { out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

export function page({ title, body, scripts = [], bar = false }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="style.css"></head>
<body>${bar ? '<div class="top-bar" id="bar"></div>' : ''}<main>${body}</main>
${scripts.map((s) => `<script src="${s}"></script>`).join('\n')}
</body></html>
`;
}
