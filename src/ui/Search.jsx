// The search bar in the bottom bar (instead of the Name / SMILES button and its window): typed into at once (or
// after /), and a list above it of what the text can mean:
//   a structure: a SMILES or InChI drawn as typed, a name or PubChem number to look up (Templates.jsx useLookup;
//     a text that looks like a SMILES is never sent to PubChem as a name)
//   an element (Fe: the atom tool), the templates of that name, olomol's tools and actions (commands.jsx), the
//     drawings open and the recent files of that name
// A SMILES, InChI or CID puts the structure first; words put what olomol has first and PubChem last, so Enter
// never sends a word to PubChem that something here matches. ↑ ↓ choose, Enter does it, Esc leaves.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SYMBOLS } from '../chem/elements.js';
import { ELEMENT_NAMES } from '../chem/elementNames.js';
import { matchScore, plain, ranked } from '../editor/match.js';
import { cidOf } from '../io/pubchem.js';
import { looksLikeSmiles } from '../io/smiles.js';
import { language, t } from '../i18n/i18n.js';
import { openLink, openRecent } from './actions.js';
import { olomolLink, structuresIn } from '../io/link.js';
import { commands } from './commands.jsx';
import { icons } from './icons.jsx';
import { showTab, shownTitle } from './tabs.js';
import { allTemplates, picture, pickTemplate, placeFound, templatesNamed, templatesWith, useLookup } from './Templates.jsx';
import { LABEL_NAMES } from '../chem/labels.js';

const MOST = { templates: 6, actions: 8, files: 4, containing: 24 };
const PANEL_WIDTH = 580; // px, at most
// small words, in the three languages, that a two-letter search doesn't find an action by
const SMALL_WORDS = new Set(['as', 'at', 'by', 'in', 'of', 'on', 'or', 'to', 'an', 'do', 'na', 've', 'ze', 'se', 'im', 'zu', 'am', 'um']);
// an element's name in the interface's language (English where it has none of its own)
const nameOf = (el) => ELEMENT_NAMES[el]?.[language] ?? ELEMENT_NAMES[el]?.en ?? el;
const OTHER_NAMES = { Al: ['aluminum'], S: ['sulphur'], Cs: ['cesium'] }; // (American and older English spellings)
const SECTIONS = { containing: () => t('Templates with this part'), structure: () => t('Structure'), element: () => t('Element'), templates: () => t('Templates'), actions: () => t('Actions'), files: () => t('Drawings and files') };

