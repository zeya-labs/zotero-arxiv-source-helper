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
export { sourceHTML, orderedSourceBlocks } from "./reader";
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
