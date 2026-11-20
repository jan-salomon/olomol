// The text editor's content as a model: characters, each with its shift
// (0, 'sub', 'sup'), bold and italic, kept in the drawing as markup (_{2},
// ^{+}, *{…}, ~{…}, see text.js) and shown in a contenteditable element as
// <sub>, <sup>, <b> and <i>. The editor changes the model and draws it
// again, so formatting only ever comes from its buttons, never from what
// the browser guesses while typing.
import { chemChars, parseMarkup, writeMarkup } from '../render/text.js';

// Markup → [{ ch, shift, bold, italic }].
export const modelOf = (markup) => parseMarkup(markup);

// [{ ch, shift, bold, italic }] → markup.
export const markupOf = (model) => writeMarkup(model.map((c) => ({ shift: 0, bold: false, italic: false, ...c })));

// The characters of a piece of the editor's DOM (text in <sub>/<sup>
// shifted, in <b>/<strong> bold, in <i>/<em> italic; <br> and blocks the
// browser may have added as line breaks).
const plain = { shift: 0, bold: false, italic: false };
function piecesOf(root) {
  const model = [];
  const walk = (node, on) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        for (const ch of child.textContent.replace(/​/g, '')) model.push({ ch, ...on });
      } else if (child.nodeName === 'BR') {
        model.push({ ch: '\n', ...plain });
      } else {
        const block = child.nodeName === 'DIV' || child.nodeName === 'P';
        if (block && model.length && model.at(-1).ch !== '\n') model.push({ ch: '\n', ...plain });
        const name = child.nodeName;
        walk(child, {
          shift: name === 'SUB' ? 'sub' : name === 'SUP' ? 'sup' : on.shift,
          bold: on.bold || name === 'B' || name === 'STRONG',
          italic: on.italic || name === 'I' || name === 'EM',
        });
      }
    }
  };
  walk(root, plain);
  return model;
}

// The characters in the editor. A <br> at the very end is not a line of its
// own: it only makes the line break before it show (see writeModel).
export function readModel(root) {
  const model = piecesOf(root);
  let last = root.lastChild;
  while (last?.lastChild) last = last.lastChild;
  if (last?.nodeName === 'BR' && model.at(-1)?.ch === '\n') model.pop();
  return model;
}

// Puts the model into the element: runs of text (in <b>, <i>, <sub>,
// <sup> as they are formatted) and <br>.
export function writeModel(root, model) {
  root.replaceChildren();
  const same = (a, b) => a.shift === b.shift && Boolean(a.bold) === Boolean(b.bold) && Boolean(a.italic) === Boolean(b.italic);
  let k = 0;
  while (k < model.length) {
    if (model[k].ch === '\n') {
      root.append(document.createElement('br'));
      k += 1;
      continue;
    }
    const first = model[k];
    let text = '';
    while (k < model.length && same(model[k], first) && model[k].ch !== '\n') text += model[k++].ch;
    let node = document.createTextNode(text);
    for (const [on, tag] of [[first.shift, first.shift], [first.italic, 'i'], [first.bold, 'b']]) {
      if (!on) continue;
      const element = document.createElement(tag);
      element.append(node);
      node = element;
    }
    root.append(node);
  }
  // a line break at the very end shows only with one more after it
  if (model.at(-1)?.ch === '\n') root.append(document.createElement('br'));
}

// Where a DOM position (node, offset) is in the model's characters.
function offsetOf(root, node, offset) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  const piece = document.createElement('div');
  piece.append(range.cloneContents());
  return piecesOf(piece).length;
}

// The selection inside `root` as model offsets { start, end }, or null.
export function selectionIn(root) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const length = readModel(root).length;
  const at = (node, offset) => Math.min(offsetOf(root, node, offset), length);
  return { start: at(range.startContainer, range.startOffset), end: at(range.endContainer, range.endOffset) };
}

// Selects the model offsets start…end in `root` (as drawn by writeModel).
export function select(root, start, end = start) {
  const place = (target) => {
    let left = target;
    for (const child of root.childNodes) {
      const text = child.nodeName === 'BR' ? null : child.textContent;
      const length = text === null ? 1 : text.length;
      if (left <= length && text !== null) {
        let node = child; // (the text inside <b><sub>…)
        while (node.firstChild) node = node.firstChild;
        return [node, Math.min(left, node.textContent?.length ?? 0)];
      }
      if (left < length) return [root, [...root.childNodes].indexOf(child)];
      left -= length;
    }
    return [root, root.childNodes.length];
  };
  const range = document.createRange();
  range.setStart(...place(start));
  range.setEnd(...place(end));
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

// The model with start…end formatted as a chemical formula (subscripts
// after letters, a charge at the end as a superscript), or made plain (no
// indices, bold or italic). A formula keeps the bold and italic of the
// characters it was made from.
export function formatPart(model, start, end, how) {
  const piece = model.slice(start, end);
  const formatted = how === 'chem'
    ? chemChars(piece.map((c) => c.ch).join('')).map(({ ch, shift, from }) => ({ ch, shift, bold: Boolean(piece[from]?.bold), italic: Boolean(piece[from]?.italic) }))
    : piece.map((c) => ({ ch: c.ch, ...plain }));
  return [...model.slice(0, start), ...formatted, ...model.slice(end)];
}

// The model with start…end given (or, if all of it has it already, without)
// `kind`: 'sub' or 'sup' (its shift), 'bold' or 'italic'.
export function togglePart(model, start, end, kind) {
  const has = (c) => (kind === 'sub' || kind === 'sup' ? c.shift === kind : Boolean(c[kind]));
  const all = model.slice(start, end).every((c) => has(c) || c.ch === '\n');
  return model.map((c, k) => {
    if (k < start || k >= end || c.ch === '\n') return c;
    return kind === 'sub' || kind === 'sup' ? { ...c, shift: all ? 0 : kind } : { ...c, [kind]: !all };
  });
}