export function SearchBar({ editor, ui, field }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false); // ↑ or ↓ pressed: Enter does what is highlighted
  const list = useRef(null);
  const text = query.trim();
  const done = () => {
    setQuery('');
    setOpen(false);
    setActive(0);
    setChosen(false);
    field.current?.blur();
  };
  // "?S", "?oh", "?ester", "?C=O": the templates with that element or group in them (as in the Templates window;
  // RDKit looks, a moment)
  const part = text.startsWith('?') ? text.slice(1).trim() : null;
  // an olomol link, or its #part (#smiles=CCO): opened as from the address bar, which the installed app hasn't
  const link = olomolLink(text);
  const [containing, setContaining] = useState(null); // { part, entries } once RDKit has looked
  useEffect(() => {
    if (!part) return undefined;
    let current = true;
    templatesWith(part).then((entries) => current && setContaining({ part, entries }), () => current && setContaining({ part, entries: [] }));
    return () => {
      current = false;
    };
  }, [part]);
  const lookup = useLookup(part === null && !link ? query : '', (doc, title) => {
    done();
    placeFound(editor, doc, title);
  }, editor.settings);
  // a structure first: an InChI, a CID, or a SMILES (one RDKit read, or one that looks like it and isn't a plain
  // word: aspirin's "as", "asp" are aromatic arsenic to a SMILES reader, but a name to whoever types them)
  const word = /^[a-z]+$/.test(text);
  const structureFirst = part === null && !link && Boolean(text) && (text.startsWith('InChI=') || Boolean(cidOf(text)) || (!word && (lookup.smiles || looksLikeSmiles(text))));

  // what the text can mean, in sections: [{ key, section, label, hint, icon, picture, run, href, testId }]
  const rows = useMemo(() => {
    if (!text) return [];
    // an olomol link: opening it, nothing else
    if (link) {
      const n = structuresIn(link).length;
      return [{ key: 'link', section: 'structure', label: n > 1 ? t('Open the link: {n} drawings', { n }) : t('Open the link'), icon: icons.link, run: () => openLink(editor, link).then((opened) => opened && ui.fit?.()), testId: 'search-link' }];
    }
    // a part searched for: only the templates with it, as many as there are (the best side first, then the other)
    if (part !== null) {
      if (!part || containing?.part !== part) return [];
      return containing.entries.slice(0, MOST.containing).map((entry, k) => ({
        key: `containing:${entry[0]}:${k}`, section: 'containing', label: entry[2] === 'label' ? entry[0] : t(entry[0]), entry, run: () => pickTemplate(editor, entry),
      }));
    }
    // (the PubChem lookup says on its own row what it sends where)
    const sends = `${t('Sends what you typed to PubChem (pubchem.ncbi.nlm.nih.gov); your drawing stays here.')}${language !== 'en' ? ` ${t('PubChem knows names in English only.')}` : ''}`;
    const structure = lookup.actions.map((action) => ({ ...action, key: `structure:${action.key}`, section: 'structure', structure: true, ...(action.key === 'pubchem' ? { note: sends } : {}) }));
    // an element: by its symbol (Fe), or from three letters by its name in English, Czech or German (iron, železo,
    // Eisen; also aluminum, sulphur, cesium)
    const elementRow = (el, score) => ({
      score, key: `element:${el}`, section: 'element', label: t('{name} ({el}): the atom tool', { name: nameOf(el), el }), hint: t('click an atom or the canvas'),
      icon: <b className="el-mark">{el}</b>, run: () => editor.setTool({ name: 'atom', el }),
    });
    const symbol = SYMBOLS.find((el) => el.toLowerCase() === text.toLowerCase() && el !== '*');
    const named = text.length >= 3 ? ranked(text, SYMBOLS.filter((el) => ELEMENT_NAMES[el] && el !== symbol), (el) => [nameOf(el), ...Object.values(ELEMENT_NAMES[el]), ...(OTHER_NAMES[el] ?? [])], 3)
      .filter(({ score }) => score >= 2) : [];
    const element = [...(symbol ? [elementRow(symbol, 5)] : []), ...named.map(({ item, score }) => elementRow(item, score))];
    // the templates by name, ranked as the rest (without diacritics, by the start of words, by stems), an
    // abbreviation also by what it stands for; then those the Templates window finds by an amino acid's code
    const templateRow = (entry, score) => ({ key: `template:${entry[0]}:${typeof entry[1] === 'string' ? entry[1] : ''}`, section: 'templates', label: entry[2] === 'label' ? entry[0] : t(entry[0]), entry, score, run: () => pickTemplate(editor, entry) });
    // (one template in two groups, or two by one name and drawing: once)
    const unique = [...new Map(allTemplates().map((entry) => [`${entry[0]}|${typeof entry[1] === 'string' ? entry[1] : entry[0]}`, entry])).values()];
    const short = text.length < 2; // (one letter: an element's symbol, nothing else)
    const templates = short ? [] : ranked(text, unique, ([name, , kind]) => (kind === 'label' ? [name] : [t(name), name]), MOST.templates,
      ([name, , kind]) => (kind === 'label' ? [LABEL_NAMES[name] ?? ''] : [])).map(({ item, score }) => templateRow(item, score));
    for (const entry of short ? [] : templatesNamed(text.toLowerCase())) {
      if (templates.length < MOST.templates && !templates.some((row) => row.entry === entry || row.key === templateRow(entry, 1).key)) templates.push(templateRow(entry, 1));
    }
    // (two letters find an action only by a whole word of its name that is no small word: 3d, Turn in 3D; not "as"
    // in Save as, "in" in Zoom in)
    const whole = (command) => !SMALL_WORDS.has(plain(text)) && command.names.some((name) => plain(name).split(/[^\p{L}\p{N}]+/u).includes(plain(text)));
    const actions = short ? [] : ranked(text, commands(editor, ui).filter((command) => text.length > 2 || whole(command)), (command) => command.names, MOST.actions, (command) => command.also).map(({ item, score }) => ({
      key: item.id, section: 'actions', label: item.label, hint: item.key, icon: item.icon, run: item.run, score,
    }));
    const tabs = editor.tabs.filter((tab) => tab.id !== editor.drawingId && matchScore(text, [shownTitle(tab.title)]) > 0).map((tab) => ({
      key: `tab:${tab.id}`, section: 'files', label: t('Show {name}', { name: shownTitle(tab.title) }), hint: t('open'), icon: icons.newDoc, run: () => showTab(editor, tab.id),
    }));
    const recent = (editor.recent ?? []).filter((entry) => matchScore(text, [entry.name]) > 0).map((entry) => ({
      key: `recent:${entry.name}:${entry.at}`, section: 'files', label: t('Open {file}', { file: entry.name }), hint: t('recent'), icon: icons.open, run: () => openRecent(editor, entry, ui.fit),
    }));
    const files = (short ? [] : [...tabs, ...recent]).slice(0, MOST.files).map((row) => ({ ...row, score: matchScore(text, [row.label]) }));
    // the sections by how well their best matches (the element, exact, first; templates before actions when equal);
    // a SMILES, InChI or CID: the structure first, else last
    const best = (list) => Math.max(0, ...list.map((row) => row.score ?? 0));
    const local = [element, templates, actions, files].filter((list) => list.length).sort((a, b) => best(b) - best(a));
    return structureFirst ? [...structure, ...local.flat()] : [...local.flat(), ...structure];
  }, [text, part, link, containing, lookup.actions, structureFirst, editor.tabs, editor.recent, editor.title]);
  useEffect(() => {
    setActive(0);
    setChosen(false);
  }, [text]);
  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1));
  }, [rows.length]);
  // the highlighted row in view
  useEffect(() => {
    list.current?.querySelector('.search-row.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (row) => {
    if (!row) return;
    if (row.href) {
      window.open(row.href, '_blank', 'noopener');
      done();
    } else if (row.structure) {
      row.run(); // (drawn or looked up: done once it is there; the list stays while PubChem answers, or says why not)
    } else {
      done();
      row.run();
    }
  };
  const enter = () => {
    // a SMILES, InChI or CID: drawn or looked up (also before its check is in), unless another row was chosen
    if (structureFirst && !chosen) lookup.submit();
    else if (rows.length) run(rows[active]);
    else lookup.submit();
  };
  const onKeyDown = (e) => {
    e.stopPropagation(); // (the keys are the field's, not the drawing's)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      // (the list reads upwards from the bar, the best next to it: ↑ the next one, ↓ back)
      setActive((k) => (k + (e.key === 'ArrowUp' ? 1 : rows.length - 1)) % rows.length);
      setChosen(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      enter();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else done();
    }
  };

  // the list: a panel on the bottom bar's top edge, over its right end where the field is, no wider than it needs
  // (in body: the bar's transform would make a fixed panel inside it count from the bar). On the right, above the
  // field, the best (what Enter does: a SMILES's picture and its drawing, or the best matches), the rest on the
  // left; both read upwards from the bar.
  const bar = open ? field.current?.closest('.dock')?.getBoundingClientRect() : null;
  const width = bar && Math.min(PANEL_WIDTH, bar.width);
  const full = Boolean(bar) && width >= bar.width - 1; // (as wide as the bar: its top corners both square)
  const at = bar && { left: bar.right - width, width, bottom: window.innerHeight - bar.top - 1 };
  useEffect(() => {
    const dock = field.current?.closest('.dock');
    dock?.classList.toggle('searching', open);
    dock?.classList.toggle('full', open && full);
    return () => dock?.classList.remove('searching', 'full');
  }, [open, full]);
  const first = rows.length ? rows.findIndex((row) => row.section !== rows[0].section) : 0;
  const split = Math.min(first < 0 ? rows.length : first, 6); // (the best section, six rows at most)
  // sections of rows k from…to, each a block of its own: [{ section, rows: [[row, k]] }]
  const blocks = (from, to) => rows.slice(from, to).reduce((list, row, i) => {
    const k = from + i;
    if (list.at(-1)?.section !== row.section) list.push({ section: row.section, rows: [] });
    list.at(-1).rows.push([row, k]);
    return list;
  }, []);
  // a block, read upwards: its best row next to the bar, its heading on top
  const block = ({ section, rows: list }) => (
    <div key={`${section}-${list[0][1]}`} className="search-block">
      {list.map(([row, k]) => (
        <button key={`${row.key}#${k}`} type="button" className={`search-row${row.entry ? ' template' : ''}${k === active ? ' active' : ''}`} role="option" aria-selected={k === active}
          disabled={row.structure && lookup.busy} title={row.title} data-testid={row.testId ?? `search-row-${k}`}
          onMouseEnter={() => setActive(k)} onClick={() => run(row)}>
          <span className="icon">{row.entry ? <PictureOf entry={row.entry} editor={editor} /> : row.icon}</span>
          <span className="label">{row.label}{row.note && <span className="note">{row.note}</span>}</span>
          {row.hint && <span className="hint">{row.hint}</span>}
        </button>
      ))}
      <div className="search-section">{SECTIONS[section]()}</div>
    </div>
  );
  return (
    <div className={`search-bar${open ? ' open' : ''}`} data-testid="from-name" onClick={() => field.current?.focus()}>
      {icons.search}
      <input ref={field} className="search-field" type="search" value={query} spellCheck={false} autoComplete="off"
        placeholder={t('Name, SMILES or action…')}
        title={`${t('Type a name, SMILES or InChI to draw it, or what you want to do: ring flip, export SVG, Newman.')} (/)\n\n${t('aspirin, CC(=O)Oc1ccccc1C(=O)O, InChI=1S/…, CID 2244')}\n${t('A name, SMILES or InChI; ?S, ?oh, ?ester, ?C=O: the templates with that element or group in them')}\n\n${t('SMILES and InChI are drawn here, in your browser. Names and PubChem numbers (CID 2244) are looked up on PubChem (pubchem.ncbi.nlm.nih.gov), and so is whatever you open the PubChem page of: only what you typed is sent, never your drawing. Ctrl+V on the canvas pastes a SMILES, InChI or molfile straight in.')}${language !== 'en' ? ` ${t('PubChem knows names in English only.')}` : ''}`}
        aria-label={t('Name, SMILES or action…')} data-testid="from-name-field"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => document.activeElement !== field.current && setOpen(false), 120) /* (not if back in it meanwhile) */}
        onKeyDown={onKeyDown} />
      {open && at && text && createPortal(
        <div className={`glass search-results${full ? ' full' : ''}`} style={at} ref={list} role="listbox" aria-label={t('Draw from a name, SMILES or InChI')} data-testid="search-results"
          onMouseDown={(e) => e.preventDefault() /* (the field keeps the focus) */}>
          {/* (in the page's order: the best column first, each column from the bar upwards) */}
          <div className="search-column best">
            {blocks(0, split).map(block)}
            {text && lookup.problem && <p className="small error-text search-note" data-testid="smiles-problem">{lookup.problem.message}</p>}
            {text && lookup.error && <p className="small error-text search-note">{lookup.error}</p>}
            {text && structureFirst && lookup.preview && (
              <div className="search-preview">
                <img src={lookup.preview.src} alt={lookup.text} className={lookup.preview.stale ? 'stale' : ''} data-testid="smiles-preview" />
              </div>
            )}
          </div>
          <div className="search-column rest">
            {blocks(split, rows.length).map(block)}
            {part !== null && containing?.part === part && !rows.length && <p className="small search-note">{t('No template has “{part}” in it.', { part })}</p>}
            {part !== null && part && containing?.part !== part && <p className="small search-note">{t('Loading…')}</p>}
            {part === null && text && !rows.length && !lookup.problem && <p className="small search-note">{t('Nothing found for “{text}”.', { text })}</p>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// A template's picture, once drawn (Templates.jsx keeps them)
function PictureOf({ entry, editor }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let current = true;
    picture(entry, editor.settings).then((url) => current && setSrc(url), () => {});
    return () => {
      current = false;
    };
  }, [entry]);
  return src ? <img src={src} alt="" /> : null;
}

