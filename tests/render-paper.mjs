// Optional browser verification; PDF fixtures are never redistributed.
import * as fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { paperHTML } from "../build/core.mjs";
const [pdfPath, outputDir] = process.argv.slice(2);
if (!pdfPath || !outputDir || !process.env.ASH_BROWSER_MODULE)
  throw Error(
    "Usage: ASH_BROWSER_MODULE=/path/to/playwright node tests/render-paper.mjs PAPER.pdf OUTPUT_DIR",
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
    viewport: { width: 1300, height: 1000 },
  });
  await page.addScriptTag({
    path: fileURLToPath(new URL("../build/pdf-preview.js", import.meta.url)),
  });
  const pages = await page.evaluate(
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
        true,
      ),
    (await fs.readFile(pdfPath)).toString("base64"),
  );
  await fs.mkdir(outputDir, { recursive: true });
  for (const p of pages)
    await fs.writeFile(
      path.join(
        outputDir,
        "page-" + String(p.number).padStart(4, "0") + ".png",
      ),
      Buffer.from(p.dataURL.split(",")[1], "base64"),
    );
  await fs.writeFile(
    path.join(outputDir, "paper-reading.html"),
    paperHTML("Ask to Evolve", "2610.39446v1", pages),
  );
  await page.goto(
    pathToFileURL(path.resolve(outputDir, "paper-reading.html")).href,
  );
  if ((await page.locator(".paper-page").count()) !== pages.length)
    throw Error("Missing HTML pages");
  if (await page.locator("#figures,#tables").count())
    throw Error("Unexpected separate galleries");
  for (const n of [1, 5, 11]) {
    await page.locator("#page-" + n).scrollIntoViewIfNeeded();
    await page.locator("#page-" + n + " img").evaluate((img) => img.decode());
    await page
      .locator("#page-" + n)
      .screenshot({ path: path.join(outputDir, "html-page-" + n + ".png") });
  }
  console.log(
    JSON.stringify({
      pages: pages.length,
      width: pages[0].width,
      height: pages[0].height,
      htmlBytes: (await fs.stat(path.join(outputDir, "paper-reading.html")))
        .size,
    }),
  );
} finally {
  await browser.close();
}
