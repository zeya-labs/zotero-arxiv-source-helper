// SPDX-License-Identifier: AGPL-3.0-or-later
// LaTeXML owns all TeX interpretation. This module only runs the engine,
// validates its diagnostics, and packages the resulting HTML and local assets.
import { parse, serialize, defaultTreeAdapter as tree } from "parse5";
import engineCSS from "../resources/ar5iv.css";
import { safeSourcePath } from "./vendor/texSource/storage";
import { bytesDataURL } from "./figures";
export const ENGINE_IMAGE =
  "latexml/ar5ivist@sha256:9a8d577d6df6cdf088f1764c38bddab54d7c21c857fef68ae46ea3ff9676d70e";
export const ENGINE_VERSION = "ar5ivist-2512.17";
export const CONVERTER_VERSION = 5;
export interface ProcessResult {
  exitCode: number;
  stdout: string;
  timedOut?: boolean;
}
export interface ConversionHost {
  join: (...parts: string[]) => string;
  exists: (path: string) => Promise<boolean>;
  read: (path: string) => Promise<Uint8Array>;
  write: (path: string, bytes: Uint8Array) => Promise<unknown>;
  writeUTF8: (path: string, text: string) => Promise<unknown>;
  makeDirectory: (path: string) => Promise<unknown>;
  runDocker: (
    args: string[],
    options: { timeoutMS: number; workdir?: string; containerName?: string },
  ) => Promise<ProcessResult>;
}
export function containerArguments(
  jobDir: string,
  mainFile: string,
  name: string,
  image = ENGINE_IMAGE,
) {
  if (!safeSourcePath(mainFile) || !mainFile.toLowerCase().endsWith(".tex"))
    throw Error("invalid-main-file");
  if (!/^ash-latexml-[a-z0-9-]+$/.test(name))
    throw Error("invalid-container-name");
  return [
    "run",
    "--rm",
    "--pull=never",
    "--name",
    name,
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=256",
    "--memory=4g",
    "--cpus=2",
    "--tmpfs=/tmp:rw,size=2g",
    "-e",
    "HOME=/tmp",
    "-e",
    "TEXMFVAR=/tmp/texmf-var",
    "-v",
    jobDir + ":/work",
    "-w",
    "/work",
    image,
    "--source=" + mainFile,
    "--destination=html/main.html",
    "--timeout=600",
    "--log=engine.log",
  ];
}
export function analyzeDiagnostics(log: string, exitCode: number) {
  const lines = log.split(/\r?\n/),
    errorLines = [...new Set(lines.filter((l) => /^\s*Error:/i.test(l)))],
    fatalLines = [...new Set(lines.filter((l) => /^\s*Fatal:/i.test(l)))],
    warningLines = [...new Set(lines.filter((l) => /^\s*Warning:/i.test(l)))];
  const highest = (pattern: RegExp) =>
    Math.max(0, ...[...log.matchAll(pattern)].map((m) => Number(m[1])));
  const statuses = [...log.matchAll(/^Status:conversion:(\d+)/gm)];
  return {
    errors: Math.max(errorLines.length, highest(/\b(\d+) errors?\b/gi)),
    fatals: Math.max(fatalLines.length, highest(/\b(\d+) fatal errors?\b/gi)),
    warnings: Math.max(warningLines.length, highest(/\b(\d+) warnings?\b/gi)),
    unsupportedBindings: [
      ...new Set(
        lines.filter(
          (l) =>
            /^\s*Warning:missing_file:/i.test(l) &&
            /binding for (?:class|package)/i.test(l),
        ),
      ),
    ],
    statusCode: statuses.length ? Number(statuses.at(-1)![1]) : null,
    exitCode,
    details: [
      ...new Set([...fatalLines, ...errorLines, ...warningLines]),
    ].slice(0, 40),
  };
}
function classNames(node: any): string[] {
  return (node.attrs?.find((a: any) => a.name === "class")?.value || "").split(
    /\s+/,
  );
}
function attr(node: any, name: string) {
  return node.attrs?.find((a: any) => a.name === name);
}
function textContent(node: any): string {
  return node.nodeName === "#text"
    ? node.value
    : (node.childNodes || []).map(textContent).join(" ");
}
function makeElement(
  name: string,
  attributes: Record<string, string> = {},
  text?: string,
) {
  const el = tree.createElement(
    name,
    "http://www.w3.org/1999/xhtml" as any,
    Object.entries(attributes).map(([name, value]) => ({ name, value })),
  );
  if (text) tree.insertText(el, text);
  return el as any;
}
function localPath(from: string, reference: string): string {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(reference))
    throw Error("external-resource");
  const plain = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (
    plain.startsWith("/") ||
    plain.includes("\\") ||
    plain.includes(":") ||
    plain.includes("\0")
  )
    throw Error("unsafe-resource-path");
  const parts = from.split("/").slice(0, -1);
  for (const part of plain.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw Error("resource-outside-job");
      parts.pop();
    } else parts.push(part);
  }
  const path = parts.join("/");
  if (!safeSourcePath(path)) throw Error("unsafe-resource-path");
  return path;
}
function mime(path: string) {
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      svg: "image/svg+xml",
      webp: "image/webp",
      gif: "image/gif",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
    } as Record<string, string>
  )[path.split(".").pop()!.toLowerCase()];
}
export async function packageHTML(
  html: string,
  readAsset: (relative: string) => Promise<Uint8Array>,
  title: string,
) {
  const doc: any = parse(html, { scriptingEnabled: false }),
    missing: string[] = [],
    warnings: string[] = [];
  const htmlNode = doc.childNodes.find((n: any) => n.tagName === "html"),
    head = htmlNode.childNodes.find((n: any) => n.tagName === "head"),
    body = htmlNode.childNodes.find((n: any) => n.tagName === "body");
  const cache = new Map<string, string>();
  async function embed(reference: string, from = "html/main.html") {
    if (
      /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/]+=*$/i.test(
        reference,
      )
    )
      return reference;
    const path = localPath(from, reference),
      type = mime(path);
    if (!type) throw Error("unsupported-resource-type");
    if (!cache.has(path)) {
      const bytes = await readAsset(path);
      if (bytes.length > 50 * 1024 * 1024) throw Error("resource-too-large");
      cache.set(path, bytesDataURL(bytes, type));
    }
    return cache.get(path)!;
  }
  async function css(text: string, from: string) {
    if (/@import\b/i.test(text)) throw Error("css-import-not-supported");
    const matches = [...text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];
    let result = "",
      cursor = 0;
    for (const match of matches) {
      result += text.slice(cursor, match.index);
      const ref = match[2];
      if (ref.startsWith("#") || /^data:(?:image\/|font\/)/i.test(ref))
        result += match[0];
      else result += 'url("' + (await embed(ref, from)) + '")';
      cursor = match.index! + match[0].length;
    }
    return result + text.slice(cursor);
  }
  async function visit(parent: any) {
    for (const node of [...(parent.childNodes || [])]) {
      if (!node.tagName) continue;
      const tag = node.tagName.toLowerCase();
      if (
        [
          "script",
          "iframe",
          "object",
          "embed",
          "base",
          "form",
          "input",
          "button",
          "textarea",
          "select",
        ].includes(tag)
      ) {
        tree.detachNode(node);
        continue;
      }
      if (tag === "meta" && attr(node, "http-equiv")) {
        tree.detachNode(node);
        continue;
      }
      node.attrs = (node.attrs || []).filter(
        (a: any) =>
          !/^on/i.test(a.name) &&
          !["srcdoc", "srcset", "ping", "integrity"].includes(a.name),
      );
      if (tag === "link") {
        const href = attr(node, "href")?.value || "";
        if ((attr(node, "rel")?.value || "").toLowerCase() === "stylesheet") {
          if (
            /^https:\/\/cdn\.jsdelivr\.net\/gh\/dginev\/ar5iv-css@0\.8\.4\/css\/ar5iv(?:-fonts)?\.min\.css$/.test(
              href,
            )
          ) {
            /* bundled ar5iv CSS + system fonts */
          } else
            try {
              const path = localPath("html/main.html", href),
                style = makeElement(
                  "style",
                  {},
                  await css(
                    new TextDecoder().decode(await readAsset(path)),
                    path,
                  ),
                );
              tree.insertBefore(parent, style, node);
            } catch (e) {
              missing.push(href + " · " + String(e));
            }
        }
        tree.detachNode(node);
        continue;
      }
      if (tag === "style") {
        try {
          const value = await css(textContent(node), "html/main.html");
          node.childNodes = [];
          tree.insertText(node, value);
        } catch (e) {
          missing.push("inline-css · " + String(e));
          tree.detachNode(node);
          continue;
        }
      }
      const style = attr(node, "style");
      if (style)
        try {
          style.value = await css(style.value, "html/main.html");
        } catch (e) {
          missing.push("style-resource · " + String(e));
          node.attrs = node.attrs.filter((a: any) => a !== style);
        }
      if (tag === "img" || tag === "image") {
        const source = attr(node, "src") || attr(node, "href");
        if (!source?.value) missing.push("image-without-source");
        else
          try {
            source.value = await embed(source.value);
          } catch (e) {
            missing.push(source.value + " · " + String(e));
          }
      }
      for (const a of [...node.attrs]) {
        if (a.name === "src" && tag !== "img") {
          node.attrs = node.attrs.filter((x: any) => x !== a);
          continue;
        }
        if (a.name === "href" && tag !== "image") {
          const value = a.value;
          if (value.startsWith("#") || /^https?:\/\/|^mailto:/i.test(value))
            continue;
          if (/^(?:\.\/)?main\.html#/.test(value)) {
            a.value = value.slice(value.indexOf("#"));
            continue;
          }
          node.attrs = node.attrs.filter((x: any) => x !== a);
          warnings.push("removed-local-or-unsafe-link");
        }
      }
      await visit(node);
    }
  }
  await visit(htmlNode);
  for (const node of [...head.childNodes])
    if (node.tagName === "title") tree.detachNode(node);
  tree.appendChild(head, makeElement("meta", { charset: "utf-8" }));
  tree.appendChild(
    head,
    makeElement("meta", {
      "http-equiv": "Content-Security-Policy",
      content:
        "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'",
    }),
  );
  tree.appendChild(
    head,
    makeElement("meta", {
      name: "viewport",
      content: "width=device-width,initial-scale=1",
    }),
  );
  tree.appendChild(head, makeElement("title", {}, title));
  tree.appendChild(
    head,
    makeElement(
      "style",
      {},
      engineCSS +
        '\nimg{max-width:100%;height:auto}.ltx_tabular{max-width:100%}table{border-collapse:collapse}.ltx_page_content{overflow-wrap:anywhere}math{font-family:"Cambria Math","STIX Two Math",math}.ltx_equation,.ltx_table{overflow-x:auto}',
    ),
  );
  const stats = {
    figures: 0,
    tables: 0,
    images: 0,
    math: 0,
    errorNodes: 0,
    unresolvedReferences: 0,
    textCharacters: textContent(body).replace(/\s+/g, " ").trim().length,
  };
  function count(node: any) {
    const classes = classNames(node);
    if (classes.includes("ltx_figure")) stats.figures++;
    if (classes.includes("ltx_table")) stats.tables++;
    if (node.tagName === "img") stats.images++;
    if (node.tagName === "math") stats.math++;
    if (classes.includes("ltx_ERROR")) stats.errorNodes++;
    if (classes.includes("ltx_missing")) stats.unresolvedReferences++;
    for (const child of node.childNodes || []) count(child);
  }
  count(body);
  return {
    html: serialize(doc),
    stats,
    missingAssets: missing,
    warnings: [...new Set(warnings)],
  };
}
export async function convertWithLatexml(options: {
  files: { path: string; bytes: Uint8Array }[];
  mainFile: string;
  jobDir: string;
  title: string;
  arxivID: string;
  image?: string;
  host: ConversionHost;
}) {
  const { host, jobDir, mainFile } = options,
    started = Date.now();
  if (
    options.files.some((f) => f.path === "html" || f.path.startsWith("html/"))
  )
    throw Error("reserved-output-path");
  if (
    !options.files.some((f) => f.path === mainFile) ||
    !safeSourcePath(mainFile)
  )
    throw Error("invalid-main-file");
  if (await host.exists(host.join(jobDir, "html", "main.html")))
    throw Error("conversion-job-must-be-fresh");
  await host.makeDirectory(jobDir);
  for (const file of options.files) {
    if (!safeSourcePath(file.path)) throw Error("unsafe-source-path");
    const parts = file.path.split("/");
    await host.makeDirectory(host.join(jobDir, ...parts.slice(0, -1)));
    await host.write(host.join(jobDir, ...parts), file.bytes);
  }
  const name =
    "ash-latexml-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 9);
  let process: ProcessResult;
  try {
    process = await host.runDocker(
      containerArguments(jobDir, mainFile, name, options.image || ENGINE_IMAGE),
      { workdir: jobDir, timeoutMS: 660000, containerName: name },
    );
  } catch (error) {
    process = { exitCode: -1, stdout: String(error) };
  }
  let fullLog = process.stdout;
  const engineLog = host.join(jobDir, "engine.log");
  if (await host.exists(engineLog))
    fullLog += "\n" + new TextDecoder().decode(await host.read(engineLog));
  const log = fullLog.replace(
    /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/g,
    "$1[redacted]@",
  );
  await host.writeUTF8(host.join(jobDir, "console.log"), log);
  let diagnostics = analyzeDiagnostics(log, process.exitCode),
    packaged: Awaited<ReturnType<typeof packageHTML>> | undefined,
    packagingError: string | undefined;
  const output = host.join(jobDir, "html", "main.html");
  if (await host.exists(output))
    try {
      packaged = await packageHTML(
        new TextDecoder().decode(await host.read(output)),
        (path) => host.read(host.join(jobDir, ...path.split("/"))),
        options.title,
      );
    } catch (error) {
      packagingError = String(error);
    }
  const failed =
    process.exitCode !== 0 ||
    process.timedOut ||
    diagnostics.errors > 0 ||
    diagnostics.fatals > 0 ||
    diagnostics.unsupportedBindings.length > 0 ||
    diagnostics.statusCode === null ||
    diagnostics.statusCode >= 2 ||
    !packaged ||
    !!packagingError ||
    packaged.missingAssets.length > 0 ||
    packaged.stats.errorNodes > 0 ||
    packaged.stats.unresolvedReferences > 0 ||
    packaged.stats.textCharacters < 40;
  const failureReason = !failed
    ? undefined
    : process.timedOut
      ? "engine-timeout"
      : process.exitCode !== 0
        ? "engine-exit-" + process.exitCode
        : diagnostics.errors || diagnostics.fatals
          ? "engine-errors"
          : diagnostics.unsupportedBindings.length
            ? "unsupported-binding"
            : diagnostics.statusCode === null
              ? "missing-completion-status"
              : !packaged
                ? "missing-html"
                : packaged.missingAssets.length
                  ? "missing-assets"
                  : "incomplete-output";
  const report = {
    engine:
      !options.image || options.image === ENGINE_IMAGE
        ? ENGINE_VERSION
        : "ar5ivist-custom-pinned",
    image: options.image || ENGINE_IMAGE,
    converterVersion: CONVERTER_VERSION,
    arxivID: options.arxivID,
    mainFile,
    status: failed
      ? "failed"
      : diagnostics.warnings
        ? "ready_with_warnings"
        : "ready",
    elapsedMs: Date.now() - started,
    timedOut: !!process.timedOut,
    failureReason,
    diagnostics,
    stats: packaged?.stats,
    missingAssets: packaged?.missingAssets || [],
    packagingError,
    logFile: "console.log",
    warnings: packaged?.warnings || [],
  };
  await host.writeUTF8(
    host.join(jobDir, "report.json"),
    JSON.stringify(report, null, 2),
  );
  if (failed) {
    const error = new Error(
      "latexml-conversion-failed: " +
        failureReason +
        (diagnostics.details[0] ? " · " + diagnostics.details[0] : ""),
    );
    Object.assign(error, {
      report,
      reportPath: host.join(jobDir, "report.json"),
    });
    throw error;
  }
  const htmlPath = host.join(jobDir, "reading.html");
  await host.writeUTF8(htmlPath, packaged!.html);
  return { html: packaged!.html, htmlPath, report };
}
