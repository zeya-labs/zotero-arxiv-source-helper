import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("image client saves original/preview without logging base64 or overwriting files", async () => {
  const script = fileURLToPath(new URL("../query.mjs", import.meta.url));
  const dir = await fs.mkdtemp(
    path.join(path.dirname(script), "build/cli-test-"),
  );
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (
      new URL(req.url, "http://localhost").searchParams.get("mode") === "page"
    ) {
      res.end(
        JSON.stringify({
          path: "page-0001.png",
          mime: "image/png",
          dataURL:
            "data:image/png;base64," +
            Buffer.from("page-fixture").toString("base64"),
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        path: "figures/a.pdf",
        mime: "application/pdf",
        dataURL:
          "data:application/pdf;base64," +
          Buffer.from("%PDF-fixture").toString("base64"),
        preview: {
          dataURL:
            "data:image/png;base64," +
            Buffer.from("PNG-fixture").toString("base64"),
        },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = String(server.address().port);
  async function run(extra = [], mode = "image") {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          script,
          "ABCD1234",
          mode,
          mode === "page" ? "1" : "figures/a.pdf",
          port,
          "1",
          ...extra,
        ],
        { cwd: dir, windowsHide: true },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  }
  try {
    const info = await run();
    assert.equal(info.code, 0);
    assert.ok(!info.stdout.includes("base64"));
    assert.ok(!info.stdout.includes("dataURL"));
    const original = await run(["--output", "original.pdf"]);
    assert.equal(original.code, 0);
    assert.equal(
      await fs.readFile(path.join(dir, "original.pdf"), "utf8"),
      "%PDF-fixture",
    );
    const preview = await run(["--preview", "--output", "preview.png"]);
    assert.equal(preview.code, 0);
    assert.equal(
      await fs.readFile(path.join(dir, "preview.png"), "utf8"),
      "PNG-fixture",
    );
    const collision = await run(["--output", "original.pdf"]);
    assert.equal(collision.code, 2);
    assert.ok(collision.stderr.includes("EEXIST"));
    const page = await run(["--output", "page.png"], "page");
    assert.equal(page.code, 0);
    assert.equal(
      await fs.readFile(path.join(dir, "page.png"), "utf8"),
      "page-fixture",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
