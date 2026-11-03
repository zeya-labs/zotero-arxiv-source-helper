// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  resolveArxiv,
  prepareSource,
  indexFigures,
  SourceQueue,
  validateSourcePaths,
} from "./core";
import { expandLatexSource } from "./vendor/latexQuery/parser";
import { bytesDataURL } from "./figures";
import manifest from "../manifest.json";
import {
  convertWithLatexml,
  ENGINE_IMAGE,
  CONVERTER_VERSION,
} from "./conversion";
import { showNotice, removeNotice } from "./notice";
import { createTexSourceStorage } from "./vendor/texSource/storage";
import { createLatexQueryService } from "./vendor/latexQuery/service";

declare const Zotero: any, IOUtils: any, PathUtils: any;
declare function runDocker(args: string[], options?: any): Promise<any>;
const READER_VERSION = CONVERTER_VERSION;
const PREFIX = "extensions.arxivSourceHelper.";
const ENDPOINT = "/arxiv-source-helper/read";
const states = new Map<number, { status: string; message?: string }>();
let store: ReturnType<typeof createTexSourceStorage>;
let observer: any,
  timer: any,
  queue: SourceQueue,
  alive = false,
  lastRequest = 0;
const newItems = new Set<number>();
const windows = new Set<any>();
const seen = new Map<number, string>();
const manualWindows = new Map<number, any>();
const pref = (name: string) => Zotero.Prefs.get(PREFIX + name, true);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorCode = (e: any) => e?.message || String(e);

async function download(url: string): Promise<Uint8Array> {
  await delay(Math.max(0, 3200 - (Date.now() - lastRequest)));
  lastRequest = Date.now();
  const response = await Zotero.HTTP.request("GET", url, {
    responseType: "arraybuffer",
    timeout: 60000,
  });
  if (!alive) throw new Error("plugin-stopped");
  return new Uint8Array(response.response);
}

async function getVersion(item: any): Promise<string> {
  const fields = ["extra", "url", "DOI"].map((k) => item.getField(k) || "");
  for (const id of item.getAttachments()) {
    const attachment = Zotero.Items.get(id);
    if (attachment?.attachmentContentType === "application/pdf")
      fields.push(attachment.getField("url") || "");
  }
  let id = resolveArxiv(fields);
  if (/v\d+$/.test(id)) return id;
  const html = new TextDecoder().decode(
    await download("https://arxiv.org/abs/" + id),
  );
  const versions = [
    ...html.matchAll(/arXiv:\s*([a-z-]+\/\d{7}v\d+|\d{4}\.\d{4,5}v\d+)/gi),
  ].map((m) => m[1]);
  const matched = versions.find((value) => value.replace(/v\d+$/, "") === id);
  if (!matched) throw new Error("version-not-resolved");
  return matched;
}

