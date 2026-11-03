import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import {
  prepareSource,
  sourceHTML,
  orderedSourceBlocks,
} from "../build/core.mjs";
const [sourcePath, outputDir] = process.argv.slice(2);
if (!sourcePath || !outputDir || !process.env.ASH_BROWSER_MODULE)
  throw Error(
    "Usage: ASH_BROWSER_MODULE=/path/to/playwright node tests/render-source.mjs SOURCE.gz OUTPUT_DIR",
  );
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.ASH_BROWSER_MODULE);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ASH_BROWSER_CHANNEL
    ? { channel: process.env.ASH_BROWSER_CHANNEL }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1250, height: 1100 },
  });
  await page.addScriptTag({
    path: fileURLToPath(new URL("../build/pdf-preview.js", import.meta.url)),
  });
  const source = await prepareSource(
      new Uint8Array(await readFile(sourcePath)),
    ),
    previews = {};
  await mkdir(outputDir, { recursive: true });
  const figurePaths = new Set(
    source.figures.flatMap((f) => f.images.map((i) => i.path)),
  );
  for (const asset of source.assets.filter(
    (a) => a.mime === "application/pdf" && figurePaths.has(a.path),
  )) {
    const bytes = source.files.find((f) => f.path === asset.path).bytes;
    previews[asset.path] = await page.evaluate(
      async (base64) =>
        ASHPDFPreview.renderPDF(
          Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
          (w, h) => {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            return canvas;
          },
          document,
          false,
        ),
      Buffer.from(bytes).toString("base64"),
    );
  }
  const html = sourceHTML("Ask to Evolve", "2610.39446v1", source, previews),
    file = path.resolve(outputDir, "tex-reading.html");
  await writeFile(file, html);
  const externalRequests = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) externalRequests.push(request.url());
  });
  await page.goto(pathToFileURL(file).href);
  await page.locator("img").evaluateAll((images) =>
    Promise.all(
      images.map(async (img) => {
        img.loading = "eager";
        await img.decode();
      }),
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  const expected = orderedSourceBlocks(source)
    .filter((b) => b.kind !== "text")
    .map((b) => b.id);
  const actual = await page
    .locator("main > [id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  assert.deepEqual(
    actual,
    expected,
    "body blocks must retain exact expanded TeX order",
  );
  assert.equal(
    await page.locator(".source-figure").count(),
    source.figures.length,
  );
  assert.equal(
    await page.locator(".source-figure img").count(),
    source.figures.flatMap((f) => f.images).length,
  );
  assert.equal(await page.locator(".paper-page,#figures,#tables").count(), 0);
  assert.equal(await page.locator(".katex-error,.unsupported").count(), 0);
  assert.ok((await page.locator(".abstract").innerText()).includes("embodied"));
  assert.ok(
    (await page.locator(".source-table").allTextContents())
      .join("")
      .includes("93.3"),
  );
  assert.deepEqual(externalRequests, []);
  await page.screenshot({ path: path.join(outputDir, "intro.png") });
  for (const [selector, name] of [
    [".source-figure:nth-of-type(1)", "figure"],
    [".source-table", "table"],
  ]) {
    const target = page.locator(selector).first();
    if (await target.count())
      await target.screenshot({ path: path.join(outputDir, name + ".png") });
  }
  await page
    .locator(".source-figure")
    .nth(1)
    .screenshot({ path: path.join(outputDir, "method-figure.png") });
  await page
    .locator(".source-table")
    .nth(2)
    .screenshot({ path: path.join(outputDir, "results-table.png") });
  console.log(
    JSON.stringify({
      figures: source.figures.length,
      images: await page.locator("img").count(),
      tables: await page.locator(".source-table").count(),
      bodyBlocks: actual.length,
      htmlBytes: Buffer.byteLength(html),
      externalRequests,
    }),
  );
} finally {
  await browser.close();
}
