      // The login window of a locked site (scripts/lock.mjs): the password
      // makes the key, the key decrypts the app, the app starts.
      const LOCK = LOCK_CONFIG;
      const REMEMBER = 'olomol-unlock'; // the key (not the password), if asked to remember it
      const WORDS = {
        en: ['Enter the password to open the drawing tool.', 'Remember on this computer', 'Open', 'Wrong password.', 'Opening…', 'This page must be opened over https:// to unlock.', 'The drawing tool did not load ({reason}). Reload the page to try again.'],
        cs: ['Zadejte heslo a kreslicí nástroj se otevře.', 'Zapamatovat na tomto počítači', 'Otevřít', 'Špatné heslo.', 'Otevírám…', 'Tuto stránku je třeba otevřít přes https://.', 'Kreslicí nástroj se nenačetl ({reason}). Zkuste stránku načíst znovu.'],
        de: ['Geben Sie das Passwort ein, um das Zeichenprogramm zu öffnen.', 'Auf diesem Computer merken', 'Öffnen', 'Falsches Passwort.', 'Öffne…', 'Diese Seite muss über https:// geöffnet werden.', 'Das Zeichenprogramm wurde nicht geladen ({reason}). Laden Sie die Seite neu.'],
      };
      const picked = (() => {
        try {
          return localStorage.getItem('olomol-language');
        } catch {
          return null;
        }
      })();
      const lang = [picked, ...navigator.languages.map((l) => l.split('-')[0])].find((l) => WORDS[l]) ?? 'en';
      const [hint, remember, open, wrong, opening, insecure, failed] = WORDS[lang];
      const lock = document.getElementById('lock');
      const form = lock.querySelector('form');
      const field = lock.querySelector('input[type=password]');
      const keep = lock.querySelector('input[type=checkbox]');
      const button = document.getElementById('lock-open');
      const bar = lock.querySelector('.bar');
      const error = lock.querySelector('.error');
      document.getElementById('lock-hint').textContent = hint;
      document.getElementById('lock-remember').textContent = remember;
      button.textContent = open;

      // the locked app, downloading while the password is typed; once Open
      // is pressed, the bar shows how far it is
      let loaded = 0;
      const bytes = (async () => {
        const response = await fetch(LOCK.file);
        if (!response.ok) throw new Error(`${response.status}`);
        const parts = [];
        for (const reader = response.body.getReader(); ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          loaded += value.length;
          bar.firstChild.style.width = `${Math.min(100, (100 * loaded) / LOCK.size)}%`;
        }
        bar.hidden = true;
        return new Uint8Array(await new Blob(parts).arrayBuffer());
      })();
      bytes.catch((e) => {
        lock.style.display = '';
        bar.hidden = true;
        error.textContent = failed.replace('{reason}', e.message);
        button.disabled = true;
      });
      const base64 = (a) => btoa(String.fromCharCode(...a));
      const forget = () => {
        try {
          localStorage.removeItem(REMEMBER);
        } catch {
          // nothing kept
        }
      };
      const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

      // decrypt, unpack and start; false if the key is not the right one
      async function start(key) {
        const data = await bytes;
        let packed;
        try {
          packed = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(16, 28) }, key, data.slice(28));
        } catch {
          return false;
        }
        let code = await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        for (const dep of LOCK.deps) code = code.replaceAll(`"./${dep}"`, JSON.stringify(new URL(`assets/${dep}`, document.baseURI).href));
        globalThis.__olomolBase = new URL(LOCK.main, document.baseURI).href;
        lock.remove();
        await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        return true;
      }

      // at once, so that an early Enter doesn't send the form (and reload the page)
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = opening;
        error.textContent = '';
        bar.hidden = loaded >= LOCK.size;
        const salt = (await bytes).slice(0, 16);
        const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(field.value), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: LOCK.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
        if (keep.checked) {
          try {
            localStorage.setItem(REMEMBER, JSON.stringify({ salt: base64(salt), key: base64(new Uint8Array(await crypto.subtle.exportKey('raw', key))) }));
          } catch {
            // not remembered
          }
        }
        if (!(await start(key))) {
          forget();
          error.textContent = wrong;
          button.disabled = false;
          button.textContent = open;
          field.select();
        }
      });

      if (!crypto.subtle) {
        error.textContent = insecure;
        button.disabled = true;
      } else {
        // remembered from before (for this build: the same salt); meanwhile
        // the page shows the app loading, not the login window
        (async () => {
          try {
            const saved = JSON.parse(localStorage.getItem(REMEMBER) ?? 'null');
            if (!saved) return;
            lock.style.display = 'none';
            if (saved.salt === base64((await bytes).slice(0, 16))) {
              const key = await crypto.subtle.importKey('raw', fromBase64(saved.key), 'AES-GCM', false, ['decrypt']);
              if (await start(key)) return;
            }
            forget();
          } catch {
            // nothing remembered
          }
          lock.style.display = '';
        })();
      }
