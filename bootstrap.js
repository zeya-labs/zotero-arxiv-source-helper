// SPDX-License-Identifier: AGPL-3.0-or-later
var helperContext;
function install() {}
function uninstall() {}
async function startup({ rootURI }) {
  await Zotero.initializationPromise;
  await Zotero.uiReadyPromise;
  // Zotero supplies these in the privileged bootstrap scope. Window properties
  // need not expose them (e.g. a lexical IOUtils binding is not win.IOUtils).
  helperContext = {
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
  };
  helperContext.renderPDF = async function (bytes) {
    const win = Zotero.getMainWindow();
    if (!helperContext.ASHPDFPreview) {
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
      ])
        helperContext[name] = win[name];
      helperContext.structuredClone = win.structuredClone.bind(win);
      helperContext.console = win.console;
      Services.scriptloader.loadSubScript(
        rootURI + "pdf-preview.js",
        helperContext,
      );
    }
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
    );
  };
  Services.scriptloader.loadSubScript(rootURI + "runtime.js", helperContext);
  await helperContext.ArxivSourceHelperRuntime.default.startup();
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
