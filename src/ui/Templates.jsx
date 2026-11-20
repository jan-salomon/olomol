// The template library: pick a structure, then click where it should go (a
// see-through copy follows the pointer); functional groups become a stamp
// for atoms. A search field looks through all of them, and also takes a
// SMILES or InChI (read here) or a name or number to look up on PubChem;
// the search bar in the bottom bar (Search.jsx) uses the same lookup.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ABBREVIATED, CORES, orientNucleobase, SUBGROUPS, TEMPLATES } from '../chem/templates.js';
import { ABBREVIATIONS } from '../chem/abbreviations.js';
import { LABEL_NAMES } from '../chem/labels.js';
import { withPart } from '../chem/partSearch.js';
import { AMINO_ACID_CODES } from '../chem/searchParts.js';
import { readAny, svgOf } from '../io/files.js';
import { readMolfile } from '../io/molfile.js';
import { cidOf, lookUp } from '../io/pubchem.js';
import { getRDKit, orientedMolfile, smilesToMolfile } from '../io/rdkit.js';
import { readSmiles } from '../io/readMol.js';
import { explainSmiles, looksLikeSmiles } from '../io/smiles.js';
import { language, t } from '../i18n/i18n.js';
import { useEscape } from './Dialogs.jsx';
import { pubchemLink } from './actions.js';
import { icons } from './icons.jsx';

const DUPLICATES = new Set(Object.values(ABBREVIATED).flat());
// (an abbreviation a functional group's card offers is not shown again on its own)
const shown = (entry) => !(entry[2] === 'label' && DUPLICATES.has(entry[0]));
// the entry of a label (Templates → Abbreviations)
const labelEntry = (label) => TEMPLATES.flatMap(([, list]) => list).find(([name, , kind]) => kind === 'label' && name === label);

const docs = new Map(); // template -> its drawing, made once per visit
const pictures = new Map(); // template -> data URL
const cores = new Map(); // core name -> molfile
let lastTab = 0; // the category shown last, shown again next time
let lastSub = null; // and its subgroup (null: all of it)

async function coreMolfile(name) {
  if (!CORES[name]) return null;
  if (!cores.has(name)) {
    const core = CORES[name];
    cores.set(name, typeof core === 'string' ? core : await orientedMolfile(core.smiles, core.atom, core.angle));
  }
  return cores.get(name);
}

// The drawing of a template ([name, SMILES or a function that draws it, core?]).
export async function templateDoc([, source, core]) {
  if (docs.has(source)) return docs.get(source);
  let doc;
  if (typeof source === 'function') {
    doc = source();
  } else {
    // the parts of a salt side by side
    let x = 0;
    for (const [k, part] of source.split('.').entries()) {
      const molfile = await smilesToMolfile(part, { core: k === 0 ? await coreMolfile(core) : null });
      const { doc: d, atomIds } = readMolfile(molfile, doc);
      doc = d;
      const atoms = atomIds.map((id) => doc.atoms.get(id));
      const minX = Math.min(...atoms.map((a) => a.x));
      for (const a of atoms) a.x += x - minX;
      x = Math.max(...atoms.map((a) => a.x)) + 1.6;
    }
  }
  if (core === 'purine' || core === 'pyrimidine') orientNucleobase(doc);
  docs.set(source, doc);
  return doc;
}

