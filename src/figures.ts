// SPDX-License-Identifier: AGPL-3.0-or-later
import { scanLatexCommands, plainLatexText } from "./vendor/latexQuery/scanner";
import { createLatexDocumentIndex } from "./vendor/latexQuery/documentIndex";
import type { LatexSegment } from "./vendor/latexQuery/parser";

export interface FigureImage {
  requested: string;
  path?: string;
  status: "ok" | "missing";
  file: string;
  line: number;
}
export interface SourceFigure {
  id: string;
  number: number;
  label: string;
  caption: string;
  captionTex: string;
  file: string;
  line: number;
  images: FigureImage[];
  references: { file: string; line: number }[];
}
export const IMAGE_EXTENSIONS = /\.(pdf|png|jpe?g|svg|webp|gif|eps)$/i;
export function imageMime(path: string) {
  return (
    (
      {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        svg: "image/svg+xml",
        webp: "image/webp",
        gif: "image/gif",
        eps: "application/postscript",
      } as Record<string, string>
    )[path.split(".").pop()!.toLowerCase()] || "application/octet-stream"
  );
}
function resolvePath(base: string, child: string): string {
  if (child.startsWith("/") || child.includes("\\") || child.includes(":"))
    return "";
  const parts = base.split("/").slice(0, -1);
  for (const part of child.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return "";
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}
export function indexFigures(segments: LatexSegment[], files: string[]) {
  const document = createLatexDocumentIndex(segments),
    commands = scanLatexCommands(document.text),
    available = new Set(files);
  const directories = commands
    .filter((c) => c.name === "graphicspath")
    .flatMap((c) =>
      [...(c.argument || "").matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]),
    );
  const figures: SourceFigure[] = [],
    environments: string[] = [];
  let active: (SourceFigure & { depth: number }) | undefined;
  for (const command of commands) {
    const arg = command.argument?.trim() || "",
      where = document.locate(command.start);
    if (command.name === "begin") {
      environments.push(arg);
      if (/^figure\*?$/.test(arg) && !active)
        active = {
          id: "figure-" + (figures.length + 1),
          number: figures.length + 1,
          label: "",
          caption: "",
          captionTex: "",
          ...where,
          images: [],
          references: [],
          depth: environments.length,
        };
    } else if (command.name === "end") {
      if (
        active &&
        /^figure\*?$/.test(arg) &&
        environments.length === active.depth
      ) {
        const { depth, ...figure } = active;
        figures.push(figure);
        active = undefined;
      }
      const i = environments.lastIndexOf(arg);
      if (i >= 0) environments.splice(i);
    } else if (
      active &&
      command.name === "caption" &&
      environments.length === active.depth
    ) {
      active.captionTex = arg;
      active.caption = plainLatexText(arg);
    } else if (
      active &&
      command.name === "label" &&
      environments.length === active.depth
    )
      active.label = arg;
    else if (active && command.name === "includegraphics") {
      const candidates = [
        resolvePath("main.tex", arg),
        ...directories.map((dir) =>
          resolvePath("main.tex", dir.replace(/\/?$/, "/") + arg),
        ),
        resolvePath(where.file, arg),
      ];
      const path = candidates
        .flatMap((p) =>
          p
            ? [
                p,
                ...[
                  ".pdf",
                  ".png",
                  ".jpg",
                  ".jpeg",
                  ".svg",
                  ".webp",
                  ".gif",
                  ".eps",
                ].map((ext) => p + ext),
              ]
            : [],
        )
        .find((p) => available.has(p));
      active.images.push({
        requested: arg,
        path,
        status: path ? "ok" : "missing",
        ...where,
      });
    }
  }
  for (const figure of figures)
    if (figure.label)
      for (const command of commands) {
        if (
          /^(?:ref|cref|Cref|autoref|figref|Figref|vref)$/.test(command.name) &&
          (command.argument || "")
            .split(",")
            .map((s) => s.trim())
            .includes(figure.label)
        )
          figure.references.push(document.locate(command.start));
      }
  return {
    figures,
    assets: files
      .filter((p) => IMAGE_EXTENSIONS.test(p))
      .map((path) => ({
        path,
        mime: imageMime(path),
        figureIds: figures
          .filter((f) => f.images.some((i) => i.path === path))
          .map((f) => f.id),
      })),
  };
}
export function bytesDataURL(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return "data:" + mime + ";base64," + btoa(binary);
}
