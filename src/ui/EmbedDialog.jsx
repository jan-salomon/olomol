// Embed in a page (Export): the code that puts olomol into another web page (a course page, Moodle, a practice
// site), starting from this drawing, with only the parts chosen here (features.js). Two kinds: an iframe, no code
// (students draw in it; the page around it can't see what they drew), and <olomol-editor> (public/embed.js: the
// page reads what was drawn and can mark it; the guide: the web manual's appendix B, from docs/embed.md). Nothing is sent anywhere: the drawing goes into the
// address after the #, as in a link (io/link.js). The addresses are this site's (olomol.org, or where it is hosted).
//
// Three steps: what it can do (a preset, or the parts in groups: short names, what each is on hover), what it
// starts with, and the code (one kind at a time, with Try it: a page with that code in it, at its height).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FEATURES } from '../features.js';
import { linkTo } from '../io/link.js';
import { copyObjects, emptyDoc, isEmpty } from '../model/doc.js';
import { t } from '../i18n/i18n.js';
import { Dialog } from './Dialogs.jsx';
import { icons } from './icons.jsx';
import { DOCS } from './report.js';

const ALL = Object.keys(FEATURES);
// PubChem (names looked up there, a molecule's page there): a group of its own, what students type going out to
// another service being a school's decision, not one of the drawing's tools
const PUBCHEM = 'structures-from-names';
const OTHERS = ALL.filter((name) => name !== PUBCHEM);
// the parts in groups, each by a short name (FEATURES says what it is, on hover)
const GROUPS = [
  [() => t('Drawing tools'), [
    ['structure', () => t('Atoms and bonds')], ['charges-electrons', () => t('Charges and electrons')], ['reaction-arrows', () => t('Reaction arrows')],
    ['text', () => t('Text and numbers')], ['brackets', () => t('Brackets')], ['colors', () => t('Colours and highlights')],
    ['templates', () => t('Templates')], ['structures-from-text', () => t('From SMILES, pasted')],
  ]],
  [() => t('Mechanisms'), [['curved-arrows', () => t('Curved arrows')], ['orbitals', () => t('Orbitals')]]],
  [() => t('Arranging and 3D'), [['chairs-projections', () => t('Chairs and projections')], ['align-flip', () => t('Align and flip')], ['redraw', () => t('Redraw')], ['turn-in-3d', () => t('Turn in 3D')]]],
  [() => t('Information and export'), [['molecule-info', () => t('Molecule info')], ['export', () => t('Export')]]],
];
// the usual choices: the parts each switches on (PubChem aside), and whether PubChem is on with it; Only to look
// at: none, ?readonly
const PRESETS = [
  ['arrows', () => t('Curved arrows'), ['curved-arrows', 'charges-electrons'], false],
  ['structures', () => t('Drawing structures'), ['structure', 'charges-electrons', 'templates', 'structures-from-text'], true],
  ['all', () => t('Everything'), OTHERS, true],
  ['look', () => t('Only to look at'), [], false],
];
const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// A numbered step of the dialog
const Step = ({ n, title, children }) => (
  <section className="embed-step">
    <h3><span className="num">{n}</span>{title}</h3>
    {children}
  </section>
);

