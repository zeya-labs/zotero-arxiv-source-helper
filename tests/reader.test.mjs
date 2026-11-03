import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepareFiles,
  orderedSourceBlocks,
  sourceHTML,
} from "../build/core.mjs";
const bytes = (s) => new TextEncoder().encode(s);
const png = "data:image/png;base64,iVBORw==";
function fixture() {
  return prepareFiles(
    [
      {
        path: "main.tex",
        bytes: bytes(String.raw`\documentclass{article}
\newcommand{\method}{Reader}
\abstract{\input{abstract}}
\begin{document}
\section{Start}\label{sec:start}
Before-figure with \textbf{selectable words} and $x_1+2$.
\input{figures/overview}
After-figure before-table.
\input{tables/results}
After-table. See \figref{fig:overview}, \tabref{tab:results}, and \ref{sec:start}.
\end{document}`),
      },
      {
        path: "abstract.tex",
        bytes: bytes("The abstract is expanded before the document."),
      },
      {
        path: "figures/overview.tex",
        bytes: bytes(String.raw`% \includegraphics{hidden.pdf}
\begin{figure}\includegraphics{figures/overview.pdf}\caption{The \method{} diagram.}\label{fig:overview}\end{figure}`),
      },
      { path: "figures/overview.pdf", bytes: bytes("%PDF-fixture") },
      {
        path: "tables/results.tex",
        bytes:
          bytes(String.raw`\begin{table}\caption{Results}\label{tab:results}
\begin{tabular}{lrr}\toprule
\multirow{2}{*}{Method} & \multicolumn{2}{c}{Scores} \\
 & A & B \\
\midrule Reader & 93.3 & 100 \\
A \& B & 42 & 8 \\
\bottomrule\end{tabular}\end{table}`),
      },
    ],
    "main.tex",
  );
}
test("expand abstract inputs and keep figures/tables between their surrounding source paragraphs", () => {
  const source = fixture(),
    blocks = orderedSourceBlocks(source);
  assert.ok(source.segments.some((s) => s.file === "abstract.tex"));
  assert.deepEqual(
    blocks.filter((b) => b.kind !== "text").map((b) => b.kind),
    ["abstract", "section", "figure", "table"],
  );
  const html = sourceHTML("Title", "2401.12345v1", source, {
    "figures/overview.pdf": { dataURL: png },
  });
  const positions = [
    "Before-figure",
    'class="source-figure"',
    "After-figure",
    'class="source-table"',
    "After-table",
  ].map((s) => html.indexOf(s));
  assert.ok(positions.every((p, i) => p >= 0 && (!i || p > positions[i - 1])));
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.ok(html.includes("The abstract is expanded"));
  assert.ok(html.includes("The Reader diagram"));
  assert.ok(html.includes('class="katex"'));
  assert.ok(
    !html.includes('class="paper-page"') &&
      !html.includes('id="figures"') &&
      !html.includes('id="tables"'),
  );
  assert.ok(!html.includes("hidden.pdf"));
  assert.ok(
    html.includes('href="#' + blocks.find((b) => b.kind === "figure").id + '"'),
  );
});
test("tables retain selectable values, escaped ampersands, column spans and row spans", () => {
  const html = sourceHTML("Title", "id", fixture());
  assert.ok(html.includes('colspan="2"') && html.includes('rowspan="2"'));
  assert.ok(html.includes("<td>93.3</td>") && html.includes("<td>100</td>"));
  assert.ok(html.includes("<td>A &amp; B</td>"));
  assert.ok(html.includes("<td>Reader</td>"));
});
test("reader escapes source markup and rejects untrusted image preview URLs", () => {
  const source = fixture();
  source.segments.push({
    file: "main.tex",
    lineStart: 20,
    text: "<script>bad()</script>",
  });
  const html = sourceHTML("<script>title</script>", "id", source, {
    "figures/overview.pdf": { dataURL: "javascript:alert(1)" },
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('src="javascript:'));
  assert.ok(html.includes("&lt;script&gt;title"));
  assert.ok(html.includes("Content-Security-Policy"));
  assert.ok(html.includes("图片预览未生成"));
});
