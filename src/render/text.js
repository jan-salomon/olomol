// Text widths without a browser: the advance widths of Arial (Helvetica and
// Liberation Sans have the same), in thousandths of the font size. So label
// placement is the same on screen, in exported files and in the tests. Bold, and
// the serif family (Times New Roman; Liberation Serif has the same widths), from
// the Liberation fonts as Chrome measures them (bold: SANS_BOLD, SERIF, SERIF_BOLD).
import { STYLE } from './style.js';

const WIDTHS = {
  ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584,
  ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333, '{': 334, '|': 260, '}': 334, '~': 584,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722,
  O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556,
  o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  '−': 584, '–': 556, '—': 1000, '°': 400, '•': 350, '·': 278, '→': 1000, '⇌': 1000, 'α': 578, 'β': 575, 'Δ': 668,
  'γ': 500, 'δ': 556, 'ν': 500, 'π': 573, 'σ': 616, 'µ': 576, 'λ': 500, '‡': 556, '†': 556, '′': 191, '″': 355,
};
for (let d = 0; d <= 9; d++) WIDTHS[String(d)] = 556;

const SANS_BOLD = {
  " ": 278, "!": 333, "\"": 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238, "(": 333, ")": 333, "*": 389,
  "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611,
  "@": 975, "[": 333, "\\": 278, "]": 333, "^": 584, "_": 556, "`": 333, "{": 389, "|": 280, "}": 389, "~": 584,
  "A": 722, "B": 722, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722, "I": 278, "J": 556, "K": 722,
  "L": 611, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667,
  "W": 944, "X": 667, "Y": 667, "Z": 611, "a": 556, "b": 611, "c": 556, "d": 611, "e": 556, "f": 333, "g": 611,
  "h": 611, "i": 278, "j": 278, "k": 556, "l": 278, "m": 889, "n": 611, "o": 611, "p": 611, "q": 611, "r": 389,
  "s": 556, "t": 333, "u": 611, "v": 556, "w": 778, "x": 556, "y": 556, "z": 500, "−": 584, "–": 556, "—": 1000,
  "°": 400, "•": 350, "·": 333, "→": 1000, "⇌": 1012, "α": 615, "β": 610, "Δ": 719, "γ": 556, "δ": 606, "ν": 556,
  "π": 766, "σ": 684, "µ": 576, "λ": 556, "‡": 556, "†": 556, "′": 240, "″": 479
};
for (let d = 0; d <= 9; d++) SANS_BOLD[String(d)] = 556;
const SERIF = {
  " ": 250, "!": 333, "\"": 408, "#": 500, "$": 500, "%": 833, "&": 778, "'": 180, "(": 333, ")": 333, "*": 500,
  "+": 564, ",": 250, "-": 333, ".": 250, "/": 278, ":": 278, ";": 278, "<": 564, "=": 564, ">": 564, "?": 444,
  "@": 921, "[": 333, "\\": 278, "]": 333, "^": 469, "_": 500, "`": 333, "{": 480, "|": 200, "}": 480, "~": 541,
  "A": 722, "B": 667, "C": 667, "D": 722, "E": 611, "F": 556, "G": 722, "H": 722, "I": 333, "J": 389, "K": 722,
  "L": 611, "M": 889, "N": 722, "O": 722, "P": 556, "Q": 722, "R": 667, "S": 556, "T": 611, "U": 722, "V": 722,
  "W": 944, "X": 722, "Y": 722, "Z": 611, "a": 444, "b": 500, "c": 444, "d": 500, "e": 444, "f": 333, "g": 500,
  "h": 500, "i": 278, "j": 278, "k": 500, "l": 278, "m": 778, "n": 500, "o": 500, "p": 500, "q": 500, "r": 333,
  "s": 389, "t": 278, "u": 500, "v": 500, "w": 722, "x": 500, "y": 500, "z": 444, "−": 564, "–": 500, "—": 1000,
  "°": 400, "•": 350, "·": 333, "→": 1000, "⇌": 1012, "α": 524, "β": 509, "Δ": 643, "γ": 442, "δ": 471, "ν": 452,
  "π": 505, "σ": 539, "µ": 576, "λ": 485, "‡": 500, "†": 500, "′": 219, "″": 417
};
for (let d = 0; d <= 9; d++) SERIF[String(d)] = 500;
const SERIF_BOLD = {
  " ": 250, "!": 333, "\"": 555, "#": 500, "$": 500, "%": 1000, "&": 833, "'": 278, "(": 333, ")": 333, "*": 500,
  "+": 570, ",": 250, "-": 333, ".": 250, "/": 278, ":": 333, ";": 333, "<": 570, "=": 570, ">": 570, "?": 500,
  "@": 930, "[": 333, "\\": 278, "]": 333, "^": 581, "_": 500, "`": 333, "{": 394, "|": 220, "}": 394, "~": 520,
  "A": 722, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 778, "I": 389, "J": 500, "K": 778,
  "L": 667, "M": 944, "N": 722, "O": 778, "P": 611, "Q": 778, "R": 722, "S": 556, "T": 667, "U": 722, "V": 722,
  "W": 1000, "X": 722, "Y": 722, "Z": 667, "a": 500, "b": 556, "c": 444, "d": 556, "e": 444, "f": 333, "g": 500,
  "h": 556, "i": 278, "j": 333, "k": 556, "l": 278, "m": 833, "n": 556, "o": 500, "p": 556, "q": 556, "r": 444,
  "s": 389, "t": 333, "u": 556, "v": 500, "w": 722, "x": 500, "y": 500, "z": 444, "−": 570, "–": 500, "—": 1000,
  "°": 400, "•": 350, "·": 333, "→": 1000, "⇌": 1012, "α": 558, "β": 527, "Δ": 627, "γ": 468, "δ": 519, "ν": 447,
  "π": 548, "σ": 544, "µ": 576, "λ": 491, "‡": 500, "†": 500, "′": 281, "″": 552
};
for (let d = 0; d <= 9; d++) SERIF_BOLD[String(d)] = 500;
const TABLES = { sans: [WIDTHS, SANS_BOLD], serif: [SERIF, SERIF_BOLD] };

