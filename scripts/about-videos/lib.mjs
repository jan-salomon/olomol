// Shared helpers for the about page's videos: a page on a dev server, a drawn
// pointer (recordings show none), a keycap for pressed keys, human-paced moves,
// and recording by CDP screencast (frames with their times) into an MP4.
// Each script records one video (and without "record" takes stills to look at):
//   OLOMOL_URL=http://localhost:5179/ node e2.mjs <out dir> record       mechanism.mp4
//   node rxn.mjs, cleanup.mjs, complex.mjs, chairs.mjs                   scheme, cleanup, turn3d, chairs
//   node conformations.mjs e2|flip|glucose <out dir> record   three takes of a video on conformations
//   node pictures.mjs <out dir>                               the page's two pictures (app, help)
// The poster is the video's last frame:
//   ffmpeg -sseof -0.3 -i v.mp4 -frames:v 1 v.png && magick v.png -quality 82 v.webp
// Both go in public/about/. README's animated copy: python3 scripts/about-videos/clip.py v.mp4 docs/readme/v.webp
// Record from a copy of the checkout (as npm run check -- --copy serves one) if anyone else is saving files in it.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

export const APP = process.env.OLOMOL_URL ?? 'http://localhost:5179/';

// A rotation of Turn in 3D (3×3 rows, from its first view) as a drag in a straight line (dx, dy) and then a
// Shift drag (px to the right) that give it exactly: the turn about an axis in the page that brings the right
// side to the viewer, then the turn in the page. The stage turns 0.01 rad per pixel (src/ui/Turn3D.jsx).
export function turnDrags(R) {
  const PER_PIXEL = 0.01;
  const about = ([x, y, z], a) => {
    const [c, s, k] = [Math.cos(a), Math.sin(a), 1 - Math.cos(a)];
    return [[c + x * x * k, x * y * k - z * s, x * z * k + y * s], [y * x * k + z * s, c + y * y * k, y * z * k - x * s], [z * x * k - y * s, z * y * k + x * s, c + z * z * k]];
  };
  const times = (a, b) => a.map((row) => [0, 1, 2].map((k) => row.reduce((sum, v, i) => sum + v * b[i][k], 0)));
  const v = R[2]; // what ends up towards the viewer
  const sideways = Math.hypot(v[0], v[1]);
  const theta = Math.acos(Math.max(-1, Math.min(1, v[2])));
  const axis = sideways < 1e-9 ? [1, 0, 0] : [v[1] / sideways, -v[0] / sideways, 0];
  const over = about(axis, sideways < 1e-9 ? 0 : theta);
  const inPlane = times(R, over[0].map((_, k) => over.map((row) => row[k])));
  const gamma = Math.atan2(inPlane[1][0], inPlane[0][0]);
  const length = sideways < 1e-9 ? 0 : theta / PER_PIXEL;
  return { drag: [axis[1] * length, axis[0] * length], shift: -gamma / PER_PIXEL };
}

const POINTER = `
(() => {
  const add = () => {
    const style = document.createElement('style');
    style.textContent = \`
      #demo-pointer { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none; transform: translate(-100px, -100px); }
      #demo-pointer svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35)); }
      #demo-ring { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid rgba(46,111,219,0.75); z-index: 2147483646; pointer-events: none; opacity: 0; transform: scale(0.4); transition: opacity 0.35s, transform 0.35s; }
      #demo-ring.on { opacity: 1; transform: scale(1); transition: none; }
      #demo-key { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 2147483647; pointer-events: none; font: 600 22px system-ui, sans-serif; color: #1c1f26; background: #fff; border: 1px solid rgba(20,25,45,0.18); border-bottom-width: 4px; border-radius: 9px; padding: 4px 14px; box-shadow: 0 6px 20px rgba(25,30,60,0.18); opacity: 0; transition: opacity 0.3s; }
      #demo-key.on { opacity: 1; transition: none; }
    \`;
    document.head.append(style);
    const pointer = document.createElement('div');
    pointer.id = 'demo-pointer';
    pointer.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2 L3 19 L7.5 14.8 L10.6 21.6 L13.6 20.3 L10.6 13.6 L16.8 13.6 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const ring = document.createElement('div');
    ring.id = 'demo-ring';
    const key = document.createElement('div');
    key.id = 'demo-key';
    document.body.append(pointer, ring, key);
    addEventListener('mousemove', (e) => { pointer.style.transform = \`translate(\${e.clientX - 3}px, \${e.clientY - 2}px)\`; }, true);
    addEventListener('mousedown', (e) => { ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px'; ring.classList.add('on'); }, true);
    addEventListener('mouseup', () => ring.classList.remove('on'), true);
    window.demoKey = (text, ms = 700) => { key.textContent = text; key.classList.add('on'); clearTimeout(window.demoKeyTimer); window.demoKeyTimer = setTimeout(() => key.classList.remove('on'), ms); };
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();`;

