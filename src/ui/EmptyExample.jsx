// The empty canvas: a faint example drawing with its title, one of four in
// turn (ExampleDrawing.jsx: a Diels–Alder reaction and an addition; an SN2
// with its transition state; octahedral and tetrahedral cobalt in 3D; an
// enzyme with its cofactor on side arcs), and the three ways to start under
// it. Pointing at a part says how it was drawn and lights the button it was
// drawn with. It is no part of the drawing: gone as soon as anything is
// drawn, and clicks go through it to the canvas.
import { useState } from 'react';
import ExampleDrawing, { EXAMPLES } from './ExampleDrawing.jsx';
import { t } from '../i18n/i18n.js';

const BLANK = EXAMPLES.filter((example) => example.blank);

// The example shown: the next one each time the canvas is empty again
// (the first start, New drawing, everything deleted), not again for the
// same empty canvas (a dialog closed, a gesture ended). The last one shown
// is remembered for the next visit.
const LAST_KEY = 'olomol-example';
let shown = null; // { version: the document's, index }
function exampleFor(editor) {
  if (shown?.version === editor.docVersion) return shown.index;
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST_KEY) ?? -1);
  } catch {
    // not remembered: the first one
  }
  const index = (((last + 1) % BLANK.length) + BLANK.length) % BLANK.length || 0;
  try {
    localStorage.setItem(LAST_KEY, String(index));
  } catch {
    // not remembered
  }
  shown = { version: editor.docVersion, index };
  return index;
}

export default function EmptyExample({ editor, dark }) {
  const index = exampleFor(editor);
  const example = BLANK[index];
  const [pointed, setPointed] = useState(false);
  return (
    <div className={`empty-hint${pointed ? ' pointed' : ''}`} data-testid="empty-example" data-example={index}>
      <div className="example-title">{example.title()}</div>
      <ExampleDrawing editor={editor} dark={dark} example={example} through onPointed={setPointed} />
      <div className="moves">{t('Click or drag to draw · / for a name or SMILES · Templates in the bottom bar')}</div>
    </div>
  );
}
