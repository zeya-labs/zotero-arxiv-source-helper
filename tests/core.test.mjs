import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { resolveArxiv, prepareSource, SourceQueue } from "../build/core.mjs";

function tar(files) {
  const result = [];
  for (const [name, content] of Object.entries(files)) {
    const b = Buffer.from(content),
      h = Buffer.alloc(512);
    h.write(name);
    h.write("0000644\0", 100);
    h.write(b.length.toString(8).padStart(11, "0") + "\0", 124);
    h[156] = 48;
    h.write("ustar", 257);
    result.push(h, b, Buffer.alloc((512 - (b.length % 512)) % 512));
  }
  return Buffer.concat([...result, Buffer.alloc(1024)]);
}
const main =
  "\\documentclass{article}\n\\begin{document}\n\\section{Method}\n\\input{parts/model}\n\\section{Results}\nDone.\n\\end{document}";
const part =
  "An equation $x_1 + x_2$.\n\\begin{table}\n\\caption{Ablation results}\\label{tab:ablation}\n\\begin{tabular}{lc}Baseline & 86\\\\ Full & 100\\\\\\end{tabular}\n\\end{table}";
test("uses exact PDF version, recognizes DOI and legacy IDs", () => {
  assert.equal(
    resolveArxiv([
      "arXiv:2610.39446 [cs.RO]",
      "http://arxiv.org/pdf/2610.39446v1",
    ]),
    "2610.39446v1",
  );
  assert.equal(
    resolveArxiv(["10.48550/arXiv.2610.39446", "version: 2"]),
    "2610.39446v2",
  );
  assert.equal(
    resolveArxiv(["https://arxiv.org/abs/astro-ph/9901234v3"]),
    "astro-ph/9901234v3",
  );
});
test("rejects conflicting identity or PDF versions", () => {
  for (const f of [
    ["arxiv:2610.39446", "arxiv:2401.12345"],
    ["arxiv:2610.39446v1", "arxiv:2610.39446v2"],
    ["arxiv:2610.39446v1", "version: 2"],
  ])
    assert.throws(() => resolveArxiv(f), /ambiguous/);
});
test("expands multifile source and preserves equations, tables and file positions", async () => {
  const result = await prepareSource(
    gzipSync(tar({ "main.tex": main, "parts/model.tex": part })),
  );
  assert.equal(result.mainFile, "main.tex");
  assert.deepEqual(
    result.headings.map((h) => h.title),
    ["Method", "Results"],
  );
  assert.ok(
    result.segments.some(
      (s) => s.file === "parts/model.tex" && s.text.includes("$x_1 + x_2$"),
    ),
  );
  assert.ok(
    result.tables.some(
      (t) =>
        t.caption === "Ablation results" && t.content.includes("Baseline & 86"),
    ),
  );
  assert.ok(
    result.tables.every((t) => t.file === "parts/model.tex" && t.lineStart > 0),
  );
});
test("supports gzip single-file source", async () => {
  assert.equal(
    (
      await prepareSource(
        gzipSync(Buffer.from(main.replace("\\input{parts/model}", ""))),
      )
    ).mainFile,
    "main.tex",
  );
});
test("resolves root-relative table inputs referenced from a section file", async () => {
  const result = await prepareSource(
    tar({
      "main.tex":
        "\\documentclass{article}\n\\begin{document}\n\\input{sections/results}\n\\end{document}",
      "sections/results.tex": "\\section{Results}\n\\input{tables/ablation}",
      "tables/ablation.tex": part,
    }),
  );
  assert.ok(
    result.tables.some(
      (t) =>
        t.caption === "Ablation results" && t.file === "tables/ablation.tex",
    ),
  );
});
test("rejects PDF, path traversal and ambiguous entry points", async () => {
  await assert.rejects(prepareSource(Buffer.from("%PDF-1.7")), /PDF/);
  await assert.rejects(
    prepareSource(tar({ "../escape.tex": main })),
    /unsafe-archive/,
  );
  await assert.rejects(
    prepareSource(tar({ "main.tex": main, "supplement.tex": main })),
    /ambiguous-main-file/,
  );
});
test("queue serializes work, deduplicates pending events, and continues after a failed download", async () => {
  const done = [],
    errors = [];
  let concurrent = 0,
    peak = 0;
  const queue = new SourceQueue(
    async (id) => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 1));
      concurrent--;
      if (id === 2) throw Error("network");
      done.push(id);
    },
    (id) => errors.push(id),
  );
  queue.add(1);
  queue.add(1);
  queue.add(2);
  queue.add(3);
  await Promise.all([queue.drain(), queue.drain()]);
  assert.deepEqual(done, [1, 3]);
  assert.deepEqual(errors, [2]);
  assert.equal(peak, 1);
  queue.stop();
  queue.add(4);
  await queue.drain();
  assert.deepEqual(done, [1, 3]);
});
