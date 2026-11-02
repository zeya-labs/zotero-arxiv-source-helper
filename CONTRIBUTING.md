# Contributing

This is a small preview Zotero plugin. Keep changes focused and describe the observed behavior and how it was verified.

1. Use Python 3.12+ and Node 24+.
2. Run `python build.py` and `npm test`. Build dependencies are downloaded into `.tools/`; tests need no npm packages.
3. For formatting, run `npm install`, then `npm run format:check`. Match the existing two-space TypeScript style.
4. Test application changes in a separate Zotero profile with a separate data directory. Never point test profiles at a production library.
5. Distinguish mocked runtime tests from real Zotero/Connector verification. State what was actually exercised.

`src/vendor/` contains AGPL-3.0-or-later code from MinerU for Zotero. Preserve attribution and document local changes in `THIRD_PARTY.md`.

For a release, update `manifest.json` and `package.json` together, update the changelog, build and test, then upload the exact XPI and its checksum to a GitHub release. Commit the generated `updates.json` for the same binary. Do not replace an existing release asset with a different binary without updating its checksum.

Do not commit credentials, profile data, local paths, PDFs, or downloaded paper source archives. Avoid adding network calls or implicitly downloading content to read-only query endpoints.
