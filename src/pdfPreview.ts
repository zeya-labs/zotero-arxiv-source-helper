// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// Run the bundled worker handler on the plugin's own main-thread scope. No
// remote script, worker URL, PDF compilation, or external renderer is needed.
(globalThis as any).pdfjsWorker = { WorkerMessageHandler };
export async function renderPDF(
  bytes: Uint8Array,
  createCanvas: (width: number, height: number) => any,
  ownerDocument: any,
  allPages = false,
  onProgress?: (page: number, total: number) => void,
) {
  class CanvasFactory {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(entry: any, width: number, height: number) {
      entry.canvas.width = width;
      entry.canvas.height = height;
    }
    destroy(entry: any) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
      entry.canvas = null;
      entry.context = null;
    }
  }
  const task = getDocument({
    data: bytes.slice(),
    CanvasFactory,
    ownerDocument,
    disableFontFace: true,
    useSystemFonts: true,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false,
    useWasm: false,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise,
      pages = [];
    if (allPages && pdf.numPages > 100)
      throw Error("paper-exceeds-100-page-limit");
    for (let number = 1; number <= (allPages ? pdf.numPages : 1); number++) {
      const page = await pdf.getPage(number),
        base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(2, 1400 / base.width, 1800 / base.height),
      });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      await page.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport,
      }).promise;
      const result = {
        number,
        dataURL: canvas.toDataURL("image/png"),
        pages: pdf.numPages,
        width: canvas.width,
        height: canvas.height,
      };
      pages.push(result);
      page.cleanup();
      canvas.width = canvas.height = 0;
      onProgress?.(number, pdf.numPages);
    }
    return allPages ? pages : pages[0];
  } finally {
    await task.destroy();
  }
}