async function addAttachment(
  item: any,
  path: string,
  title: string,
  type: string,
  update = false,
  aliases: string[] = [],
) {
  if (!alive) return;
  for (const id of item.getAttachments()) {
    const child = Zotero.Items.get(id);
    if (child && [title, ...aliases].includes(child.getField("title"))) {
      const existingPath = await child.getFilePathAsync();
      if (existingPath && (await IOUtils.exists(existingPath))) {
        if (update || child.getField("title") !== title) {
          await child.relinkAttachmentFile(path);
          child.setField("title", title);
          child.attachmentSyncState = "to_upload";
          await child.saveTx();
        }
        return;
      }
    }
  }
  await Zotero.Attachments.importFromFile({
    file: Zotero.File.pathToFile(path),
    libraryID: item.libraryID,
    parentItemID: item.id,
    title,
    contentType: type,
  });
}
async function fetchItem(itemID: number) {
  if (!alive) return;
  const item = await Zotero.Items.getAsync(itemID);
  if (
    !item?.isRegularItem() ||
    item.deleted ||
    !Zotero.Libraries.get(item.libraryID).filesEditable
  )
    return;
  const id = await getVersion(item);
  if (seen.get(itemID) === id) return;
  states.set(itemID, { status: "downloading" });
  const ref = { libraryID: item.libraryID, key: item.key };
  let ready: any;
  try {
    const m = await store.readReadyManifest(ref);
    const cachedDir = store.getDir(item.libraryID, item.key);
    if (
      m.arxivID === id &&
      (await IOUtils.exists(
        PathUtils.join(cachedDir, "_ash-original-source.bin"),
      ))
    )
      ready = m;
  } catch {
    /* download missing or interrupted source */
  }
  if (!ready) {
    const bytes = await download("https://arxiv.org/src/" + id);
    const result = await prepareSource(bytes);
    if (!alive) return;
    const manifest = {
      libraryID: item.libraryID,
      itemKey: item.key,
      arxivID: id,
      resolvedVersion: id.match(/v\d+$/)![0],
      downloadedAt: new Date().toISOString(),
      mainFile: result.mainFile,
      files: result.files.map((f) => f.path),
      fileCount: result.files.length,
      status: "ready" as const,
      resultVersion: 1 as const,
    };
    await store.write({ ...ref, files: result.files, manifest });
    if (!alive) return;
    const dir = store.getDir(item.libraryID, item.key);
    await IOUtils.write(PathUtils.join(dir, "_ash-original-source.bin"), bytes);
    ready = manifest;
  }
  validateSourcePaths(ready.files);
  const dir = store.getDir(item.libraryID, item.key);
  if (await IOUtils.exists(PathUtils.join(dir, "_ash-original-source.bin"))) {
    const bytes = await IOUtils.read(
      PathUtils.join(dir, "_ash-original-source.bin"),
    );
    const file = PathUtils.join(
      dir,
      bytes[0] === 31 && bytes[1] === 139
        ? "arxiv-source.gz"
        : "arxiv-source.bin",
    );
    await IOUtils.write(file, bytes);
    await addAttachment(
      item,
      file,
      "arXiv 原始源码 · " + id,
      "application/octet-stream",
    );
  }
  let readerVersion = 0,
    previousReport: any;
  try {
    readerVersion = JSON.parse(
      await IOUtils.readUTF8(PathUtils.join(dir, "_ash-reader-version.json")),
    ).version;
  } catch {}
  try {
    previousReport = JSON.parse(
      await IOUtils.readUTF8(
        PathUtils.join(dir, "_ash-conversion-report.json"),
      ),
    );
  } catch {}
  let rebuilt = false;
  if (
    readerVersion !== READER_VERSION ||
    previousReport?.arxivID !== id ||
    previousReport?.image !== ENGINE_IMAGE ||
    !["ready", "ready_with_warnings"].includes(previousReport?.status) ||
    !(await IOUtils.exists(PathUtils.join(dir, "_ash-reading.html")))
  ) {
    states.set(itemID, {
      status: "converting",
      message: "LaTeXML 正在转换正文和图表",
    });
    const files = [];
    for (const path of ready.files)
      files.push({
        path,
        bytes: await IOUtils.read(PathUtils.join(dir, ...path.split("/"))),
      });
    const jobDir = PathUtils.join(
      dir,
      "_ash-latexml-jobs",
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    );
    const host = {
      join: PathUtils.join,
      exists: IOUtils.exists,
      read: IOUtils.read,
      write: IOUtils.write,
      writeUTF8: IOUtils.writeUTF8,
      makeDirectory: (path: string) =>
        IOUtils.makeDirectory(path, {
          createAncestors: true,
          ignoreExisting: true,
        }),
      runDocker,
    };
    try {
      const conversion = await convertWithLatexml({
        files,
        mainFile: ready.mainFile,
        jobDir,
        title: item.getDisplayTitle(),
        arxivID: id,
        host,
      });
      if (!alive) return;
      const nextReader = PathUtils.join(dir, "_ash-reading-next.html");
      await IOUtils.writeUTF8(nextReader, conversion.html);
      await IOUtils.move(nextReader, PathUtils.join(dir, "_ash-reading.html"));
      await IOUtils.writeUTF8(
        PathUtils.join(dir, "_ash-conversion-report.json"),
        JSON.stringify({ ...conversion.report, jobDirectory: jobDir }),
      );
      await IOUtils.writeUTF8(
        PathUtils.join(dir, "_ash-reader-version.json"),
        JSON.stringify({ version: READER_VERSION }),
      );
      rebuilt = true;
    } catch (error: any) {
      if (error.report)
        await IOUtils.writeUTF8(
          PathUtils.join(dir, "_ash-conversion-report.json"),
          JSON.stringify({ ...error.report, jobDirectory: jobDir }),
        );
      throw error;
    }
  }
  // Cache and attachments are separate: a partial attachment import can be retried without another download.
  if (await IOUtils.exists(PathUtils.join(dir, "_ash-reading.html")))
    await addAttachment(
      item,
      PathUtils.join(dir, "_ash-reading.html"),
      "arXiv TeX 阅读版 · " + id,
      "text/html",
      rebuilt,
      ["arXiv PDF 逐页阅读版 · " + id, "arXiv TeX 源码查看版 · " + id],
    );
  seen.set(itemID, id);
  await IOUtils.writeUTF8(
    PathUtils.join(dir, "_ash-reader-version.json"),
    JSON.stringify({ version: READER_VERSION }),
  );
  states.set(itemID, { status: "ready" });
}

