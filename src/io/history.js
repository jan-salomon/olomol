// Two lists olomol keeps in the browser (io/store.js), as pure functions here for the tests (tests/history.test.mjs):
// the recent files (opened or saved, newest first, each once) and a drawing's earlier versions (taken while it is
// drawn, a few minutes apart, newest last).

export const RECENT_MOST = 10;
// earlier versions: at least `gap` ms apart (the latest is replaced until then), at most `most` of them
export const VERSIONS = { gap: 5 * 60_000, most: 30 };

// The recent files with `entry` ({ name, handle, ket, at }) first; one that is the same file (`same(a, b)`,
// resolved for each before: the same name, and the same file where the browser can tell) taken out of where it was
export function withRecent(list, entry, sameAs) {
  return [entry, ...list.filter((other, i) => !sameAs[i])].slice(0, RECENT_MOST);
}

// A drawing's versions with `version` ({ at, ket }) added. The latest is the drawing as last kept, and stays only
// once it is `gap` after the one before it: until then a new one takes its place. So every version but the latest
// is at least `gap` after the one before it. The same drawing as the latest is no new version; the oldest go
// beyond `most`.
export function withVersion(list, version, { gap, most } = VERSIONS) {
  const last = list.at(-1);
  if (last?.ket === version.ket) return list;
  const before = list.at(-2);
  const provisional = last && before && last.at - before.at < gap;
  return [...(provisional ? list.slice(0, -1) : list), version].slice(-most);
}
