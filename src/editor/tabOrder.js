// The order of the open drawings (tabs), as ids: which one comes forward when one is closed, the order they
// come back in, a step to the next. Pure, for the tests (tests/tabs.test.mjs); ui/tabs.js uses them.

// The tab that comes forward when `id` is closed: the one to its right, else to its left (null: none left)
export function afterClosing(order, id) {
  const at = order.indexOf(id);
  if (at < 0) return null;
  return order[at + 1] ?? order[at - 1] ?? null;
}

// The order the drawings kept come back in: as the last session had them (`session`), then any others kept
// (another window's, one a crash left out), oldest kept first; ids no longer kept are left out
export function restoredOrder(session, kept) {
  const known = new Map(kept.map((record) => [record.id, record]));
  const first = (session ?? []).filter((id, i, ids) => known.has(id) && ids.indexOf(id) === i);
  const rest = kept.filter((record) => !first.includes(record.id)).sort((a, b) => (a.keptAt ?? 0) - (b.keptAt ?? 0)).map((record) => record.id);
  return [...first, ...rest];
}

// The tab `step` (1 or -1) from `id`, round the ends
export function stepFrom(order, id, step) {
  const at = order.indexOf(id);
  if (at < 0 || !order.length) return null;
  return order[(at + step + order.length) % order.length];
}

// `order` with `id` moved to position `to` (0: first)
export function moved(order, id, to) {
  const rest = order.filter((other) => other !== id);
  const at = Math.max(0, Math.min(rest.length, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
