// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeSourceArchive } from "./vendor/texSource/archive";
import { selectTexMainFile } from "./vendor/texSource/mainFile";
import {
  expandLatexSource,
  parseLatexHeadings,
  extractLatexTables,
} from "./vendor/latexQuery/parser";
import { indexFigures } from "./figures";
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
export interface PaperPage {
  number: number;
  width: number;
  height: number;
  dataURL: string;
}
/** A faithful page facsimile: figures, tables, equations and text keep PDF positions. */
export function paperHTML(
  title: string,
  arxivID: string,
  pages: PaperPage[],
): string {
  if (!pages.length) throw Error("paper-has-no-pages");
  for (const [index, page] of pages.entries())
    if (
      page.number !== index + 1 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(page.dataURL)
    )
      throw Error("invalid-page-preview");
  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    esc(title) +
    "</title><style>body{margin:0;background:#edf0f3;color:#252c34;font:14px/1.5 system-ui,sans-serif}header{background:white;padding:18px 24px;border-bottom:1px solid #dbe0e5}h1{font-size:20px;margin:0 0 6px}p{margin:6px 0}nav{display:flex;gap:10px;flex-wrap:wrap;max-width:1100px;margin:12px auto;padding:0 12px}a{color:#1769aa}main{max-width:1100px;margin:auto;padding:0 12px 30px}.paper-page{margin:16px 0;scroll-margin-top:16px}.paper-page img{display:block;width:100%;height:auto;background:white;border:1px solid #d8dde3;box-shadow:0 2px 9px #0001;box-sizing:border-box}.paper-page figcaption{text-align:center;color:#65717e;padding:7px}header .hint{font-size:12px;color:#65717e}</style></head><body><header><h1>" +
    esc(title) +
    "</h1><p>PDF 逐页阅读版 · arXiv " +
    esc(arxivID) +
    " · " +
    pages.length +
    ' 页</p><p class="hint">以下为原始 PDF 的逐页 PNG，正文、图片、表格和公式保留在原位。文字检索与复制请使用原 PDF 或 TeX 查询。</p></header><nav aria-label="页码">' +
    pages
      .map((p) => '<a href="#page-' + p.number + '">' + p.number + "</a>")
      .join("") +
    "</nav><main>" +
    pages
      .map(
        (p) =>
          '<figure class="paper-page" id="page-' +
          p.number +
          '"><img loading="' +
          (p.number === 1 ? "eager" : "lazy") +
          '" width="' +
          p.width +
          '" height="' +
          p.height +
          '" alt="第 ' +
          p.number +
          ' 页" src="' +
          p.dataURL +
          '"><figcaption>第 ' +
          p.number +
          " / " +
          pages.length +
          " 页</figcaption></figure>",
      )
      .join("") +
    "</main></body></html>"
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