function enqueue(ids: number[]) {
  for (const id of ids) queue.add(id);
  clearTimeout(timer);
  timer = setTimeout(() => queue.drain(), 2500);
}

function notify(event: string, type: string, ids: number[]) {
  if (
    !alive ||
    type !== "item" ||
    !["add", "modify"].includes(event) ||
    pref("autoFetch") === false
  )
    return;
  const parents: number[] = [];
  for (const id of ids) {
    const item = Zotero.Items.get(id);
    if (!item) continue;
    const parent = item.isRegularItem()
      ? item
      : item.parentID
        ? Zotero.Items.get(item.parentID)
        : null;
    if (!parent) continue;
    if (event === "add" && item.isRegularItem()) newItems.add(parent.id);
    if (!newItems.has(parent.id)) continue;
    try {
      resolveArxiv(
        ["extra", "url", "DOI"].map((k) => parent.getField(k) || ""),
      );
      parents.push(parent.id);
    } catch {
      /* unrelated item */
    }
  }
  if (parents.length) enqueue(parents);
}

async function fetchSelected(win: any) {
  const selection = win.ZoteroPane.getSelectedItems();
  const ids = [
    ...new Set<number>(
      selection
        .map((item: any) => (item.isRegularItem() ? item.id : item.parentID))
        .filter(Boolean),
    ),
  ];
  for (const id of ids) {
    seen.delete(id);
    manualWindows.set(id, win);
  }
  enqueue(ids);
  showNotice(win, "已加入阅读版生成队列");
}

