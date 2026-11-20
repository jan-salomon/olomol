// Minimal molfiles for the ring templates: atom symbols and 2D coordinates,
// bonds with order and stereo (V2000 codes: 1 wedge, 6 hash, 4 either).
// Indices are 0-based. Reads V2000 and V3000, writes V2000. (The drawing's
// own molfiles, with charges and radicals, are in io/molfile.js.)

export function parseMolfile(molfile) {
  const lines = molfile.split('\n');
  const counts = lines[3] ?? '';
  if (counts.includes('V3000')) return parseV3000(lines);
  const nAtoms = parseInt(counts.slice(0, 3), 10);
  const nBonds = parseInt(counts.slice(3, 6), 10);
  const atoms = lines.slice(4, 4 + nAtoms).map((line) => ({
    x: parseFloat(line.slice(0, 10)),
    y: parseFloat(line.slice(10, 20)),
    symbol: line.slice(31, 34).trim(),
  }));
  const bonds = lines.slice(4 + nAtoms, 4 + nAtoms + nBonds).map((line) => ({
    a: parseInt(line.slice(0, 3), 10) - 1,
    b: parseInt(line.slice(3, 6), 10) - 1,
    order: parseInt(line.slice(6, 9), 10),
    stereo: parseInt(line.slice(9, 12), 10) || 0,
  }));
  return { atoms, bonds };
}

// Indigo writes V3000 when it must (e.g. AND/OR stereo groups), whatever we ask for.
function parseV3000(lines) {
  // "M  V30 ..." lines; a trailing "-" continues a line on the next one.
  const v30 = lines.filter((line) => line.startsWith('M  V30 ')).map((line) => line.slice(7)).join('\n').replace(/-\n/g, '').split('\n');
  const block = (name) => v30.slice(v30.indexOf(`BEGIN ${name}`) + 1, v30.indexOf(`END ${name}`));
  const atoms = block('ATOM').map((line) => {
    const [, symbol, x, y] = line.trim().split(/\s+/);
    return { x: parseFloat(x), y: parseFloat(y), symbol };
  });
  const stereoCode = { 1: 1, 3: 6, 2: 4 }; // V3000 CFG= -> V2000 stereo
  const bonds = block('BOND').map((line) => {
    const [, order, a, b, ...properties] = line.trim().split(/\s+/);
    const cfg = properties.find((p) => p.startsWith('CFG='))?.slice(4);
    return { a: parseInt(a, 10) - 1, b: parseInt(b, 10) - 1, order: parseInt(order, 10), stereo: stereoCode[cfg] ?? 0 };
  });
  return { atoms, bonds };
}

const pad = (value, width) => String(value).padStart(width);

// atoms: [{symbol, x, y, isotope?}], bonds: [{a, b, order}]
export function writeMolfile(atoms, bonds) {
  const lines = ['', '  olomol', '', `${pad(atoms.length, 3)}${pad(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const { x, y, symbol } of atoms) {
    lines.push(`${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}    0.0000 ${symbol.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  }
  for (const { a, b, order } of bonds) lines.push(`${pad(a + 1, 3)}${pad(b + 1, 3)}${pad(order, 3)}  0`);
  lines.push(...isotopeLines(atoms.map((atom, i) => [i, atom.isotope]).filter(([, iso]) => iso)), 'M  END');
  return lines.join('\n');
}

// "M  ISO" property lines for [[atomIndex, isotope], ...], at most 8 per line.
export function isotopeLines(pairs) {
  const lines = [];
  for (let i = 0; i < pairs.length; i += 8) {
    const chunk = pairs.slice(i, i + 8);
    lines.push(`M  ISO${pad(chunk.length, 3)}${chunk.map(([atom, iso]) => `${pad(atom + 1, 4)}${pad(iso, 4)}`).join('')}`);
  }
  return lines;
}

// A clean-up's molfile (`after`: the same atoms and bonds as `before`, moved) with each wedge read as it was:
// a wedge or hashed wedge says its group is on the viewer's side of its centre's other bonds, or behind them,
// and with the atoms moved that can turn round (a chair's wedges, chosen for the chair's own shape, on the
// ring evened out into a hexagon); there it becomes the other one. V2000 only (V3000 as it is).
export function keepHandedness(before, after) {
  if (!before || !after || after.split('\n')[3]?.includes('V3000')) return after;
  const [old, now] = [parseMolfile(before), parseMolfile(after)];
  if (old.atoms.length !== now.atoms.length || old.bonds.length !== now.bonds.length) return after;
  const volume = ([u, v, w]) => u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
  // how the page reads the centre at the wedge's narrow end (+1 or −1; 0: it can't say)
  const sense = ({ atoms, bonds }, k) => {
    const { a: c, b: d, stereo } = bonds[k];
    const others = bonds.filter((x, j) => j !== k && (x.a === c || x.b === c)).map((x) => (x.a === c ? x.b : x.a)).slice(0, 2);
    if (others.length < 2) return 0;
    const from = (i) => [atoms[i].x - atoms[c].x, atoms[i].y - atoms[c].y, i === d ? (stereo === 1 ? 1 : -1) : 0];
    const v = volume([d, ...others].map(from));
    return Math.abs(v) < 1e-3 ? 0 : Math.sign(v);
  };
  const lines = after.split('\n');
  const nAtoms = now.atoms.length;
  now.bonds.forEach((bond, k) => {
    const was = old.bonds[k];
    if (![1, 6].includes(bond.stereo) || was.stereo !== bond.stereo || was.a !== bond.a || was.b !== bond.b) return;
    const [s0, s1] = [sense(old, k), sense(now, k)];
    if (s0 && s1 && s0 !== s1) {
      const line = lines[4 + nAtoms + k];
      lines[4 + nAtoms + k] = `${line.slice(0, 9)}${String(bond.stereo === 1 ? 6 : 1).padStart(3)}${line.slice(12)}`;
    }
  });
  return lines.join('\n');
}