export function EmbedDialog({ editor, onClose }) {
  const [parts, setParts] = useState(PRESETS[0][2]);
  const [pubchem, setPubchem] = useState(PRESETS[0][3]);
  const [readOnly, setReadOnly] = useState(false);
  // what it starts with: this drawing, the selection (when something is selected), or nothing
  const selected = editor.selection.size > 0;
  const [start, setStart] = useState(isEmpty(editor.doc) ? 'empty' : 'drawing');
  const [height, setHeight] = useState(420);
  const [hashes, setHashes] = useState({ drawing: '', selection: '', empty: '' });
  const [kind, setKind] = useState('iframe');
  const [copied, setCopied] = useState(false);
  const [trying, setTrying] = useState(false);
  // the drawing and the selection as a link's #d=…, made once (the same while the dialog is open: the canvas is
  // behind it)
  useEffect(() => {
    let current = true;
    (async () => {
      const made = { empty: '' };
      const as = (doc) => linkTo(doc, { settings: editor.settings, title: editor.title, base: '' });
      if (!isEmpty(editor.doc)) made.drawing = await as(editor.doc);
      if (selected) {
        const part = emptyDoc();
        copyObjects(editor.doc, [...new Set([...editor.selection, ...editor.selectedAtoms()])], 0, 0, part);
        if (part.style === undefined && editor.doc.style) part.style = editor.doc.style;
        made.selection = isEmpty(part) ? '' : await as(part);
      }
      if (current) setHashes((now) => ({ ...now, ...made }));
    })();
    return () => {
      current = false;
    };
  }, [editor, selected]);
  const STARTS = [
    ...(isEmpty(editor.doc) ? [] : [['drawing', t('This drawing')]]),
    ...(selected ? [['selection', t('The selection')]] : []),
    ['empty', t('Empty')],
  ];

  const site = new URL('./', location.href.split('#')[0].split('?')[0]);
  const on = pubchem ? [...parts, PUBCHEM] : parts;
  const query = readOnly ? '?readonly' : same(on, ALL) ? '' : `?only=${ALL.filter((name) => on.includes(name)).join(',')}`;
  const address = `${new URL('embed.html', site).href}${query}${hashes[start] ?? ''}`;
  const rows = Math.max(200, Math.min(1200, Number(height) || 420));
  const codes = {
    iframe: `<iframe src="${address}" title="olomol" width="100%" height="${rows}" style="border: 1px solid #d0d4dc; border-radius: 8px" allow="clipboard-read; clipboard-write"></iframe>`,
    element: `<script src="${new URL('embed.js', site).href}"></script>\n<olomol-editor src="${address}" height="${rows}"></olomol-editor>`,
  };
  const code = codes[kind];
  useEffect(() => setCopied(false), [code]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const preset = readOnly ? 'look' : PRESETS.find(([, , list, withPubchem]) => list.length && same(list, parts) && withPubchem === pubchem)?.[0] ?? null;
  const choose = ([name, , list, withPubchem]) => {
    setReadOnly(name === 'look');
    if (name !== 'look') {
      setParts(list);
      setPubchem(withPubchem);
    }
  };
  // (from Only to look at, a part ticked is the only one on: the preset chosen last is where a change starts)
  const toggle = (name) => {
    if (readOnly) {
      setReadOnly(false);
      setParts(name === PUBCHEM ? [] : [name]);
      setPubchem(name === PUBCHEM);
    } else if (name === PUBCHEM) setPubchem(!pubchem);
    else setParts((now) => (now.includes(name) ? now.filter((x) => x !== name) : [...now, name]));
  };
  const isOn = (name) => !readOnly && (name === PUBCHEM ? pubchem : parts.includes(name));
  const chip = ([name, label]) => (
    <label key={name} className={`chip${isOn(name) ? ' on' : ''}`} title={FEATURES[name]()}>
      <input type="checkbox" checked={isOn(name)} onChange={() => toggle(name)} data-testid={`embed-part-${name}`} />
      {label()}
    </label>
  );

  return (
    // (Esc, or a click beside it: the try-out first, then the dialog)
    <Dialog title={t('Embed in a page')} onClose={trying ? () => setTrying(false) : onClose} width="min(760px, calc(100vw - 32px))">
      <div className="body embed" data-testid="embed-dialog">
        <p className="intro">{t('olomol in another web page (a course page, Moodle, a blog, a practice site), with only the tools you choose, starting from this drawing.')}</p>

        <Step n="1" title={t('What it can do')}>
          <span className="seg presets" role="group" aria-label={t('Tools')}>
            {PRESETS.map((entry) => (
              <button key={entry[0]} type="button" className={preset === entry[0] ? 'on' : ''} aria-pressed={preset === entry[0]} onClick={() => choose(entry)} data-testid={`embed-${entry[0]}`}>{entry[1]()}</button>
            ))}
          </span>
          <div className={`groups${readOnly ? ' off' : ''}`}>
            {GROUPS.map(([title, list]) => (
              <fieldset key={title()}>
                <legend>{title()}</legend>
                {list.map(chip)}
              </fieldset>
            ))}
            <fieldset className="outside">
              <legend>{t('Outside olomol')}</legend>
              {chip([PUBCHEM, () => 'PubChem'])}
              <p className="small">{t('Names typed into it go to PubChem (pubchem.ncbi.nlm.nih.gov), never the drawing.')}</p>
            </fieldset>
          </div>
          <p className="small muted">{readOnly ? t('Only to look at: no tools, zooming only.') : t('Selecting, moving, zooming, undo and Erase are always there.')}</p>
        </Step>

        <Step n="2" title={t('What it starts with')}>
          <div className="row">
            <span className="seg" role="group" aria-label={t('What it starts with')}>
              {STARTS.map(([name, label]) => (
                <button key={name} type="button" className={start === name ? 'on' : ''} aria-pressed={start === name} onClick={() => setStart(name)} data-testid={`embed-start-${name}`}>{label}</button>
              ))}
            </span>
            <label className="tick">
              {t('Height')}
              <input type="number" min={200} max={1200} step={20} value={height} onChange={(e) => setHeight(e.target.value)} />
              px
            </label>
          </div>
        </Step>

        <Step n="3" title={t('Copy the code')}>
          <div className="row kinds">
            <span className="seg" role="tablist">
              <button type="button" role="tab" aria-selected={kind === 'iframe'} className={kind === 'iframe' ? 'on' : ''} onClick={() => setKind('iframe')} data-testid="embed-kind-iframe">{t('Without code')}</button>
              <button type="button" role="tab" aria-selected={kind === 'element'} className={kind === 'element' ? 'on' : ''} onClick={() => setKind('element')} data-testid="embed-kind-element">{t('With code')}</button>
            </span>
            {kind === 'element' && <a className="guide small" href={new URL(`${DOCS.manual}#embedding`, site).href} target="_blank" rel="noopener" data-testid="embed-guide">{icons.external}{t('The embedding guide: reading and checking a drawing')}</a>}
          </div>
          <p className="small">
            {kind === 'iframe'
              ? t('An iframe, for any page that takes HTML (Moodle too). Anyone can draw in it, but the page around it doesn\'t see what was drawn: for a figure to turn and zoom, a demonstration, or practice whose answer is shown elsewhere.')
              : t('<olomol-editor>: the page around it reads what was drawn (the curved arrows by their atoms, SMILES, a step written the same way however it is drawn), and can mark it and answer, to check an exercise, say.')}
          </p>
          <textarea readOnly value={code} rows={4} spellCheck={false} data-testid={kind === 'iframe' ? 'embed-iframe' : 'embed-element'} onFocus={(e) => e.target.select()} />
          <div className="row">
            <button type="button" className="btn primary" onClick={copy} data-testid="embed-copy">{icons.copy}<span className="label">{copied ? t('Copied') : t('Copy')}</span></button>
            <button type="button" className="btn" onClick={() => setTrying(true)} title={t('The editor as this code puts it into a page: its tools, its drawing, its height; it follows what you change here')} data-testid="embed-try">{icons.play}<span className="label">{t('Try it')}</span></button>
            <span className="small muted">{t('Nothing is sent anywhere: the drawing is in the address, as in a link.')}</span>
          </div>
          {trying && createPortal(
            <>
              <div className="scrim tryout-scrim" onClick={() => setTrying(false)} />
              <div className="glass dialog tryout" role="dialog" aria-label={t('Try it')} data-testid="embed-tryout">
                <header>
                  {icons.play} {t('Try it')}
                  <span className="small muted">{rows} px</span>
                  <button type="button" className="btn" onClick={() => setTrying(false)} aria-label={t('Close')}>{icons.close}</button>
                </header>
                {/* (the very address of the code, at its height, in a window of its own over the dialog) */}
                <iframe src={address} title="olomol" style={{ height: `${rows}px` }} allow="clipboard-read; clipboard-write" />
              </div>
            </>,
            document.body,
          )}
        </Step>
      </div>
    </Dialog>
  );
}
