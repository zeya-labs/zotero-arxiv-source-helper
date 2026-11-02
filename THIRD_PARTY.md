# Attribution

The TypeScript files in `src/vendor/texSource` and `src/vendor/latexQuery` are copied from [Asianfleet/mineru-for-zotero](https://github.com/Asianfleet/mineru-for-zotero), under AGPL-3.0-or-later. This distribution is also AGPL-3.0-or-later; see LICENSE. Their original parsing and storage code is reused, while the auto-save workflow, version resolution, reading copy, and standalone runtime are new. Local changes to src/vendor/latexQuery/parser.ts add compilation-root input resolution and retain macro-only heading names instead of empty strings.

The bundle includes [fflate 0.8.2](https://github.com/101arrowz/fflate), copyright Arjun Barrett, MIT license (included as FFLATE-LICENSE). The esbuild compiler is a build tool only and is not included in the plugin.

Upstream revision used for attribution: [`3694234725e8a8e1d6e43c53f0edff91c19cf2d2`](https://github.com/Asianfleet/mineru-for-zotero/tree/3694234725e8a8e1d6e43c53f0edff91c19cf2d2). The source files were obtained from the main-branch archive on 2026-11-02.
