# Attribution

The TypeScript files in `src/vendor/texSource` and `src/vendor/latexQuery` are copied from [Asianfleet/mineru-for-zotero](https://github.com/Asianfleet/mineru-for-zotero), under AGPL-3.0-or-later. This distribution is also AGPL-3.0-or-later; see LICENSE. Their original parsing and storage code is reused, while the auto-save workflow, version resolution, reading copy, and standalone runtime are new. Local changes to src/vendor/latexQuery/parser.ts add compilation-root input resolution and retain macro-only heading names instead of empty strings, and expand inputs nested in an abstract argument.

The bundle includes [fflate 0.8.2](https://github.com/101arrowz/fflate), copyright Arjun Barrett, MIT license (included as FFLATE-LICENSE). The esbuild compiler is a build tool only and is not included in the plugin.

Upstream revision used for attribution: [`3694234725e8a8e1d6e43c53f0edff91c19cf2d2`](https://github.com/Asianfleet/mineru-for-zotero/tree/3694234725e8a8e1d6e43c53f0edff91c19cf2d2). The source files were obtained from the main-branch archive on 2026-11-02.

PDF previews bundle [Mozilla PDF.js / pdfjs-dist 5.4.296](https://github.com/mozilla/pdf.js), under Apache-2.0; see PDFJS-LICENSE. The worker handler is run locally in the plugin scope. No remote renderer is used. Local changes to src/vendor/texSource/storage.ts additionally recognize WebP and GIF MIME types.

The reading copy uses [KaTeX 0.16.22](https://github.com/KaTeX/KaTeX) to render equations locally into static HTML/MathML. KaTeX and the bundled fonts are distributed under its MIT license; see KATEX-LICENSE. Font data is embedded in the generated stylesheet, so viewing a reading copy makes no remote requests.
