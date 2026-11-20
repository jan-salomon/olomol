# Third-party licenses

This folder is copied unchanged into the built site, so these notices ship
with every deployment. Every licence file here is the project's own file,
copied verbatim from the installed npm package or from the upstream source
at the version given.

## JavaScript that ships with the site

Found from a build with sourcemaps (every `node_modules` package among the
sources), plus the helpers Vite and Rolldown write into the bundle, which
the sourcemaps don't name.

| Component | Version | License | Files |
|---|---|---|---|
| [React](https://react.dev) (`react`, `react-dom`), Meta Platforms | 19.3.1 | MIT | `react-LICENSE.txt` |
| `scheduler` (part of React), Meta Platforms | 0.28.0 | MIT (the same file as React's, byte for byte) | `react-LICENSE.txt` |
| [OpenChemLib](https://github.com/cheminfo/openchemlib-js) (`openchemlib`), cheminfo: 3D conformers where RDKit has no MMFF94 types, and MMFF94 energies | 9.25.1 | BSD-3-Clause | `openchemlib-LICENSE.txt` |
| The Java [OpenChemLib](https://github.com/cheminfo/openchemlib) it is compiled from (Actelion, Idorsia), commit `54949b8` | 2026.10.0 | BSD-3-Clause | `openchemlib-java-LICENSE.txt` |
| [Vite](https://vite.dev)'s module-preload helper, written into `main-*.js` | 8.3.4 | MIT (the file also lists the licences of Vite's own build-time dependencies, which do not ship) | `vite-LICENSE.md` |
| [Rolldown](https://rolldown.rs)'s runtime helpers (`rolldown-runtime-*.js`), partly derived from Rollup and esbuild | 1.2.15 | MIT | `rolldown-LICENSE.txt`, `rolldown-THIRD-PARTY-LICENSE.txt` |
| The JavaScript glue of the three WebAssembly files below (Emscripten output) | see below | see below | |

## Indigo (`indigo-ketcher` 1.46.0, the "norender" WebAssembly build)

What is compiled in follows from Indigo's build files at the tag
[`indigo-1.46.0`](https://github.com/epam/Indigo/tree/indigo-1.46.0):
`api/wasm/indigo-ketcher/CMakeLists.txt` links the norender build from
indigo, indigo-inchi, indigo-core, inchi, tinyxml2, png and z, and
indigo-core includes RapidJSON, cppcodec and object_threadsafe (header-only).
The rendering libraries (render2d, cairo, pixman, freetype, lunasvg, the
Noto fonts) are only in the other builds and are not here. Indigo's CI built
it with Emscripten 5.0.7 (`emscripten/emsdk:5.0.7`). The versions are those
of the copies Indigo vendors in `third_party/` at that tag; the InChI one is
also printed inside the `.wasm` file ("Software v. 1.06").

| Component | Version | License | Files |
|---|---|---|---|
| [Indigo](https://github.com/epam/Indigo), EPAM Systems | 1.46.0 | Apache-2.0 (no NOTICE file at that tag) | `indigo-LICENSE.txt` |
| [InChI](https://www.inchi-trust.org), IUPAC and InChI Trust | 1.06 | IUPAC/InChI-Trust InChI Licence No. 1.0 | `indigo-inchi-1.06-LICENCE.txt` |
| [libpng](https://github.com/pnggroup/libpng) | 1.6.54 | libpng License (PNG Reference Library License v2) | `indigo-libpng-LICENSE.txt` |
| [zlib](https://zlib.net) | 1.3.1 | zlib License | `indigo-zlib-LICENSE.txt` |
| [TinyXML-2](https://github.com/leethomason/tinyxml2) | 9.0.0 | zlib License | `indigo-tinyxml2-LICENSE.txt` |
| [RapidJSON](https://github.com/Tencent/rapidjson), header-only | 1.1.0 (as its `rapidjson.h` says; Indigo's copy may be a later snapshot) | MIT; the file also covers `msinttypes` (BSD) and `bin/jsonchecker` (JSON License), and `bin/jsonchecker` isn't in Indigo's copy | `indigo-rapidjson-license.txt` |
| [cppcodec](https://github.com/tplgy/cppcodec), header-only | not stated in Indigo's copy | MIT | `indigo-cppcodec-LICENSE.txt` |
| [object_threadsafe](https://github.com/AlexeyAB/object_threadsafe), header-only | not stated in Indigo's copy | Apache-2.0 (no NOTICE file upstream) | `indigo-object_threadsafe-LICENSE.txt` |
| Emscripten runtime: JavaScript glue, libc (musl), libc++, libc++abi, compiler-rt | 5.0.7 | MIT / NCSA (Emscripten); MIT (musl); Apache-2.0 with LLVM exception, or NCSA (LLVM's) | `emscripten-LICENSE.txt`, `emscripten-musl-COPYRIGHT.txt`, `emscripten-libcxx-LICENSE.txt`, `emscripten-libcxxabi-LICENSE.txt`, `emscripten-compiler-rt-LICENSE.txt` |

The source of InChI 1.06 as it is compiled into Indigo's file is at
https://github.com/epam/Indigo/tree/indigo-1.46.0/third_party/inchi, and
Indigo's own source and build files are in the same tag. Under InChI's
licence you may change InChI and rebuild Indigo's WebAssembly file with it;
olomol loads that file as it is (`indigo-ketcher-norender-1.46.0.wasm`), so
a rebuilt one can take its place.

## RDKit (`@rdkit/rdkit` 2026.9.1, the MinimalLib WebAssembly build)

What is compiled in follows from RDKit's build files at the tag
[`Release_2026_09_1`](https://github.com/rdkit/rdkit/tree/Release_2026_09_1):
the npm package is built by `.github/workflows/minimallib-publish.yml`
through `Code/MinimalLib/docker/` (`01_deps.Dockerfile` pins Boost, FreeType
and zlib; `03_build.Dockerfile` sets the options: FreeType, InChI and
CoordGen on, maeparser off). The `.wasm` file itself names InChI 1.07.3, the
Telex and Roboto fonts and Boost's headers.

| Component | Version | License | Files |
|---|---|---|---|
| [RDKit](https://github.com/rdkit/rdkit) / RDKit.js | 2026.09.1 | BSD-3-Clause (no NOTICE file) | `rdkit-LICENSE.txt` |
| RDKit ring-system templates (`Code/GraphMol/Depictor/TemplateSmarts.h`, © 2023 Schrödinger, LLC, part of RDKit), copied into `src/layout/ringTemplateData.js`; the morphinan template in `src/layout/extraTemplates.js` is derived from template #42 | 2026.09.1 | BSD-3-Clause | `rdkit-LICENSE.txt` |
| RDKit's UFF force field (`Code/ForceField/UFF`: the atom parameters of Rappé et al. 1992 as RDKit tabulates them, and its energy terms), ported to JavaScript in `src/layout/uffParams.js` and `src/layout/uff.js`, © 2004-2021 Greg Landrum and other RDKit contributors | 2026.09.1 | BSD-3-Clause | `rdkit-LICENSE.txt` |
| [InChI](https://github.com/IUPAC-InChI/InChI) | 1.07.3 | MIT | `rdkit-inchi-LICENSE.txt` |
| [CoordGen](https://github.com/schrodinger/coordgenlibs), Schrödinger | 3.0.2 | BSD-3-Clause | `rdkit-coordgenlibs-LICENSE.txt` |
| [RingDecomposerLib](https://github.com/rareylab/RingDecomposerLib) | 1.1.3_rdkit | BSD-3-Clause | `rdkit-ringdecomposerlib-LICENSE.txt` |
| [FreeType](https://freetype.org) | 2.13.3 | FreeType License (FTL), chosen of its two licences (FTL or GPLv2); the BDF and PCF drivers under their own MIT-style terms | `rdkit-freetype-LICENSE.txt`, `rdkit-freetype-FTL.txt`, `rdkit-freetype-bdf-README.txt`, `rdkit-freetype-pcf-README.txt` |
| [zlib](https://zlib.net) | 1.3.2 | zlib License | `rdkit-zlib-LICENSE.txt` |
| [Boost](https://www.boost.org), headers (JSON, property_tree, rational and what RDKit includes) | 1.87.0 | BSL-1.0 | `boost-LICENSE_1_0.txt` |
| [Eigen](https://eigen.tuxfamily.org), header-only, source at https://gitlab.com/libeigen/eigen | most likely 3.4.0 (see below) | MPL-2.0 | `eigen-COPYING.MPL2.txt` |
| Telex font (`Telex-Regular.ttf`, built into MolDraw2D), The Telex Project Authors | 1.100 | SIL Open Font License 1.1 | `rdkit-telex-font-license.txt` |
| Roboto font (`Roboto-Regular.ttf`, built into MolDraw2D), Google | 2.137 | Apache-2.0 | `rdkit-roboto-LICENSE.txt` |
| Emscripten runtime (as for Indigo) | not recorded (see below) | MIT / NCSA; MIT (musl); Apache-2.0 with LLVM exception, or NCSA | the `emscripten-*` files |

## megane-rdkit (`megane-rdkit` 0.1.0)

| Component | Version | License | Files |
|---|---|---|---|
| [megane-rdkit](https://github.com/hodakamori/megane-rdkit) (RDKit 2026.03.6 compiled to WebAssembly with Boost headers, zlib, Eigen and the Emscripten runtime): 3D conformers and MMFF94s | 0.1.0 | BSD-3-Clause (wrapper, RDKit); BSL-1.0, zlib, MPL-2.0 (Eigen, source at https://gitlab.com/libeigen/eigen), MIT/NCSA | `megane-rdkit-LICENSE.txt`, `megane-rdkit-THIRD_PARTY.md`, `eigen-COPYING.MPL2.txt` |

## Not certain

- **Eigen in RDKit's file.** RDKit's build image installs Debian bookworm's
  `libeigen3-dev` (3.4.0), and with it RDKit compiles Eigen into
  MolTransforms and the BCUT descriptors. Eigen leaves no version string in
  the `.wasm` file, so its presence and version follow from the build files
  only.
- **Emscripten for RDKit.** The build takes emsdk "latest" on the day it
  ran; the `.wasm` file names only its compiler (Clang 24.0.0git, LLVM
  commit `f718ebe`). The Emscripten licence files here are from 5.0.7, the
  version Indigo used.
- **Roboto 2.137.** The font says version 2.137; its repository
  (googlefonts/roboto-2) has no tag for it. The licence file here is the
  one at v2.138, identical to the one at v2.136.
- **cppcodec and object_threadsafe.** Indigo's copies state no version.
  Their licence files match the upstream ones byte for byte.

Our KET files follow the format of [Ketcher](https://github.com/epam/ketcher)
(EPAM Systems, Apache-2.0); no Ketcher code is part of this site.

FreeType's licence asks for this credit: Portions of this software are
copyright © 2024 The FreeType Project (www.freetype.org). All rights
reserved.
