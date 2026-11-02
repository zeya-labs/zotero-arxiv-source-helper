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
