// The Re-layout dialog: the current drawing and the candidates as
// pictures; click one to use it. In debug mode each card also says which
// engine (and ring template) made it, how, how long it took, and why other
// engines gave nothing.
import { useEffect, useRef, useState } from 'react';
import { svgOf } from '../io/files.js';
import { applyCandidate, prepare, relayoutTargets, runEngines, withCandidate } from '../layout/relayout.js';
import { t } from '../i18n/i18n.js';
import { Seconds, useEscape } from './Dialogs.jsx';
import { icons } from './icons.jsx';

// The drawings of a section in the order they are shown: ranked once, the best first, when the quick
// engines are done (each section's first drawings, whenever they come); every later one after them, so that
// no card moves, changes its number or goes once it is shown. Without `all` only the best: at first the few
// best (at most three, none much worse than the best), then any later one not much worse than that best; the
// rest behind "Show all".
const SHOWN = 3;
const WORSE = 2.5;
let showAll = false; // (remembered while the page is open)
const sectionOf = (c) => (c.part ? 'part' : 'whole');

// Adds the drawings not yet in `arranged` ({ order: [ids], best: Set(ids), top: Map(section → best score) },
// kept between updates).
function arrange(arranged, candidates) {
  const known = new Set(arranged.order);
  const fresh = candidates.filter((c) => !known.has(c.id));
  for (const key of ['part', 'whole']) {
    const list = fresh.filter((c) => sectionOf(c) === key);
    if (!list.length) continue;
    if (!arranged.top.has(key)) {
      list.sort((a, b) => a.score - b.score);
      arranged.top.set(key, list[0].score);
      list.forEach((c, k) => { if (k < SHOWN && c.score <= list[0].score + WORSE) arranged.best.add(c.id); });
    } else {
      for (const c of list) if (c.score <= arranged.top.get(key) + WORSE) arranged.best.add(c.id);
    }
    arranged.order.push(...list.map((c) => c.id));
  }
}

function shownOf(arranged, candidates, all) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return arranged.order.map((id) => byId.get(id)).filter((c) => c && (all || arranged.best.has(c.id)));
}

