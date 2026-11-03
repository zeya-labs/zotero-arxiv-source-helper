#!/usr/bin/env node
// Read-only local client. No paper downloads or writes occur here.
import { writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
function option(name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--"))
    throw Error("Missing value for " + name);
  args.splice(i, 2);
  return value;
}
const output = option("--output"),
  previewIndex = args.indexOf("--preview"),
  preview = previewIndex >= 0;
if (preview) args.splice(previewIndex, 1);
const [key, mode = "headings", query = "", port = "23119", libraryID = "1"] =
  args;
if (!key) {
  console.error(
    "Usage: node query.mjs ITEM_KEY [headings|section|search|table|figures|images|image|pages|page|full|status|conversion] [query] [port] [libraryID] [--output FILE] [--preview]",
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
  if (["image", "page"].includes(mode) && response.ok) {
    if (output) {
      const data =
        preview && mode === "image" ? result.preview?.dataURL : result.dataURL;
      if (!data)
        throw Error(
          "Preview unavailable; omit --preview to save the original.",
        );
      await writeFile(output, Buffer.from(data.split(",")[1], "base64"), {
        flag: "wx",
      });
      console.log(
        JSON.stringify({
          path: result.path,
          output,
          mime: preview ? "image/png" : result.mime,
        }),
      );
    } else
      console.log(
        JSON.stringify(
          {
            path: result.path,
            mime: result.mime,
            previewAvailable: !!result.preview?.dataURL,
            message:
              "Pass --output FILE to save the image; add --preview to save its PNG preview.",
          },
          null,
          2,
        ),
      );
  } else console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (e) {
  console.error("Local Zotero query failed:", e.message);
  process.exitCode = 2;
}
