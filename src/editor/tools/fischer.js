// The tools that draw a molecule's main chain anew (the top bar's projections, with the chairs' tools):
//
// The Fischer projection tool. Clicked on a vertical chain of crossings: read as a Fischer projection (its
// horizontal bonds towards you, its vertical ones away: its stereo counts), clicked again a drawing again.
// Clicked on a molecule drawn otherwise, with wedges: drawn as its Fischer projection (chem/chains.js), as Ring
// flip makes a chair of a flat ring. Pointed at, a chain of crossings lights up its spine (in full when read as
// one, paler when a click would read it), and another molecule shows its Fischer projection see-through
// (Canvas.jsx). Nothing is read into a drawing unless clicked (chem/fischer.js).
//
// The zigzag tool. Clicked on a molecule (a Fischer projection too): its main chain drawn as a zigzag, C1 on the
// left, with the wedges that keep its R/S; pointed at, the zigzag see-through.
import { fischerSpine, readAsFischer } from '../../chem/fischer.js';
import { moleculeAt, toFischer, toZigzag } from '../../chem/chains.js';
import { getRDKit } from '../../io/rdkit.js';
import { t } from '../../i18n/i18n.js';
import { copyObjects, deleteObjects, dropLooseCurves, emptyDoc } from '../../model/doc.js';

const lit = (ed, hit) => {
  const spine = hit ? fischerSpine(ed.doc, hit) : null;
  return spine && !spine.sideways ? { kind: 'fischer', bonds: spine.bonds, pale: !spine.read } : null;
};

const atomOf = (ed, hit) => (hit?.kind === 'atom' ? hit.id : hit?.kind === 'bond' ? ed.doc.bonds.get(hit.id)?.a : null);

// The molecule at `id` drawn anew by `convert` (chem/chains.js), once worked out (RDKit), for this drawing as it is now
function drawnOf(ed, id, convert) {
  const atoms = moleculeAt(ed.doc, id);
  const key = `${ed.tool.name}|${Math.min(...atoms)}|${ed.docVersion}`;
  if (ed.tool.made?.key !== key) {
    const doc = ed.doc;
    const version = ed.docVersion;
    ed.tool.made = { key, made: getRDKit().then(async (RDKit) => {
      if (ed.docVersion !== version) return { error: 'changed' };
      try {
        return await convert(RDKit, doc, id);
      } catch (error) {
        console.error(`[${ed.tool.name}]`, error);
        return { error: 'failed' };
      }
    }) };
  }
  return ed.tool.made.made;
}

// The see-through molecule as it would be drawn, the molecule washed out under it, and a word above it
function ghost(ed, made, note) {
  const part = emptyDoc();
  copyObjects(made.doc, made.atoms, 0, 0, part);
  part.texts.clear();
  const atoms = [...part.atoms.values()];
  const xs = atoms.map((a) => a.x);
  const ys = atoms.map((a) => a.y);
  const moving = new Set([...made.atoms, ...made.removed]);
  const bonds = [...ed.doc.bonds.values()].filter((b) => moving.has(b.a) && moving.has(b.b)).map((b) => b.id);
  const middle = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  return { kind: 'place', doc: part, at: middle, tint: true, turning: [...made.atoms.filter((id) => ed.doc.atoms.has(id)), ...made.removed, ...bonds],
    note: { at: [middle[0], Math.min(...ys) - 0.55], text: note } };
}

