import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
  packageHTML,
  analyzeDiagnostics,
  convertWithLatexml,
  containerArguments,
  ENGINE_IMAGE,
} from "../build/conversion.mjs";
const markup =
  '<html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/dginev/ar5iv-css@0.8.4/css/ar5iv.min.css"></head><body><article><p id="first">First paragraph of the actual article is long enough for validation.</p><figure class="ltx_figure"><img src="images/fig.png"><figcaption>Caption</figcaption></figure><p>Next paragraph</p><table class="ltx_table"><tr><td>93.3</td></tr></table><math><mi>x</mi></math><a href="main.html#first">Back</a></article></body></html>';
test("packages engine HTML with inline graphics, MathML and tables in engine order", async () => {
  const result = await packageHTML(
    markup,
    async (name) => {
      assert.equal(name, "html/images/fig.png");
      return new Uint8Array([1, 2, 3]);
    },
    "Paper",
  );
  assert.deepEqual(result.missingAssets, []);
  assert.equal(result.stats.figures, 1);
  assert.equal(result.stats.tables, 1);
  assert.equal(result.stats.math, 1);
  assert.match(result.html, /<html/);
  assert.match(result.html, /data:image\/png;base64,AQID/);
  assert.match(result.html, /<math/);
  assert.match(result.html, /href="#first"/);
  assert.ok(
    result.html.indexOf("First paragraph") < result.html.indexOf("<figure"),
  );
  assert.ok(
    result.html.indexOf("<figure") < result.html.indexOf("Next paragraph"),
  );
  assert.ok(
    result.html.indexOf("Next paragraph") < result.html.indexOf("<table"),
  );
  assert.ok(!result.html.includes("cdn.jsdelivr.net"));
  assert.match(result.html, /Content-Security-Policy/);
});
test("rejects external/missing/traversing image resources and removes active HTML", async () => {
  let reads = 0;
  const result = await packageHTML(
    '<script>alert(1)</script><iframe src="https://example.org"></iframe><img onload="bad()" src="../../secret.png"><img src="https://example.org/x.png"><a href="javascript:bad()">link</a>',
    async () => {
      reads++;
      throw Error("absent");
    },
    "Paper",
  );
  assert.equal(reads, 0);
  assert.equal(result.missingAssets.length, 2);
  assert.ok(!/onload|<script|<iframe|javascript:/.test(result.html));
});
test("embeds local CSS assets and blocks remote CSS imports", async () => {
  const files = {
    "html/styles/local.css": "body{background:url(../images/a.png)}",
    "html/images/a.png": new Uint8Array([1]),
  };
  const result = await packageHTML(
    '<link rel="stylesheet" href="styles/local.css"><p>Text</p>',
    async (p) =>
      typeof files[p] === "string"
        ? new TextEncoder().encode(files[p])
        : files[p],
    "Paper",
  );
  assert.deepEqual(result.missingAssets, []);
  assert.match(result.html, /background:url\("data:image\/png;base64,AQ=="\)/);
  const invalid = await packageHTML(
    '<style>@import "https://example.org/x.css";</style>',
    async () => {
      throw Error("no");
    },
    "Paper",
  );
  assert.equal(invalid.missingAssets.length, 1);
});
test("diagnostics recognize failures even when the engine produces partial HTML", () => {
  const d = analyzeDiagnostics(
    "Error:package:unknown bad\nFatal:tex:group bad\nWarning:ref:missing bad\nStatus:conversion:3\nError:package:unknown bad",
    1,
  );
  assert.equal(d.errors, 1);
  assert.equal(d.fatals, 1);
  assert.equal(d.warnings, 1);
  assert.equal(d.statusCode, 3);
});
test("engine runs in a pinned isolated container with safe argument boundaries", () => {
  const args = containerArguments(
    "C:/folder with spaces/job",
    "main.tex",
    "ash-latexml-test",
  );
  assert.ok(args.includes(ENGINE_IMAGE));
  assert.ok(args.includes("C:/folder with spaces/job:/work"));
  assert.ok(args.includes("--network=none"));
  assert.ok(args.includes("--read-only"));
  assert.ok(args.includes("--pull=never"));
  assert.throws(() =>
    containerArguments("x", "../escape.tex", "ash-latexml-test"),
  );
  assert.throws(() => containerArguments("x", "main.tex", "other-container"));
});
async function pipeline(t, result, html = markup) {
  const dir = path.resolve(
    "build/conversion-test-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2),
  );
  await fs.mkdir(dir, { recursive: true });
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const host = {
    join: path.join,
    exists: async (p) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    },
    read: async (p) => new Uint8Array(await fs.readFile(p)),
    write: fs.writeFile,
    writeUTF8: fs.writeFile,
    makeDirectory: (p) => fs.mkdir(p, { recursive: true }),
    runDocker: async (args, opts) => {
      assert.equal(
        await fs.readFile(path.join(opts.workdir, "main.tex"), "utf8"),
        "original source",
      );
      if (html) {
        await fs.mkdir(path.join(dir, "html/images"), { recursive: true });
        await fs.writeFile(
          path.join(dir, "html/images/fig.png"),
          new Uint8Array([1, 2, 3]),
        );
        await fs.writeFile(path.join(dir, "html/main.html"), html);
      }
      return result;
    },
  };
  return {
    dir,
    options: {
      files: [
        {
          path: "main.tex",
          bytes: new TextEncoder().encode("original source"),
        },
      ],
      mainFile: "main.tex",
      jobDir: dir,
      title: "Paper",
      arxivID: "2610.39446v1",
      host,
    },
  };
}
test("successful conversion saves a self-contained reading copy and machine-readable report", async (t) => {
  const { dir, options } = await pipeline(t, {
    exitCode: 0,
    stdout: "Status:conversion:0",
  });
  const r = await convertWithLatexml(options);
  assert.equal(r.report.status, "ready");
  assert.equal(r.report.arxivID, "2610.39446v1");
  assert.equal(r.report.image, ENGINE_IMAGE);
  assert.equal(
    await fs.readFile(path.join(dir, "reading.html"), "utf8"),
    r.html,
  );
});
test("engine crashes and incomplete output save diagnostics without promoting the reading copy", async (t) => {
  for (const [process, html] of [
    [{ exitCode: 139, stdout: "Segmentation fault" }, null],
    [
      {
        exitCode: 0,
        stdout: "Error:package:unsupported unknown\nStatus:conversion:2",
      },
      markup,
    ],
    [
      { exitCode: 0, stdout: "" },
      markup.replace("images/fig.png", "missing.png"),
    ],
  ]) {
    const { dir, options } = await pipeline(t, process, html);
    await assert.rejects(
      convertWithLatexml(options),
      /latexml-conversion-failed/,
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(dir, "report.json"), "utf8"))
        .status,
      "failed",
    );
    await assert.rejects(fs.access(path.join(dir, "reading.html")));
  }
});
test("source archives cannot prepopulate the engine output", async (t) => {
  const { options } = await pipeline(t, { exitCode: 0, stdout: "" });
  options.files.push({ path: "html/main.html", bytes: new Uint8Array() });
  await assert.rejects(convertWithLatexml(options), /reserved-output-path/);
});

test("missing class bindings are rejected even if the engine exits successfully", async (t) => {
  const { options } = await pipeline(t, {
    exitCode: 0,
    stdout:
      "Warning:missing_file:class Can't find binding for class custom (using OmniBus)\nStatus:conversion:1",
  });
  await assert.rejects(convertWithLatexml(options), (error) => {
    assert.equal(error.report.failureReason, "unsupported-binding");
    return true;
  });
});
