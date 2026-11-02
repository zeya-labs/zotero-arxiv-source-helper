# Changelog

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
