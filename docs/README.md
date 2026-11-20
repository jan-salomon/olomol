# The documentation and its pictures

## Quick start and manual

The quick start and manual are in `docs/`, in Czech
(`rychly-start.typ`, `manual.typ`) and in English (`en/quick-start.typ`,
`en/manual.typ`), compiled PDFs beside them. The Help window opens them
from the app: the Czech ones in the Czech app, the English ones otherwise
(the build copies the four PDFs to `dist/docs/`, so compile them before
building). Their screenshots come from
the running app: start `npm run dev`, then `node scripts/manual-shots.mjs`
for the Czech ones (with `--built <url>` of a `build:locked` site also the
login window and the Install button) and with `--en` for the English ones
(`docs/en/img/`); the buttons' symbols in the text from
`node scripts/manual-icons.mjs` (the app's own icons, `docs/img/ikony/`);
then `typst compile --root . docs/manual.typ` (and the other three).

## The clips in the README

The clips in the [README](../README.md) (`docs/readme/`) are the about page's videos
(`public/about/*.mp4`) as animated WebP, one and a half times as fast:

```sh
for f in mechanism scheme cleanup turn3d; do
  ffmpeg -i public/about/$f.mp4 -vf "setpts=PTS/1.5,fps=10,scale=960:-1:flags=lanczos" \
    -c:v libwebp_anim -quality 85 -compression_level 6 -loop 0 -an docs/readme/$f.webp
done
```