// A tool that draws the molecule clicked anew: `convert` (chem/chains.js), `note` above its see-through preview,
// `done` said when drawn, `refused` what is said for each error, `first` a click that does something else
// (the Fischer tool's on a chain of crossings: true if it did)
function redrawingTool({ convert, note, done, refused, first = null, hovered = null }) {
  return {
    cursor: 'pointer',
    hover(ed, point, hit) {
      const own = hovered?.(ed, hit) ?? null;
      const id = atomOf(ed, hit);
      ed.tool.pointed = own || id == null ? null : `${id}|${ed.docVersion}`;
      ed.preview = own;
      if (!own && id != null && ed.doc.atoms.has(id)) {
        const pointed = ed.tool.pointed;
        drawnOf(ed, id, convert).then((made) => {
          if (ed.tool.pointed !== pointed || made.error) return;
          ed.preview = ghost(ed, made, note());
          ed.emit();
        }, () => {});
      }
      ed.emit();
    },
    click(ed, g) {
      if (first?.(ed, g)) return;
      const id = atomOf(ed, g.hit);
      if (id == null || !ed.doc.atoms.has(id)) {
        ed.say(refused.nothing());
        return;
      }
      // drawn anew once worked out (RDKit may still be loading); not if the drawing has changed meanwhile
      const version = ed.docVersion;
      drawnOf(ed, id, convert).then((made) => {
        if (ed.docVersion !== version) return;
        if (made.error) {
          const said = (refused[made.error] ?? refused.failed)(made);
          if (said) ed.say(said);
          return;
        }
        ed.preview = null;
        ed.tool.pointed = null;
        ed.change((doc) => {
          // (the molecule as worked out: its atoms where they go, hydrogens drawn on or left out, the atoms of an
          // end group gone into its label)
          const kept = new Set(made.atoms);
          // the atoms gone (into a label, or hydrogens left out): as Delete takes them, with what was on them (a
          // text anchored there to another atom of the molecule, an orbital, a curved arrow from them)
          deleteObjects(doc, made.removed.filter((atom) => doc.atoms.has(atom)));
          // the bonds in the molecule as worked out; its bonds to anything else (a One compound link) as they were
          for (const [bid, bond] of doc.bonds) if (kept.has(bond.a) && kept.has(bond.b)) doc.bonds.delete(bid);
          for (const atom of made.atoms) doc.atoms.set(atom, structuredClone(made.doc.atoms.get(atom)));
          for (const bond of made.doc.bonds.values()) if (kept.has(bond.a) && kept.has(bond.b)) doc.bonds.set(bond.id, structuredClone(bond));
          doc.nextId = Math.max(doc.nextId, made.doc.nextId);
          // (a curved arrow on a bond the new drawing hasn't: gone, not pointing at nothing)
          dropLooseCurves(doc);
        });
        // (refused, a part switched off or an atom locked: that said, not this)
        if (!ed.lastRefused) ed.say(done(made));
      }, () => ed.say(refused.rdkit()));
    },
  };
}

const short = () => t('This molecule has no chain to draw.');

export const fischerTool = redrawingTool({
  convert: toFischer,
  note: () => t('click: drawn as a Fischer projection'),
  done: (made) => t('Drawn as a Fischer projection: {n} centres, the horizontal bonds towards you, the vertical ones away.', { n: made.centres.length }),
  refused: {
    nothing: () => t('No crossings and no wedges here: draw the stereocentres with wedges and click, the Fischer projection is drawn; or draw the crossings yourself and click them.'),
    none: () => t('No crossings and no wedges here: draw the stereocentres with wedges and click, the Fischer projection is drawn; or draw the crossings yourself and click them.'),
    achiral: () => t('This molecule has no stereocentre: its Fischer projection would show nothing a drawing doesn\'t.'),
    open: ({ n }) => t('{n} stereocentres have no wedge: a Fischer projection would give each a side. Draw their wedges first.', { n }),
    ring: () => t('A Fischer projection is of an open chain: the main chain of this molecule is a ring.'),
    shape: () => t('This chain can\'t be drawn as a Fischer projection: it has a double bond in it, or a carbon with more than two groups.'),
    stereo: () => t('Its Fischer projection would not be the same stereoisomer, so it isn\'t drawn.'),
    short,
    changed: () => '',
    failed: () => t('The Fischer projection could not be worked out.'),
    rdkit: () => t('RDKit could not be loaded: the Fischer projection needs it to keep the R/S.'),
  },
  hovered: lit,
  // a chain of crossings: read as a Fischer projection, or a drawing again
  first(ed, g) {
    const spine = g.hit ? fischerSpine(ed.doc, g.hit) : null;
    if (!spine) return false;
    if (spine.sideways) ed.say(t('This chain lies on its side: a Fischer projection stands upright, its chain vertical. Turn it first.'));
    else if (spine.read) {
      ed.change((doc) => readAsFischer(doc, spine.centres, false));
      if (!ed.lastRefused) ed.say(t('A drawing again: no stereo is read from its crossings.'));
    } else {
      const { changed } = ed.change((doc) => readAsFischer(doc, spine.centres, true));
      if (!ed.lastRefused) ed.say(t('Read as a Fischer projection: {n} centres, the horizontal bonds towards you, the vertical ones away.', { n: changed }));
    }
    ed.preview = lit(ed, g.hit);
    ed.emit();
    return true;
  },
});

export const zigzagTool = redrawingTool({
  convert: toZigzag,
  note: () => t('click: its main chain drawn as a zigzag'),
  done: () => t('Its main chain drawn as a zigzag, C1 on the left.'),
  refused: {
    nothing: () => t('Click a molecule: its main chain is drawn as a zigzag.'),
    ring: () => t('A zigzag is of an open chain: the main chain of this molecule is a ring.'),
    shape: () => t('This chain can\'t be drawn as a zigzag: a carbon in it has more than two groups.'),
    stereo: () => t('Its zigzag would not be the same stereoisomer (a Z double bond in its chain, say), so it isn\'t drawn.'),
    short,
    changed: () => '',
    failed: () => t('The zigzag could not be worked out.'),
    rdkit: () => t('RDKit could not be loaded: the zigzag needs it to keep the R/S.'),
  },
});
