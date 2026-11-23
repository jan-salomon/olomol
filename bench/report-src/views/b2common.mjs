// Shared by the B2 views.
export const tex = (w, d = 1) => {
  if (w.p === null || w.p === undefined) return '--';
  const e = w.lo > 0.9995 ? Math.max(d, 3) : d;
  return `${(100 * w.p).toFixed(e)}\\,\\% (${(100 * w.lo).toFixed(e)}--${(100 * w.hi).toFixed(e)})`;
};

export function compareRows(c) {
  return [
    { label: 'canonical SMILES', expected: c.expected?.smiles ?? '–', got: c.got?.smiles ?? '–' },
    { label: 'InChIKey', expected: c.expected?.inchikey ?? '–', got: c.got?.inchikey ?? '–' },
  ];
}
