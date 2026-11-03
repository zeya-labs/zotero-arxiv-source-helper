# Attribution

The TypeScript files in `src/vendor/texSource` and `src/vendor/latexQuery` are copied from [Asianfleet/mineru-for-zotero](https://github.com/Asianfleet/mineru-for-zotero), under AGPL-3.0-or-later. This distribution is also AGPL-3.0-or-later; see LICENSE. Their original parsing and storage code is reused, while the auto-save workflow, version resolution, reading copy, and standalone runtime are new. Local changes to src/vendor/latexQuery/parser.ts add compilation-root input resolution and retain macro-only heading names instead of empty strings, and expand inputs nested in an abstract argument.

The bundle includes [fflate 0.8.2](https://github.com/101arrowz/fflate), copyright Arjun Barrett, MIT license (included as FFLATE-LICENSE). The esbuild compiler is a build tool only and is not included in the plugin.

Upstream revision used for attribution: [`3694234725e8a8e1d6e43c53f0edff91c19cf2d2`](https://github.com/Asianfleet/mineru-for-zotero/tree/3694234725e8a8e1d6e43c53f0edff91c19cf2d2). The source files were obtained from the main-branch archive on 2026-11-02.

HTML is parsed and serialized with [parse5 7.2.1](https://github.com/inikulin/parse5), MIT (PARSE5-LICENSE), and [entities 4.5.0](https://github.com/fb55/entities), BSD-2-Clause (ENTITIES-LICENSE). These libraries handle engine-generated HTML, not TeX.

The reader embeds [ar5iv-css 0.8.4](https://github.com/dginev/ar5iv-css/tree/0.8.4), copyright 2021 Deyan Ginev, MIT (resources/AR5IV-CSS-LICENSE). resources/ar5iv.css is the unmodified upstream CSS, SHA-256 7496a25ba6750ef6c1488903411fb0f12b1b39ba7cfdf501cc31e7dddb36a577. The separate upstream remote font stylesheet is not loaded; system fonts and native MathML are used.

Conversion is performed by an external, unmodified official [ar5ivist](https://github.com/dginev/ar5ivist) Docker image, which provides [LaTeXML](https://github.com/brucemiller/LaTeXML), ar5iv bindings, TeX packages and image tools. The image is not bundled in the XPI. The default immutable image is latexml/ar5ivist@sha256:9a8d577d6df6cdf088f1764c38bddab54d7c21c857fef68ae46ea3ff9676d70e (tag 2512.17). LaTeXML and ar5iv bindings are MIT-licensed; the image contains additional third-party components under their respective licenses. See upstream repositories and image metadata for their notices.

The prior custom TeX-to-HTML renderer, KaTeX and PDF.js renderer are removed from this branch. The retained TeX query index is used only for source retrieval, not reading-copy generation. Experimental paper-specific LaTeXML bindings used during diagnosis are not included in this implementation.
