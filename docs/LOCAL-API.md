# Local query API

The plugin registers one read-only route on Zotero's existing local HTTP server:

```text
GET http://127.0.0.1:23119/arxiv-source-helper/read
```

Use `query.mjs` for ordinary access. Zotero may drop requests that look like browser requests, so pasting the URL into a browser is not a reliable test.

| Parameter   | Meaning                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `libraryID` | Zotero library ID; defaults to the personal library                                                                              |
| `key`       | Eight-character parent item key                                                                                                  |
| `mode`      | `headings` (default), `section`, `search`, `table`, `figures`, `images`, `image`, `pages`, `page`, `full`, `status`              |
| `section`   | Exact full heading path separated by `/`, or a unique leaf heading title                                                         |
| `q`         | Keyword for `search`, caption/label/content substring for `table`, filter for `figures`, or exact relative file path for `image` |

`mode=status` without a key returns the plugin version, automatic-download setting, and current session task statuses. All other queries require an existing item and source cache. A query never downloads or mutates a paper.

Responses are JSON. Headings and keyword matches carry original file locations; table queries return raw LaTeX with file and line ranges. An ambiguous section returns candidates rather than silently choosing one. Treat unparsed commands, comments, and source macros as source material, not rendered publication text.

The endpoint has no separate token layer; it relies on Zotero's local server and browser-request restrictions. Do not forward or expose the local port to a network. Keep application security settings unchanged.

The source cache lives under Zotero's data directory. External clients should query it through this route rather than edit plugin-owned cache files. Ordinary attachment synchronization does not synchronize the expanded query cache.

## Figures and images

`mode=figures` returns figure labels, captions (plain and original TeX), referenced image paths, and source locations. `number` is source order, not the final publication figure number. `mode=images` lists the available assets and associated figure IDs.

`mode=image&q=figures/example.pdf` returns its MIME type and original bytes as a data URL, plus a legacy PNG preview when one was previously cached. The CLI suppresses base64 output: use `--output FILE` to save the original, or add `--preview` to save its PNG preview. Existing output files are never overwritten. PDF previews show the first page; originals retain all pages.

## Full paper pages

`mode=pages` returns the generated paper-page manifest. `mode=page&q=5` returns page 5 as a PNG data URL. The CLI can save it with `node query.mjs ABCD1234 page 5 --output page-5.png`. These are complete original PDF pages, so figures and tables stay in their original text context. New reading copies no longer generate isolated figure previews; use page exports for PNG viewing, or `image` for the original source asset.
