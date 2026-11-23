// Help (the round ? button): the examples, and in the header the quick
// start and the manual (PDFs that go with the site: in Czech for the Czech
// app, else in English), what is new (changelog.html, in the app's
// language, at this version), the keyboard shortcuts and reporting a
// problem. On the left the examples as pictures (one of the tags picked:
// only those); on the right the one chosen, with the tips of the empty
// canvas (how each part was drawn, its button lit in the bars, which stay
// in view: no scrim) and under it the steps that can't be pointed at
// (Layout, Templates, Align). An example can be opened as the drawing, to
// look at it closer or change it (Ctrl+Z brings back what was there). Above
// the tags, in the ? button's colours, a link to the about page's videos of
// olomol at work.
import { useEffect, useState } from 'react';
import ExampleDrawing, { EXAMPLES, ExampleLooks, ExampleThumb, exampleDoc, TAGS } from './ExampleDrawing.jsx';
import { language, t } from '../i18n/i18n.js';
import { icons } from './icons.jsx';
import { ABOUT_PAGE, DOCS, WHATS_NEW } from './report.js';


export default function ExamplesWindow({ editor, dark, fit, onClose, onKeys, onReport }) {
  const [id, setId] = useState(EXAMPLES[0].id);
  const [tag, setTag] = useState(null);
  const shown = EXAMPLES.filter((ex) => !tag || ex.tags.includes(tag));
  const example = shown.find((ex) => ex.id === id) ?? shown[0];
  useEffect(() => {
    // caught before the drawing's keys (arrows would move its selection)
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const k = shown.indexOf(example);
        setId(shown[(k + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length].id);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose, shown, example]);
  const open = () => {
    editor.setDoc(exampleDoc(example));
    onClose();
    fit();
    editor.say(t('The example is your drawing now: change it as you like. Ctrl+Z brings back what was there.'));
  };
  const steps = example.steps?.() ?? [];
  return (
    <>
    {/* a click outside closes it, and only that (no bond drawn under it); see-through, so the buttons pointing
        at a part lights up in the bars stay as they are */}
    <div className="scrim clear" onPointerDown={(e) => { e.preventDefault(); onClose(); }} data-testid="examples-outside" />
    <div className="glass examples-window" role="dialog" aria-label={t('Help')} data-testid="examples">
      <header>
        {t('Help')}
        {/* (the only way to them from the window, besides keys: buttons, not quiet links) */}
        <nav className="help-links">
          <a className="btn" href={DOCS.quickStart} target="_blank" rel="noopener" title={t('PDF, a few pages')} data-testid="help-quick-start">{icons.external}<span className="label">{t('Quick start')}</span></a>
          <a className="btn" href={DOCS.manual} target="_blank" rel="noopener" title={t('Every tool explained, on the web')} data-testid="help-manual">{icons.external}<span className="label">{t('Manual')}</span></a>
          <a className="btn" href={DOCS.manualPdf} target="_blank" rel="noopener" title={t('The manual as a PDF, for printing')} data-testid="help-manual-pdf"><span className="label">PDF</span></a>
          <a className="btn" href={WHATS_NEW} target="_blank" rel="noopener"
            title={t("All versions; you're on {version}", { version: __APP_VERSION__ })} data-testid="help-changelog">{icons.external}<span className="label">{t("What's new")}</span></a>
          <button type="button" className="btn" onClick={() => { onClose(); onKeys(); }} title="?" data-testid="help-keys">{icons.keyboard}<span className="label">{t('Keyboard shortcuts')}</span></button>
          <button type="button" className="btn" onClick={() => { onClose(); onReport(); }} data-testid="help-report">{icons.mail}<span className="label">{t('Report a problem')}</span></button>
          <a className="btn" href={ABOUT_PAGE} target="_blank" rel="noopener" title={t('About, credits and licences')} data-testid="help-about">{icons.info}<span className="label">{t('About')}</span></a>
        </nav>
        <button type="button" className="btn" onClick={onClose} aria-label={t('Close')}>{icons.close}</button>
      </header>
      <div className="examples-body">
        <div className="examples-side">
          {/* the about page's videos, as bright as the ? button, in a new tab
              (?stay: the page, though a kept link to it opens the app) */}
          <a className="examples-videos" href={ABOUT_PAGE} target="_blank" rel="noopener"
            title={t('Five short videos on the about page; it opens in a new tab')} data-testid="example-videos">
            {icons.play}
            <span>
              <strong>{t('Examples in action')}</strong>
              <small>{t('Five short videos · opens in a new tab')}</small>
            </span>
          </a>
          <div className="examples-tags">
            <button type="button" className={`tag${tag ? '' : ' on'}`} onClick={() => setTag(null)} data-testid="examples-all">{t('All')}</button>
            {Object.entries(TAGS).map(([key, name]) => (
              <button key={key} type="button" className={`tag${tag === key ? ' on' : ''}`} onClick={() => setTag(tag === key ? null : key)} data-testid={`examples-tag-${key}`}>{name()}</button>
            ))}
          </div>
          <nav className="examples-list">
            {shown.map((ex) => (
              <button key={ex.id} type="button" className={`item${ex === example ? ' on' : ''}`} onClick={() => setId(ex.id)} data-testid={`example-${ex.id}`}>
                <ExampleThumb editor={editor} dark={dark} example={ex} />
                <span className="caption">{ex.title()}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="examples-view">
          <div className="examples-title">{example.title()}</div>
          {!example.looks && <div className="small">{t("Point at a part to see how it's drawn; its button lights up")}</div>}
          {example.looks ? <ExampleLooks editor={editor} dark={dark} example={example} /> : <ExampleDrawing key={example.id} editor={editor} dark={dark} example={example} largest={1.5} />}
          {steps.length > 0 && (
            <ul className="examples-steps" data-testid="example-steps">
              {steps.map((step, k) => <li key={k}>{step}</li>)}
            </ul>
          )}
          <div className="examples-actions">
            <button type="button" className="btn" onClick={open} data-testid="example-open">{icons.open}<span className="label">{t('Open as a drawing')}</span></button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
