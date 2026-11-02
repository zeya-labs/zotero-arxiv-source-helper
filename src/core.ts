// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeSourceArchive } from "./vendor/texSource/archive";
import { selectTexMainFile } from "./vendor/texSource/mainFile";
import {
  expandLatexSource,
  parseLatexHeadings,
  extractLatexTables,
} from "./vendor/latexQuery/parser";

export function resolveArxiv(fields: string[]): string {
  const ids: string[] = [];
  for (const field of fields) {
    const re =
      /(?:arxiv\s*:\s*|(?:export\.)?arxiv\.org\/(?:abs|pdf|src|e-print)\/|10\.48550\/arxiv\.)([a-z-]+\/\d{7}(?:v\d+)?|\d{4}\.\d{4,5}(?:v\d+)?)/gi;
    for (const match of field.matchAll(re)) ids.push(match[1].toLowerCase());
  }
  const bases = new Set(ids.map((id) => id.replace(/v\d+$/, "")));
  if (!bases.size) throw new Error("arxiv-id-not-found");
  if (bases.size > 1) throw new Error("ambiguous-arxiv-id");
  const versions = new Set(ids.filter((id) => /v\d+$/.test(id)));
  if (versions.size > 1) throw new Error("ambiguous-arxiv-version");
  const id = [...versions][0] || ids[0];
  const extraVersions = fields.flatMap((field) =>
    [...field.matchAll(/^version:\s*(\d+)\s*$/gim)].map((m) => m[1]),
  );
  if (new Set(extraVersions).size > 1)
    throw new Error("ambiguous-arxiv-version");
  if (extraVersions.length) {
    if (/v\d+$/.test(id) && !id.endsWith("v" + extraVersions[0]))
      throw new Error("ambiguous-arxiv-version");
    return id.replace(/v\d+$/, "") + "v" + extraVersions[0];
  }
  return id;
}

export async function prepareSource(bytes: Uint8Array, mainFile?: string) {
  const files = await decodeSourceArchive(bytes);
  const main = selectTexMainFile(files, mainFile);
  const textFiles = files
    .filter((f) => f.path.endsWith(".tex"))
    .map((f) => ({ path: f.path, content: new TextDecoder().decode(f.bytes) }));
  const segments = expandLatexSource(textFiles, main);
  const headings = parseLatexHeadings(segments);
  const tables = extractLatexTables(segments);
  return { files, mainFile: main, segments, headings, tables };
}

function esc(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
}

export function sourceHTML(
  title: string,
  arxivID: string,
  result: Awaited<ReturnType<typeof prepareSource>>,
): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' +
    esc(title) +
    "</title>" +
    "<style>body{max-width:1000px;margin:40px auto;padding:0 24px;font:17px/1.65 system-ui;color:#222}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 monospace;padding:16px;background:#f6f7f9}h1{font-size:26px}summary{cursor:pointer}a{color:#1769aa}</style></head><body><h1>" +
    esc(title) +
    "</h1>" +
    "<p>arXiv " +
    esc(arxivID) +
    " · Source reading copy / TeX 源码阅读版</p><p>Formula and table commands are preserved as TeX. This is not a rendered PDF. File names and line numbers locate original evidence.</p>" +
    "<h2>Contents / 章节</h2><ol>" +
    result.headings
      .map(
        (h) =>
          "<li>" +
          esc(h.path.join(" / ")) +
          " — " +
          esc(h.file) +
          ":" +
          h.line +
          "</li>",
      )
      .join("") +
    "</ol>" +
    "<h2>Tables / 表格源码</h2>" +
    result.tables
      .filter((t) => /^table\*?$|longtable/.test(t.environment))
      .map(
        (t) =>
          "<details><summary>" +
          esc(t.caption || t.label || t.environment) +
          " — " +
          esc(t.file) +
          ":" +
          t.lineStart +
          "</summary><pre>" +
          esc(t.content) +
          "</pre></details>",
      )
      .join("") +
    "<h2>Full source / 展开正文</h2>" +
    result.segments
      .map(
        (s) =>
          "<p><strong>" +
          esc(s.file) +
          ":" +
          s.lineStart +
          "</strong></p><pre>" +
          esc(s.text) +
          "</pre>",
      )
      .join("") +
    "</body></html>"
  );
}

/** Debounce notifications, serialize requests, and deduplicate parent/attachment events. */
export class SourceQueue {
  pending = new Set<number>();
  stopped = false;
  running = false;
  constructor(
    private run: (id: number) => Promise<void>,
    private report: (id: number, error: unknown) => void,
  ) {}
  add(id: number) {
    if (!this.stopped) this.pending.add(id);
  }
  async drain() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped && this.pending.size) {
        const id = this.pending.values().next().value!;
        this.pending.delete(id);
        try {
          await this.run(id);
        } catch (e) {
          this.report(id, e);
        }
      }
    } finally {
      this.running = false;
    }
  }
  stop() {
    this.stopped = true;
    this.pending.clear();
  }
}
