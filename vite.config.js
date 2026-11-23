import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { citedVersion, LANGUAGES, PAGES, pathOf, releaseDate as releaseDateIn, splitPage } from './scripts/pages.mjs';

// the sizes of the big files, for the progress bar while they download (src/io/download.js)
const size = (file) => statSync(new URL(`node_modules/${file}`, import.meta.url)).size;

// which version a report is about: package.json's version, the build date
// and the commit (with "+" if the files differ from it; none without git)
const { version, conceptDoi } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));
function commit() {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const changed = execSync('git status --porcelain --untracked-files=no', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return changed ? `${hash}+` : hash;
  } catch {
    return '';
  }
}

// this version's release date, as What's new gives it (public/changelog.html: its section's data-date);
// none for a development version (0.4.0-dev), which has no section of its own
const releaseDate = () => releaseDateIn(readFileSync(new URL('public/changelog.html', import.meta.url), 'utf8'), version);

// The quick start and manual, Czech and English, go along with the site (dist/docs/), and for developers how to
// embed olomol and its file format,
// the help button links them wherever it is hosted; in development Vite
// serves docs/ itself.
const manuals = {
  name: 'olomol-manuals',
  generateBundle() {
    for (const file of ['rychly-start.pdf', 'manual.pdf', 'en/quick-start.pdf', 'en/manual.pdf', 'embed.md', 'olom.md']) this.emitFile({ type: 'asset', fileName: `docs/${file}`, source: readFileSync(new URL(`docs/${file}`, import.meta.url)) });
  },
};

// The about page and What's new, one page per language (scripts/pages.mjs, which the build runs on dist/):
// served the same way here, from public/, with Vite's client, so they reload when they or what they show
// (public/about/, public/changelog/) change
const languagePages = {
  name: 'olomol-language-pages',
  apply: 'serve',
  configureServer(server) {
    const served = new Map(PAGES.flatMap((page) => LANGUAGES.map((lang) => [`/${pathOf(page, lang)}`, [page, lang]])));
    server.middlewares.use((req, res, next) => {
      const [page, lang] = served.get(req.url.split(/[?#]/)[0]) ?? [];
      if (!page) return next();
      const source = readFileSync(new URL(`public/${page}`, import.meta.url), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.end(splitPage(source, page, lang, { version, released: releaseDate(), doi: conceptDoi ?? '', cited: citedVersion(readFileSync(new URL('public/changelog.html', import.meta.url), 'utf8'), version) }).replace('</head>', '<script type="module" src="/@vite/client"></script></head>'));
    });
    const changed = (file) => {
      if (/\/public\/(about|changelog)(\.html|\/)/.test(file)) server.ws.send({ type: 'full-reload' });
    };
    server.watcher.on('change', changed).on('add', changed).on('unlink', changed);
  },
};

export default defineConfig({
  // Relative asset URLs, so the built site works from any sub-folder
  // (GitHub Pages serves project sites from https://<user>.github.io/<repo>/).
  base: './',
  plugins: [react(), manuals, languagePages],
  // the dev server reads a changed file only once it has stopped changing:
  // an editor that rewrites a file whole can otherwise be caught with it
  // empty, and that version is served until the server starts again
  server: { watch: { awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } } },
  define: {
    __RDKIT_WASM_SIZE__: size('@rdkit/rdkit/dist/RDKit_minimal.wasm'),
    __INDIGO_WASM_SIZE__: size('indigo-ketcher/indigo-ketcher-norender-1.46.0.wasm'),
    __OCL_RESOURCES_SIZE__: size('openchemlib/dist/resources.json'),
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __RELEASE_DATE__: JSON.stringify(releaseDate()),
    __COMMIT__: JSON.stringify(commit()),
    // the DOI to cite olomol by: the concept DOI on Zenodo, of all versions (package.json), the version
    // named beside it; so citations of every version add up under one DOI
    __DOI__: JSON.stringify(conceptDoi ?? ''),
  },
  // Indigo finds its .wasm next to its own script (new URL(..., import.meta.url));
  // Vite's dependency pre-bundling would move the script away from it.
  optimizeDeps: { exclude: ['indigo-ketcher'] },
  worker: { format: 'es' },
  // the app, the page a "PubChem page" button opens, and the app to embed in other pages (src/features.js)
  build: { rolldownOptions: { input: { main: 'index.html', pubchem: 'pubchem.html', embed: 'embed.html' } } },
});
