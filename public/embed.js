// olomol in your page: <olomol-editor>, an olomol editor in an iframe, with calls to read what was drawn.
//
//   <script src="https://olomol.org/embed.js"></script>
//   <olomol-editor src="https://olomol.org/embed.html?only=curved-arrows#d=…" height="400"></olomol-editor>
//   <olomol-editor only="curved-arrows,charges-electrons" smiles="CC(=O)O.OCC"></olomol-editor>
//
//   const editor = document.querySelector('olomol-editor');
//   editor.addEventListener('change', async (e) => {
//     if (!e.detail.changed.includes('curvedArrows')) return;
//     const arrows = await editor.get('curvedArrows');   // the curved arrows, by the ids of the atoms in the drawing
//   });
//
// Attributes: src (an embed address: embed.html?only=…#…), or only / off (the parts of olomol to
// switch on, or off: curved-arrows, charges-electrons, structure…), readonly (only to look at), theme (light, dark,
// auto), arrowcolor (curved arrows' colour, e.g. 1035a9), changedelay (ms after a change settles, 150 without) and the
// drawing as smiles="…" or drawing="…" (a link's #d=…); height (px, 420 without); lang (olomol's words: en, cs, de).
// Calls, each a promise: get('curvedArrows' | 'canonicalForms' | 'olom' | 'smiles' | 'inchi' | 'inchikeys' |
// 'molfile' | 'svg' | 'png' | 'partsOn' | 'version'), get(what, drawing) (the same about another drawing, read on the
// side: an answer's, get('canonicalForms', answer)); set(drawing, { only, off, locked }),
// setParts({ only, off }), lock(atomIds | 'all' | null), pick({ kinds, count, colour }), highlight(targets, colour or
// null), showMessage(text, { kind, seconds }), readOnly(true | false), clear(), fit().
// Events on the element: 'ready', 'change' (the student changed the drawing: detail.changed says which kinds of
// things; ask for what you need), 'error' (the drawing in the address couldn't be read: detail.message).
// The format of everything: https://olomol.org/docs/embed.md. Free (MIT); please cite olomol (DOI on olomol.org).
(() => {
  if (customElements.get('olomol-editor')) return;
  const VERSION = 1;
  const SCRIPT = document.currentScript?.src ?? 'https://olomol.org/embed.js';
  const BASE = new URL('embed.html', SCRIPT).href;

  class OlomolEditor extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'only', 'off', 'readonly', 'view', 'theme', 'arrowcolor', 'changedelay', 'smiles', 'drawing', 'height', 'lang'];
    }

    constructor() {
      super();
      this.waiting = new Map(); // id -> { resolve, reject, sent }
      this.nextId = 1;
      this.queue = [];
      this.isReady = false;
      this.onMessage = this.onMessage.bind(this);
    }

    connectedCallback() {
      // (moved in the page: the browser loads the frame anew, the editor in it as the address says)
      if (this.frame) this.reloaded();
      if (!this.frame) {
        this.frame = document.createElement('iframe');
        this.frame.title = this.getAttribute('title') ?? 'olomol';
        this.frame.allow = 'clipboard-read; clipboard-write';
        this.frame.style.cssText = 'display:block;width:100%;border:1px solid #d0d4dc;border-radius:8px;box-sizing:border-box';
        this.appendChild(this.frame);
      }
      window.addEventListener('message', this.onMessage);
      this.load();
    }

    disconnectedCallback() {
      window.removeEventListener('message', this.onMessage);
    }

    attributeChangedCallback() {
      if (this.frame) this.load();
    }

    address() {
      if (this.hasAttribute('src')) return new URL(this.getAttribute('src'), location.href).href;
      const url = new URL(BASE);
      for (const name of ['only', 'off', 'theme', 'arrowcolor', 'changedelay', 'lang']) if (this.hasAttribute(name)) url.searchParams.set(name, this.getAttribute(name));
      // (view: its name before 0.6.0)
      if (this.hasAttribute('readonly') || this.hasAttribute('view')) url.searchParams.set('readonly', '');
      if (this.hasAttribute('smiles')) url.hash = `smiles=${this.getAttribute('smiles').replace(/#/g, '%23')}`;
      else if (this.hasAttribute('drawing')) url.hash = this.getAttribute('drawing').replace(/^#/, '');
      return url.href;
    }

    load() {
      this.frame.style.height = `${Number(this.getAttribute('height')) || 420}px`;
      const address = this.address();
      if (this.frame.src === address) return;
      // (only the #drawing changed: the page in the frame stays and opens it; else it loads anew, ready again later)
      if (this.frame.src && this.frame.src.split('#')[0] !== address.split('#')[0]) this.reloaded();
      else if (!this.frame.src) this.isReady = false;
      this.origin = new URL(address).origin;
      this.frame.src = address;
    }

    // The editor in the frame loads anew: not ready until it says so (calls made meanwhile wait for it), and calls
    // it was already asked never answered: rejected
    reloaded() {
      this.isReady = false;
      for (const [id, waiting] of this.waiting) {
        if (!waiting.sent) continue;
        this.waiting.delete(id);
        waiting.reject(new Error('olomol: the editor was loaded anew before it answered'));
      }
    }

    onMessage(e) {
      if (e.source !== this.frame?.contentWindow || e.origin !== this.origin) return;
      const message = e.data;
      if (!message || message.olomol === undefined) return;
      if (message.event) {
        if (message.event === 'ready') {
          this.isReady = true;
          for (const send of this.queue.splice(0)) send();
        }
        this.dispatchEvent(new CustomEvent(message.event, { detail: message }));
        return;
      }
      const waiting = this.waiting.get(message.id);
      if (!waiting) return;
      this.waiting.delete(message.id);
      if (message.error) waiting.reject(new Error(`olomol: ${message.error}`));
      else waiting.resolve(message.result);
    }

    // a call to olomol in the frame, once it is ready
    call(name, ...args) {
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        const waiting = { resolve, reject, sent: false };
        this.waiting.set(id, waiting);
        const send = () => {
          waiting.sent = true;
          this.frame.contentWindow.postMessage({ olomol: VERSION, id, call: name, args }, this.origin);
        };
        if (this.isReady) send();
        else this.queue.push(send);
      });
    }

    get(what, drawing, options) { return drawing === undefined ? this.call('get', what) : options === undefined ? this.call('get', what, drawing) : this.call('get', what, drawing, options); }
    set(drawing, options = {}) { return this.call('set', drawing, options); }
    setParts(parts) { return this.call('setParts', parts); }
    lock(atomIds) { return this.call('lock', atomIds); }
    pick(options = {}) { return this.call('pick', options); }
    highlight(targets, colour = null) { return this.call('highlight', targets, colour); }
    showMessage(text, options = {}) { return this.call('showMessage', text, options); }
    select(targets) { return this.call('select', targets); }
    readOnly(on = true) { return this.call('readOnly', on); }
    clear() { return this.call('clear'); }
    fit(drawing) { return drawing === undefined ? this.call('fit') : this.call('fit', drawing); }
    get ready() {
      return this.isReady ? Promise.resolve() : new Promise((resolve) => this.addEventListener('ready', () => resolve(), { once: true }));
    }
  }

  customElements.define('olomol-editor', OlomolEditor);
})();
