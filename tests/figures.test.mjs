import { test } from "node:test";
import assert from "node:assert/strict";
import { indexFigures } from "../build/core.mjs";
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
