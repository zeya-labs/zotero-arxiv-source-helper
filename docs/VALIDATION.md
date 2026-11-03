> The records below describe historical releases. They are not evidence that the new LaTeXML backend supports Ask to Evolve. For this branch see [LaTeXML validation](LATEXML-VALIDATION.md).

# Validation status

Last checked: 2026-11-02. Current release: **0.1.7 preview**.

## Verified

- Windows x64 build with Python 3.12.15, Node 24.20.0, esbuild 0.25.12 and fflate 0.8.2.
- Package downloads are checked against npm registry SHA-512 integrity metadata.
- Seventeen automated tests pass: ID/version selection and conflicts, source expansion, single-file gzip sources, root-relative table references, unsafe or ambiguous source rejection, serial queue behavior, manifest fields, privileged bootstrap globals, and simulated Zotero integration.
- The integration test runs the bundled production runtime against a mocked Zotero API and a real temporary filesystem. It covers save notifications, source caching, two attachment imports, heading/section/search/table queries, duplicate events, and shutdown cleanup.
- The same integration test was exercised with the real Ask to Evolve archive (`2610.39446v1`): 11,683,775 compressed bytes, 43 files, 31 headings, 7 tables. It locates the interaction section and memory table in their original source files. The paper archive is not redistributed in this repository.
- The mandatory `applications.zotero.update_url` requirement was checked against the installed Zotero 10.0.7 manifest-validation code after 0.1.0 failed installation. The missing field and bootstrap-global issues are fixed, with regression tests and build-time checks.
- Generated HTML escapes source markup. TeX is not executed or compiled.

## Still needs real application testing

- Installation and loading of the current package in Zotero.
- A browser Connector save followed by automatic downloading and real Zotero attachment import/indexing.
- Current-package installation and a fresh Connector-triggered download/indexing flow.
- Zotero 7/8/9, macOS/Linux, and cross-device use.

The declared compatibility range is not a claim that each listed version has been tested. Mocked integration tests do not replace the real application checks above.

## Figure preview validation

The actual bundled PDF.js renderer was run in a separate headless Edge browser against all 14 PDF figure assets in Ask to Evolve. All 14 rendered. The HTML viewer was opened in that browser and its framework figure, caption, source location, and original-download link were visually inspected. A contact sheet of all generated figures was also inspected. These browser checks do not replace testing in Zotero itself. Synthetic tests cover figure indexing, escaped markup, image export, cache migration, and in-place attachment updates.

## 0.1.4 page and notice checks

The bundled renderer converted the complete 29-page Ask to Evolve PDF into PNG pages and a self-contained 18,102,223-byte HTML file in an isolated headless Edge browser. Pages 1, 5 and 11 were captured from the HTML; the method figure and main results table were visually checked in their original page context. The viewer contains all 29 ordered page images and no separate figure/table galleries.

The new in-document notice was checked at 1000×700 / DPR 1 and 2194×1194 / DPR 1.75. In both cases it remained 20 CSS pixels from the right and bottom viewport edges, retained keyboard focus, merged repeated notices, and closed automatically. This is browser verification of the shared DOM/CSS behavior; Zotero window integration still needs user confirmation.

## 0.1.5 startup checks

The installed 0.1.4 was enabled but had no menu or local endpoint. Zotero's own error buffer reported `NativeDOMException is undefined` in `pdf-preview.js` during startup. A plain-object subscript target did not give PDF.js its own globalThis. The real window did expose the DOM constructors.

Loading the actual installed renderer into a genuine privileged Gecko sandbox succeeded in Zotero 10.0.7. The corrected bootstrap and production runtime were then loaded temporarily from a local staging directory in the same application; the check returned `menu: true`, `api: true`, and `renderer: function`. The temporary runtime was shut down after the check, removing its menu, endpoint and observer. No plugin installation or library import was performed by this check.

Regression tests evaluate the real bundled PDF.js script in a separate global, verify that runtime startup happens first, and inject a renderer-load failure to check that startup remains available and rendering reports the error. Installation of the newly packaged 0.1.5 XPI and a complete attachment-generation flow still require verification.

## 0.1.6 real rendering and import

The installed 0.1.5 menu worked, but actual rendering failed with `this[#document].body is null`. PDF.js attempted to append SVG filter definitions to Zotero's XUL main document. The fix provides a temporary HTML filter host in the same live document as the canvases and removes it in a finally block. Native document methods remain bound to their original document; helper HTML elements use the HTML namespace.

The corrected production bootstrap and runtime were run in Zotero 10.0.7 against the user's requested Ask to Evolve item. An isolated observer/endpoint facade avoided replacing the installed plugin's registrations while using the actual library and attachment APIs. The run reused cached sources and PDF, rendered all 29 pages at 1224×1584, wrote a self-contained 23,185,741-byte HTML, and imported both the page-reading copy and original source archive into Zotero. The stored HTML attachment was verified to contain all 29 embedded PNGs; page 5 (framework figure) and page 11 (main results table) were visually inspected. The installed plugin's read-only pages endpoint also returned the complete 29-page manifest. The temporary validation runtime was shut down.

The regression test covers a XUL document with no body, the live filter host, HTML element creation, native method binding and cleanup after success or rendering failure. Installation of the newly packaged XPI and a fresh Connector-triggered download remain separate checks.

## 0.1.7 ordered TeX reading copy

The page-facsimile direction in 0.1.4–0.1.6 did not match the requested reader and is no longer the generation workflow. The current reader expands TeX inputs in source order, renders prose as selectable HTML, places figure PNGs and HTML tables at their corresponding source blocks, and renders math with local KaTeX. Original TeX remains available alongside figures/tables. Unknown commands are visible rather than silently discarded; this is not a complete LaTeX engine.

The production bootstrap/runtime were temporarily loaded in Zotero 10.0.7 using an isolated observer/endpoint facade and actual library/attachment APIs for the requested Ask to Evolve item. The completed run returned `status: ready`, `figures: 14`, `images: 14`, `tables: 7`, `fullPages: 0`, with the TeX reading-copy and source-archive attachments present. The temporary runtime was shut down afterward. No plugin installation was performed.

The standalone browser verification script rerenders the source figure PDFs, opens the generated HTML, asserts exact expanded block order and all images, checks the abstract, table values, equations and absence of separate galleries/full-page images, and rejects remote viewer requests. Framework and main-results screenshots were visually inspected. Tests also cover nested abstract input, common text macros, escaped ampersands, row/column spans, unsafe markup/URLs, source-preview cache reuse, migration from a page-reading attachment, and absence of whole-paper PDF requests.
