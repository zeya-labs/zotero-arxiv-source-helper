// SPDX-License-Identifier: AGPL-3.0-or-later
import { renderToString } from "katex";
import { mathCSS } from "./generated/mathStyle";
import { bytesDataURL, imageMime, type SourceFigure } from "./figures";
import { createLatexDocumentIndex } from "./vendor/latexQuery/documentIndex";
import { scanLatexCommands } from "./vendor/latexQuery/scanner";
import type { LatexSegment } from "./vendor/latexQuery/parser";

export interface ImagePreview {
  dataURL?: string;
  pages?: number;
  error?: string;
}
interface Source {
  segments: LatexSegment[];
  files: { path: string; bytes: Uint8Array }[];
  figures: SourceFigure[];
}
interface Block {
  kind: string;
  start: number;
  end: number;
  argument?: string;
  raw: string;
  file: string;
  line: number;
  id: string;
  number?: string;
}
export const escapeHTML = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
// Keep offsets and newlines intact for source locations.
function uncomment(s: string) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      out += s[i] + s[++i];
      continue;
    }
    if (s[i] === "%") {
      while (i < s.length && s[i] !== "\n") {
        out += " ";
        i++;
      }
      if (i < s.length) out += "\n";
    } else out += s[i];
  }
  return out;
}
function group(
  s: string,
  start: number,
  open = "{",
  close = "}",
): { value: string; end: number } | undefined {
  let i = start;
  while (/\s/.test(s[i] || "")) i++;
  if (s[i] !== open) return;
  const begin = ++i;
  let depth = 1;
  for (; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === open) depth++;
    if (s[i] === close && --depth === 0)
      return { value: s.slice(begin, i), end: i + 1 };
  }
}
function args(s: string, start: number, count: number) {
  const values: string[] = [];
  let end = start;
  for (let n = 0; n < count; n++) {
    const g = group(s, end);
    if (!g) break;
    values.push(g.value);
    end = g.end;
  }
  return { values, end };
}
const HEADING: Record<string, number> = {
  part: 2,
  chapter: 2,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};
const FLOAT = /^(figure\*?|table\*?|tabular\*?|tabularx|longtable)$/;
const MATH = /^(equation\*?|align\*?|gather\*?|multline\*?|displaymath)$/;
const LIST = /^(itemize|enumerate|description)$/;
export function orderedSourceBlocks(source: Source): Block[] {
  const document = createLatexDocumentIndex(source.segments),
    text = uncomment(document.text),
    commands = scanLatexCommands(text);
  const begin = commands.find(
    (c) => c.name === "begin" && c.argument === "document",
  );
  const end = commands.find(
    (c) => c.name === "end" && c.argument === "document",
  );
  const start = begin?.end || 0,
    stop = end?.start ?? text.length;
  const blocks: Block[] = [];
  let cursor = start,
    active: any,
    stack: string[] = [];
  let figure = 0,
    table = 0,
    equation = 0,
    appendix = false,
    section = 0,
    subsection = 0;
  const add = (
    kind: string,
    a: number,
    b: number,
    argument?: string,
    number?: string,
  ) => {
    blocks.push({
      kind,
      start: a,
      end: b,
      raw: document.text.slice(a, b),
      argument,
      ...document.locate(a),
      id: "block-" + (blocks.length + 1),
      number,
    });
  };
  const abstract = commands.find(
    (c) => c.name === "abstract" && c.start < start && c.argument,
  );
  if (abstract)
    add("abstract", abstract.start, abstract.end, abstract.argument);
  for (const c of commands) {
    if (c.start < start || c.start >= stop) continue;
    if (c.name === "appendix") {
      appendix = true;
      figure = 0;
      section = 0;
    }
    if (active) {
      if (c.name === "begin") stack.push(c.argument || "");
      if (c.name === "end") {
        const idx = stack.lastIndexOf(c.argument || "");
        if (idx >= 0) stack.splice(idx);
        if (!stack.length) {
          add(active.kind, active.start, c.end, active.argument, active.number);
          cursor = c.end;
          active = undefined;
        }
      }
      continue;
    }
    if (HEADING[c.name] && c.argument !== undefined) {
      if (c.start > cursor) add("text", cursor, c.start);
      let number = "";
      if (!c.starred && c.name === "section") {
        section++;
        subsection = 0;
        number = appendix ? String.fromCharCode(64 + section) : String(section);
      }
      if (!c.starred && c.name === "subsection") {
        subsection++;
        number =
          (appendix ? String.fromCharCode(64 + section) : section) +
          "." +
          subsection;
      }
      add(c.name, c.start, c.end, c.argument, number);
      cursor = c.end;
    } else if (
      c.name === "begin" &&
      (FLOAT.test(c.argument || "") ||
        MATH.test(c.argument || "") ||
        LIST.test(c.argument || "") ||
        /^(abstract|mechanismbox|evidencebox|quote|verbatim|lstlisting|algorithm)$/.test(
          c.argument || "",
        ))
    ) {
      if (c.start > cursor) add("text", cursor, c.start);
      const kind = c.argument!;
      active = {
        kind,
        start: c.start,
        number: /^figure/.test(kind)
          ? (appendix ? "S" : "") + ++figure
          : /^(table|longtable)/.test(kind)
            ? String(++table)
            : MATH.test(kind) && !kind.endsWith("*")
              ? String(++equation)
              : undefined,
      };
      stack = [kind];
    }
  }
  if (active) add("text", active.start, stop);
  else if (cursor < stop) add("text", cursor, stop);
  return blocks;
}

