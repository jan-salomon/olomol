// Mistakes in typed SMILES, said in words: a SMILES RDKit can't read gets
// what is wrong and where, and, for a mistake beginners often make (a
// charge after its atom: N[+] for [N+]), the SMILES as it was meant.
import { t } from '../i18n/i18n.js';
import { rdkitProblem } from './readMol.js';

// Is this a SMILES (meant as one) rather than a name or a formula? No
// spaces, no lower-case letters but those of aromatic atoms (outside
// brackets, Cl and Br), and some of SMILES' own signs or a ring number.
export function looksLikeSmiles(text) {
  const s = text.trim();
  if (!s || /\s/.test(s)) return false;
  const bare = s.replace(/\[[^\]]*\]/g, '').replace(/Cl|Br/g, '');
  if (/[ad-mq-rt-z]/.test(bare)) return false; // a name: aspirin, NaCl, benzo[a]pyrene
  return /[=#@\\/()[\]]/.test(s) || /[bcnops]\d/.test(s);
}

// Why RDKit can't read `text` (a SMILES), or null if it can: { message,
// fixed (a SMILES it can read, or null) }.
export function explainSmiles(RDKit, text) {
  const problem = rdkitProblem(RDKit, text);
  if (!problem) return null;
  // N[+], O[-], Fe[3+] for [N+], [O-], [Fe3+]
  const moved = text.replace(/(Cl|Br|[A-Z][a-z]?|[bcnops])\[(\d*[+-]+\d*)\]/g, (all, el, charge) => `[${el}${charge}]`);
  const fixed = moved !== text && !rdkitProblem(RDKit, moved) ? moved : null;
  const valence = /Explicit valence for atom # (\d+) (\w+), (\d+), is greater than permitted/.exec(problem);
  const position = /mistakes around position (\d+)/.exec(problem);
  let message;
  if (fixed) message = t('A charge goes inside the brackets, with its atom: [N+], [O-].');
  else if (valence) message = t('Atom {n} ({el}) has {bonds} bonds, more than a neutral {el} can have; with a charge it can have one more: [{el}+].', { n: Number(valence[1]) + 1, el: valence[2], bonds: valence[3] });
  else if (/unclosed ring/.test(problem)) message = t('A ring is opened but not closed: a ring number without its partner.');
  else if (/extra open parenthes/.test(problem)) message = t('A bracket ( is not closed.');
  else if (/extra close parenthes/.test(problem)) message = t('There is one closing bracket ) too many.');
  else if (/kekulize/i.test(problem)) message = t("These lower-case (aromatic) atoms can't be given alternating double bonds: check the ring, or write an N with an H on it as [nH].");
  else if (position) message = t('Not a SMILES RDKit can read: there is a mistake near character {n}.', { n: position[1] });
  else message = t('Not a SMILES RDKit can read: {reason}', { reason: problem.split('\n')[0] });
  return { message, fixed };
}