function addWindow(win: any) {
  if (windows.has(win)) return;
  const popup = win.document.getElementById("menu_ToolsPopup");
  if (!popup) return;
  const menu = win.document.createXULElement("menu");
  menu.id = "ash-menu";
  menu.setAttribute("label", "arXiv Source Helper");
  const children = win.document.createXULElement("menupopup");
  for (const [label, action] of [
    ["下载源码并生成阅读版", () => fetchSelected(win)],
    [
      "准备 LaTeXML 转换环境（下载镜像）",
      async () => {
        showNotice(win, "正在准备 LaTeXML 环境，首次下载需要一些时间");
        try {
          const result = await runDocker(["pull", ENGINE_IMAGE], {
            timeoutMS: 1800000,
          });
          if (result.exitCode !== 0) throw Error(result.stdout);
          showNotice(win, "LaTeXML 转换环境已就绪");
        } catch (error) {
          win.alert("无法准备转换环境：" + errorCode(error));
        }
      },
    ],
    [
      "查看选中文献转换报告",
      async () => {
        const selected = win.ZoteroPane.getSelectedItems()[0];
        const item = selected?.isRegularItem()
          ? selected
          : Zotero.Items.get(selected?.parentID);
        if (!item) {
          win.alert("请先选中文献");
          return;
        }
        try {
          const report = JSON.parse(
            await IOUtils.readUTF8(
              PathUtils.join(
                store.getDir(item.libraryID, item.key),
                "_ash-conversion-report.json",
              ),
            ),
          );
          win.alert(
            "LaTeXML：" +
              report.status +
              "\n退出码：" +
              report.diagnostics.exitCode +
              "；原因：" +
              (report.failureReason || "—") +
              "\n错误：" +
              report.diagnostics.errors +
              "；致命错误：" +
              report.diagnostics.fatals +
              "；警告：" +
              report.diagnostics.warnings +
              "\n" +
              (report.diagnostics.details[0] || "") +
              "\n日志目录：" +
              report.jobDirectory,
          );
        } catch {
          win.alert("这篇文献尚无 LaTeXML 转换报告");
        }
      },
    ],
    [
      "自动补充新文献源码：开 / 关",
      () => {
        const next = pref("autoFetch") === false;
        Zotero.Prefs.set(PREFIX + "autoFetch", next, true);
        win.alert("自动补充源码：" + (next ? "已开启" : "已关闭"));
      },
    ],
    [
      "查看下载状态",
      () =>
        win.alert(
          [...states]
            .map(
              ([id, s]) =>
                (Zotero.Items.get(id)?.getDisplayTitle() || id) +
                "\n" +
                s.status +
                (s.message ? " · " + s.message : ""),
            )
            .join("\n\n") || "暂无任务",
        ),
    ],
  ] as const) {
    const item = win.document.createXULElement("menuitem");
    item.setAttribute("label", label);
    item.addEventListener("command", action);
    children.append(item);
  }
  menu.append(children);
  popup.append(menu);
  windows.add(win);
}
function removeWindow(win: any) {
  removeNotice(win);
  win.document.getElementById("ash-menu")?.remove();
  windows.delete(win);
}

