# Validation status

Last checked: 2026-11-02. Current release: **0.1.4 preview**.

## Verified

- Windows x64 build with Python 3.12.15, Node 24.20.0, esbuild 0.25.12 and fflate 0.8.2.
- Package downloads are checked against npm registry SHA-512 integrity metadata.
- Thirteen automated tests pass: ID/version selection and conflicts, source expansion, single-file gzip sources, root-relative table references, unsafe or ambiguous source rejection, serial queue behavior, manifest fields, privileged bootstrap globals, and simulated Zotero integration.
- The integration test runs the bundled production runtime against a mocked Zotero API and a real temporary filesystem. It covers save notifications, source caching, two attachment imports, heading/section/search/table queries, duplicate events, and shutdown cleanup.
- The same integration test was exercised with the real Ask to Evolve archive (`2610.39446v1`): 11,683,775 compressed bytes, 43 files, 31 headings, 7 tables. It locates the interaction section and memory table in their original source files. The paper archive is not redistributed in this repository.
- The mandatory `applications.zotero.update_url` requirement was checked against the installed Zotero 10.0.7 manifest-validation code after 0.1.0 failed installation. The missing field and bootstrap-global issues are fixed, with regression tests and build-time checks.
- Generated HTML escapes source markup. TeX is not executed or compiled.

## Still needs real application testing

- Installation and loading of the current package in Zotero.
- A browser Connector save followed by automatic downloading and real Zotero attachment import/indexing.
- Queries served by Zotero's actual HTTP server.
- Zotero 7/8/9, macOS/Linux, and cross-device use.

The declared compatibility range is not a claim that each listed version has been tested. Mocked integration tests do not replace the real application checks above.

## Figure preview validation

The actual bundled PDF.js renderer was run in a separate headless Edge browser against all 14 PDF figure assets in Ask to Evolve. All 14 rendered. The HTML viewer was opened in that browser and its framework figure, caption, source location, and original-download link were visually inspected. A contact sheet of all generated figures was also inspected. These browser checks do not replace testing in Zotero itself. Synthetic tests cover figure indexing, escaped markup, image export, cache migration, and in-place attachment updates.

## 0.1.4 page and notice checks

The bundled renderer converted the complete 29-page Ask to Evolve PDF into PNG pages and a self-contained 18,102,223-byte HTML file in an isolated headless Edge browser. Pages 1, 5 and 11 were captured from the HTML; the method figure and main results table were visually checked in their original page context. The viewer contains all 29 ordered page images and no separate figure/table galleries.

The new in-document notice was checked at 1000×700 / DPR 1 and 2194×1194 / DPR 1.75. In both cases it remained 20 CSS pixels from the right and bottom viewport edges, retained keyboard focus, merged repeated notices, and closed automatically. This is browser verification of the shared DOM/CSS behavior; Zotero window integration still needs user confirmation.
