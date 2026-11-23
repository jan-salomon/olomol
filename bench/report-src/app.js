// The report's benchmark page: filters, pages of cards, drawings drawn as
// they scroll into view, keyboard navigation. Data: window.BENCH (set by
// data/<id>-cases.js), drawings in data/<id>-dNNN.js (loaded on demand by a
// script tag, which works from file://). Drawings by olomolRender.
(function () {
  const B = window.BENCH;
  const PAGE = 200;
  const STATUS_LABEL = { fail: 'failures only', all: 'all', pass: 'passes only', excluded: 'excluded / not judged' };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const store = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private window */ } },
  };
  const counts = { fail: 0, pass: 0, excluded: 0, info: 0 };
  for (const c of B.cases) counts[c.status] = (counts[c.status] ?? 0) + 1;
  const state = {
    status: counts.fail ? 'fail' : 'all',
    facets: Object.fromEntries(B.facets.map((f) => [f.key, ''])),
    search: '',
    page: 0,
    current: -1,
  };
  const BASES = { local: 'http://localhost:5173/', site: 'https://olomol.org/' };
  let base = store.get('bench-report-base', 'local');
  if (!BASES[base]) base = 'local'; // (a choice kept from before, no longer offered)

  // --- the bar at the top ---
  const facetValues = (key) => {
    const seen = new Map();
    for (const c of B.cases) for (const v of [].concat(c.facets?.[key] ?? [])) if (v !== '' && v !== null) seen.set(v, (seen.get(v) ?? 0) + 1);
    return [...seen].sort((a, b) => (typeof a[0] === 'number' ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true })));
  };
  const statusButtons = ['fail', 'all', 'pass', ...(counts.excluded || counts.info ? ['excluded'] : [])];
  document.getElementById('bar').innerHTML = `<div class="row">
    <a href="index.html">← all benchmarks</a>
    <b>${esc(B.title)}</b>
    <span class="seg" id="status">${statusButtons.map((s) => `<button data-status="${s}">${(B.statusLabels ?? STATUS_LABEL)[s] ?? STATUS_LABEL[s]}</button>`).join(' ')}</span>
    ${B.facets.map((f) => `<label>${esc(f.label)} <select data-facet="${f.key}"><option value="">any</option>${facetValues(f.key).map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join('')}</select></label>`).join(' ')}
    <input type="search" id="search" placeholder="search name, ID, SMILES">
    <span id="count" class="muted"></span>
    <label class="small">Open in <select id="base"><option value="local">localhost:5173</option><option value="site">olomol.org</option></select></label>
    <span class="help"><kbd>j</kbd>/<kbd>k</kbd> next/previous, <kbd>f</kbd> failures only</span>
  </div>`;
  document.getElementById('base').value = base;
  document.getElementById('base').onchange = (e) => { base = e.target.value; store.set('bench-report-base', base); };
  document.getElementById('status').onclick = (e) => {
    const s = e.target.dataset?.status;
    if (!s) return;
    state.status = s;
    state.page = 0;
    render();
  };
  for (const select of document.querySelectorAll('select[data-facet]')) {
    select.onchange = () => { state.facets[select.dataset.facet] = select.value; state.page = 0; render(); };
  }
  let typing;
  document.getElementById('search').oninput = (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.search = e.target.value.trim().toLowerCase(); state.page = 0; render(); }, 200);
  };

  // --- filtering ---
  const matches = (c) => {
    if (state.status === 'fail' && c.status !== 'fail') return false;
    if (state.status === 'pass' && c.status !== 'pass') return false;
    if (state.status === 'excluded' && c.status !== 'excluded' && c.status !== 'info') return false;
    for (const [key, value] of Object.entries(state.facets)) {
      if (value && ![].concat(c.facets?.[key] ?? []).map(String).includes(value)) return false;
    }
    if (state.search && !(`${c.id} ${c.title ?? ''} ${c.smiles ?? ''} ${c.search ?? ''}`.toLowerCase().includes(state.search))) return false;
    return true;
  };

  // --- drawings ---
  const loaded = new Map();
  window.BENCH_D ??= {};
  function chunk(n) {
    const name = `${B.id}-d${String(n).padStart(3, '0')}`;
    if (!loaded.has(name)) {
      loaded.set(name, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `data/${name}.js`;
        script.onload = () => resolve(window.BENCH_D[name]);
        script.onerror = reject;
        document.head.appendChild(script);
      }));
    }
    return loaded.get(name);
  }
  const drawingOf = async (c, key) => (await chunk(c.chunk))?.[key];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target;
      observer.unobserve(el);
      const c = B.cases[Number(el.dataset.case)];
      const d = c.drawings[Number(el.dataset.drawing)];
      drawingOf(c, d.key).then((json) => {
        if (!json) { el.innerHTML = '<span class="muted small">no drawing</span>'; return; }
        try {
          el.innerHTML = window.olomolRender.svg(json, { overlays: d.overlays ?? [] });
        } catch (error) {
          el.innerHTML = `<span class="muted small">drawing failed: ${esc(error.message)}</span>`;
        }
      }, () => { el.innerHTML = '<span class="muted small">drawing file missing</span>'; });
    }
  }, { rootMargin: '600px 0px' });

  // --- a card ---
  // differing middle of two strings marked
  function diff(a, b) {
    a = String(a ?? '');
    b = String(b ?? '');
    if (a === b) return [esc(a), esc(b)];
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    const mark = (x) => `${esc(x.slice(0, p))}<mark>${esc(x.slice(p, x.length - s))}</mark>${esc(x.slice(x.length - s))}`;
    return [mark(a), mark(b)];
  }
  function card(c, index) {
    const tags = Object.entries(c.facets ?? {}).flatMap(([k, v]) => [].concat(v ?? []).filter((x) => x !== '' && x !== null).map((x) => `<span class="tag" title="${esc(k)}">${esc(x)}</span>`)).join(' ');
    const figures = (c.drawings ?? []).map((d, k) => `<figure class="${d.small ? 'small ' : ''}${(d.classes ?? []).join(' ')}">
        ${d.key ? `<div class="paper" data-case="${index}" data-drawing="${k}"><span class="muted small">…</span></div>` : `<div class="paper"><span class="muted small">${esc(d.text ?? 'no drawing')}</span></div>`}
        <figcaption>${d.label ? `<span class="label">${esc(d.label)}</span>` : ''}${d.caption ? ` ${d.caption}` : ''}${d.metrics ? `<div class="metrics">${d.metrics}</div>` : ''}</figcaption></figure>`).join('');
    const compare = c.compare?.length ? `<table class="compare"><tr><th></th><th>${esc(c.compareHeads?.[0] ?? 'expected')}</th><th>${esc(c.compareHeads?.[1] ?? 'olomol')}</th></tr>${c.compare.map((row) => {
      const differs = row.differs ?? (String(row.expected) !== String(row.got));
      const [e, g] = row.plain ? [esc(row.expected), esc(row.got)] : diff(row.expected, row.got);
      return `<tr class="${differs ? 'differs' : ''}"><td>${esc(row.label)}</td><td class="mono">${e}</td><td class="mono">${g}</td></tr>`;
    }).join('')}</table>` : '';
    const tables = (c.tables ?? []).map((t) => `${t.title ? `<h3>${esc(t.title)}</h3>` : ''}<table class="case-table"><tr>${t.columns.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${t.rows.map((r, i) => `<tr class="${(t.bad ?? []).includes(i) ? 'bad' : ''}">${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`).join('');
    return `<article class="card ${c.status}" id="${esc(c.id)}" data-index="${index}">
      <header><span class="badge ${c.status}">${esc(c.badge ?? c.status)}</span><a class="cid" href="#${esc(c.id)}">${esc(c.id)}</a><span class="title">${esc(c.title ?? '')}</span> ${tags}
        <span class="actions">${c.open !== undefined ? '<button data-open>Open in olomol</button>' : ''}${c.smiles ? '<button data-copy>Copy SMILES</button>' : ''}</span></header>
      ${c.reason ? `<p class="reason">${esc(c.reason)}</p>` : ''}
      ${c.explanation ? `<p class="explain">${c.category ? `<b>${esc(c.category)}.</b> ` : ''}${esc(c.explanation)}</p>` : ''}
      ${figures ? `<div class="drawings">${figures}</div>` : ''}
      ${compare}${tables}
      ${c.notes ? `<p class="notes">${c.notes}</p>` : ''}
    </article>`;
  }

  // --- the page ---
  let shown = [];
  function pageLinks(total) {
    const pages = Math.ceil(total / PAGE);
    if (pages <= 1) return '';
    const links = [];
    for (let p = 0; p < pages; p++) {
      const label = `${p * PAGE + 1}–${Math.min(total, (p + 1) * PAGE)}`;
      links.push(p === state.page ? `<span class="current">${label}</span>` : `<a href="#" data-page="${p}">${label}</a>`);
    }
    return links.join('');
  }
  function render({ keepScroll = false } = {}) {
    for (const b of document.querySelectorAll('#status button')) b.setAttribute('aria-pressed', String(b.dataset.status === state.status));
    const filtered = [];
    B.cases.forEach((c, i) => { if (matches(c)) filtered.push(i); });
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    shown = filtered.slice(state.page * PAGE, (state.page + 1) * PAGE);
    const fails = filtered.filter((i) => B.cases[i].status === 'fail').length;
    document.getElementById('count').textContent = `${filtered.length} of ${B.cases.length} cases (${fails} failed) · page ${state.page + 1} of ${pages}`;
    const links = pageLinks(filtered.length);
    document.getElementById('pages-top').innerHTML = links;
    document.getElementById('pages-bottom').innerHTML = links;
    const list = document.getElementById('cases');
    list.classList.toggle('gallery', B.layout === 'gallery');
    observer.disconnect();
    list.innerHTML = shown.length ? shown.map((i) => card(B.cases[i], i)).join('') : `<div class="empty">No case matches${state.status === 'fail' ? ': no failures here' : ''}.</div>`;
    for (const el of list.querySelectorAll('.paper[data-case]')) observer.observe(el);
    state.current = -1;
    if (!keepScroll) window.scrollTo(0, document.getElementById('cases').offsetTop - 120);
  }
  for (const id of ['pages-top', 'pages-bottom']) {
    document.getElementById(id).onclick = (e) => {
      const p = e.target.dataset?.page;
      if (p === undefined) return;
      e.preventDefault();
      state.page = Number(p);
      render();
    };
  }
  document.getElementById('cases').onclick = async (e) => {
    const article = e.target.closest('article');
    if (!article) return;
    const c = B.cases[Number(article.dataset.index)];
    if (e.target.matches('[data-copy]')) {
      try {
        await navigator.clipboard.writeText(c.smiles);
      } catch {
        const area = Object.assign(document.createElement('textarea'), { value: c.smiles });
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      e.target.textContent = 'Copied';
      setTimeout(() => { e.target.textContent = 'Copy SMILES'; }, 1200);
    }
    if (e.target.matches('[data-open]')) {
      const json = await drawingOf(c, c.drawings[c.open].key);
      const url = await window.olomolRender.link(json, BASES[base]);
      window.open(url, '_blank', 'noopener');
    }
  };

  // --- keys and links to a case ---
  function go(delta) {
    const cards = [...document.querySelectorAll('#cases article')];
    if (!cards.length) return;
    let next = state.current + delta;
    if (next >= cards.length || next < 0) {
      const pages = Math.ceil([...B.cases].filter(matches).length / PAGE);
      const page = state.page + (next < 0 ? -1 : 1);
      if (page < 0 || page >= pages) return;
      state.page = page;
      render();
      const fresh = [...document.querySelectorAll('#cases article')];
      next = delta > 0 ? 0 : fresh.length - 1;
    }
    document.querySelector('#cases article.current')?.classList.remove('current');
    const target = document.querySelectorAll('#cases article')[next];
    target.classList.add('current');
    target.scrollIntoView({ block: 'start' });
    state.current = next;
  }
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'j') go(1);
    else if (e.key === 'k') go(-1);
    else if (e.key === 'f') { state.status = state.status === 'fail' ? 'all' : 'fail'; state.page = 0; render(); }
  });
  function openHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const index = B.cases.findIndex((c) => c.id === id);
    if (index < 0) return false;
    if (!matches(B.cases[index])) {
      state.status = 'all';
      state.search = '';
      document.getElementById('search').value = '';
      for (const key of Object.keys(state.facets)) state.facets[key] = '';
      for (const s of document.querySelectorAll('select[data-facet]')) s.value = '';
    }
    const filtered = B.cases.map((c, i) => (matches(c) ? i : -1)).filter((i) => i >= 0);
    state.page = Math.floor(filtered.indexOf(index) / PAGE);
    render({ keepScroll: true });
    const el = document.getElementById(id);
    el?.classList.add('current');
    el?.scrollIntoView({ block: 'start' });
    return true;
  }
  window.addEventListener('hashchange', openHash);
  if (!location.hash || !openHash()) render({ keepScroll: true });
}());
