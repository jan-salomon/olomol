// Small dialogs: the periodic table, reporting a problem, the shortcuts, Save as. (About is the about page.)
import { keptText, sameDrawing } from '../io/saving.js';
import { versionsOf } from './history.js';
import { useEffect, useRef, useState } from 'react';
import { familyOf, groupOf, SYMBOLS } from '../chem/elements.js';
import { isEmpty } from '../model/doc.js';
import { t } from '../i18n/i18n.js';
import { icons } from './icons.jsx';
import { SHORTCUTS } from './keys.js';
import { copyRows, CONTACT_ADDRESS, mailLink, REPORT_ADDRESS, reportRows } from './report.js';
import { readAny, svgOf } from '../io/files.js';
import { shownTitle } from './tabs.js';
import { applyStyle, clampPoints, fromPoints, LIMITS, POINTS, STYLE } from '../render/style.js';
import { smilesToMolfile } from '../io/rdkit.js';
import { readMolfile } from '../io/molfile.js';

// Esc closes a dialog.
export function useEscape(onClose) {
  useEffect(() => {
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
}

// The seconds of a long wait, counted up (a clock makes waiting easier): since `since` (performance.now()),
// else since it appeared.
export function Seconds({ since }) {
  const [start] = useState(() => since ?? performance.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="seconds">{Math.floor((performance.now() - start) / 1000)} s</span>;
}

export function Dialog({ title, onClose, children, width }) {
  useEscape(onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="glass dialog" role="dialog" aria-label={title} style={width ? { width } : undefined}>
        <header>
          {title}
          <button type="button" className="btn" onClick={onClose} aria-label={t('Close')}>{icons.close}</button>
        </header>
        {children}
      </div>
    </>
  );
}

// Grid position (row, column; 1-based) of element z in the usual table,
// lanthanides and actinides in two rows underneath.
function place(z) {
  const group = groupOf(z);
  const period = z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : z <= 36 ? 4 : z <= 54 ? 5 : z <= 86 ? 6 : 7;
  if (group) return [period, group];
  return [period === 6 ? 9 : 10, 3 + (z - (period === 6 ? 57 : 89))];
}

const FAMILY_NAMES = {
  alkali: t('Alkali metals'), alkaline: t('Alkaline earth metals'), transition: t('Transition metals'), postTransition: t('Post-transition metals'),
  metalloid: t('Metalloids'), nonmetal: t('Nonmetals'), halogen: t('Halogens'), noble: t('Noble gases'), lanthanide: t('Lanthanides'), actinide: t('Actinides'),
};

// Elements coloured by family, with group and period numbers. (The group
// labels, R, Ph, Boc…, are in Templates → Abbreviations.)
export function PeriodicTable({ onPick, onClose }) {
  return (
    <Dialog title={t('Periodic table')} onClose={onClose} width="fit-content">
      <div className="periodic">
        {Array.from({ length: 18 }, (_, k) => <span key={`g${k}`} className="axis" style={{ gridRow: 1, gridColumn: k + 2 }}>{k + 1}</span>)}
        {Array.from({ length: 7 }, (_, k) => <span key={`p${k}`} className="axis" style={{ gridRow: k + 2, gridColumn: 1 }}>{k + 1}</span>)}
        {SYMBOLS.map((symbol, i) => {
          const [row, column] = place(i + 1);
          const family = familyOf(i + 1);
          return (
            <button key={symbol} type="button" className={`fam-${family}`} style={{ gridRow: row + 1, gridColumn: column + 1 }}
              title={`${symbol} (${i + 1}) · ${FAMILY_NAMES[family]}`} onClick={() => onPick(symbol)}>
              {symbol}
            </button>
          );
        })}
      </div>
      <div className="families">
        {Object.entries(FAMILY_NAMES).map(([family, name]) => <span key={family} className={`fam-${family}`}>{name}</span>)}
      </div>
    </Dialog>
  );
}

// Reporting a problem: nothing is sent from here. A table of
// what helps to know (version, browser, system, the drawing as a link),
// a button that copies it, and one that starts an e-mail to paste it into.
export function Report({ editor, onClose }) {
  const [withDrawing, setWithDrawing] = useState(true);
  const [rows, setRows] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let current = true;
    reportRows(editor, { drawing: withDrawing }).then((found) => current && setRows(found));
    return () => {
      current = false;
    };
  }, [editor, withDrawing]);
  const copy = async () => {
    try {
      await copyRows(rows);
      setCopied(true);
    } catch {
      editor.say(t('Could not copy the table: select it and copy it by hand.'), 'error');
    }
  };
  return (
    <Dialog title={t('Report a problem')} onClose={onClose} width="min(640px, calc(100vw - 32px))">
      <div className="body report">
        <p>
          {t('Write an e-mail to {address}: what you did, what happened and what you expected. A screenshot helps too.', {
            address: <a href={mailLink(rows ?? [])}>{REPORT_ADDRESS}</a>,
          })}
        </p>
        <p>
          <strong>{t('The e-mail already contains this table.')}</strong>
          {(rows ?? []).some(([name]) => name === t('Drawing')) && ` ${t('Only the link to the drawing is too long for it: copy the table and paste it into the e-mail.')}`}
        </p>
        <table data-testid="report-table">
          <tbody>
            {(rows ?? []).map(([name, value]) => (
              <tr key={name}><td>{name}</td><td>{name === t('Drawing') ? `${value.slice(0, 60)}… (${value.length} ${t('characters')})` : value}</td></tr>
            ))}
          </tbody>
        </table>
        {!isEmpty(editor.doc) && (
          <label className="tick">
            <input type="checkbox" checked={withDrawing} onChange={(e) => setWithDrawing(e.target.checked)} />
            {t('With the drawing (a link that holds it whole, so I can see what you saw)')}
          </label>
        )}
        <div className="row buttons">
          <button type="button" className="btn primary" onClick={copy} disabled={!rows} data-testid="report-copy">
            {icons.copy}<span className="label">{copied ? t('Copied') : t('Copy the table')}</span>
          </button>
          <a className="btn" href={mailLink(rows ?? [])} data-testid="report-mail">
            {icons.mail}<span className="label">{t('Write the e-mail')}</span>
          </a>
        </div>
        <p className="small">{t('Nothing is sent from here: you see the e-mail before you send it.')}</p>
        <p className="small" data-testid="report-contact">
          {t('Ideas and questions: {address}', { address: <a href={`mailto:${CONTACT_ADDRESS}?subject=olomol`}>{CONTACT_ADDRESS}</a> })}
        </p>
      </div>
    </Dialog>
  );
}

export function Shortcuts({ onClose }) {
  return (
    <Dialog title={t('Keyboard shortcuts')} onClose={onClose}>
      <div className="body shortcuts">
        {SHORTCUTS.map(([section, rows]) => (
          <section key={section}>
            <h3>{section}</h3>
            <table>
              <tbody>
                {rows.map(([keys, what]) => <tr key={keys}><td><kbd>{keys}</kbd></td><td>{what}</td></tr>)}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

// The name for a file being saved (where the browser has no save dialog of
// its own): Enter saves, Esc cancels.
// The drawing's earlier versions, kept in the browser while it was drawn (ui/history.js), newest first, each as a
// picture: one brought back is an undo step (Ctrl+Z goes back to the drawing before)
export function VersionsDialog({ editor, onClose }) {
  const [versions, setVersions] = useState(null);
  useEscape(onClose);
  useEffect(() => {
    let current = true;
    void editor.scene; // (texts and arrows in their places, as kept)
    const now = keptText(editor.doc, editor.title); // (as the versions are kept: ui/tabs.js)
    versionsOf(editor.drawingId).then(async (list) => {
      const shown = [];
      for (const version of [...list].reverse()) {
        try {
          const { doc } = await readAny(version.ket, { name: 'version.ket' });
          shown.push({ ...version, doc, svg: svgOf(doc, editor.settings), now: sameDrawing(version.ket, now) });
        } catch {
          // (one that can't be read is left out)
        }
      }
      if (current) setVersions(shown);
    });
    return () => {
      current = false;
    };
  }, []);
  const when = (at) => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const bringBack = (version) => {
    editor.setDoc(version.doc);
    onClose();
    editor.say(t('The drawing of {time} is back. Ctrl+Z goes back to the one before.', { time: when(version.at) }), 'info', 6000);
  };
  return (
    <Dialog title={t('Earlier versions of {name}', { name: shownTitle(editor.title) })} onClose={onClose} width="min(720px, calc(100vw - 32px))">
      <div className="body versions" data-testid="versions">
        <p className="small">{t('Kept in this browser while you draw, a few minutes apart (the latest: the drawing as it is now). Closing the drawing forgets them.')}</p>
        {versions === null ? <p>{t('Loading…')}</p> : !versions.length ? null : (
          <ul>
            {versions.map((version, index) => (
              <li key={version.at} data-testid={`version-${index}`}>
                <div className="preview" dangerouslySetInnerHTML={{ __html: version.svg }} />
                <span className="when">{when(version.at)}{version.now && <span className="small"> · {t('as it is now')}</span>}</span>
                {!version.now && <button type="button" className="btn" onClick={() => bringBack(version)} data-testid={`version-back-${index}`}>{t('Bring back')}</button>}
              </li>
            ))}
          </ul>
        )}
        {/* (only the drawing as it is now: when there will be more) */}
        {versions !== null && !versions.some((version) => !version.now) && <p className="small" data-testid="versions-none">{t('Earlier ones are kept every few minutes while you draw: none yet.')}</p>}
      </div>
    </Dialog>
  );
}

// A question with buttons (ask in actions.js): a file changed since it was opened, and the like; Esc: none
export function QuestionDialog({ question }) {
  const cancel = () => question.resolve(null);
  useEscape(cancel);
  return (
    <Dialog title={question.title} onClose={cancel} width="min(480px, calc(100vw - 32px))">
      <div className="body question-dialog" data-testid="question">
        <p>{question.text}</p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          {question.choices.map((choice) => (
            <button key={choice.id} type="button" className={`btn${choice.primary ? ' on' : ''}`} onClick={() => question.resolve(choice.id)}
              autoFocus={choice.primary} data-testid={`question-${choice.id}`}>{choice.label}</button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

export function NameDialog({ request }) {
  const [name, setName] = useState(request.name);
  const field = useRef(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const cancel = () => request.resolve(null);
  useEscape(cancel);
  const save = () => {
    const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
    if (clean) request.resolve(clean.replace(new RegExp(`\\.${request.ext}$`, 'i'), ''));
  };
  return (
    <Dialog title={t('Save as')} onClose={cancel} width="min(460px, calc(100vw - 32px))">
      <form className="body name-dialog" onSubmit={(e) => {
        e.preventDefault();
        save();
      }}>
        <label>
          {t('File name')}
          <span className="name-row">
            <input ref={field} className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-testid="file-name" />
            <span className="small">.{request.ext}</span>
          </span>
        </label>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn" onClick={cancel}>{t('Cancel')}</button>
          <button type="submit" className="btn on" data-testid="save-name">{t('Save')}</button>
        </div>
      </form>
    </Dialog>
  );
}

// A drawing style of one's own (Settings → Style → Custom…): the sizes a journal or a group asks for, in points,
// started from ACS 1996 or RSC; the font Sans (Arial) or Serif (Times New Roman). A molecule drawn with them at
// true size beside them, as they change. Use: the style of the drawings (settings.customStyle, style 'custom').
const SAMPLE = 'CC(=O)N[C@@H](Cc1ccccc1)C(=O)O';
export function StyleDialog({ editor, onClose }) {
  const now = editor.drawingStyle();
  const start = now.customStyle ?? POINTS[now.style] ?? POINTS.acs;
  const [points, setPoints] = useState(clampPoints(start));
  const [sample, setSample] = useState(null);
  useEffect(() => {
    let current = true;
    smilesToMolfile(SAMPLE).then((molfile) => current && setSample(readMolfile(molfile).doc), () => {});
    return () => {
      current = false;
    };
  }, []);
  // the sample drawn with these sizes (the style put in place for a moment, then the one in use again)
  let preview = '';
  if (sample) {
    const kept = { ...STYLE };
    try {
      applyStyle({ style: 'custom', customStyle: points });
      preview = svgOf(sample, editor.settings, { scale: fromPoints(clampPoints(points)).exportScale });
    } finally {
      Object.assign(STYLE, kept);
    }
  }
  const field = (key, label) => (
    <label className="row style-field" key={key}>
      <span className="name">{label}</span>
      <input type="number" step={key === 'bond' || key === 'label' ? 0.5 : 0.1} min={LIMITS[key][0]} max={LIMITS[key][1]} value={points[key]}
        data-testid={`style-${key}`} onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setPoints({ ...points, [key]: e.target.value })}
        onBlur={() => setPoints(clampPoints(points))} />
      <span className="small">pt</span>
    </label>
  );
  return (
    <Dialog title={t('Drawing style')} onClose={onClose} width="min(640px, calc(100vw - 32px))">
      <div className="body style-dialog" data-testid="style-dialog">
        <div className="style-fields">
          <div className="row style-field">
            <span className="name">{t('Start from')}</span>
            <span className="seg">
              <button type="button" onClick={() => setPoints({ ...POINTS.acs, family: points.family })}>ACS 1996</button>
              <button type="button" onClick={() => setPoints({ ...POINTS.rsc, family: points.family })}>RSC</button>
            </span>
          </div>
          {field('bond', t('Bond length'))}
          {field('line', t('Lines'))}
          {field('bold', t('Bold bonds, wedges'))}
          {field('hash', t('Hash spacing'))}
          {field('margin', t('Margin round labels'))}
          {field('label', t('Labels and texts'))}
          <div className="row style-field">
            <span className="name">{t('Font')}</span>
            <span className="seg">
              {[['sans', t('Sans (Arial)')], ['serif', t('Serif (Times)')]].map(([family, name]) => (
                <button key={family} type="button" className={points.family === family ? 'on' : ''} data-testid={`style-font-${family}`}
                  onClick={() => setPoints({ ...points, family })}>{name}</button>
              ))}
            </span>
          </div>
        </div>
        <div className="style-preview" title={t('At true size')} dangerouslySetInnerHTML={{ __html: preview }} />
        <p className="small style-note">{t('Sizes as the journal or your group asks; pictures and PDFs come out at this true size.')}</p>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button type="button" className="btn on" data-testid="style-use" onClick={() => {
            editor.setDrawingStyle('custom', clampPoints(points));
            onClose();
          }}>{t('Use')}</button>
        </div>
      </div>
    </Dialog>
  );
}
