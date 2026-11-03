// SPDX-License-Identifier: AGPL-3.0-or-later
var helperContext;
function install() {}
function uninstall() {}
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
    return helperContext.ASHPDFPreview.renderPDF(
      bytes,
      (width, height) => {
        const canvas = win.document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "canvas",
        );
        canvas.width = width;
        canvas.height = height;
        return canvas;
      },
      win.document,
      true,
      onProgress,
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