const picture = (doc, settings, ids) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgOf(doc, settings, { ids, scale: 30 }))}`;

// What a drawing is called: of only the selected part by how it was made, else counted among the
// drawings of whole molecules (in the order shown: `shown`).
function caption(candidate, shown) {
  const nth = (kind) => shown.filter((c) => c.part === kind).indexOf(candidate) + 1;
  if (candidate.part === 'kept') return t('Selected part unchanged, reattached');
  if (candidate.part === 'tidied') return t('Selected part tidied');
  if (candidate.part === 'redrawn') return t('Selected part redrawn {n}', { n: nth('redrawn') });
  return t('Drawing {n}', { n: nth(undefined) });
}

export default function LayoutDialog({ editor, onClose }) {
  const [state, setState] = useState({ status: 'working' });
  const [all, setAll] = useState(showAll);
  const [opened] = useState(() => performance.now()); // (for the seconds of the wait)
  const arranged = useRef({ order: [], best: new Set(), top: new Map() });
  useEscape(onClose);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targets = relayoutTargets(editor);
      if (!targets) {
        setState({ status: 'error', message: t('Select the molecule(s) you want to redraw first.') });
        return;
      }
      try {
        const job = await prepare(editor, targets);
        const ids = (doc) => job.molecules.flatMap((m) => [...m.atomIds, ...m.bondIds]).filter((id) => doc.atoms.has(id) || doc.bonds.has(id));
        const current = picture(editor.doc, editor.settings, ids(editor.doc));
        await runEngines(editor, job, (view) => {
          if (cancelled || !view.quickDone) return; // (nothing shown until the quick engines are done)
          const candidates = view.candidates.map((c) => {
            c.image ??= picture(withCandidate(editor.doc, job, c), editor.settings, ids(editor.doc));
            return c;
          });
          arrange(arranged.current, candidates);
          setState({ status: 'ready', job, current, ...view, candidates });
        }, () => cancelled);
      } catch (error) {
        console.error('[relayout]', error);
        if (!cancelled) setState({ status: 'error', message: t('Redrawing failed: {reason}', { reason: error.message }) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor]);

  const pick = (candidate) => {
    applyCandidate(editor, state.job, candidate);
    editor.say(editor.debug ? `Applied "${candidate.label}". Ctrl+Z undoes it.` : t('New drawing applied. Ctrl+Z undoes it.'));
    onClose();
  };
  const debug = editor.debug;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="glass dialog" role="dialog" aria-label={t('Redraw')}>
        <header>
          {icons.layout} {t('Redraw: pick a drawing')}
          <button type="button" className="btn" onClick={onClose} aria-label={t('Close')}>{icons.close}</button>
        </header>
        <div className="body">
          {state.status === 'working' && <p className="small">{t('Computing drawings…')} <Seconds since={opened} /></p>}
          {state.status === 'error' && <p>{state.message}</p>}
          {state.status === 'ready' && (
            <>
              {(() => {
                // with part of a molecule selected: the drawings of that part (tinted) apart from those of whole molecules
                const sections = state.job.partial
                  ? [['part', t('Only the selected part, the rest where it is'), state.candidates.filter((c) => c.part)], ['whole', t('Whole molecules'), state.candidates.filter((c) => !c.part)]]
                  : [['whole', null, state.candidates]];
                const hidden = sections.reduce((n, [, , list]) => n + list.length - shownOf(arranged.current, list, false).length, 0);
                return (
                  <>
                    {/* (its place kept while there is nothing behind it: a drawing coming later doesn't push the cards down) */}
                    <button type="button" className="btn layout-all" onClick={() => { showAll = !all; setAll(!all); }} data-testid="layout-all"
                      style={hidden > 0 || all ? undefined : { visibility: 'hidden' }} tabIndex={hidden > 0 || all ? undefined : -1} aria-hidden={hidden > 0 || all ? undefined : true}>
                      {all ? t('Show only the best') : t('Show all drawings ({n} more)', { n: hidden })}
                    </button>
                    {sections.map(([key, title, list], s) => {
                      const shown = shownOf(arranged.current, list, all);
                      if (!shown.length && s > 0) return null;
                      return (
                        <section key={key} className={`layout-section ${key}`} data-testid={`layout-${key}`}>
                          {title && <div className="layout-title">{title}</div>}
                          <div className="cards">
                            {s === 0 && (
                              <div className="card current">
                                <div className="thumb"><img src={state.current} alt={t('Current drawing')} /></div>
                                <div className="caption">{t('Current drawing')}</div>
                              </div>
                            )}
                            {shown.map((c) => (
                              <button key={c.id} type="button" className="card" onClick={() => pick(c)} data-testid="layout-card">
                                <div className="thumb"><img src={c.image} alt={caption(c, shown)} /></div>
                                <div className="caption">{debug ? [c.label, ...(c.also ?? [])].join(' = ') : caption(c, shown)}</div>
                                {c.problems && <div className="warn">{c.problems}</div>}
                                {debug && (
                                  <div className="debug-box">
                                    {`rule: ${c.rule}\n${c.detail ? `template: ${c.detail}\n` : ''}score: ${c.score.toFixed(2)} (${Object.entries(c.parts).map(([k, v]) => `${k} ${+v.toFixed(2)}`).join(', ')})\ntime: ${c.ms} ms\nSMILES check: same (${c.smiles.length > 60 ? `${c.smiles.slice(0, 60)}…` : c.smiles})`}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </>
                );
              })()}
              {state.pending.length > 0 && <p className="small">{debug ? `Still working: ${state.pending.join(', ')}…` : t('Still working: {n} more…', { n: state.pending.length })} <Seconds since={opened} /></p>}
              {state.pending.length === 0 && !state.candidates.length && (
                <p>{state.skipped.some((s) => s.dropped) ? t('No new drawing: each one would have changed the molecule (e.g. its stereochemistry).') : t('Every engine gave the current drawing (or nothing new).')}</p>
              )}
              {debug && state.skipped.length > 0 && (
                <ul className="skipped">
                  {state.skipped.map((s) => <li key={s.label}><b>{s.label}</b>: {s.reason}</li>)}
                </ul>
              )}
              {!debug && state.candidates.length > 0 && state.skipped.some((s) => s.dropped) && (
                <p className="small">{t('Some drawings were left out because they would have changed the molecule (e.g. its stereochemistry).')}</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
