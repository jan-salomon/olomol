// Atom labels: which atoms show one, and where the element symbol, its
// hydrogens, charge and isotope go. The symbol is centred on the atom; the
// hydrogens go to the side with the most room (right first, then left, then
// above or below), as in printed structures: OH, HO, H2N, NH in a ring.
// Positions are relative to the atom, in bond lengths, y down.
import { H_FIRST, isotopeLetter } from '../chem/elements.js';
import { labelLayout } from '../chem/abbreviations.js';
import { labelElements } from '../chem/condensed.js';
import { STYLE } from './style.js';
import { CAP_HEIGHT, formatRuns, runsWidth, textWidth } from './text.js';

const DEGREE = Math.PI / 180;
const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export const SIDES = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

// Does the atom get a label? Carbons only when charged, labelled with an
// isotope, alone, given hydrogens by hand, at a chain end (if
// `terminalCarbons`, or the atom's own `endLabel` if set), or when
// something is wrong with them; every carbon (CH2, CH, C too) with
// `allCarbons` (for beginners: a corner is a carbon), or the atom's own
// `carbonLabel` if set (false: not even with a charge, which then stands at
// the corner).
export function hasLabel(atom, degree, electrons, { terminalCarbons = true, allCarbons = false } = {}) {
  if (atom.el !== 'C') return true;
  const written = atom.carbonLabel ?? (allCarbons || ((atom.endLabel ?? terminalCarbons) && degree === 1));
  // (a charged carbon not written, carbonLabel false: its charge at the corner, as in ring corners' C⁺ drawn as +)
  return Boolean((atom.charge && atom.carbonLabel !== false) || atom.isotope || degree === 0 || electrons?.error || (atom.hCount !== null && atom.hCount !== undefined) || written);
}

// The side for the hydrogens, given the directions (angles) of the atom's bonds.
export function hydrogenSide(atom, bondAngles) {
  if (atom.hSide) return atom.hSide; // set by a template (HO on the left of a Haworth ring)
  if (!bondAngles.length) return H_FIRST.has(atom.el) ? 'left' : 'right';
  const room = (side) => Math.min(...bondAngles.map((a) => angleBetween(a, SIDES[side])));
  if (room('right') >= 60 * DEGREE) return 'right';
  if (room('left') >= 60 * DEGREE) return 'left';
  return ['right', 'left', 'down', 'up'].reduce((best, side) => (room(side) > room(best) + 1e-9 ? side : best));
}

// A label written to its usual side that runs into another atom (OH beside an H drawn close to it, CH2OH over
// the OH of the next carbon): the other side ('left' or 'right', HO, HOH2C) if it has room there (no bond
// within 60°, no atom in the way), else null. `others`: other atoms' points, relative to this one. Only for
// a label with hydrogens or a group's text, whose side is not set by hand or a template.
const IN_THE_WAY = 0.25; // (an atom's own label, an H, reaches about 0.2 round it, and a little space)
export function crowdedLabelSide(atom, bondAngles, hydrogens, others) {
  if (atom.hSide || !(hydrogens > 0 || atom.alias)) return null;
  const hits = (label) => label.boxes.some((b) => !b.charge && others.some(([x, y]) => x > b.x1 - IN_THE_WAY && x < b.x2 + IN_THE_WAY && y > b.y1 - IN_THE_WAY && y < b.y2 + IN_THE_WAY));
  const now = layoutLabel(atom, bondAngles, hydrogens);
  if (!hits(now)) return null;
  const reach = (sign) => Math.max(0, ...now.boxes.map((b) => sign * (sign > 0 ? b.x2 : b.x1)));
  const side = reach(1) > reach(-1) + 0.05 ? 'left' : reach(-1) > reach(1) + 0.05 ? 'right' : null;
  if (!side || bondAngles.some((a) => angleBetween(a, SIDES[side]) < 60 * DEGREE)) return null;
  return hits(layoutLabel({ ...atom, hSide: side }, bondAngles, hydrogens)) ? null : side;
}

