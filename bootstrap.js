// SPDX-License-Identifier: AGPL-3.0-or-later
var helperContext;
function install() {}
function uninstall() {}
async function withRenderDocument(win, render) {
  // PDF.js appends SVG filter definitions to document.body. Zotero's XUL
  // document has no body, so supply an HTML host in that same live document.
  // Keeping filters and canvases in the same document preserves URL references.
  const source = win.document;
  const host = source.createElementNS("http://www.w3.org/1999/xhtml", "div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute(
    "style",
    "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none",
  );
  source.documentElement.append(host);
  const document = new Proxy(source, {
    get(target, name) {
      if (name === "body") return host;
      if (name === "createElement")
        return (tag) =>
          target.createElementNS("http://www.w3.org/1999/xhtml", tag);
      const value = Reflect.get(target, name, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  try {
    return await render(document);
  } finally {
    host.remove();
  }
}
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  // Zotero supplies these in the privileged bootstrap scope. Window properties
  // need not expose them (e.g. a lexical IOUtils binding is not win.IOUtils).
  // A plain object passed to loadSubScript is not a new global in Gecko:
  // globalThis still points at the bootstrap sandbox. PDF.js reads its native
  // constructors through globalThis, so use a real, separate global here.
  helperContext = new Components.utils.Sandbox(
    Services.scriptSecurityManager.getSystemPrincipal(),
    { sandboxName: "arxiv-source-helper-runtime" },
  );
  Object.assign(helperContext, {
    Zotero,
    Services,
    ChromeUtils,
    rootURI,
    IOUtils,
    PathUtils,
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    btoa,
    atob,
  });
  const win = Zotero.getMainWindow();
  for (const name of [
    "DOMMatrix",
    "Path2D",
    "ImageData",
    "DOMException",
    "AbortController",
    "AbortSignal",
    "URL",
    "ReadableStream",
    "TransformStream",
    "Blob",
    "navigator",
    "document",
  ])
    helperContext[name] = win[name];
  helperContext.structuredClone = win.structuredClone.bind(win);
  helperContext.console = win.console;
  let rendererError;
  // Load while the install root is available, rather than reopening the XPI
  // later from a background download callback.
  helperContext.renderPaperPDF = async function (bytes, onProgress) {
    if (rendererError)
      throw new Error("PDF renderer failed to load: " + rendererError.message);
    return withRenderDocument(win, (document) =>
      helperContext.ASHPDFPreview.renderPDF(
        bytes,
        (width, height) => {
          const canvas = document.createElementNS(
            "http://www.w3.org/1999/xhtml",
            "canvas",
          );
          canvas.width = width;
          canvas.height = height;
          return canvas;
        },
        document,
        true,
        onProgress,
      ),
    );
  };
  Services.scriptloader.loadSubScript(rootURI + "runtime.js", helperContext);
  await helperContext.ArxivSourceHelperRuntime.default.startup();
  // Menus, source queries and status stay available even if the renderer fails.
  try {
    Services.scriptloader.loadSubScript(
      rootURI + "pdf-preview.js",
      helperContext,
    );
  } catch (error) {
    rendererError = error;
    Zotero.logError(error);
  }
}
function onMainWindowLoad({ window }) {
  helperContext?.ArxivSourceHelperRuntime?.default.addWindow(window);
}
function onMainWindowUnload({ window }) {
  helperContext?.ArxivSourceHelperRuntime?.default.removeWindow(window);
}
async function shutdown() {
  await helperContext?.ArxivSourceHelperRuntime?.default.shutdown();
  helperContext = null;
}