export const CAP_HEIGHT = 0.716; // of the font size
export const X_HEIGHT = 0.519;
export const DESCENT = 0.21;

// (`family`: 'sans' or 'serif', the drawing style's unless given; `bold`)
export function textWidth(text, size, { bold = false, family = STYLE.family ?? 'sans' } = {}) {
  const table = (TABLES[family] ?? TABLES.sans)[bold ? 1 : 0];
  let sum = 0;
  for (const ch of text) sum += table[ch] ?? WIDTHS[ch] ?? 600;
  return (sum / 1000) * size;
}

// Markup: _{…} subscript, ^{…} superscript, *{…} bold, ~{…} italic, one
// inside another (*{H_{2}O}); a backslash before { } \\ _ ^ * ~ writes that character
// as it is (\{, \}). Text → its characters [{ ch, shift: 0 | 'sub' | 'sup', bold, italic }].
const ESCAPED = '\\{}_^*~';
export function parseMarkup(text) {
  const chars = [];
  const KINDS = { _: 'sub', '^': 'sup', '*': 'bold', '~': 'italic' };
  // from i, with the formatting `on` (depth: inside braces, where a "}" closes them); returns where it stopped
  const walk = (i, on) => {
    while (i < text.length) {
      // a character written as it is: \{ \} \\ (and \_ \^ \* \~); a backslash before anything else is itself
      if (text[i] === '\\' && ESCAPED.includes(text[i + 1] ?? '')) {
        chars.push({ ch: text[i + 1], shift: on.shift ?? 0, bold: Boolean(on.bold), italic: Boolean(on.italic) });
        i += 2;
        continue;
      }
      const kind = KINDS[text[i]];
      if (kind && text[i + 1] === '{' && text.indexOf('}', i) > i) {
        const inner = kind === 'bold' || kind === 'italic' ? { ...on, [kind]: true } : { ...on, shift: kind };
        i = walk(i + 2, { ...inner, depth: (on.depth ?? 0) + 1 });
        continue;
      }
      if (text[i] === '}' && on.depth) return i + 1;
      chars.push({ ch: text[i], shift: on.shift ?? 0, bold: Boolean(on.bold), italic: Boolean(on.italic) });
      i += 1;
    }
    return i;
  };
  walk(0, {});
  return chars;
}

// A plain text as markup: its braces and backslashes escaped, so that none of it is read as formatting
export const escapeMarkup = (text) => String(text).replace(/[\\{}]/g, (ch) => `\\${ch}`);

// Characters → markup, each kind of formatting opened once for a stretch
// of characters that have it (bold outermost, then italic, then the index).
export function writeMarkup(chars) {
  const groups = (list, same) => {
    const out = [];
    for (const c of list) {
      if (out.length && same(out.at(-1)[0], c)) out.at(-1).push(c);
      else out.push([c]);
    }
    return out;
  };
  const shifts = (list) => groups(list, (a, b) => a.shift === b.shift).map((g) => {
    const text = escapeMarkup(g.map((c) => c.ch).join(''));
    return g[0].shift ? `${g[0].shift === 'sub' ? '_' : '^'}{${text}}` : text;
  }).join('');
  const italics = (list) => groups(list, (a, b) => a.italic === b.italic).map((g) => (g[0].italic ? `~{${shifts(g)}}` : shifts(g))).join('');
  return groups(chars, (a, b) => a.bold === b.bold).map((g) => (g[0].bold ? `*{${italics(g)}}` : italics(g))).join('');
}

