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

test("bootstrap passes privileged globals directly and cleans up on shutdown", async () => {
  let started = 0,
    stopped = 0;
  const globals = {
    IOUtils: {},
    PathUtils: {},
    TextDecoder,
    TextEncoder,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  const Zotero = {
    initializationPromise: Promise.resolve(),
    uiReadyPromise: Promise.resolve(),
  };
  const Services = {
    scriptloader: {
      loadSubScript(url, context) {
        assert.equal(url, "jar:file:///test.xpi!/runtime.js");
        for (const [name, value] of Object.entries(globals))
          assert.equal(context[name], value);
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
    ...globals,
  });
  vm.runInContext(
    await readFile(new URL("../bootstrap.js", import.meta.url), "utf8"),
    context,
  );
  await context.startup({ rootURI: "jar:file:///test.xpi!/" });
  assert.equal(started, 1);
  await context.shutdown();
  assert.equal(stopped, 1);
});
