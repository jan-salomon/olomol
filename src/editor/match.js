// How well a search (the search bar, Search.jsx) matches a name: in lower case and without diacritics (Kekule
// finds Kekulé), each word typed matching the start of a word of the name (in any order), a word of five letters
// or more also by its stem, without its last two (Czech and German endings: židlička finds "Překlopení židličky"),
// or failing that a part of a word. Pure, for the tests (tests/match.test.mjs).

export const plain = (text) => String(text).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
const wordsOf = (text) => plain(text).split(/[^\p{L}\p{N}+−-]+/u).filter(Boolean);

// The best of `names` (the name in this language, in English, other words for it) for `query`: 0 no match,
// 1 a part of a word, 2 the start of words, 3 the name starts with the query, 4 the query is the name
export function matchScore(query, names) {
  const typed = wordsOf(query);
  if (!typed.length) return 0;
  const whole = plain(query).trim();
  let best = 0;
  for (const name of names.filter(Boolean)) {
    const full = plain(name);
    const words = wordsOf(name);
    let score = 0;
    if (full === whole) score = 4;
    else if (full.startsWith(whole)) score = 3;
    else if (typed.every((word) => words.some((w) => w.startsWith(word) || (word.length >= 5 && w.startsWith(word.slice(0, -2)))))) score = 2;
    else if (typed.every((word) => word.length >= 3 && words.some((w) => w.includes(word)))) score = 1;
    best = Math.max(best, score);
  }
  return best;
}

// How `item` matches: by its names, and by other words for it (`alsoOf`) only from three letters typed and at most as
// the start of a word (2), so that its own name always counts for more
export function scoreOf(query, names, also = []) {
  const own = matchScore(query, names);
  const other = also.length && plain(query).trim().length >= 3 ? Math.min(2, matchScore(query, also)) : 0;
  return Math.max(own, other);
}

// `items` that match, best first (then shorter names first, then as they came): [{ item, score }]
export function ranked(query, items, namesOf, most = Infinity, alsoOf = () => []) {
  return items.map((item, index) => ({ item, index, score: scoreOf(query, namesOf(item), alsoOf(item)), length: plain(namesOf(item)[0] ?? '').length }))
    .filter((found) => found.score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length || a.index - b.index)
    .slice(0, most)
    .map(({ item, score }) => ({ item, score }));
}
