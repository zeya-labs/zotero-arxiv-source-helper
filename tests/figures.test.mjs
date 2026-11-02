import { test } from "node:test";
import assert from "node:assert/strict";
import { indexFigures, prepareFiles, sourceHTML } from "../build/core.mjs";
const text = String.raw`\documentclass{article}
\graphicspath{{figures/}}
\begin{document}
See \ref{fig:overview}.
% \includegraphics{ignored.pdf}
\begin{figure}
\includegraphics[width=\linewidth]{overview}
\caption{A <script>caption</script> with \textbf{nested} text.}
\label{fig:overview}
\end{figure}
\begin{figure*}
\includegraphics{../../escape.pdf}
\caption{Missing image}
\label{fig:missing}
\end{figure*}
\end{document}`;
test("figure index resolves graphicspath, captions, labels and reference locations without including comments", () => {
  const index = indexFigures(
    [{ text, file: "sections/method.tex", lineStart: 1 }],
    ["figures/overview.pdf", "extra.png"],
  );
  assert.equal(index.figures.length, 2);
  const figure = index.figures[0];
  assert.equal(figure.label, "fig:overview");
  assert.equal(figure.images.length, 1);
  assert.equal(figure.images[0].path, "figures/overview.pdf");
  assert.equal(figure.references[0].line, 4);
  assert.ok(figure.caption.includes("nested"));
  assert.ok(figure.captionTex.includes("\\textbf"));
  assert.equal(index.figures[1].images[0].status, "missing");
  assert.deepEqual(index.assets[1].figureIds, []);
});
test("source viewer contains a preview, original download, captions and escaped markup", () => {
  const files = [
    { path: "main.tex", bytes: new TextEncoder().encode(text) },
    {
      path: "figures/overview.pdf",
      bytes: new TextEncoder().encode("%PDF-fixture"),
    },
    { path: "extra.png", bytes: new Uint8Array([137, 80, 78, 71]) },
  ];
  const result = prepareFiles(files, "main.tex");
  const html = sourceHTML("Example", "2401.12345v1", result, {
    "figures/overview.pdf": {
      dataURL: "data:image/png;base64,iVBORw==",
      pages: 2,
    },
  });
  assert.ok(html.includes("<img"));
  assert.ok(html.includes("data:application/pdf;base64,"));
  assert.ok(html.includes('download="overview.pdf"'));
  assert.ok(html.includes("page 1 of 2"));
  assert.ok(html.includes("fig:overview"));
  assert.ok(!html.includes("<script>caption"));
  assert.ok(html.includes("&lt;script&gt;caption"));
});
