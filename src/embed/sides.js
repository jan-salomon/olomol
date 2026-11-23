// A step's molecules and its products, by atom ids: with one reaction arrow, those before it and on it, and those
// after it; else all of them, and no products. What leaves on the arrow counts with the products: a molecule at the
// free end of a side arc's way out (H₂O out, NAD⁺) or written with a minus (− H₂O). What comes in on an arc (NADH,
// H₂O in) or stands on the arrow (H₃O⁺, a catalyst) is the step's: curved arrows go to and from it.
// (For canonical.js, in the browser: reactionSides is files.js's.)
import { reactionSides } from '../io/files.js';
import { REACTION_ARROWS } from '../io/lost.js';

// An atom of a molecule that leaves on its reaction arrow: at the free end of a side arc's way out (H₂O out, NAD⁺)
// or written with a minus (− H₂O): a product of the step
export const leaving = (atom) => atom?.arrow != null && (/-out$/.test(atom.arrowSlot ?? '') || atom.arrowSign === '−');

export function sidesOf(doc) {
  const reactions = [...doc.arrows.values()].filter((a) => REACTION_ARROWS.includes(a.kind));
  if (reactions.length !== 1) return { step: [...doc.atoms.keys()], products: null };
  const { reactants, agents, products } = reactionSides(doc, null);
  const out = agents.filter((id) => leaving(doc.atoms.get(id)));
  return { step: [...reactants, ...agents.filter((id) => !out.includes(id))], products: [...products, ...out] };
}
