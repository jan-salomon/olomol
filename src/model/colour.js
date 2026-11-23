// A colour as olomol keeps and draws it: a CSS hex colour, #rgb or #rrggbb (docs/olom.md), and for a highlight
// also one with a pattern, 'hatch:#f87171', 'lines:…' or 'dots:…' (docs/embed.md). Anything else is not a colour
// to olomol: a colour goes into the drawing's SVG markup as it stands, so one from a file, a link or an embedding
// page that isn't one of these is never kept or drawn.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PATTERNED = /^(?:hatch|lines|dots):#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const isColour = (value) => typeof value === 'string' && HEX.test(value);
export const isHighlight = (value) => typeof value === 'string' && (HEX.test(value) || PATTERNED.test(value));

// A drawing's colours and highlights that aren't one taken away (set to null: drawn in the default colour, not
// highlighted). Returns how many were.
export function cleanColours(doc) {
  let cleaned = 0;
  for (const things of Object.values(doc)) {
    if (!(things instanceof Map)) continue;
    for (const thing of things.values()) {
      if (!thing || typeof thing !== 'object') continue;
      for (const key of ['color', 'colorOther']) {
        if (thing[key] != null && !isColour(thing[key])) {
          thing[key] = null;
          cleaned++;
        }
      }
      if (thing.highlight != null && !isHighlight(thing.highlight)) {
        thing.highlight = null;
        cleaned++;
      }
    }
  }
  return cleaned;
}