export async function picture(entry, settings) {
  const [label, source, kind] = entry;
  if (!pictures.has(source)) {
    // (an abbreviation: the group it stands for drawn out, on R)
    const doc = structuredClone(await templateDoc(kind === 'label' && ABBREVIATIONS[label] ? [label, ABBREVIATIONS[label][0]] : entry));
    for (const atom of doc.atoms.values()) if (atom.el === '*') atom.alias ??= 'R';
    pictures.set(source, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOf(doc, settings, { scale: 24 }))}`);
  }
  return pictures.get(source);
}

// The templates with a part in them (?S, ?oh, ?ester: src/chem/partSearch.js)
const searched = new Map(); // a template's SMILES -> its molecule, kept for the next search
export async function templatesWith(text) {
  const RDKit = await getRDKit();
  try {
    return withPart(RDKit, text, TEMPLATES.flatMap(([, list]) => list), searched);
  } catch {
    return []; // (a SMARTS RDKit can't read)
  }
}

// The templates a search by name finds (`q` in lower case), in this language or in English; a functional group
// also by its abbreviation (Ph: Phenyl), an amino acid also by its code (Phe, F: first, as "f" is in many names)
export function templatesNamed(q) {
  const coded = ([name]) => (AMINO_ACID_CODES[name] ?? []).some((code) => code.toLowerCase() === q);
  const found = TEMPLATES.flatMap(([, list]) => list).filter(shown).filter((entry) => {
    const [name, , kind] = entry;
    return t(name).toLowerCase().includes(q) || name.toLowerCase().includes(q)
      || (kind === 'label' && (LABEL_NAMES[name] ?? '').toLowerCase().includes(q))
      || (ABBREVIATED[name] ?? []).some((label) => label.toLowerCase() === q) || coded(entry);
  });
  return [...found.filter(coded), ...found.filter((entry) => !coded(entry))];
}

// Every template the window shows (for the search bar's own ranking: Search.jsx)
export const allTemplates = () => TEMPLATES.flatMap(([, list]) => list).filter(shown);

// A template picked: a structure placed like a template, a functional group (an abbreviation too) a stamp for atoms
export async function pickTemplate(editor, entry) {
  const [key, source, kind] = entry;
  const name = kind === 'label' ? key : t(key);
  const doc = structuredClone(await templateDoc(entry));
  if (kind === 'label' || (typeof source === 'string' && source.includes('*'))) {
    // a functional group (an abbreviation too: one labelled atom): a stamp for atoms; "*" without a
    // label is where it attaches
    if (kind !== 'label') for (const atom of doc.atoms.values()) if (atom.el === '*') atom.alias = null;
    editor.setTool({ name: 'group', label: name, group: doc });
    const inText = language === 'de' ? name : name.toLowerCase(); // German nouns keep their capital
    editor.say(t('Click an atom to attach {name} there, or drag from it to aim (Shift: the atom becomes its first atom; the canvas: {name} on R). Esc when done.', { name: inText }), 'info', 6000);
    return;
  }
  placeFound(editor, doc, name);
}

// Is this text a SMILES RDKit can read?
async function isSmiles(text) {
  if (/\s/.test(text)) return false;
  const RDKit = await getRDKit();
  try {
    readSmiles(RDKit, text).mol.delete();
    return true;
  } catch {
    return false;
  }
}

// What a typed text can draw: a SMILES or an InChI, read here, or a name
// or PubChem number, looked up there (only when asked; a SMILES is sent
// only for its PubChem page). Returns { text, actions (best first: [{ key,
// label, icon, testId, title, and run or href }]), submit (what Enter
// does), busy, error, preview (a picture of the SMILES or InChI as typed),
// problem (what is wrong with a SMILES RDKit can't read: { message, fixed }) }.
// A text that looks like a SMILES is never sent to PubChem as a name.
export function useLookup(query, onDoc, settings) {
  const text = query.trim();
  const [smiles, setSmiles] = useState(false);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const inchi = text.startsWith('InChI=');
  useEffect(() => {
    let current = true;
    setError('');
    // (the last answer stays until this one is in: no flicker while typing)
    if (!text || inchi) {
      setSmiles(false);
      setProblem(null);
    } else {
      (async () => {
        const ok = await isSmiles(text);
        const why = !ok && looksLikeSmiles(text) ? explainSmiles(await getRDKit(), text) : null;
        if (!current) return;
        setSmiles(ok);
        setProblem(why);
      })();
    }
    return () => {
      current = false;
    };
  }, [text, inchi]);
  // the picture follows the typing (a moment after it stops); an unreadable text keeps the last one
  useEffect(() => {
    if (!text || !(inchi || smiles)) {
      if (!text) setPreview(null);
      return undefined;
    }
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const { doc } = await readAny(text);
        if (current) setPreview({ text, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOf(doc, settings, { scale: 26 }))}` });
      } catch {
        // half typed
      }
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, inchi, smiles, settings]);
  const run = async (job) => {
    setBusy(true);
    setError('');
    try {
      const { title, source } = await job();
      const { doc } = await readAny(source);
      setBusy(false); // (the search bar stays: ready for the next)
      onDoc(doc, title);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const draw = (source = text) => run(async () => ({ title: inchi ? t('the InChI') : source, source }));
  const meantAsSmiles = !inchi && looksLikeSmiles(text);
  const ask = async () => {
    // (the SMILES check may still be under way: a SMILES is drawn, not sent)
    if (await isSmiles(text)) return draw();
    if (meantAsSmiles) return null; // a SMILES with a mistake: what is wrong is shown
    return run(async () => {
      const found = await lookUp(text);
      return { title: found.title, source: found.smiles };
    });
  };
  const cid = cidOf(text);
  const actions = [];
  if (text && (inchi || smiles)) actions.push({ key: 'draw', label: inchi ? t('Draw this InChI') : t('Draw this SMILES'), icon: icons.templates, testId: 'draw-identifier', run: () => draw() });
  const fix = !smiles && meantAsSmiles ? problem?.fixed : null;
  if (fix) actions.push({ key: 'fix', label: t('Draw {smiles} instead', { smiles: fix }), icon: icons.templates, testId: 'draw-fixed', run: () => draw(fix) });
  if (text && !inchi && !smiles && !meantAsSmiles) {
    const label = busy ? t('Looking up…') : cid ? t('Look up CID {cid} on PubChem', { cid }) : t('Look up “{name}” on PubChem', { name: text });
    actions.push({ key: 'pubchem', label, icon: icons.search, testId: 'pubchem', run: ask });
  }
  if (text && (smiles || inchi || !meantAsSmiles)) {
    const by = cid ? { cid } : inchi ? { inchi: text } : smiles ? { smiles: text } : { name: text };
    actions.push({ key: 'page', label: t('PubChem page'), icon: icons.external, testId: 'pubchem-open',
      title: t('Open its page on PubChem (this sends what you typed there)'), href: pubchemLink(by) });
  }
  const submit = () => (!text || busy ? null : inchi ? draw() : fix ? draw(fix) : ask());
  // the last picture, faint while the text is not (yet) what it shows
  return {
    text, inchi, smiles, actions, submit, busy, error, problem: !smiles && meantAsSmiles ? problem : null,
    preview: preview && { ...preview, stale: preview.text !== text || !(inchi || smiles) },
  };
}

// `note`: say what a lookup sends (FromName says it in its own words);
// `keep`: the picture's place is there from the start (nothing moves)
function Elsewhere({ lookup, note = true, keep = false }) {
  const picture = lookup.preview && (
    <img src={lookup.preview.src} alt={lookup.text} className={lookup.preview.stale ? 'stale' : ''} data-testid="smiles-preview" />
  );
  if (!lookup.text) return keep ? <div className="preview"><span className="small">{t('A SMILES or InChI is drawn here as you type it.')}</span></div> : null;
  return (
    <>
      {(picture || keep) && <div className="preview">{picture || <span className="small">{t('A SMILES or InChI is drawn here as you type it.')}</span>}</div>}
      <div className="elsewhere">
        {lookup.actions.map(({ key, label, icon, testId, title, run, href }) => (href
          ? <a key={key} className="btn" href={href} target="_blank" rel="noopener" data-testid={testId} title={title}>{icon}<span className="label">{label}</span></a>
          : (
            <button key={key} type="button" className="btn" disabled={lookup.busy} onClick={run} data-testid={testId} title={title}>
              {icon}<span className="label">{label}</span>
            </button>
          )))}
        {note && !lookup.inchi && !lookup.smiles && (
          <span className="small">
            {t('Sends what you typed to PubChem (pubchem.ncbi.nlm.nih.gov); your drawing stays here.')}
            {language !== 'en' && ` ${t('PubChem knows names in English only.')}`}
          </span>
        )}
        {lookup.problem && <span className="small error-text" data-testid="smiles-problem">{lookup.problem.message}</span>}
        {lookup.error && <span className="small error-text">{lookup.error}</span>}
      </div>
    </>
  );
}

// A structure from what was typed, placed like a template.
export function placeFound(editor, doc, title) {
  editor.setTool({ name: 'place', label: title, doc });
  editor.say(t('Click where {name} should go (again for more). Esc when done.', { name: title }), 'info', 5000);
}

export default function Templates({ editor, onClose }) {
  useEscape(onClose);
  const [tab, setTabState] = useState(lastTab);
  const [sub, setSubState] = useState(lastSub);
  const [query, setQuery] = useState('');
  // a category from the list on the left (`group`: one of its subgroups, null for all of it)
  const setTab = (k, group = null) => {
    [lastTab, lastSub] = [k, group];
    setTabState(k);
    setSubState(group);
    setQuery('');
  };
  // "?S", "?Ph", "?C=O": the templates with that element, group or part in them
  const asking = query.trim().startsWith('?');
  const [containing, setContaining] = useState(null); // { query, entries } once RDKit has looked
  useEffect(() => {
    if (!asking) return undefined;
    let current = true;
    templatesWith(query.trim().slice(1)).then((entries) => current && setContaining({ query, entries }), () => current && setContaining({ query, entries: [] }));
    return () => {
      current = false;
    };
  }, [asking, query]);
  const lookup = useLookup(asking ? '' : query, (doc, title) => {
    onClose();
    placeFound(editor, doc, title);
  }, editor.settings);
  const [, setDrawn] = useState(0);
  // the cards in sections: [[subgroup heading or null, entries]] (a whole category with subgroups: one each)
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.startsWith('?')) return [[null, (containing?.query === query ? containing.entries : []).filter(shown)]];
    if (!q) {
      const [category, list] = TEMPLATES[tab];
      const entries = list.filter(shown);
      const groups = SUBGROUPS[category];
      if (!groups) return [[null, entries]];
      return groups.filter(([name]) => sub === null || name === sub)
        .map(([name, names]) => [sub === null ? name : null, names.map((n) => entries.find(([key]) => key === n)).filter(Boolean)])
        .filter(([, list2]) => list2.length);
    }
    return [[null, templatesNamed(q)]];
  }, [tab, sub, query, containing]);
  const items = useMemo(() => sections.flatMap(([, list]) => list), [sections]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // the cards shown again at most once a frame (not after every picture: hundreds of renders of
      // hundreds of cards), and a moment for the page between pictures, so typing goes on
      let frame = null;
      const show = () => {
        frame ??= requestAnimationFrame(() => {
          frame = null;
          if (!cancelled) setDrawn((n) => n + 1);
        });
      };
      let since = performance.now();
      // then the other templates' pictures while the window is open, so the next search finds them drawn
      const shown = new Set(items);
      for (const entry of [...items, ...TEMPLATES.flatMap(([, list]) => list)]) {
        if (pictures.has(entry[1])) continue;
        await picture(entry, editor.settings).catch((error) => console.error('[templates]', entry[0], error));
        if (cancelled) return;
        if (shown.has(entry)) show();
        if (performance.now() - since > 30) {
          await new Promise((resolve) => setTimeout(resolve));
          since = performance.now();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items, editor]);

  const pick = (entry) => {
    onClose();
    pickTemplate(editor, entry);
  };
  // drawn by a function: a chair (its R/S read from its axial and equatorial groups), the boat or the adamantane cage
  const drawn = (source, kind) => typeof source !== 'string' && kind !== 'label';
  const chair = (key) => /chair|^Methyl, /i.test(key);
  // one template's card
  const card = (entry, k) => {
    const [key, source, kind] = entry;
    const name = kind === 'label' ? key : t(key);
    // (an abbreviation's full name, a placeholder's meaning, an amino acid's codes)
    const full = kind === 'label' ? LABEL_NAMES[key] : AMINO_ACID_CODES[key]?.join(', ');
    const title = kind === 'label' ? t('{name}: click, then click an atom to attach it', { name: `${name} (${full ?? ''})` })
      : /Haworth|Fischer/.test(key) ? t('{name} (its stereo goes into files as wedges)', { name })
      : /Newman/.test(key) ? t('{name}: a molecule seen along a bond (curved arrows, R/S); the panel changes the groups and turns the back carbon', { name })
      : drawn(source, kind) ? (chair(key) ? t('{name} (its R/S is read from the axial and equatorial groups and goes into files)', { name }) : name)
      : source.includes('*') ? t('{name}: click, then click an atom to attach it', { name }) : `${name}: ${source}`;
    const labels = ABBREVIATED[key] ?? [];
    return (
      <div key={`${k}-${key}`} className="card-place">
        <button type="button" className="card" onClick={() => pick(entry)} title={title} data-testid="template">
          <div className="thumb">{pictures.has(source) ? <img src={pictures.get(source)} alt={name} /> : <span className="small">…</span>}</div>
          <div className="caption">{name}{full && <span className="full"> · {full}</span>}</div>
        </button>
        {labels.length > 0 && (
          // the same group as one labelled atom (an abbreviation)
          <span className="as-labels">
            {labels.map((label) => (
              <button key={label} type="button" className="as-label" onClick={() => pick(labelEntry(label))}
                title={t('{label}: the group written as one atom, its abbreviation', { label })} data-testid={`as-label-${label}`}>{label}</button>
            ))}
          </span>
        )}
      </div>
    );
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="glass dialog templates-dialog" role="dialog" aria-label={t('Templates')}>
        <header>
          {icons.templates} {t('Templates')}
          <button type="button" className="btn" onClick={onClose} aria-label={t('Close')}>{icons.close}</button>
        </header>
        <div className="body templates-layout">
          <nav className="template-list" aria-label={t('Categories')}>
            <input className="field search" type="search" placeholder={t('Search…')} value={query} autoFocus
              onChange={(e) => setQuery(e.target.value)} data-testid="template-search"
              onKeyDown={(e) => {
                e.stopPropagation();
                // Enter: the first template found, else what the text draws
                if (e.key !== 'Enter' || !query.trim()) return;
                if (items.length) pick(items[0]);
                else lookup.submit();
              }} />
            {TEMPLATES.map(([name, list], k) => (
              <Fragment key={name}>
                <button type="button" className={k === tab && sub === null && !query ? 'on' : ''} onClick={() => setTab(k)} data-testid="template-category">{t(name)}</button>
                {/* (a subgroup with nothing to show on its own, its abbreviations all on functional groups' cards: not listed) */}
                {(SUBGROUPS[name] ?? []).filter(([, names]) => names.some((n) => list.some((e) => e[0] === n && shown(e)))).map(([group]) => (
                  <button key={group} type="button" className={`sub${k === tab && sub === group && !query ? ' on' : ''}`} onClick={() => setTab(k, group)} data-testid="template-subgroup">{t(group)}</button>
                ))}
              </Fragment>
            ))}
          </nav>
          <div className="template-main">
            <p className="search-hint">{t('A name, SMILES or InChI; ?S, ?oh, ?ester, ?C=O: the templates with that element or group in them')}</p>
            {!items.length && !asking && <p className="small">{t('No template called “{name}”.', { name: query })}</p>}
            {!items.length && asking && containing?.query === query && <p className="small">{t('No template has “{part}” in it.', { part: query.trim().slice(1) })}</p>}
            <Elsewhere lookup={lookup} />
            {sections.map(([heading, list], s) => (
              <section key={heading ?? s} className="template-section">
                {heading && <h4 className="template-heading">{t(heading)}</h4>}
                <div className="cards small-cards">{list.map(card)}</div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
