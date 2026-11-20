// Drawing style, in bond lengths (a bond is 1). Close to the ACS document
// style (ChemDraw's "ACS 1996"), with slightly smaller labels for screens.
export const STYLE = {
  line: 0.045, // bond line width
  font: 0.56, // atom label font size
  fontFamily: "Arial, Helvetica, 'Liberation Sans', sans-serif",
  family: 'sans', // 'sans' or 'serif' (FONTS)
  subScale: 0.7, // subscripts and charges, relative to the label font
  labelMargin: 0.08, // free space between a label and its bonds
  doubleGap: 0.18, // distance between the lines of a double bond
  wedgeWidth: 0.16, // the wide end of a wedge
  hashSpacing: 0.12, // between the lines of a hashed wedge
  wavyAmplitude: 0.06,
  arrowHeadLength: 0.17, // curved arrows
  arrowHeadHalfWidth: 0.065,
  arrowLine: 0.045,
  rxnHeadLength: 0.3, // reaction arrows
  rxnHeadHalfWidth: 0.11,
  dotRadius: 0.038, // lone pair dots
  radicalRadius: 0.052, // unpaired electrons
  dotHalfSpacing: 0.085,
  barHalfLength: 0.14,
  textFont: 0.5, // free text
  plusSize: 0.22, // half the width of a "+"
  straightDot: 0.055, // marks a carbon in a straight chain (C≡C–C)
  highlightRadius: 0.34, // RDKit-style marking: discs on atoms
  highlightWidth: 0.42, // and bands along bonds
  stereoFont: 0.36, // R/S and E/Z labels
  stereoColor: '#5b6472',
  numberFont: 0.3, // atom numbers
  numberColor: '#5b6472',
  exportScale: 40, // pixels per bond in exported pictures
};

// Drawing styles. 'screen', the default: a little smaller labels, for screens and slides, in bond lengths. The
// journals' in points, as their pictures come out at true size (a bond of 14.4 pt is 19.2 px):
//   'acs': ChemDraw's "ACS Document 1996", what ACS journals ask for (bonds 14.4 pt, lines 0.6 pt, bold and wedges
//     2 pt, hash spacing 2.5 pt, margins 1.6 pt, Arial 10 pt)
//   'rsc': what the RSC asks of authors (bonds 12.2 pt, lines 0.5 pt, bold 1.6 pt, Arial 7 pt; its hash spacing and
//     margins not given: ACS's, scaled to the shorter bond)
//   'slides': thicker lines and larger labels, for a projector
//   'custom': the user's own, in points (settings.customStyle: bond, line, bold, hash, margin, label, family)
// `family`: the font of labels and texts, 'sans' (Arial, Helvetica) or 'serif' (Times New Roman).
const PT = 1 / 14.4; // one point, in ACS bond lengths
export const FONTS = {
  sans: "Arial, Helvetica, 'Liberation Sans', sans-serif",
  serif: "'Times New Roman', Times, 'Liberation Serif', serif",
};
// A style from sizes in points: the bond length, line width, bold (and wedge) width, hash spacing, margin round
// labels, the label size and the font family
export const fromPoints = ({ bond, line, bold, hash, margin, label, family = 'sans' }) => ({
  line: line / bond, font: label / bond, labelMargin: margin / bond, wedgeWidth: bold / bond, hashSpacing: hash / bond,
  arrowLine: line / bond, textFont: label / bond, exportScale: (bond * 4) / 3, family,
});
export const POINTS = {
  acs: { bond: 14.4, line: 0.6, bold: 2, hash: 2.5, margin: 1.6, label: 10, family: 'sans' },
  rsc: { bond: 12.2, line: 0.5, bold: 1.6, hash: 2.1, margin: 1.4, label: 7, family: 'sans' },
};
export const STYLES = {
  screen: { line: 0.045, font: 0.56, labelMargin: 0.08, wedgeWidth: 0.16, hashSpacing: 0.12, arrowLine: 0.045, textFont: 0.5, exportScale: 40, family: 'sans' },
  acs: fromPoints(POINTS.acs),
  rsc: fromPoints(POINTS.rsc),
  slides: { line: 0.07, font: 0.62, labelMargin: 0.1, wedgeWidth: 0.22, hashSpacing: 0.14, arrowLine: 0.07, textFont: 0.56, exportScale: 60, family: 'sans' },
};
// What a custom style may be, in points (beyond these it draws badly): [least, most]
export const LIMITS = { bond: [6, 40], line: [0.2, 3], bold: [0.5, 8], hash: [1, 8], margin: [0, 6], label: [4, 24] };
export const clampPoints = (points) => ({
  ...POINTS.acs, ...points,
  ...Object.fromEntries(Object.entries(LIMITS).map(([key, [least, most]]) => [key, Math.min(most, Math.max(least, Number(points?.[key] ?? POINTS.acs[key]) || POINTS.acs[key]))])),
  family: points?.family === 'serif' ? 'serif' : 'sans',
});

// A drawing's style as kept in it (doc.style), each key in this order (two are compared as text): its sizes, a
// preset's name or 'custom' and its points; and its look: charges circled (⊕ ⊖), lone pairs as bars (Lewis),
// written only when so. `from`: { style, customStyle, charges, lonePairs } (the defaults left out).
export const styleOf = ({ style = 'screen', customStyle, charges, lonePairs }) => ({
  style, ...(style === 'custom' && { customStyle }), ...(charges === 'circled' && { charges }), ...(lonePairs === 'bars' && { lonePairs }),
});

// The style for new drawings, from the settings (Settings → Style, Charges, Lone pairs; Use for new drawings)
export const defaultStyleOf = (settings) => styleOf({ style: settings.style ?? 'screen', customStyle: settings.customStyle, charges: settings.chargeStyle, lonePairs: settings.pairStyle });

// The style of `settings` (its name, and for 'custom' its points) put in place; a name alone as before
export function applyStyle(settings) {
  const name = typeof settings === 'string' ? settings : settings?.style;
  const style = name === 'custom' ? fromPoints(clampPoints(settings?.customStyle)) : STYLES[name] ?? STYLES.screen;
  Object.assign(STYLE, style, { fontFamily: FONTS[style.family] ?? FONTS.sans });
}

export const INK = '#000000';
// The stick model's highlights, in depth among its balls and sticks: this opaque, what lies behind showing a little.
// Each is LAYERS thin see-through copies, from just behind its atom to `ramp` further back (half a bond), so
// that what passes behind it is covered a layer at a time as it turns, not all at once (a jump); together as
// opaque as IN_DEPTH, and seen face on one flat shape as before.
export const IN_DEPTH = 0.75;
const LAYERS = 8;
export const LAYER_OPACITY = +(1 - (1 - IN_DEPTH) ** (1 / LAYERS)).toFixed(3);
export const layerDepths = (z, ramp) => Array.from({ length: LAYERS }, (_, k) => z - 1e-3 - (ramp * k) / (LAYERS - 1));
