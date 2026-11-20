// Locks the built site (dist/) with a password. The app's own code (the
// main file: editor, drawing, chemistry) is encrypted with AES-256-GCM, its
// key made from the password with PBKDF2-SHA-256; the page becomes a login
// window that turns the password into the key, decrypts the app and starts
// it. Any static hosting then serves a site only those with the password
// can use; without it the files are of no use. The free libraries (RDKit,
// Indigo, OpenChemLib), the styles and the translations stay as they are:
// public anyway, useless without the app.
//   npm run build:locked                   (asks for the password)
//   OLOMOL_PASSWORD='…' npm run build:locked
// The browser decrypts only on https:// pages (and on localhost).
import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const ITERATIONS = 600_000; // PBKDF2 rounds: a guess costs a moment, a million guesses a long time

// The password, typed without showing it (twice), unless OLOMOL_PASSWORD has it.
async function askPassword() {
  if (process.env.OLOMOL_PASSWORD) return process.env.OLOMOL_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('no password: set OLOMOL_PASSWORD');
  const ask = (question) => new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let typed = '';
    const key = (buffer) => {
      for (const c of buffer.toString('utf8')) {
        if (c === '\r' || c === '\n') {
          process.stdin.off('data', key);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(typed);
          return;
        }
        if (c === '\u0003') process.exit(1); // Ctrl+C
        typed = c === '\u007f' ? typed.slice(0, -1) : typed + c;
      }
    };
    process.stdin.on('data', key);
  });
  const password = await ask('Password for the site: ');
  if ((await ask('The same again: ')) !== password) throw new Error('the two passwords differ');
  return password;
}

// a mistake: one line, not a stack trace
process.on('uncaughtException', (error) => {
  console.error(`olomol: ${error.message}`);
  process.exit(1);
});

const password = await askPassword();
if (!password) throw new Error('an empty password');
if (password.length < 10) console.warn('olomol: a short password; anyone with the files can try guesses at their leisure, so a longer one (a few words) is safer');

const page = readFileSync('dist/index.html', 'utf8');
const entry = /<script type="module" crossorigin src="\.\/(assets\/main-[^"]+\.js)"><\/script>\s*/.exec(page);
if (!entry) throw new Error('dist/index.html has no app to lock (run npm run build first, once)');
const mainFile = entry[1];
let code = readFileSync(`dist/${mainFile}`, 'utf8');

// The app will run from memory (a blob: address), so what it finds next to
// itself it must find by the address of the file it was: import.meta stands
// for that address, set by the login page; files it imports when needed go
// by that address too, files it imports at once are named by the login page.
code = code.replace(/import\(\s*([`"'])\.\/([^`"']+)\1\s*\)/g, (all, quote, file) => `import(new URL(${JSON.stringify(`./${file}`)}, globalThis.__olomolBase).href)`);
code = code.replaceAll('import.meta.resolve', '(void 0)').replaceAll('import.meta.url', 'globalThis.__olomolBase');
if (code.includes('import.meta')) throw new Error('the app uses import.meta in a way the lock does not know');
const deps = [...new Set([...code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((m) => m[1]))];

// AES-256-GCM, the key from the password: salt (16 bytes), iv (12), then
// the encrypted app (packed with gzip first: encrypted, it can't be packed
// on the way)
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gzipSync(code, { level: 9 })));
const locked = new Uint8Array([...salt, ...iv, ...sealed]);
const lockedFile = `assets/app-${createHash('sha256').update(locked).digest('hex').slice(0, 10)}.locked`;
writeFileSync(`dist/${lockedFile}`, locked);
unlinkSync(`dist/${mainFile}`);

const config = { file: lockedFile, size: locked.length, main: mainFile, deps, iterations: ITERATIONS };
writeFileSync('dist/index.html', page.replace(entry[0], '').replace('<div id="root">', `${readFileSync(new URL('lock-page.html', import.meta.url), 'utf8')}
    <script type="module">
${readFileSync(new URL('lock-page.js', import.meta.url), 'utf8').replace('LOCK_CONFIG', JSON.stringify(config))}
    </script>
    <div id="root">`));
console.log(`olomol: locked (${(locked.length / 1024).toFixed(0)} kB encrypted: ${lockedFile}); the site in dist/ now needs the password`);
