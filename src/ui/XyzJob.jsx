// XYZ coordinates being worked out in the background (see startXyz in actions.js): how far it is and
// a way to stop it, then a button that saves the file. Stereocentres left open are said while it works,
// so that it can be stopped and the drawing put right.
import { t } from '../i18n/i18n.js';
import { dropXyz, saveXyz } from './actions.js';
import { Seconds } from './Dialogs.jsx';
import { icons } from './icons.jsx';

export default function XyzJob({ editor }) {
  const run = editor.xyzJob;
  if (!run) return null;
  const working = run.status === 'working';
  return (
    <div className="glass xyz-job" role="status" data-testid="xyz-job">
      {working ? (
        <div className="line">
          <span className="spinner" aria-hidden="true" />
          <span>{t('Working out 3D coordinates… You can keep drawing.')}</span>
          {run.molecules > 1 && <span className="seconds">{t('Molecule {k} of {n}', { k: run.molecule + 1, n: run.molecules })}</span>}
          {run.how === 'uff' && <span className="seconds" data-testid="xyz-uff">{t('Metal complex: optimised by UFF')}</span>}
          {run.how !== 'uff' && run.tries > 0 && <span className="seconds">{t('Try {k}', { k: run.tries })}</span>}
          <Seconds since={run.started} />
          <button type="button" className="btn" onClick={() => dropXyz(editor)} data-testid="xyz-cancel">{t('Cancel')}</button>
        </div>
      ) : (
        <div className="line">
          <span>{t('3D coordinates are ready.')}</span>
          <button type="button" className="btn primary" onClick={() => saveXyz(editor)} data-testid="xyz-save">{t('Save XYZ file')}</button>
          <button type="button" className="btn" onClick={() => dropXyz(editor)} aria-label={t('Close')}>{icons.close}</button>
        </div>
      )}
      {run.open > 0 && <p className="warn" data-testid="xyz-open">{t('{n} stereocentres have no R/S drawn: the file shows one possible form, which may not be the compound you mean.', { n: run.open })}</p>}
      {!working && editor.docVersion !== run.drawn && <p className="small" data-testid="xyz-changed">{t('The drawing has changed since: the file has it as it was when you clicked Export.')}</p>}
    </div>
  );
}
