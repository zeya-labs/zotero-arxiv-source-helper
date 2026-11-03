# Changelog

## 0.1.6 — 2026-11-02 (preview)

- Fix actual PDF rendering in Zotero's XUL window, whose document has no HTML body. Supply a temporary live HTML host for PDF.js SVG filters and clean it up after success or failure.
- Create HTML helper elements in the correct namespace and bind native document methods to their original document.
- Verify complete 29-page rendering and actual Zotero attachment import for Ask to Evolve, including source reuse, all embedded PNGs, and the framework figure/results table in context.

## 0.1.5 — 2026-11-02 (preview)

- Fix missing Tools menu and local endpoint after upgrading to 0.1.4: PDF.js saw the bootstrap global instead of the supplied native DOM constructors.
- Load runtime scripts into a genuine Gecko sandbox and register menus/source queries before initializing the PDF renderer.
- Keep the runtime available and report a readable error if the renderer fails to load.
- Exercise the actual PDF bundle in bootstrap regression tests, including renderer failure. Verify menu/API/renderer startup in Zotero 10.0.7 without installing over the user's copy.

## 0.1.4 — 2026-11-02 (preview)

- Replace the separated figure/table source view with original PDF pages rendered as PNGs in a self-contained HTML reading copy.
- Preserve original paragraph, figure, table and equation placement; add page-list and page-PNG export queries while retaining TeX retrieval.
- Prefer the matching local PDF attachment and reuse cached source/PDF data when rebuilding existing copies.
- Load the PDF renderer during startup instead of reopening its package lazily during a download.
- Replace the detached native progress window with an in-document notice anchored to the Zotero viewport, avoiding mixed screen/DPI coordinates.

## 0.1.3 — 2026-11-02 (preview)

- Add figure/caption/reference indexing and local image list/export queries.
- Bundle PDF.js to render PDF figure previews, retain original downloads, and show images inside a self-contained HTML source viewer.
- Rename the misleading reading-copy label to TeX source viewer. Equations and tables still retain source syntax.
- Rebuild old cached viewers and update existing attachments in place. Surface preview failures for retry.
- Require Zotero 10 for the new graphics runtime; other application versions remain untested.

## 0.1.2 — 2026-11-02 (preview)

- Establish a standalone source repository with build instructions, tests, contributor guidance, and upstream attribution.
- Connect the update manifest to the public repository and generate checksummed release metadata.
- Keep generated packages, development tools, Zotero profiles, and paper source bundles out of version control.
- Preserve the installation-manifest and privileged-bootstrap fixes introduced in 0.1.1.

## 0.1.1 — 2026-11-02

- Add the mandatory `applications.zotero.update_url` field omitted from the first package.
- Validate required manifest fields before packaging.
- Pass Zotero's privileged globals directly into the runtime.
- Add manifest and bootstrap regression tests.

## 0.1.0 — 2026-11-02

- Download TeX sources for newly added arXiv items and selected existing items.
- Retain the original archive and a source-reading HTML attachment.
- Provide local heading, section, keyword, and table queries.
- Reuse and attribute the source parser from MinerU for Zotero.