function registerEndpoint() {
  const service = createLatexQueryService({
    store,
    getItem: (libraryID, key) =>
      Zotero.Items.getByLibraryAndKeyAsync(libraryID, key),
  });
  Zotero.Server.Endpoints[ENDPOINT] = class {
    supportedMethods = ["GET"];
    supportedDataTypes = ["application/json"];
    permitBookmarklet = false;
    async init(options: any) {
      try {
        const q = options.searchParams
          ? Object.fromEntries(options.searchParams.entries())
          : options.query;
        const libraryID = Number(q.libraryID || Zotero.Libraries.userLibraryID);
        if (q.mode === "status" && !q.key)
          return [
            200,
            "application/json",
            JSON.stringify({
              version: manifest.version,
              autoFetch: pref("autoFetch") !== false,
              states: [...states],
            }),
          ];
        if (
          !Number.isInteger(libraryID) ||
          !libraryID ||
          !/^[A-Z0-9]{8}$/.test(q.key || "")
        )
          throw new Error("invalid-request");
        const ref = { libraryID, key: q.key };
        let result;
        if (q.mode === "status")
          result = {
            version: manifest.version,
            autoFetch: pref("autoFetch") !== false,
            states: [...states],
            manifest: await store.readReadyManifest(ref),
          };
        else if (q.mode === "conversion")
          result = JSON.parse(
            await IOUtils.readUTF8(
              PathUtils.join(
                store.getDir(ref.libraryID, ref.key),
                "_ash-conversion-report.json",
              ),
            ),
          );
        else if (q.mode === "pages" || q.mode === "page") {
          const cached = await store.readReadyManifest(ref);
          const info = JSON.parse(
            await IOUtils.readUTF8(
              PathUtils.join(
                store.getDir(ref.libraryID, ref.key),
                "_ash-pages.json",
              ),
            ),
          );
          if (info.arxivID !== cached.arxivID || !Array.isArray(info.pages))
            throw Error("paper-pages-not-found");
          if (q.mode === "pages") result = info;
          else {
            if (!/^[1-9]\d{0,2}$/.test(q.q || ""))
              throw Error("invalid-page-number");
            const number = Number(q.q),
              page = info.pages.find((p: any) => p.number === number);
            if (!page) throw Error("page-not-found");
            const path = "page-" + String(number).padStart(4, "0") + ".png";
            const bytes = await IOUtils.read(
              PathUtils.join(
                store.getDir(ref.libraryID, ref.key),
                "_ash-pages",
                path,
              ),
            );
            result = {
              ...page,
              path,
              mime: "image/png",
              dataURL: bytesDataURL(bytes, "image/png"),
            };
          }
        } else if (q.mode === "table")
          result = await service.table({ ...ref, query: q.q || "" });
        else if (q.mode === "figures" || q.mode === "images") {
          const source = await store.read(ref),
            index = indexFigures(
              expandLatexSource(source.files, source.mainFile),
              source.manifest.files,
            );
          result =
            q.mode === "images"
              ? { assets: index.assets }
              : {
                  figures: index.figures.filter(
                    (f) =>
                      !q.q ||
                      [
                        f.label,
                        f.caption,
                        ...f.images.map((i) => i.path || i.requested),
                      ].some((text) =>
                        text.toLowerCase().includes(q.q.toLowerCase()),
                      ),
                  ),
                };
        } else if (q.mode === "image") {
          const image = await store.readImage(ref, q.q || "");
          let preview;
          try {
            preview = JSON.parse(
              await IOUtils.readUTF8(
                PathUtils.join(
                  store.getDir(ref.libraryID, ref.key),
                  "_ash-figure-previews.json",
                ),
              ),
            )[image.path];
          } catch {
            /* older cache */
          }
          result = {
            path: image.path,
            mime: image.mime,
            dataURL: bytesDataURL(image.bytes, image.mime),
            preview,
          };
        } else
          result = await service.read({
            ...ref,
            granularity: q.mode || "headings",
            query: q.q,
            sectionPath: q.section,
            contextParagraphs: 1,
          });
        return [200, "application/json", JSON.stringify(result)];
      } catch (e: any) {
        return [
          400,
          "application/json",
          JSON.stringify({ error: errorCode(e), candidates: e?.candidates }),
        ];
      }
    }
  };
}

var ArxivSourceHelper = {
  async startup() {
    alive = true;
    store = createTexSourceStorage(
      PathUtils.join(Zotero.DataDirectory.dir, "arxiv-source-helper"),
    );
    queue = new SourceQueue(
      async (id) => {
        await fetchItem(id);
        const win = manualWindows.get(id);
        if (win) showNotice(win, "TeX 阅读版已生成");
        manualWindows.delete(id);
      },
      (id, e) => {
        states.set(id, { status: "error", message: errorCode(e) });
        Zotero.logError(e);
        const win = manualWindows.get(id);
        if (win) showNotice(win, "转换未通过，原阅读版已保留；请查看转换报告");
        manualWindows.delete(id);
      },
    );
    observer = Zotero.Notifier.registerObserver(
      { notify },
      ["item"],
      "arxiv-source-helper",
      90,
    );
    registerEndpoint();
    for (const win of Zotero.getMainWindows()) addWindow(win);
    Zotero.ArxivSourceHelper = {
      fetchSelected,
      enqueue,
      getStatus: () => [...states],
    };
  },
  addWindow,
  removeWindow,
  async shutdown() {
    alive = false;
    clearTimeout(timer);
    queue?.stop();
    if (observer) Zotero.Notifier.unregisterObserver(observer);
    delete Zotero.Server.Endpoints[ENDPOINT];
    for (const win of [...windows]) removeWindow(win);
    delete Zotero.ArxivSourceHelper;
  },
};
export default ArxivSourceHelper;
