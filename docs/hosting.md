# Hosting olomol yourself

olomol is a folder of files (`dist/`, built with `npm run build`; or the
zip of each version on [Zenodo](https://doi.org/10.5281/zenodo.24104909),
which is the same folder). Nothing runs on the server, and drawings never
leave the browser. Any web space that hands out files over **https://**
can host it: a folder on a department web server, GitHub Pages,
Cloudflare, and so on.

## With a password (the simple way)

```sh
npm run build:locked
```

It builds the site and asks for a password (twice; it isn't shown). The
folder `dist/` is then ready: copy **everything in it** to the web space.
Opening the address shows a login window; the right password opens the
drawing tool, and "Remember on this computer" skips the window next time.

- **What the password protects**: the app itself (editor, drawing,
  chemistry) is stored encrypted (AES-256; the key is made from the
  password, slowly on purpose, so guessing takes long). Without the
  password the files are of no use. Not encrypted: the free libraries it
  uses (RDKit, Indigo, OpenChemLib), the styles and translations, the
  PubChem page and the two manuals (PDF); they are public anyway.
- **One password for everyone.** Choose a few words rather than one
  short word: anyone who has the files can try guesses on their own
  computer, so a long password is what keeps it safe.
- **Changing it**: run `npm run build:locked` again with the new one and
  upload again. Everyone is asked again, also those who ticked
  "Remember". A forgotten password: the same, with a new one.
- **https:// only.** Browsers decrypt only on secure pages (and on
  `localhost`); on plain `http://` the window says so. GitHub Pages is
  always https; ask the department for an https address.
- Without a password: `npm run build`, and upload `dist/` the same way.
- To check an uploaded site with the whole browser test:
  `CHECK_PASSWORD='<password>' npm run check -- https://<address>/`

## Offline, and as an app

Every build (`npm run build` and `npm run build:locked`) also writes
`dist/sw.js`, a service worker: the first visit keeps a copy of all the
site's files in the browser (about 6 MB to download, compressed), so the
site then opens at once, works without a network, and can be installed as
an app with its own window and icon:

- **Chrome, Edge** (Windows, macOS, Linux, Android): the Install button at
  the top right of the app, or the one in the address bar.
- **iPhone, iPad**: Safari, Share, Add to Home Screen.
- **Firefox**: can't install web apps (on Linux not at all); the site
  still works offline there.

A new version shows on the next load after uploading it. A locked site
asks for the password offline too (unless remembered). Like the lock,
this needs **https://** (or `localhost`).

## In a container (only if the server's admin wants one)

Not needed for the above. For an admin who runs services as containers:
`Dockerfile` builds the site (`npm ci && npm run build`, with Node as in
`.nvmrc`) and puts it into nginx, which serves it behind a password of the
server (HTTP Basic Auth: the browser asks for a user name and password
once and keeps them until it is closed). The image holds only nginx and
the built files.

```sh
docker build -t olomol .
docker run -d --name olomol --restart unless-stopped -p 8080:80 \
  -e OLOMOL_PASSWORD='choose one' olomol
```

Then open `http://<server>:8080/`, user `olomol`, and the password.

| Setting | |
|---|---|
| `OLOMOL_PASSWORD` | the password (required) |
| `OLOMOL_PASSWORD_FILE` | instead: a file holding it, e.g. a Docker secret (`-v /path/pw.txt:/run/pw:ro -e OLOMOL_PASSWORD_FILE=/run/pw`) |
| `OLOMOL_USER` | the user name (default `olomol`) |
| `OLOMOL_NO_PASSWORD=1` | no password: open to everyone who can reach it |

Without a password (and without `OLOMOL_NO_PASSWORD=1`) the container
stops at once with a message, so it can't go online open by mistake.

- **Use HTTPS.** Basic Auth sends the password with every request, only
  encoded, not encrypted: over plain `http://` anyone on the network path
  can read it. Put the container behind the department's HTTPS reverse
  proxy (or a TLS-terminating load balancer) and expose only that.
- **One shared password** for everyone; to change it, start the container
  again with a new one. It keeps out casual visitors, not a determined
  attacker; it isn't an account system.
- `GET /healthz` answers `ok` without the password, for monitoring; the
  image's `HEALTHCHECK` uses it (Docker; Podman needs `--format docker`
  when building to keep it).
- The files with a hash in their names are cached for a year and sent
  compressed (the WebAssembly too); the pages, the service worker and the
  app manifest are checked again on every visit, so a new version shows
  at once.
- **Updating**: pull the new code, `docker build -t olomol .` again, and
  restart the container. For nginx security fixes, raise the nginx version
  in `Dockerfile` (`nginx:1.30.x-alpine…`, the stable line) and rebuild.
- **Checking** a running container with the whole browser test:
  `CHECK_AUTH='olomol:<password>' npm run check -- http://<server>:8080/`
  (Podman works the same: `podman build`, `podman run`.)

## Rebuilding years from now

The live site never needs rebuilding. If you change something later:

- `npm ci && npm run build` installs exactly what `package-lock.json` lists,
  so the same code builds the same site, provided Node from `.nvmrc` is
  used.
