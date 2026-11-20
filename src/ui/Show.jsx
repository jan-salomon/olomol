// Show: the drawings alone, full screen, for a lecture or a seminar (an exercise in one tab, its solution in the
// next). The bars and panels go (body.showing, app.css), each drawing fills the screen, and → ↓ Page Down Space
// (a presentation clicker) show the next open drawing, each fitted to the screen (J: a large scheme beside small
// molecules made them too small at one scale), ← ↑ Page Up the one before, Home and End the first and the
// last; Esc (or leaving full screen) goes back, every drawing seen as it was before. Nothing can be drawn
// meanwhile (Canvas.jsx: editor.showing); the wheel still zooms. A small bar at the bottom, while the mouse
// moves: the drawing's number and name, back, next, and leaving.
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/i18n.js';
import { icons } from './icons.jsx';
import { showTab, shownTitle } from './tabs.js';

const MARGIN = 48; // px round the drawing
const MOST = 110; // the largest scale (a small molecule not blown up past 260 %)
const IDLE = 2500; // ms without moving the mouse: the small bar goes

// What App.jsx needs: { start, stop, step, key } and whether it is showing
export function useShow(editor) {
  const [showing, setShowing] = useState(false);
  const views = useRef(new Map()); // drawing id -> its view before showing
  const full = useRef(false); // (whether we asked for full screen)
  const room = () => [window.innerWidth - 2 * MARGIN, window.innerHeight - 2 * MARGIN];
  const fitAll = () => {
    const [width, height] = room();
    editor.fit(width, height, { left: MARGIN, top: MARGIN, most: MOST });
  };
  const seen = () => {
    if (!views.current.has(editor.drawingId)) views.current.set(editor.drawingId, { ...editor.view });
    fitAll();
  };
  const start = async () => {
    editor.select([]);
    editor.setTool({ name: 'select' });
    views.current = new Map();
    editor.showing = true;
    setShowing(true);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        full.current = true;
      }
    } catch {
      // (no full screen here: the window as it is)
    }
    requestAnimationFrame(seen);
  };
  const stop = () => {
    if (!editor.showing) return;
    editor.showing = false;
    setShowing(false);
    // every drawing seen as it was before
    for (const [id, view] of views.current) {
      if (id === editor.drawingId) editor.setView(view);
      else {
        const tab = editor.tabs.find((other) => other.id === id);
        if (tab?.own?.doc) tab.own.view = view;
      }
    }
    if (full.current && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    full.current = false;
    editor.emit();
  };
  const step = async (k) => {
    const order = editor.tabs.map((tab) => tab.id);
    const at = order.indexOf(editor.drawingId);
    const to = k === 'first' ? 0 : k === 'last' ? order.length - 1 : Math.max(0, Math.min(order.length - 1, at + k));
    if (to === at || to < 0) return;
    if (await showTab(editor, order[to])) seen();
  };
  // the keys while showing: true when taken
  const key = (e) => {
    const steps = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1, Home: 'first', End: 'last' };
    if (e.key === 'Escape') stop();
    else if (e.key in steps) step(steps[e.key]);
    else return false;
    return true;
  };
  useEffect(() => {
    if (!showing) return undefined;
    document.body.classList.add('showing');
    const resized = () => requestAnimationFrame(fitAll);
    // (full screen left by the browser's own Esc or F11: showing ends too)
    const screen = () => {
      if (!document.fullscreenElement && full.current) stop();
      else resized();
    };
    window.addEventListener('resize', resized);
    document.addEventListener('fullscreenchange', screen);
    return () => {
      document.body.classList.remove('showing');
      window.removeEventListener('resize', resized);
      document.removeEventListener('fullscreenchange', screen);
    };
  }, [showing]);
  return { showing, start, stop, step, key };
}

// The small bar at the bottom while showing: there at first and while the mouse moves
export function ShowBar({ editor, show }) {
  const [seen, setSeen] = useState(true);
  const timer = useRef(null);
  useEffect(() => {
    const moved = () => {
      setSeen(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setSeen(false), IDLE);
    };
    moved();
    window.addEventListener('pointermove', moved);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('pointermove', moved);
    };
  }, []);
  const at = editor.tabs.findIndex((tab) => tab.id === editor.drawingId);
  const many = editor.tabs.length > 1;
  return (
    <div className={`glass show-bar${seen ? '' : ' gone'}`} data-testid="show-bar" onPointerEnter={() => clearTimeout(timer.current)}>
      {many && <button type="button" className="btn" title={t('The drawing before (←)')} aria-label={t('The drawing before (←)')} disabled={at <= 0} onClick={() => show.step(-1)} data-testid="show-back">{icons.chevron}</button>}
      <span className="where">{many && <b>{at + 1} / {editor.tabs.length}</b>}{shownTitle(editor.title)}</span>
      {many && <button type="button" className="btn next" title={t('The next drawing (→, Page Down, Space)')} aria-label={t('The next drawing (→, Page Down, Space)')} disabled={at >= editor.tabs.length - 1} onClick={() => show.step(1)} data-testid="show-next">{icons.chevron}</button>}
      <span className="sep" />
      <button type="button" className="btn" title={t('Back to drawing (Esc)')} aria-label={t('Back to drawing (Esc)')} onClick={show.stop} data-testid="show-stop">{icons.close}</button>
    </div>
  );
}
