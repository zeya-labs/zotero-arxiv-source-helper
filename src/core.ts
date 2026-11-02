// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeSourceArchive } from "./vendor/texSource/archive";
import { selectTexMainFile } from "./vendor/texSource/mainFile";
import {
  expandLatexSource,
  parseLatexHeadings,
  extractLatexTables,
} from "./vendor/latexQuery/parser";
import { indexFigures, bytesDataURL, imageMime } from "./figures";
export { indexFigures } from "./figures";
export interface ImagePreview {
  dataURL?: string;
  pages?: number;
  error?: string;
}

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
  return prepareFiles(files, main);
}
export function prepareFiles(
  files: { path: string; bytes: Uint8Array }[],
  main: string,
) {
  const textFiles = files
    .filter((f) => f.path.endsWith(".tex"))
    .map((f) => ({ path: f.path, content: new TextDecoder().decode(f.bytes) }));
  const segments = expandLatexSource(textFiles, main);
  const headings = parseLatexHeadings(segments);
  const tables = extractLatexTables(segments);
  return {
    files,
    mainFile: main,
    segments,
    headings,
    tables,
    ...indexFigures(
      segments,
      files.map((f) => f.path),
    ),
  };
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
  previews: Record<string, ImagePreview> = {},
): string {
  const byPath = new Map(result.files.map((f) => [f.path, f.bytes]));
  function figureImage(path: string) {
    const bytes = byPath.get(path);
    if (!bytes) return "<p>Missing image: " + esc(path) + "</p>";
    const mime = imageMime(path),
      original = bytesDataURL(bytes, mime);
    const preview = mime.startsWith("image/")
      ? original
      : previews[path]?.dataURL;
    return (
      '<div class="figure-image">' +
      (preview
        ? '<img loading="lazy" alt="' + esc(path) + '" src="' + preview + '">'
        : '<p class="notice">Preview unavailable. Download the original figure below.</p>') +
      '<p><a download="' +
      esc(path.split("/").pop()!) +
      '" href="' +
      original +
      '">Download original / 下载原图</a> · ' +
      esc(path) +
      (previews[path]?.pages && previews[path].pages! > 1
        ? " · preview: page 1 of " + previews[path].pages
        : "") +
      "</p></div>"
    );
  }
  const figureHTML = result.figures
    .map(
      (f) =>
        '<figure id="' +
        f.id +
        '"><h3>Source figure / 图源 ' +
        f.number +
        (f.label ? " · " + esc(f.label) : "") +
        "</h3>" +
        f.images
          .map((i) =>
            i.path
              ? figureImage(i.path)
              : '<p class="notice">Missing image: ' + esc(i.requested) + "</p>",
          )
          .join("") +
        "<figcaption>" +
        esc(f.caption) +
        '</figcaption><p class="location">' +
        esc(f.file) +
        ":" +
        f.line +
        (f.references.length
          ? " · cited in " +
            f.references.map((r) => esc(r.file) + ":" + r.line).join(", ")
          : "") +
        "</p><details><summary>Original caption / 原始图注</summary><pre>" +
        esc(f.captionTex) +
        "</pre></details></figure>",
    )
    .join("");
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' +
    esc(title) +
    "</title>" +
    "<style>body{max-width:1100px;margin:40px auto;padding:0 24px;font:17px/1.65 system-ui;color:#222}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 monospace;padding:16px;background:#f6f7f9}h1{font-size:26px}summary{cursor:pointer}a{color:#1769aa}figure{margin:30px 0;padding:22px;border:1px solid #dfe4e8;border-radius:12px}figure img{max-width:100%;height:auto;display:block;margin:auto}.location,.figure-image p{font-size:13px;color:#59636c}.notice{padding:12px;background:#fff5df}nav{padding:12px;background:#f1f6f9}figcaption{margin-top:14px}</style></head><body><h1>" +
    esc(title) +
    "</h1>" +
    "<p>arXiv " +
    esc(arxivID) +
    ' · TeX source viewer / TeX 源码查看版</p><p>Figures are previewed below with their captions and original downloads. Formulas and tables retain TeX source; this is not a typeset paper.</p><nav><a href="#figures">Figures / 图片</a> · <a href="#tables">Tables / 表格</a> · <a href="#source">Source / 正文源码</a></nav>' +
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
    '<h2 id="figures">Figures / 图片与图注</h2>' +
    figureHTML +
    (result.assets.some((a) => !a.figureIds.length)
      ? "<details><summary>Other image assets / 其他图像文件</summary>" +
        result.assets
          .filter((a) => !a.figureIds.length)
          .map((a) => figureImage(a.path))
          .join("") +
        "</details>"
      : "") +
    '<h2 id="tables">Tables / 表格源码</h2>' +
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
    '<h2 id="source">Full source / 展开正文</h2>' +
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