export function sourceHTML(
  title: string,
  arxivID: string,
  source: Source,
  previews: Record<string, ImagePreview> = {},
) {
  const index = createLatexDocumentIndex(source.segments),
    clean = uncomment(index.text),
    blocks = orderedSourceBlocks(source);
  const macros = new Map<string, { count: number; body: string }>();
  for (const c of scanLatexCommands(clean)) {
    if (
      !/^(newcommand|renewcommand|DeclareRobustCommand|providecommand)$/.test(
        c.name,
      ) ||
      !c.argument
    )
      continue;
    let end = c.end;
    const opt = group(clean, end, "[", "]");
    if (opt) end = opt.end;
    const body = group(clean, end),
      name = c.argument.replace(/^\\/, "").trim(),
      count = Number(opt?.value || 0);
    if (
      body &&
      /^[A-Za-z]+$/.test(name) &&
      Number.isInteger(count) &&
      count >= 0 &&
      count <= 4
    )
      macros.set(name, { count, body: body.value });
  }
  const labels = new Map<string, { id: string; text: string }>();
  for (const b of blocks) {
    const next = blocks[blocks.indexOf(b) + 1];
    const target = HEADING[b.kind]
      ? b.raw +
        clean.slice(b.end, Math.min(next?.end ?? b.end + 300, b.end + 300))
      : b.raw;
    for (const c of scanLatexCommands(uncomment(target)))
      if (c.name === "label" && c.argument && !labels.has(c.argument))
        labels.set(c.argument, { id: b.id, text: b.number || c.argument });
  }
  const citationKeys: string[] = [];
  function collectCitations(text: string, depth = 0) {
    if (depth > 12) return;
    for (const command of scanLatexCommands(text)) {
      if (/^cite[pt]?$/.test(command.name) && command.argument) {
        for (const key of command.argument.split(",").map((k) => k.trim()))
          if (!citationKeys.includes(key)) citationKeys.push(key);
      } else if (command.argument)
        collectCitations(command.argument, depth + 1);
    }
  }
  collectCitations(clean);
  const math = (tex: string, display = false) =>
    renderToString(tex.replace(/\\label\s*\{[^}]*\}/g, ""), {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
      maxExpand: 1000,
      output: "htmlAndMathml",
    });
  let expandedCharacters = 0;
  function inline(raw: string, depth = 0): string {
    expandedCharacters += raw.length;
    if (expandedCharacters > 8 * 1024 * 1024)
      throw new Error("tex-reader-expansion-limit");
    if (depth > 18) return "<code>" + escapeHTML(raw) + "</code>";
    const s = uncomment(raw);
    let out = "";
    for (let i = 0; i < s.length; ) {
      if (s[i] === "$") {
        const delimiter = s[i + 1] === "$" ? "$$" : "$",
          begin = i + delimiter.length;
        let j = begin;
        for (; j < s.length; j++) {
          if (s[j] === "\\") {
            j++;
            continue;
          }
          if (s.startsWith(delimiter, j)) break;
        }
        if (j < s.length) {
          out += math(s.slice(begin, j), delimiter === "$$");
          i = j + delimiter.length;
          continue;
        }
      }
      if (s[i] === "\\") {
        if (s[i + 1] === "(" || s[i + 1] === "[") {
          const close = s[i + 1] === "(" ? "\\)" : "\\]",
            j = s.indexOf(close, i + 2);
          if (j >= 0) {
            out += math(s.slice(i + 2, j), s[i + 1] === "[");
            i = j + 2;
            continue;
          }
        }
        const m = /^\\([A-Za-z]+)\*?/.exec(s.slice(i));
        if (!m) {
          const c = s[i + 1] || "";
          out +=
            c === "\\"
              ? "<br>"
              : /[,%_&#$ {}]/.test(c)
                ? escapeHTML(c)
                : c === ";" || c === "!"
                  ? " "
                  : escapeHTML(c);
          i += 2;
          continue;
        }
        const name = m[1];
        i += m[0].length;
        const opt = group(s, i, "[", "]");
        if (opt) i = opt.end;
        const first = group(s, i),
          text = (v: string) => inline(v, depth + 1);
        if (
          /^(ref|eqref|figref|Figref|tabref|secref|autoref|cref|Cref|vref)$/.test(
            name,
          ) &&
          first
        ) {
          out += first.value
            .split(",")
            .map((key) => {
              key = key.trim();
              const l = labels.get(key),
                prefix = /fig/i.test(name)
                  ? "Fig. "
                  : name === "tabref"
                    ? "Table "
                    : name === "secref"
                      ? "Section "
                      : "";
              return l
                ? '<a class="reference" href="#' +
                    l.id +
                    '">' +
                    prefix +
                    escapeHTML(name === "eqref" ? "(" + l.text + ")" : l.text) +
                    "</a>"
                : escapeHTML(prefix + key);
            })
            .join(", ");
          i = first.end;
          continue;
        }
        if (/^cite[pt]?|^citeauthor$|^citeyear$/.test(name) && first) {
          out +=
            '<span class="citation">[' +
            first.value
              .split(",")
              .map((key) => {
                key = key.trim();
                if (!citationKeys.includes(key)) citationKeys.push(key);
                return (
                  '<a href="#citation-' +
                  (citationKeys.indexOf(key) + 1) +
                  '">' +
                  (citationKeys.indexOf(key) + 1) +
                  "</a>"
                );
              })
              .join(", ") +
            "]</span>";
          i = first.end;
          continue;
        }
        if (
          /^(label|index|bibliographystyle|setcitestyle|vspace|hspace|color|rowcolor|cellcolor|arrayrulecolor|fontfamily|fontsize|setcounter|setlength|renewcommand|newcommand|DeclareRobustCommand|providecommand|addtocounter|enlargethispage|rule|cline|cmidrule)$/.test(
            name,
          )
        ) {
          const count =
            /^(setcounter|setlength|renewcommand|newcommand|DeclareRobustCommand|providecommand|addtocounter|fontsize|rule)$/.test(
              name,
            )
              ? 2
              : 1;
          const a = args(s, i, count);
          i = a.end;
          continue;
        }
        if (
          /^(maketitle|centering|raggedright|raggedleft|arraybackslash|small|footnotesize|scriptsize|tiny|normalsize|large|Large|selectfont|scshape|normalfont|bfseries|itshape|sffamily|begingroup|endgroup|clearpage|newpage|FloatBarrier|appendix|toprule|midrule|bottomrule|hline|noindent)$/.test(
            name,
          )
        )
          continue;
        if (name === "par") {
          out += "\n\n";
          continue;
        }
        if (name === "newline" || name === "linebreak") {
          out += "<br>";
          continue;
        }
        if (name === "LaTeX" || name === "TeX") {
          out += name;
          continue;
        }
        if (name === "cmark" || name === "xmark") {
          out += name === "cmark" ? "✓" : "✗";
          continue;
        }
        if (name === "ding" && first) {
          out +=
            first.value === "51"
              ? "✓"
              : first.value === "55"
                ? "✗"
                : escapeHTML(first.value);
          i = first.end;
          continue;
        }
        if (
          /^(textbf|mathbf|emph|textit|texttt|tool|textsf|textnormal|textrm|textsc|text|mbox|underline|shortstack)$/.test(
            name,
          ) &&
          first
        ) {
          const tag = /^(textbf|mathbf)$/.test(name)
            ? "strong"
            : /^(emph|textit)$/.test(name)
              ? "em"
              : /^(texttt|tool)$/.test(name)
                ? "code"
                : "span";
          out += "<" + tag + ">" + text(first.value) + "</" + tag + ">";
          i = first.end;
          continue;
        }
        if ((name === "textcolor" || name === "colorbox") && first) {
          const second = group(s, first.end);
          if (second) {
            out += text(second.value);
            i = second.end;
            continue;
          }
        }
        if (name === "href" && first) {
          const second = group(s, first.end);
          if (second) {
            out += /^https?:\/\/|^mailto:/i.test(first.value)
              ? '<a href="' +
                escapeHTML(first.value) +
                '">' +
                text(second.value) +
                "</a>"
              : text(second.value);
            i = second.end;
            continue;
          }
        }
        if ((name === "url" || name === "path") && first) {
          out += "<code>" + escapeHTML(first.value) + "</code>";
          i = first.end;
          continue;
        }
        if ((name === "footnote" || name === "footnotetext") && first) {
          out +=
            '<small class="footnote"> (' + text(first.value) + ") </small>";
          i = first.end;
          continue;
        }
        if ((name === "begin" || name === "end") && first) {
          i = first.end;
          continue;
        }
        if (name === "multicolumn" || name === "multirow") {
          const a = args(s, i, 3);
          if (a.values.length === 3) {
            out += text(a.values[2]);
            i = a.end;
            continue;
          }
        }
        const macro = macros.get(name);
        if (macro) {
          const a = args(s, i, macro.count);
          if (a.values.length === macro.count) {
            out += text(
              macro.body.replace(
                /#([1-4])/g,
                (_, n) => a.values[Number(n) - 1] || "",
              ),
            );
            i = a.end;
            if (!macro.count) {
              const empty = group(s, i);
              if (empty?.value === "") i = empty.end;
            }
            continue;
          }
        }
        if (name === "bibliography" && first) {
          out +=
            '<span class="bibliography-source">References: ' +
            escapeHTML(first.value) +
            "</span>";
          i = first.end;
          continue;
        }
        // Unknown commands remain visible, so unsupported content is never silently discarded.
        out +=
          '<code class="unsupported">' + escapeHTML("\\" + name) + "</code>";
        continue;
      }
      const c = s[i++];
      if (c === "{" || c === "}") continue;
      out += c === "~" ? " " : escapeHTML(c);
    }
    return out
      .replace(/``/g, "“")
      .replace(/''/g, "”")
      .replace(/---/g, "—")
      .replace(/--/g, "–");
  }
  function paragraphs(raw: string) {
    return uncomment(raw)
      .split(/\n\s*\n/)
      .map((p) => inline(p).trim())
      .filter((p) => p.replace(/<[^>]*>/g, "").trim())
      .map((p) => "<p>" + p.replace(/\s*\n\s*/g, " ") + "</p>")
      .join("");
  }
  const sourceDetails = (raw: string, file: string, line: number) =>
    '<details class="source-details"><summary>TeX · ' +
    escapeHTML(file) +
    ":" +
    line +
    "</summary><pre>" +
    escapeHTML(raw.trim()) +
    "</pre></details>";
  const byPath = new Map(source.files.map((f) => [f.path, f.bytes]));
  function image(path: string) {
    const bytes = byPath.get(path);
    if (!bytes)
      return '<p class="notice">Missing image: ' + escapeHTML(path) + "</p>";
    const mime = imageMime(path),
      original = bytesDataURL(bytes, mime),
      data =
        mime === "application/pdf"
          ? previews[path]?.dataURL
          : /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(mime)
            ? original
            : undefined;
    return (
      '<div class="figure-image">' +
      (data &&
      /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(
        data,
      )
        ? '<img loading="lazy" alt="' +
          escapeHTML(path) +
          '" src="' +
          data +
          '">'
        : '<p class="notice">图片预览未生成：' +
          escapeHTML(previews[path]?.error || path) +
          "</p>") +
      '<details class="asset-details"><summary>原图</summary><a download="' +
      escapeHTML(path.split("/").pop()!) +
      '" href="' +
      original +
      '">' +
      escapeHTML(path) +
      "</a></details></div>"
    );
  }
  function table(raw: string) {
    const text = uncomment(raw),
      commands = scanLatexCommands(text),
      begin = commands.find(
        (c) =>
          c.name === "begin" &&
          /^(tabular\*?|tabularx|longtable)$/.test(c.argument || ""),
      );
    if (!begin) return "<pre>" + escapeHTML(raw) + "</pre>";
    const stop = commands.find(
      (c) =>
        c.start > begin.end &&
        c.name === "end" &&
        c.argument === begin.argument,
    );
    if (!stop) return "<pre>" + escapeHTML(raw) + "</pre>";
    const params = args(
      text,
      begin.end,
      /^(tabularx|tabular\*)$/.test(begin.argument!) ? 2 : 1,
    );
    if (!params.values.length) return "<pre>" + escapeHTML(raw) + "</pre>";
    const content = text
      .slice(params.end, stop.start)
      .replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g, "")
      .replace(/\\(?:cmidrule|cline)(?:\([^)]*\))?\{[^}]*\}/g, "")
      .replace(/\\addlinespace(?:\[[^\]]*\])?/g, "");
    const rows: string[][] = [];
    let cells: string[] = [],
      cell = "",
      depth = 0,
      mathMode = false;
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (c === "\\") {
        if (content[i + 1] === "\\" && depth === 0 && !mathMode) {
          cells.push(cell);
          rows.push(cells);
          cells = [];
          cell = "";
          i++;
          const optional = group(content, i + 1, "[", "]");
          if (optional) i = optional.end - 1;
          continue;
        }
        cell += c;
        if (/[%&#${}]/.test(content[i + 1] || "")) cell += content[++i];
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") depth--;
      if (c === "$") mathMode = !mathMode;
      if (c === "&" && depth === 0 && !mathMode) {
        cells.push(cell);
        cell = "";
      } else cell += c;
    }
    if (cell.trim() || cells.length) {
      cells.push(cell);
      rows.push(cells);
    }
    const occupied: number[] = [];
    const htmlRows = rows
      .filter((row) => row.some((c) => c.trim()))
      .map((row) => {
        let col = 0;
        const active = occupied.map((n) => n > 0);
        for (let i = 0; i < occupied.length; i++)
          if (occupied[i]) occupied[i]--;
        const tds = row
          .map((rawCell) => {
            let text = rawCell
              .trim()
              .replace(/\\rowcolor(?:\[[^\]]*\])?\{[^}]*\}/g, "")
              .trim();
            if (active[col] && !text) {
              col++;
              return "";
            }
            while (active[col]) col++;
            let colspan = 1,
              rowspan = 1;
            const span = /^\\(multicolumn|multirow)(?:\[[^\]]*\])?/.exec(text);
            if (span) {
              const a = args(text, span[0].length, 3);
              if (a.values.length === 3) {
                const count = Number(a.values[0]);
                if (Number.isInteger(count) && count > 0 && count <= 100) {
                  if (span[1] === "multicolumn") colspan = count;
                  else rowspan = count;
                  text = a.values[2] + text.slice(a.end);
                }
              }
            }
            if (rowspan > 1)
              for (let c = col; c < col + colspan; c++)
                occupied[c] = rowspan - 1;
            col += colspan;
            return (
              "<td" +
              (colspan > 1 ? ' colspan="' + colspan + '"' : "") +
              (rowspan > 1 ? ' rowspan="' + rowspan + '"' : "") +
              ">" +
              inline(text) +
              "</td>"
            );
          })
          .join("");
        return (
          "<tr" +
          (row.some((c) => /\\rowcolor/.test(c)) ? ' class="tinted"' : "") +
          ">" +
          tds +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="table-scroll"><table><tbody>' +
      htmlRows +
      "</tbody></table></div>"
    );
  }
  const toc: string[] = [];
  const body = blocks
    .map((b) => {
      const text = uncomment(b.raw),
        caption =
          scanLatexCommands(text).find((c) => c.name === "caption")?.argument ||
          "";
      if (HEADING[b.kind]) {
        const content = inline(b.argument || ""),
          number = b.number ? escapeHTML(b.number) + " " : "";
        toc.push('<a href="#' + b.id + '">' + number + content + "</a>");
        return (
          "<h" +
          HEADING[b.kind] +
          ' id="' +
          b.id +
          '">' +
          number +
          content +
          "</h" +
          HEADING[b.kind] +
          ">"
        );
      }
      if (b.kind === "abstract")
        return (
          '<section class="abstract" id="' +
          b.id +
          '"><h2>Abstract</h2>' +
          paragraphs(
            b.argument ??
              text.replace(/^\\begin\{abstract\}|\\end\{abstract\}$/g, ""),
          ) +
          "</section>"
        );
      if (/^figure/.test(b.kind)) {
        const figure = source.figures.find(
          (f) => f.file === b.file && f.line === b.line,
        );
        return (
          '<figure class="source-figure" id="' +
          b.id +
          '" data-file="' +
          escapeHTML(b.file) +
          '">' +
          (figure?.images
            .map((i) =>
              i.path
                ? image(i.path)
                : '<p class="notice">Missing image: ' +
                  escapeHTML(i.requested) +
                  "</p>",
            )
            .join("") || "<pre>" + escapeHTML(b.raw) + "</pre>") +
          "<figcaption><strong>Figure " +
          b.number +
          ". </strong>" +
          inline(caption) +
          "</figcaption>" +
          sourceDetails(b.raw, b.file, b.line) +
          "</figure>"
        );
      }
      if (/^(table|tabular|longtable)/.test(b.kind))
        return (
          '<figure class="source-table" id="' +
          b.id +
          '" data-file="' +
          escapeHTML(b.file) +
          '"><figcaption><strong>Table ' +
          (b.number || "") +
          ". </strong>" +
          inline(caption) +
          "</figcaption>" +
          table(b.raw) +
          sourceDetails(b.raw, b.file, b.line) +
          "</figure>"
        );
      if (MATH.test(b.kind)) {
        const tex = text
          .replace(/^\\begin\{[^}]+\}/, "")
          .replace(/\\end\{[^}]+\}\s*$/, "");
        return (
          '<div class="equation" id="' +
          b.id +
          '">' +
          math(tex, true) +
          (b.number
            ? '<span class="equation-number">(' + b.number + ")</span>"
            : "") +
          "</div>"
        );
      }
      if (LIST.test(b.kind)) {
        const content = text
          .replace(/^\\begin\{[^}]+\}/, "")
          .replace(/\\end\{[^}]+\}\s*$/, "");
        const items = scanLatexCommands(content).filter(
            (c) => c.name === "item",
          ),
          tag = b.kind === "enumerate" ? "ol" : "ul";
        return (
          "<" +
          tag +
          ' id="' +
          b.id +
          '">' +
          items
            .map(
              (c, i) =>
                "<li>" +
                paragraphs(content.slice(c.end, items[i + 1]?.start)) +
                "</li>",
            )
            .join("") +
          "</" +
          tag +
          ">"
        );
      }
      if (b.kind === "text") return paragraphs(b.raw);
      return (
        '<section class="source-environment" id="' +
        b.id +
        '">' +
        paragraphs(text) +
        "</section>"
      );
    })
    .join("\n");
  const css = `body{margin:0;background:#f6f7f8;color:#20262c;font:17px/1.75 Georgia,"Times New Roman",serif}header,main{max-width:1080px;margin:auto;padding:24px 34px;background:white}header{padding-top:42px;border-bottom:1px solid #dfe4e8}h1,h2,h3,h4,h5,summary,nav{font-family:system-ui,sans-serif}h1{font-size:29px;line-height:1.3;margin:0 0 15px}h2{font-size:25px}h3{font-size:21px}h4{font-size:19px}h5{font-size:17px;margin-bottom:8px}h2,h3,h4{margin:32px 0 14px;scroll-margin-top:20px}p{margin:12px 0}main>p,.abstract,.equation,main>ul,main>ol{max-width:85ch}a{color:#086d81;text-decoration:none}a:hover{text-decoration:underline}.meta,.source-details,.asset-details{font:12px/1.6 system-ui;color:#64727e}.meta{font-size:14px}nav{display:grid;gap:6px;font-size:14px;padding:12px 0;max-height:300px;overflow:auto}.source-figure,.source-table{margin:28px 0;padding:18px 0;border-top:1px solid #dce5e8;border-bottom:1px solid #dce5e8}.figure-image img{display:block;max-width:100%;height:auto;margin:auto}figcaption{font-size:15px;line-height:1.65;margin:12px 0}.table-scroll{overflow:auto;margin:14px 0}table{border-collapse:collapse;font-size:13px;line-height:1.5;width:100%}td{padding:7px 9px;border-bottom:1px solid #dce4e7;vertical-align:top}tr:first-child{border-top:2px solid #476978}.tinted{background:#edf6f5}tr:last-child{border-bottom:2px solid #476978}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f7f9;padding:14px;font:13px/1.65 monospace}code{font:0.88em/1.5 monospace;overflow-wrap:anywhere}.unsupported{color:#8a4521}.equation{overflow:auto;margin:22px 0;display:flex;align-items:center;justify-content:center;gap:20px}.equation-number{margin-left:auto}.source-details{margin-top:12px}.source-details summary,.asset-details summary{cursor:pointer}.asset-details{margin:6px 0}.citation{font-size:.85em}.notice{padding:10px;background:#fff6dc}.footnote{color:#586573}.abstract{border-left:3px solid #147d86;padding-left:18px}.source-environment{padding:14px 20px;background:#f1f6f6;margin:20px 0}footer{max-width:1080px;margin:auto;padding:20px 34px;background:white;font:13px/1.6 system-ui}.katex-display{margin:0.7em 0}.katex{font-size:1.06em}@media(max-width:650px){header,main,footer{padding:20px 16px}h1{font-size:23px}}`;
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; font-src data:; style-src \'unsafe-inline\'; base-uri \'none\'"><title>' +
    escapeHTML(title) +
    "</title><style>" +
    mathCSS +
    css +
    "</style></head><body><header><h1>" +
    escapeHTML(title) +
    '</h1><p class="meta">arXiv ' +
    escapeHTML(arxivID) +
    " · TeX 阅读版 · 图表随正文排列</p><details><summary>Contents / 目录</summary><nav>" +
    toc.join("") +
    "</nav></details></header><main>" +
    body +
    "</main><footer><details><summary>Citation keys / 引文对应</summary><ol>" +
    citationKeys
      .map(
        (k, i) =>
          '<li id="citation-' + (i + 1) + '">' + escapeHTML(k) + "</li>",
      )
      .join("") +
    "</ol></details></footer></body></html>"
  );
}
