// Languages. The English text is the key, so the code reads as English;
// each language is a table of English → its own text (cs.js, de.js). A
// text missing from a table stays English, and tests/i18n.test.mjs lists
// what is missing. {name} in a text is filled in from `values`; a table
// entry { one, few, other } is a text with a count {n} (Czech: 1 atom,
// 2 atomy, 5 atomů), picked by the language's own rules.
// The language is chosen once, when the page loads; choosing another one
// in Settings reloads the page (the drawing is kept), so texts made when
// a module loads come out in the right language too.
import { cloneElement, isValidElement } from 'react';
import cs from './cs.js';
import de from './de.js';
import en from './en.js';

export const LANGUAGES = [['en', 'English'], ['cs', 'Čeština'], ['de', 'Deutsch']];
const TABLES = { en, cs, de };
const KEY = 'olomol-language';

// The language picked in Settings (a code), or null: the browser's.
export function pickedLanguage() {
  try {
    const code = localStorage.getItem(KEY);
    return TABLES[code] ? code : null;
  } catch {
    return null;
  }
}

export function pickLanguage(code) {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    // not remembered
  }
}

// The language of the address (?lang=cs), else the one picked in
// Settings, else the browser's first one we have. English outside a
// browser, and in the browser tests unless they pick one.
function chosen() {
  if (typeof document === 'undefined') return 'en';
  const query = new URLSearchParams(location.search);
  if (TABLES[query.get('lang')]) return query.get('lang');
  const picked = pickedLanguage();
  if (picked) return picked;
  if (query.has('test')) return 'en';
  const code = (navigator.languages ?? [navigator.language]).map((tag) => tag.split('-')[0].toLowerCase()).find((c) => TABLES[c]);
  return code ?? 'en';
}

export const language = chosen();
if (typeof document !== 'undefined') document.documentElement.lang = language;

const plurals = new Intl.PluralRules(language);

// The text in the current language, with `values` filled in. With a React
// element among the values (a link), the result is a list for JSX.
export function t(text, values) {
  let found = TABLES[language][text] ?? en[text] ?? text;
  if (typeof found === 'object') found = found[plurals.select(values.n)] ?? found.other;
  if (!values) return found;
  const parts = found.split(/\{(\w+)\}/); // odd places: the names
  if (!Object.values(values).some(isValidElement)) return parts.map((part, i) => (i % 2 ? values[part] : part)).join('');
  return parts.map((part, i) => (i % 2 && isValidElement(values[part]) ? cloneElement(values[part], { key: i }) : i % 2 ? values[part] : part));
}