// A text formatted as a chemical formula: digits right after a letter or
// ")" become subscripts (H2SO4), and a charge at the end of a formula a
// superscript (H+, Cl-, AlCl4-, SO42-, Fe3+ for a lone element, [SiF6]2-
// after a bracket; the electron, e- and 2e-); _3 and ^2- (as LaTeX's mhchem writes them: CO_3^2-) and
// _{…}, ^{…} as written. No rule gets every case: x₂ and x² do the rest.
// Its characters [{ ch, shift, from }] (from: the index in `text` it came
// from, to keep the formatting of the characters it was made from).
export function chemChars(text) {
  const out = [];
  const push = (t, shift, from) => [...t].forEach((ch, k) => out.push({ ch, shift, from: from + k }));
  const sign = (s) => (s === '-' ? '−' : s);
  const signAtEnd = /^[+\-−](?=$|[\s,;.)\]])/;
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const braces = rest.match(/^([_^])\{([^}]*)\}/);
    if (braces) {
      push(braces[2], braces[1] === '_' ? 'sub' : 'sup', i + 2);
      i += braces[0].length;
      continue;
    }
    // mhchem's short forms: _3, ^2-, ^+
    const short = rest.match(/^_(\d+)|^\^(\d*[+\-−]|\d+)/);
    if (short) {
      const [kind, body] = short[1] !== undefined ? ['sub', short[1]] : ['sup', short[2]];
      [...body].forEach((ch, k) => out.push({ ch: sign(ch), shift: kind, from: i + 1 + k }));
      i += body.length + 1;
      continue;
    }
    const ch = text[i];
    const afterFormula = /[A-Za-z)\]]/.test(text[i - 1] ?? ' ');
    const word = text.slice(0, i).split(/[\s,;]/).at(-1);
    // a sign at the end of a formula (H+, AlCl4-) is a charge, and the electron's (e-, 2e-)
    if ((/^[A-Z(\[]/.test(word) || /^\d*e$/.test(word)) && /[A-Za-z0-9)\]]$/.test(word) && signAtEnd.test(rest)) {
      out.push({ ch: sign(ch), shift: 'sup', from: i });
      i += 1;
      continue;
    }
    if (afterFormula && /\d/.test(ch)) {
      const digits = rest.match(/^\d+/)[0];
      const after = text.slice(i + digits.length);
      const loneElement = /^[A-Z][a-z]?$/.test(word); // Fe3+, Cu2+: the digit is the charge's
      // after a complex ion's bracket, all of it is the charge: [SiF6]2-, [Fe(CN)6]3-
      if (signAtEnd.test(after) && text[i - 1] === ']') {
        push(digits, 'sup', i);
        out.push({ ch: sign(after[0]), shift: 'sup', from: i + digits.length });
        i += digits.length + 1;
      } else if (signAtEnd.test(after) && (digits.length > 1 || loneElement)) {
        push(digits.slice(0, -1), 'sub', i);
        push(digits.slice(-1), 'sup', i + digits.length - 1);
        out.push({ ch: sign(after[0]), shift: 'sup', from: i + digits.length });
        i += digits.length + 1;
      } else {
        push(digits, 'sub', i);
        i += digits.length;
      }
      continue;
    }
    out.push({ ch, shift: 0, from: i });
    i += 1;
  }
  return out;
}

// Runs [{ text, shift, bold, italic }] of a text: with `auto`, formatted as
// a formula (chemChars: group labels, template names); without, only its
// markup (the texts of a drawing: formatted where the user asked).
export function formatRuns(text, { auto = true } = {}) {
  const chars = auto ? chemChars(text).map((c) => ({ ...c, bold: false, italic: false })) : parseMarkup(text);
  const runs = [];
  for (const { ch, shift, bold, italic } of chars) {
    const last = runs.at(-1);
    if (last && last.shift === shift && last.bold === bold && last.italic === italic) last.text += ch;
    else runs.push({ text: ch, shift, bold, italic });
  }
  return runs;
}

// A text formatted as formulas, written out as markup (H2SO4 → H_{2}SO_{4},
// Fe3+ → Fe^{3+}).
export function chemMarkup(text) {
  return writeMarkup(chemChars(text).map(({ ch, shift }) => ({ ch, shift, bold: false, italic: false })));
}

// Width of formatted runs at font `size`.
export function runsWidth(runs, size, subScale = 0.7, options = {}) {
  return runs.reduce((sum, run) => sum + textWidth(run.text, run.shift ? size * subScale : size, { ...options, bold: options.bold || Boolean(run.bold) }), 0);
}
