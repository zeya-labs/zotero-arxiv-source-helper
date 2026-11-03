import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("manifest supplies Zotero mandatory fields including the update URL", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.manifest_version, 2);
  const app = manifest.applications.zotero;
  for (const field of [
    "id",
    "update_url",
    "strict_min_version",
    "strict_max_version",
  ])
    assert.ok(app[field], `Missing ${field}`);
  assert.equal(new URL(app.update_url).protocol, "https:");
  assert.equal(app.strict_max_version, "10.0.*");
  assert.match(app.id, /^[\w.-]+@[\w.-]+$/);
});

async function bootstrapFixture(failRenderer = false) {
  let started = 0,
    stopped = 0;
  const loaded = [];
  const globals = {
    IOUtils: {},
    PathUtils: {},
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    btoa,
    atob,
  };
  const errors = [];
  const browserGlobals = {
    DOMException,
    DOMMatrix: class DOMMatrix {},
    structuredClone,
    console,
    document: {},
    navigator: {
      language: "en-US",
      platform: "Win32",
      userAgent: "Mozilla/5.0",
    },
    AbortController,
    AbortSignal,
    URL,
    ReadableStream,
    TransformStream,
    Blob,
  };
  const pdfBundle = await readFile(
    new URL("../build/pdf-preview.js", import.meta.url),
    "utf8",
  );
  const principal = {};
  const Zotero = {
    logError: (e) => errors.push(e),
    initializationPromise: Promise.resolve(),
    uiReadyPromise: Promise.resolve(),
    getMainWindow: () => browserGlobals,
  };
  const Services = {
    scriptSecurityManager: { getSystemPrincipal: () => principal },
    scriptloader: {
      loadSubScript(url, context) {
        loaded.push(url);
        assert.ok(
          [
            "jar:file:///test.xpi!/runtime.js",
            "jar:file:///test.xpi!/pdf-preview.js",
          ].includes(url),
        );
        for (const [name, value] of Object.entries(globals))
          assert.equal(context[name], value);
        if (url.endsWith("pdf-preview.js")) {
          assert.equal(started, 1, "register menus and API before PDF.js");
          assert.ok(vm.isContext(context), "renderer requires a real global");
          assert.equal(
            vm.runInContext("globalThis.DOMException", context),
            DOMException,
          );
          if (failRenderer) throw new Error("renderer-unavailable");
          vm.runInContext(pdfBundle, context);
          assert.equal(typeof context.ASHPDFPreview.renderPDF, "function");
        } else
          context.ArxivSourceHelperRuntime = {
            default: {
              startup: async () => {
                started++;
              },
              shutdown: async () => {
                stopped++;
              },
            },
          };
      },
    },
  };
  const context = vm.createContext({
    Zotero,
    Services,
    ChromeUtils: {},
    Components: {
      utils: {
        Sandbox: function (p) {
          assert.equal(p, principal);
          return vm.createContext({});
        },
      },
    },
    ...globals,
  });
  vm.runInContext(
    await readFile(new URL("../bootstrap.js", import.meta.url), "utf8"),
    context,
  );
  await context.startup({ rootURI: "jar:file:///test.xpi!/" });
  assert.equal(started, 1);
  assert.deepEqual(loaded, [
    "jar:file:///test.xpi!/runtime.js",
    "jar:file:///test.xpi!/pdf-preview.js",
  ]);
  if (failRenderer) {
    assert.equal(errors.length, 1);
    await assert.rejects(
      context.helperContext.renderPaperPDF(new Uint8Array()),
      /renderer-unavailable/,
    );
  } else assert.deepEqual(errors, []);
  await context.shutdown();
  assert.equal(stopped, 1);
}

test("bootstrap loads the real PDF bundle in its own global after menus start", () =>
  bootstrapFixture());
test("renderer failure preserves runtime startup and gives a readable error", () =>
  bootstrapFixture(true));
