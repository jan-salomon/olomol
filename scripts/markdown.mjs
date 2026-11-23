// Markdown to HTML, as much as olomol's own guides use (docs/embed.md): headings, paragraphs, lists (- and 1.,
// with their lines continued), tables (\| a pipe inside a cell), code blocks (fenced, or indented by four spaces),
// and inline code, bold, italics, links (<…> too). For the manual on the web (manual-web.mjs), which takes the
// embedding guide in as a chapter. Not a full Markdown: what a guide here doesn't use, it doesn't know.
//   toHtml(text, { level, link, idPrefix }): `level` the HTML heading for #; `link(href)`: where a relative link goes;
//   every heading gets an id (`idPrefix` + its words), and the headings are returned for a contents list.

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (text) => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');

function inline(text, link) {
  const codes = [];
  // (code first, kept as it is: nothing inside it is markup)
  let out = text.replace(/`([^`]+)`/g, (_, code) => `\u0000${codes.push(`<code>${escape(code)}</code>`) - 1}\u0000`);
  out = escape(out);
  out = out.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_, url) => `<a href="${url}">${url}</a>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, words, href) => `<a href="${escape(link(href.replace(/&amp;/g, '&')))}">${words}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, k) => codes[Number(k)]);
}

// a table row's cells: split at | that aren't \|
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));

export function toHtml(text, { level = 2, link = (href) => href, idPrefix = '' } = {}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const headings = [];
  let k = 0;
  const blank = (line) => !line || !line.trim();
  while (k < lines.length) {
    const line = lines[k];
    if (blank(line)) {
      k++;
      continue;
    }
    // a fenced code block
    if (/^```/.test(line)) {
      const body = [];
      for (k++; k < lines.length && !/^```/.test(lines[k]); k++) body.push(lines[k]);
      k++;
      out.push(`<pre><code>${escape(body.join('\n'))}</code></pre>`);
      continue;
    }
    // an indented code block
    if (/^ {4}\S/.test(line)) {
      const body = [];
      for (; k < lines.length && (/^ {4}/.test(lines[k]) || (blank(lines[k]) && /^ {4}/.test(lines[k + 1] ?? ''))); k++) body.push(lines[k].slice(4));
      out.push(`<pre><code>${escape(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const tag = `h${Math.min(6, level + heading[1].length - 1)}`;
      const words = inline(heading[2], link);
      const id = `${idPrefix}${slug(words)}`;
      headings.push({ depth: heading[1].length, id, html: words });
      out.push(`<${tag} id="${id}">${words}</${tag}>`);
      k++;
      continue;
    }
    // a table: a row, the line under it of dashes, then rows
    if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[k + 1] ?? '')) {
      const head = cells(line);
      const rows = [];
      for (k += 2; k < lines.length && /^\|/.test(lines[k]); k++) rows.push(cells(lines[k]));
      out.push(`<table><thead><tr>${head.map((cell) => `<th>${inline(cell, link)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, link)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    // a list: its items, each with the lines under it indented
    const item = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (k < lines.length) {
        const at = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[k]);
        if (at) {
          items.push([at[3]]);
          k++;
        } else if (!blank(lines[k]) && /^\s{2,}\S/.test(lines[k]) && items.length) {
          items.at(-1).push(lines[k].trim());
          k++;
        } else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((words) => `<li>${inline(words.join(' '), link)}</li>`).join('')}</${tag}>`);
      continue;
    }
    // a paragraph: lines up to a blank one or another block
    const words = [];
    for (; k < lines.length && !blank(lines[k]) && !/^(#{1,6}\s|```|\||\s*([-*]|\d+\.)\s| {4}\S)/.test(lines[k]); k++) words.push(lines[k].trim());
    if (!words.length) {
      words.push(lines[k].trim());
      k++;
    }
    out.push(`<p>${inline(words.join(' '), link)}</p>`);
  }
  return { html: out.join('\n'), headings };
}