export async function open(url, { width = 1280, height = 720, lang = 'en' } = {}) {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'en-GB', colorScheme: 'light' });
  await context.addInitScript(POINTER);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log('[page error]', error.message));
  const address = new URL(url);
  address.searchParams.set('test', '');
  address.searchParams.set('lang', lang);
  await page.goto(address.href);
  await page.waitForFunction(() => window.olomolTest);
  let at = [width / 2, height / 2];
  const pause = (ms) => page.waitForTimeout(ms);
  // A hand's moves, not a robot's (seeded, so a recording comes out the same each time): a slight
  // arc, speed rising and falling (minimum jerk), longer for longer ways (Fitts), on long ways a
  // small overshoot put right, a faint tremor, and a short varying hesitation before a click.
  let seed = 7;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (a, b) => a + (b - a) * random();
  const jerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);
  const path = async (x, y, ms, { bend = 0.12, tremor = 0.6 } = {}) => {
    const [x0, y0] = at;
    const [dx, dy] = [x - x0, y - y0];
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) return;
    const side = random() < 0.5 ? -1 : 1;
    const off = side * between(0.3, 1) * bend * distance; // the arc's bulge
    const [nx, ny] = [-dy / distance, dx / distance];
    const c1 = [x0 + dx * 0.3 + nx * off, y0 + dy * 0.3 + ny * off];
    const c2 = [x0 + dx * 0.7 + nx * off * 0.6, y0 + dy * 0.7 + ny * off * 0.6];
    const phase = [between(0, 6.3), between(0, 6.3)];
    const steps = Math.max(3, Math.round(ms / 25));
    const started = Date.now();
    for (let i = 1; i <= steps; i++) {
      const t = jerk(i / steps);
      const u = 1 - t;
      let px = u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x;
      let py = u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y;
      if (i < steps) {
        px += tremor * Math.sin(i * 0.9 + phase[0]);
        py += tremor * Math.sin(i * 0.7 + phase[1]);
      }
      await page.mouse.move(px, py);
      const late = started + (ms * i) / steps - Date.now();
      if (late > 0) await page.waitForTimeout(late);
    }
    at = [x, y];
  };
  // ms: as a hand would take (Fitts), unless given; precise: no overshoot (a small target, a drag's end);
  // exact: dead straight, for a turn in 3D that must end where it was worked out to
  const move = async (x, y, ms, { precise = false, bend, exact = false } = {}) => {
    if (exact) return path(x, y, ms ?? 900, { bend: 0, tremor: 0 });
    const distance = Math.hypot(x - at[0], y - at[1]);
    const time = ms ?? (230 + 120 * Math.log2(1 + distance / 30)) * between(0.88, 1.15);
    if (!precise && distance > 220 && random() < 0.55) {
      const over = between(0.03, 0.06) * distance;
      const [ux, uy] = [(x - at[0]) / distance, (y - at[1]) / distance];
      const sideways = between(-6, 6);
      await path(x + ux * over - uy * sideways, y + uy * over + ux * sideways, time * 0.9, { bend });
      await pause(between(40, 90));
      await path(x, y, between(140, 200), { bend: 0.05, tremor: 0.3 });
    } else await path(x, y, time, { bend });
  };
  const click = async (x, y, ms) => {
    await move(x, y, ms);
    await pause(between(70, 190));
    await page.mouse.down();
    await pause(between(60, 100));
    await page.mouse.up();
    await pause(between(150, 300));
  };
  // a drag: a hand drags more slowly and straighter than it moves
  const drag = async (x, y, x2, y2, ms) => {
    await move(x, y);
    await pause(between(120, 220));
    await page.mouse.down();
    await pause(between(70, 120));
    const distance = Math.hypot(x2 - x, y2 - y);
    await move(x2, y2, ms ?? (330 + 150 * Math.log2(1 + distance / 30)) * between(0.9, 1.1), { precise: true, bend: 0.06 });
    await pause(between(90, 160));
    await page.mouse.up();
    await pause(between(220, 340));
  };
  const key = async (name, label = name) => {
    await page.evaluate((label) => window.demoKey(label), label);
    await page.keyboard.press(name);
    await pause(400);
  };
  const type = async (text) => {
    for (const c of text) {
      await page.keyboard.type(c);
      await pause(between(30, 95) + (c === ' ' || c === ',' ? between(60, 160) : 0));
    }
  };
  const state = (fn, arg) => page.evaluate(fn, arg);
  const showKey = (label, ms) => page.evaluate(([label, ms]) => window.demoKey(label, ms), [label, ms]);
  // the screen point of an atom, and of its lone pairs
  const atomAt = (id) => state((id) => {
    const p = olomol.scene.atoms.get(id).pos;
    const { scale, tx, ty } = olomol.view;
    return [p[0] * scale + tx, p[1] * scale + ty];
  }, id);
  const pairsOf = (id) => state((id) => {
    const { scale, tx, ty } = olomol.view;
    return olomol.scene.atoms.get(id).electrons.pairs.map((e) => [e.point[0] * scale + tx, e.point[1] * scale + ty]);
  }, id);
  const atoms = () => state(() => [...olomol.doc.atoms.values()].map((a) => ({ id: a.id, el: a.el, charge: a.charge })));
  const bonds = () => state(() => [...olomol.doc.bonds.values()].map((b) => ({ id: b.id, a: b.a, b: b.b })));

  // recording: the frames the page paints, with their times
  let session = null;
  const frames = [];
  const record = async () => {
    session = await context.newCDPSession(page);
    session.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      frames.push({ data, time: metadata.timestamp });
      await session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: width, maxHeight: height });
  };
  // the frames as a video: each shown until the next, the last for `hold` s
  const save = async (out, { hold = 1.5, trimStart = 0 } = {}) => {
    await session.send('Page.stopScreencast');
    const dir = `${out}.frames`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    const kept = frames.filter((f) => f.time >= frames[0].time + trimStart);
    const lines = ['ffconcat version 1.0'];
    kept.forEach((frame, i) => {
      writeFileSync(`${dir}/${String(i).padStart(5, '0')}.png`, Buffer.from(frame.data, 'base64'));
      const duration = i + 1 < kept.length ? kept[i + 1].time - frame.time : hold;
      lines.push(`file '${String(i).padStart(5, '0')}.png'`, `duration ${duration.toFixed(4)}`);
    });
    lines.push(`file '${String(kept.length - 1).padStart(5, '0')}.png'`);
    writeFileSync(`${dir}/list.txt`, lines.join('\n'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'animation', '-movflags', '+faststart', '-an', out]);
    console.log(`${out}: ${kept.length} frames, ${(kept.at(-1).time - kept[0].time + hold).toFixed(1)} s`);
  };
  return { browser, page, showKey, at: () => at, between, pause, move, click, drag, key, type, state, atomAt, pairsOf, atoms, bonds, record, save };
}