// A group label as written: R' with a real prime.
export const groupText = (alias) => alias.replace(/''/g, '″').replace(/'/g, '′');

// The label of an atom: { runs: [{ text, x, y, size }] (x: left end, y:
// baseline), circles (circled charges: [{ cx, cy, r, sign }]), boxes: [{
// x1, y1, x2, y2 }], hSide, symbolBox, chargeAngle }. `bondAngles`:
// directions of its bonds; `hydrogens`: how many H to write; `avoid`: more
// directions the charge should keep away from (electrons); `circled`:
// charges as ⊕ and ⊖; `partial`: +1 or -1 to write δ+ or δ− instead;
// `wide`: those of `bondAngles` that are double or triple bonds; `lobes`:
// orbitals' lobes on the atom, [{ angle, half }] (half width): the charge
// is written where none runs.
export function layoutLabel(atom, bondAngles, hydrogens, avoid = [], { circled = false, partial = 0, wide = [], lobes = [] } = {}) {
  const size = STYLE.font;
  // (a label made bold: measured and written bold)
  const bold = Boolean(atom.bold);
  const widthOf = (text, s) => textWidth(text, s, { bold });
  const small = size * STYLE.subScale;
  const cap = CAP_HEIGHT * size;
  const baseline = cap / 2;
  // a group label (R1, Nu, Ph) with its digits as subscripts; an abbreviation
  // such as OMe with its O on the atom, written MeO when the bond comes from the right
  const written = atom.alias ? labelLayout(atom.alias, bondAngles, atom.hSide === 'left') : null;
  const parts = written ? formatRuns(groupText(written.text)) : null;
  const letter = isotopeLetter(atom); // D, T: hydrogen 2 and 3, written as their letters
  const symbol = letter ?? atom.el;
  const symbolWidth = parts ? runsWidth(parts, size, STYLE.subScale, { bold }) : widthOf(symbol, size);
  const runs = [];
  const boxes = [];
  const box = (x1, y1, x2, y2) => boxes.push({ x1, y1, x2, y2 });
  const run = (text, x, y, s, el = null) => {
    runs.push({ text, x, y, size: s, ...(el ? { el } : {}), ...(bold && { bold: true }) });
    return x + widthOf(text, s);
  };

  // the symbol, centred (or its attaching letter)
  let left = -symbolWidth / 2;
  if (written?.anchor === 'start') left = -widthOf(written.text.slice(0, written.lead ?? 1), size) / 2;
  if (written?.anchor === 'end') left = -symbolWidth + widthOf(written.text.slice(-(written.lead ?? 1)), size) / 2;
  if (parts) {
    // the letters that are atoms with their element (the P of PPh3, not the P of PMB), to be coloured
    // like it; each run split where that changes
    let elements = labelElements(groupText(written.text), { reversed: written.anchor === 'end' });
    if (elements?.length !== parts.reduce((n, part) => n + part.text.length, 0)) elements = null;
    let x = left;
    let at = 0;
    for (const part of parts) {
      const y = baseline + (part.shift === 'sub' ? 0.22 * size : part.shift === 'sup' ? -0.42 * size : 0);
      const s = part.shift ? small : size;
      let piece = '';
      let el = null;
      for (const ch of part.text) {
        const next = elements?.[at++] ?? null;
        if (piece && next !== el) {
          x = run(piece, x, y, s, el);
          piece = '';
        }
        piece += ch;
        el = next;
      }
      if (piece) x = run(piece, x, y, s, el);
    }
  } else {
    run(symbol, left, baseline, size);
  }
  const symbolBox = { x1: left, y1: -cap / 2, x2: left + symbolWidth, y2: cap / 2 };
  box(symbolBox.x1, symbolBox.y1, symbolBox.x2, symbolBox.y2);
  let rowLeft = left; // the row the symbol is in, for the isotope and charge
  let rowRight = left + symbolWidth;

  // hydrogens: "H" and a subscript count
  const hSide = hydrogens > 0 ? hydrogenSide(atom, bondAngles) : null;
  // isotope: superscript before the symbol, between it and hydrogens on the left (H3¹³C, ¹³CH3)
  const raise = 0.42 * size;
  const isotope = atom.isotope && !letter ? String(atom.isotope) : null;
  const writeIsotope = () => {
    rowLeft -= widthOf(isotope, small);
    const end = run(isotope, rowLeft, baseline - raise, small);
    box(rowLeft, baseline - raise - CAP_HEIGHT * small, end, baseline - raise);
  };
  if (isotope && hSide === 'left') writeIsotope();
  if (hSide) {
    const count = hydrogens > 1 ? String(hydrogens) : '';
    const hWidth = widthOf('H', size);
    const countWidth = widthOf(count, small);
    const subDrop = 0.22 * size;
    const place = (x, y) => {
      const end = run('H', x, y, size);
      box(x, y - cap, end, y);
      if (count) {
        const countEnd = run(count, end, y + subDrop, small);
        box(end, y + subDrop - CAP_HEIGHT * small, countEnd, y + subDrop);
      }
    };
    if (hSide === 'right') {
      place(rowRight, baseline);
      rowRight += hWidth + countWidth;
    } else if (hSide === 'left') {
      rowLeft -= hWidth + countWidth;
      place(rowLeft, baseline);
    } else {
      const lineHeight = cap * 1.45;
      const y = baseline + (hSide === 'up' ? -lineHeight : lineHeight);
      place(-hWidth / 2, y);
    }
  }

  if (isotope && hSide !== 'left') writeIsotope();
  // charge: a superscript at the top right of the row; if a bond leaves
  // there, at another free corner of the symbol (N⁺–CH3 in a ring)
  let chargeAngle = null;
  const circles = [];
  if (atom.charge || partial) {
    // a partial charge (δ−) is never circled
    if (partial) circled = false;
    const digits = !partial && Math.abs(atom.charge) > 1 ? String(Math.abs(atom.charge)) : '';
    const sign = partial ? `δ${partial > 0 ? '+' : '−'}` : atom.charge > 0 ? '+' : '−';
    const r = 0.11; // of a circled sign
    const width = circled ? widthOf(digits, small) + 2 * r + 0.01 : widthOf(digits + sign, small);
    // (hydrogens written left or right don't count: the charge goes past them, NH3⁺)
    const taken = [...bondAngles, ...(hSide === 'up' || hSide === 'down' ? [SIDES[hSide]] : []), ...avoid, ...lobes.map((l) => l.angle)];
    const free = (angle) => Math.round(Math.min(Math.PI, ...taken.map((a) => angleBetween(a, angle))) / DEGREE);
    // corners (x, y: where the text starts; out: which way is away from the
    // symbol) with a preference: top right is where charges usually are;
    // straight beside, over or under the symbol when bonds take the corners ([AuCl4]⁻)
    const high = CAP_HEIGHT * small;
    // a label of an atom with groups on a bond (PPh3, `lead` letters on the atom): the charge is that
    // atom's, so beside it (⁺PPh3, Ph3P⁺), not past the groups
    const lead = written?.lead ? widthOf(written.anchor === 'start' ? written.text.slice(0, written.lead) : written.text.slice(-written.lead), size) : 0;
    const atomMiddle = written?.anchor === 'start' ? left + lead / 2 : left + symbolWidth - lead / 2;
    const middle = (lead ? atomMiddle : (symbolBox.x1 + symbolBox.x2) / 2) - width / 2;
    const corners = [
      { angle: -40 * DEGREE, x: rowRight + 0.01, y: baseline - raise, out: [1, -1], bonus: 15 },
      { angle: -140 * DEGREE, x: rowLeft - width - 0.01, y: baseline - raise, out: [-1, -1], bonus: 5 },
      { angle: 40 * DEGREE, x: symbolBox.x2 + 0.01, y: baseline + 0.28 * size, out: [1, 1], bonus: 0 },
      { angle: 140 * DEGREE, x: rowLeft - width - 0.01, y: baseline + 0.28 * size, out: [-1, 1], bonus: 0 },
      { angle: 0, x: rowRight + 0.03, y: high / 2, out: [1, 0], bonus: -5 },
      { angle: -90 * DEGREE, x: middle, y: symbolBox.y1 - 0.05, out: [0, -1], bonus: -5 },
      { angle: Math.PI, x: rowLeft - width - 0.03, y: high / 2, out: [-1, 0], bonus: -8 },
      { angle: 90 * DEGREE, x: middle, y: symbolBox.y2 + high + 0.05, out: [0, 1], bonus: -8 },
    ].filter((c) => !lead || (written.anchor === 'start' ? c.out[0] < 1 : c.out[0] > -1))
      // (the groups to the right: top left takes the preference top right has, ⁺PPh3)
      .map((c) => (lead && written.anchor === 'start' && c.angle === -140 * DEGREE ? { ...c, bonus: 15 } : c));
    // (more than 60° of room is no better: then the preference decides; a crowded corner isn't
    // preferred; one a bond runs through, as the charge would be written there, much less)
    // (a double bond's lines run either side of its angle: O=C=O's top line through a δ+ at the corner)
    // (an orbital's lobe is as wide as it is: its middle and its sides)
    const lines = [
      ...bondAngles.map((a) => [a, wide.includes(a) ? [0, STYLE.doubleGap / 2, -STYLE.doubleGap / 2] : [0]]),
      ...lobes.map(({ angle, half }) => [angle, [0, half / 2, -half / 2, half, -half]]),
    ];
    const crossed = (c) => lines.some(([a, offsets]) => {
      const box = [c.x - 0.02, c.y - CAP_HEIGHT * small - 0.02, c.x + width + 0.02, c.y + 0.02];
      return offsets.some((d) => {
        const hit = throughBox(...box, -Math.sin(a) * d, Math.cos(a) * d, Math.cos(a), Math.sin(a));
        return hit > 0 && hit < 1;
      });
    });
    const score = (c) => Math.min(60, free(c.angle)) + (free(c.angle) >= 30 ? c.bonus : Math.min(0, c.bonus)) - (crossed(c) ? 40 : 0);
    const corner = corners.reduce((best, c) => (score(c) > score(best) ? c : best));
    // a lone pair close by: a little further out, so they don't touch
    if (free(corner.angle) < 50) {
      corner.x += corner.out[0] * 0.13;
      corner.y += corner.out[1] * 0.06;
    }
    let end;
    if (circled) {
      const x = digits ? run(digits, corner.x, corner.y, small) : corner.x;
      const cy = corner.y - (CAP_HEIGHT * small) / 2;
      circles.push({ cx: x + r + 0.005, cy, r, sign: Math.sign(atom.charge) });
      end = x + 2 * r + 0.01;
    } else {
      end = run(digits + sign, corner.x, corner.y, small);
    }
    // a bond running through the charge is cut off by it (there may be no free corner: four bonds)
    boxes.push({ x1: corner.x, y1: corner.y - CAP_HEIGHT * small - (circled ? 0.03 : 0), x2: end, y2: corner.y + 0.02, margin: STYLE.labelMargin * 0.6, charge: true });
    chargeAngle = corner.angle;
  }
  return { runs, circles, boxes, hSide, symbolBox, chargeAngle };
}

// How far a ray from (ox, oy) (relative to the atom's centre) in direction
// (dx, dy) (a unit vector) runs inside the label's boxes, grown by
// `margin`, before it is out: 0 if it starts outside them. A charge's box
// also cuts it where the ray only runs through it further on.
export function exitDistance(boxes, ox, oy, dx, dy, margin = STYLE.labelMargin) {
  let distance = 0;
  // Leaving one box may enter the next (symbol, then H): repeat until clear.
  for (let pass = 0; pass <= boxes.length; pass++) {
    let moved = false;
    for (const b of boxes) {
      const m = Math.min(margin, b.margin ?? margin);
      const [x1, y1, x2, y2] = [b.x1 - m, b.y1 - m, b.x2 + m, b.y2 + m];
      if (b.charge) {
        const out = throughBox(x1, y1, x2, y2, ox, oy, dx, dy);
        if (out > distance + 1e-9) {
          distance = out;
          moved = true;
        }
        continue;
      }
      const px = ox + distance * dx;
      const py = oy + distance * dy;
      if (px < x1 - 1e-9 || px > x2 + 1e-9 || py < y1 - 1e-9 || py > y2 + 1e-9) continue;
      // out through the side the ray reaches first
      const tx = dx > 0 ? (x2 - px) / dx : dx < 0 ? (x1 - px) / dx : Infinity;
      const ty = dy > 0 ? (y2 - py) / dy : dy < 0 ? (y1 - py) / dy : Infinity;
      const t = Math.min(tx, ty);
      if (t > 1e-9) {
        distance += t;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return distance;
}

// Where a ray leaves a box it runs through (its distance), or 0 if it misses it.
function throughBox(x1, y1, x2, y2, ox, oy, dx, dy) {
  let [enter, leave] = [0, Infinity];
  for (const [o, d, lo, hi] of [[ox, dx, x1, x2], [oy, dy, y1, y2]]) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return 0;
      continue;
    }
    const [a, b] = [(lo - o) / d, (hi - o) / d];
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  return enter < leave ? leave : 0;
}
