#!/usr/bin/env node
// Read-only local client. No paper downloads or writes occur here.
const [key, mode = "headings", query = "", port = "23119", libraryID = "1"] =
  process.argv.slice(2);
if (!key) {
  console.error(
    "Usage: node query.mjs ITEM_KEY [headings|section|search|table|full|status] [query] [port] [libraryID]",
  );
  process.exit(2);
}
const url = new URL(
  `http://127.0.0.1:${Number(port)}/arxiv-source-helper/read`,
);
url.search = new URLSearchParams({
  key,
  mode,
  libraryID,
  ...(mode === "section" ? { section: query } : { q: query }),
}).toString();
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (e) {
  console.error("Local Zotero query failed:", e.message);
  process.exitCode = 2;
}
