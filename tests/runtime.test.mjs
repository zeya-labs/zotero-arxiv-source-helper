import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

function fixture() {
  const files = {
    "main.tex":
      "\\documentclass{article}\n\\begin{document}\n\\input{sections/method}\n\\input{tables/ablation}\n\\end{document}",
    "sections/method.tex":
      "\\section{Active Interaction}\nThe guide has privileged spatial information. See \\ref{fig:overview}.\n\\begin{figure}\\includegraphics{figures/test.pdf}\\caption{System overview}\\label{fig:overview}\\end{figure}\n",
    "figures/test.pdf": "%PDF-test-fixture",
    "tables/ablation.tex":
      "\\begin{table}\\caption{Interaction and Memory}\\label{tab:interaction_memory}\n\\begin{tabular}{lr}Full & 93.3\\\\\\end{tabular}\n\\end{table}",
  };
  const parts = [];
  for (const [name, text] of Object.entries(files)) {
    const bytes = Buffer.from(text),
      header = Buffer.alloc(512);
    header.write(name);
    header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124);
    header[156] = 48;
    header.write("ustar", 257);
    parts.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return new Uint8Array(
    gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)])),
  );
}

test("save notification → versioned source → stored attachments → section and table queries → clean shutdown", async () => {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../build/runtime-test-" + Date.now(),
  );
  await fs.mkdir(root, { recursive: true });
  const realFixture = process.env.ARXIV_SOURCE_FIXTURE;
  const archive = realFixture
    ? new Uint8Array(await fs.readFile(realFixture))
    : fixture();
  const items = new Map(),
    attachments = [],
    requests = [],
    errors = [];
  let observer;
  let relinks = 0;
  const parent = {
    id: 1,
    key: "ABCD1234",
    libraryID: 1,
    deleted: false,
    isRegularItem: () => true,
    getAttachments: () => attachments.map((a) => a.id),
    getDisplayTitle: () => "Ask to Evolve",
    getField: (k) =>
      ({
        extra: "arXiv:2610.39446\nversion: 1",
        url: "https://arxiv.org/abs/2610.39446",
      })[k] || "",
  };
  items.set(1, parent);
  const Zotero = {
    DataDirectory: { dir: root },
    Prefs: { get: () => undefined, set() {} },
    Libraries: { userLibraryID: 1, get: () => ({ filesEditable: true }) },
    Items: {
      get: (id) => items.get(id),
      getAsync: async (id) => items.get(id),
      getByLibraryAndKeyAsync: async (lib, key) =>
        lib === 1 && key === parent.key ? parent : false,
    },
    File: { pathToFile: (p) => p },
    HTTP: {
      request: async (method, url) => {
        requests.push(url);
        return { response: archive.buffer };
      },
    },
    Attachments: {
      importFromFile: async (opts) => {
        assert.equal(opts.parentItemID, 1);
        assert.ok((await fs.stat(opts.file)).size > 0);
        const child = {
          id: attachments.length + 2,
          parentID: 1,
          attachmentContentType: opts.contentType,
          isRegularItem: () => false,
          title: opts.title,
          getField(k) {
            return k === "title" ? this.title : "";
          },
          setField(k, value) {
            if (k === "title") this.title = value;
          },
          saveTx: async () => {},
          relinkAttachmentFile: async (p) => {
            assert.ok((await fs.stat(p)).size > 0);
            relinks++;
          },
          getFilePathAsync: async () => opts.file,
        };
        attachments.push(child);
        items.set(child.id, child);
        observer.notify("add", "item", [child.id]);
        return child;
      },
    },
    Notifier: {
      registerObserver: (o) => ((observer = o), "obs"),
      unregisterObserver: (id) => {
        assert.equal(id, "obs");
        observer = null;
      },
    },
    Server: { Endpoints: {} },
    getMainWindows: () => [],
    ProgressWindow: class {
      changeHeadline() {}
      show() {}
      startCloseTimer() {}
    },
    logError: (e) => errors.push(e.message),
  };
  const IOUtils = {
    exists: async (p) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    },
    makeDirectory: async (p) => fs.mkdir(p, { recursive: true }),
    read: async (p) => new Uint8Array(await fs.readFile(p)),
    readUTF8: (p) => fs.readFile(p, "utf8"),
    write: (p, b) => fs.writeFile(p, b),
    writeUTF8: (p, s) => fs.writeFile(p, s),
    move: (a, b) => fs.rename(a, b),
    remove: async (p, opts) => {
      assert.ok(path.resolve(p).startsWith(root + path.sep));
      await fs.rm(p, {
        recursive: !!opts.recursive,
        force: !!opts.ignoreAbsent,
      });
    },
  };
  const context = vm.createContext({
    Zotero,
    IOUtils,
    PathUtils: { join: path.join, profileDir: root },
    TextDecoder,
    TextEncoder,
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 5)),
    clearTimeout,
    btoa,
    renderPDF: async () => ({
      dataURL: "data:image/png;base64,iVBORw==",
      pages: 1,
    }),
  });
  vm.runInContext(
    await fs.readFile(new URL("../build/runtime.js", import.meta.url), "utf8"),
    context,
  );
  await context.ArxivSourceHelperRuntime.default.startup();
  observer.notify("add", "item", [1]);
  observer.notify("modify", "item", [1]);
  for (
    let i = 0;
    i < 200 &&
    !Zotero.ArxivSourceHelper.getStatus().some(([, s]) =>
      ["ready", "error"].includes(s.status),
    );
    i++
  )
    await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(errors, []);
  assert.equal(Zotero.ArxivSourceHelper.getStatus()[0]?.[1].status, "ready");
  assert.equal(requests.length, 1);
  assert.equal(requests[0], "https://arxiv.org/src/2610.39446v1");
  assert.equal(attachments.length, 2);
  const endpoint = new Zotero.Server.Endpoints["/arxiv-source-helper/read"]();
  async function read(query) {
    const response = await endpoint.init({
      query: { libraryID: "1", key: parent.key, ...query },
    });
    assert.equal(response[0], 200, response[2]);
    return JSON.parse(response[2]);
  }
  const headings = await read({ mode: "headings" });
  assert.equal(headings.headings.length, realFixture ? 31 : 1);
  const section = await read({
    mode: "section",
    section: "Active Interaction",
  });
  assert.ok(section.content.includes("privileged spatial information"));
  const table = await read({ mode: "table", q: "tab:interaction_memory" });
  assert.equal(table.tables.length, 1);
  assert.equal(
    table.tables[0].file,
    realFixture ? "tables/05_interaction_memory.tex" : "tables/ablation.tex",
  );
  assert.ok(table.tables[0].content.includes("93.3"));
  const search = await read({ mode: "search", q: "privileged" });
  assert.ok(search.matches.length > 0);
  assert.ok(search.matches.every((m) => m.file && m.line > 0));
  const figures = await read({ mode: "figures" });
  assert.ok(figures.figures.length > 0);
  const images = await read({ mode: "images" });
  const imagePath = images.assets.find(
    (a) => a.mime === "application/pdf",
  ).path;
  const image = await read({ mode: "image", q: imagePath });
  assert.equal(image.mime, "application/pdf");
  assert.ok(image.dataURL.startsWith("data:application/pdf;base64,"));
  assert.ok(image.preview.dataURL.startsWith("data:image/png;base64,"));
  const cache = path.join(
    root,
    "arxiv-source-helper",
    "tex_source",
    "1-ABCD1234",
  );
  const html = await fs.readFile(path.join(cache, "_ash-reading.html"), "utf8");
  assert.ok(html.includes("<img"));
  assert.ok(html.includes("Download original"));
  // Upgrading a previously generated reading copy uses cached sources and
  // updates the existing attachment instead of duplicating it or redownloading.
  await fs.writeFile(
    path.join(cache, "_ash-reader-version.json"),
    '{"version":1}',
  );
  attachments[0].title = "arXiv TeX 阅读版 · 2610.39446v1";
  await Zotero.ArxivSourceHelper.fetchSelected({
    ZoteroPane: { getSelectedItems: () => [parent] },
  });
  for (let i = 0; i < 200 && relinks === 0; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(relinks, 1);
  assert.equal(attachments.length, 2);
  assert.equal(requests.length, 1);
  assert.ok(attachments[0].title.includes("源码查看版"));
  observer.notify("add", "item", [2]);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(requests.length, 1);
  assert.equal(attachments.length, 2);
  await context.ArxivSourceHelperRuntime.default.shutdown();
  assert.equal(observer, null);
  assert.equal(Zotero.Server.Endpoints["/arxiv-source-helper/read"], undefined);
});
