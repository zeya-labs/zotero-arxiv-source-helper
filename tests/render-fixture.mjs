// Optional visual integration check. No paper bundles are distributed here.
import * as fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { prepareSource, sourceHTML } from "../build/core.mjs";
const [fixturePath, outputDir] = process.argv.slice(2);
if (!fixturePath || !outputDir || !process.env.ASH_BROWSER_MODULE)
  throw Error(
    "Usage: ASH_BROWSER_MODULE=/path/to/playwright node tests/render-fixture.mjs SOURCE.gz OUTPUT_DIR",
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
    path: new URL("../build/pdf-preview.js", import.meta.url).pathname.replace(
      /^\/([A-Z]:)/i,
      "$1",
    ),
  });
  const result = await prepareSource(
      new Uint8Array(await fs.readFile(fixturePath)),
    ),
    previews = {};
  await fs.mkdir(outputDir, { recursive: true });
  for (const asset of result.assets.filter(
    (a) => a.mime === "application/pdf",
  )) {
    const bytes = result.files.find((f) => f.path === asset.path).bytes;
    const preview = await page.evaluate(
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
        ),
      Buffer.from(bytes).toString("base64"),
    );
    previews[asset.path] = preview;
    await fs.writeFile(
      path.join(outputDir, asset.path.replaceAll("/", "_") + ".png"),
      Buffer.from(preview.dataURL.split(",")[1], "base64"),
    );
    console.log(asset.path, preview.width + "x" + preview.height);
  }
  await fs.writeFile(
    path.join(outputDir, "source-viewer.html"),
    sourceHTML("Ask to Evolve", "2610.39446v1", result, previews),
  );
  await page.goto(
    new URL(
      "file:///" +
        path.resolve(outputDir, "source-viewer.html").replaceAll("\\", "/"),
    ).href,
  );
  await page.locator("#figure-2 img").waitFor();
  await page
    .locator("#figure-2")
    .screenshot({ path: path.join(outputDir, "viewer-figure-2.png") });
  const index = {
    mainFile: result.mainFile,
    figures: result.figures,
    assets: result.assets,
    previews: Object.keys(previews),
  };
  await fs.writeFile(
    path.join(outputDir, "figure-index.json"),
    JSON.stringify(index, null, 2),
  );
  if (result.figures.some((f) => f.images.some((i) => i.status !== "ok")))
    throw Error("Missing figure assets");
  console.log(
    JSON.stringify({
      files: result.files.length,
      figures: result.figures.length,
      assets: result.assets.length,
      renderedPDFs: Object.keys(previews).length,
    }),
  );
} finally {
  await browser.close();
}
