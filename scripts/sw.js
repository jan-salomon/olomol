// The service worker of the built site (scripts/pwa.mjs fills in the files
// and the version): it keeps a copy of every file of the site (what the page
// opens with at once, the chemistry engines one by one after), so the site
// opens at once the next time, works without a network and can be
// installed as an app. The page itself comes from the network when there
// is one, so a new version shows on the next load; the other files come
// from the copy (their names change with their content). Other sites
// (PubChem) are left alone.
const CACHE = 'olomol-VERSION';
const FILES = FILE_LIST; // what the page loads to open: kept when it installs
const LATER = LATER_LIST; // the chemistry engines and the rest: kept one at a time once it runs, RDKit first
const later = new Set(LATER.map((file) => new URL(file, self.registration.scope).href));

// One download of a file into the copy, shared: the page asking for a file on its way waits for it,
// not for a second download. `priority`: low for the engines kept for later (the page's own come first).
const fetching = new Map(); // url -> promise of the response kept
function keep(url, priority = 'low') {
  if (!fetching.has(url)) {
    fetching.set(url, (async () => {
      // (past the browser's own cache, except files with a hash in their name, as when installed)
      const response = await fetch(url, { priority, cache: url.includes('/assets/') ? 'default' : 'reload' });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      await (await caches.open(CACHE)).put(url, response);
    })().finally(() => fetching.delete(url)));
  }
  return fetching.get(url);
}

// The engines kept, one after another (those kept already skipped); started again by the next request
// if the network went or the browser stopped the worker
let filling = null;
function fill() {
  filling ??= (async () => {
    const cache = await caches.open(CACHE);
    for (const url of later) if (!(await cache.match(url))) await keep(url);
  })().catch(() => {
    filling = null;
  });
  return filling;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // past the browser's own cache, except files with a hash in their name
    // (they never change: what the page has just loaded needn't come twice)
    await cache.addAll(FILES.map((file) => new Request(file, { cache: file.startsWith('./assets/') ? 'default' : 'reload' })));
    await self.skipWaiting();
  })());
});

// the copies of older versions go, after the engines they share with this one are taken over (their
// names change with their content: the same name, the same file); then the rest of the engines come
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const name of await caches.keys()) {
      if (!name.startsWith('olomol-') || name === CACHE) continue;
      const old = await caches.open(name);
      for (const url of later) {
        const kept = !(await cache.match(url)) && (await old.match(url));
        if (kept) await cache.put(url, kept);
      }
      await caches.delete(name);
    }
    await self.clients.claim();
  })());
  fill(); // (not waited for: requests would wait for it)
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    const page = new URL(url.pathname, url).href; // without ?test or ?lang
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(page, copy)));
        }
        return response;
      } catch {
        return (await caches.match(page, { ignoreVary: true })) ?? (await caches.match(new URL('index.html', self.registration.scope).href, { ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }
  // the manuals (PDF): from the network, a copy kept for offline once opened
  if (url.pathname.endsWith('.pdf')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      } catch {
        return (await caches.match(request, { ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }
  // (a server may say Vary: Origin; the files are the same for everyone)
  event.waitUntil(fill());
  event.respondWith((async () => {
    const kept = await caches.match(request, { ignoreVary: true });
    if (kept || !later.has(url.href)) return kept ?? fetch(request);
    // an engine not kept yet: its download (the one on its way, or one now, ahead of the others)
    if (!fetching.has(url.href)) {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        fetching.set(url.href, caches.open(CACHE).then((cache) => cache.put(url.href, copy)).finally(() => fetching.delete(url.href)));
      }
      return response;
    }
    await fetching.get(url.href).catch(() => {});
    return (await caches.match(url.href)) ?? fetch(request);
  })());
});
