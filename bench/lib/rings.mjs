// Ring facts from RDKit's ring perception (its SSSR, with the atoms of each
// ring in order round it), for picking the B3 data sets.
// - bridgehead atoms as RDKit defines them (rdMolDescriptors
//   CalcNumBridgeheadAtoms): where two rings share two bonds or more, the
//   two ends of the shared path;
// - the largest ring;
// - the largest fused system: rings joined through shared bonds (sharing a
//   single atom, spiro, doesn't fuse).
export function ringFacts(RDKit, smiles) {
  const mol = RDKit.get_mol(smiles);
  if (!mol) return null;
  try {
    const json = JSON.parse(mol.get_json());
    const m = json.molecules[0];
    const rings = m.extensions?.find((e) => e.name === 'rdkitRepresentation')?.atomRings ?? [];
    const bondKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const ringBonds = rings.map((ring) => new Set(ring.map((a, i) => bondKey(a, ring[(i + 1) % ring.length]))));
    const bridgeheads = new Set();
    const fusedWith = rings.map(() => []);
    for (let i = 0; i < rings.length; i++) {
      for (let j = i + 1; j < rings.length; j++) {
        const shared = [...ringBonds[i]].filter((b) => ringBonds[j].has(b));
        if (shared.length >= 1) {
          fusedWith[i].push(j);
          fusedWith[j].push(i);
        }
        if (shared.length >= 2) {
          const count = new Map();
          for (const b of shared) for (const a of b.split('-')) count.set(a, (count.get(a) ?? 0) + 1);
          for (const [a, n] of count) if (n === 1) bridgeheads.add(Number(a));
        }
      }
    }
    let largestFused = 0;
    const seen = new Set();
    for (let i = 0; i < rings.length; i++) {
      if (seen.has(i)) continue;
      const system = [i];
      seen.add(i);
      for (let k = 0; k < system.length; k++) for (const j of fusedWith[system[k]]) if (!seen.has(j)) { seen.add(j); system.push(j); }
      largestFused = Math.max(largestFused, system.length);
    }
    return {
      heavyAtoms: m.atoms.length,
      elements: new Set(m.atoms.map((a) => a.z ?? 6)),
      rings: rings.length,
      largestRing: Math.max(0, ...rings.map((r) => r.length)),
      bridgeheads: bridgeheads.size,
      largestFused,
    };
  } finally {
    mol.delete();
  }
}

// The organic subset (and the elements drug-like molecules have): H B C N O F Si P S Cl Se Br I.
export const ORGANIC = new Set([1, 5, 6, 7, 8, 9, 14, 15, 16, 17, 34, 35, 53]);

// The largest piece of a SMILES with several (a salt's counterion dropped), by heavy atoms in the text.
export function largestFragment(smiles) {
  const pieces = smiles.split('.');
  if (pieces.length === 1) return smiles;
  const size = (s) => (s.match(/Cl|Br|[BCNOFPSI]|\[[^\]]*\]|[cnops]/g) ?? []).length;
  return pieces.reduce((best, s) => (size(s) > size(best) ? s : best));
}
