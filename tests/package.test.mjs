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

test("bootstrap starts menus without Docker and invokes Docker without a shell", async () => {
  const calls = [];
  let started = 0,
    stopped = 0,
    reads = 0;
  const Subprocess = {
    pathSearch: async () => "C:/Docker/docker.exe",
    call: async (options) => {
      calls.push(options);
      return {
        stdin: { close: async () => {} },
        stdout: {
          read: async () =>
            reads++
              ? new ArrayBuffer(0)
              : new TextEncoder().encode("Docker OK").buffer,
        },
        wait: async () => ({ exitCode: 0 }),
        kill: async () => {},
      };
    },
  };
  const principal = {};
  let sandbox;
  const Zotero = {
    initializationPromise: Promise.resolve(),
    uiReadyPromise: Promise.resolve(),
    Prefs: { get: () => undefined },
  };
  const context = vm.createContext({
    Zotero,
    IOUtils: {},
    PathUtils: {},
    TextEncoder,
    TextDecoder,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    btoa,
    atob,
    ChromeUtils: { importESModule: () => ({ Subprocess }) },
    Components: {
      utils: {
        Sandbox: function (p) {
          assert.equal(p, principal);
          return (sandbox = vm.createContext({}));
        },
      },
    },
    Services: {
      scriptSecurityManager: { getSystemPrincipal: () => principal },
      scriptloader: {
        loadSubScript(url, scope) {
          assert.ok(url.endsWith("/runtime.js"));
          scope.ArxivSourceHelperRuntime = {
            default: {
              startup: async () => started++,
              shutdown: async () => stopped++,
            },
          };
        },
      },
    },
  });
  vm.runInContext(
    await readFile(new URL("../bootstrap.js", import.meta.url), "utf8"),
    context,
  );
  await context.startup({ rootURI: "jar:file:///test.xpi!/" });
  assert.equal(started, 1);
  assert.equal(calls.length, 0);
  const result = await sandbox.runDocker(
    ["version", "--format", "{{.Server.Version}}"],
    { workdir: "C:/job" },
  );
  assert.equal(result.stdout, "Docker OK");
  assert.equal(result.exitCode, 0);
  assert.equal(calls[0].command, "C:/Docker/docker.exe");
  assert.deepEqual(
    [...calls[0].arguments],
    ["version", "--format", "{{.Server.Version}}"],
  );
  assert.equal(calls[0].workdir, "C:/job");
  assert.equal(calls[0].stderr, "stdout");
  await context.shutdown();
  assert.equal(stopped, 1);
});

test("bootstrap reports a missing Docker executable and rejects only the conversion", async () => {
  const scope = vm.createContext({
    Zotero: { Prefs: { get: () => undefined }, isWin: false },
    ChromeUtils: {
      importESModule: () => ({
        Subprocess: {
          pathSearch: async () => {
            throw Error("not found");
          },
        },
      }),
    },
  });
  vm.runInContext(
    await readFile(new URL("../bootstrap.js", import.meta.url), "utf8"),
    scope,
  );
  await assert.rejects(scope.runDocker(["version"]), /Docker Desktop/);
});

test("timed-out conversions clean up only the owned container", async () => {
  const calls = [];
  let finish;
  const Subprocess = {
    pathSearch: async () => "/docker",
    call: async (options) => {
      calls.push([...options.arguments]);
      if (options.arguments[0] === "rm")
        return {
          stdin: { close: async () => {} },
          stdout: { read: async () => new ArrayBuffer(0) },
          wait: async () => ({ exitCode: 0 }),
        };
      return {
        stdin: { close: async () => {} },
        stdout: { read: () => new Promise((r) => (finish = r)) },
        kill: async () => finish(new ArrayBuffer(0)),
        wait: async () => ({ exitCode: 137 }),
      };
    },
  };
  const scope = vm.createContext({
    Zotero: { Prefs: { get: () => undefined } },
    ChromeUtils: { importESModule: () => ({ Subprocess }) },
    TextDecoder,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(
    await readFile(new URL("../bootstrap.js", import.meta.url), "utf8"),
    scope,
  );
  const result = await scope.runDocker(["run"], {
    timeoutMS: 5,
    containerName: "ash-latexml-owned",
  });
  assert.equal(result.timedOut, true);
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(calls, [["run"], ["rm", "-f", "ash-latexml-owned"]]);
  calls.length = 0;
  await scope.runDocker(["run"], {
    timeoutMS: 5,
    containerName: "unrelated-user-container",
  });
  await new Promise((r) => setTimeout(r, 15));
  assert.deepEqual(calls, [["run"]]);
});
