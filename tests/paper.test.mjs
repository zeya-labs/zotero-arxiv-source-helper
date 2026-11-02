import { test } from "node:test";
import assert from "node:assert/strict";
import { paperHTML } from "../build/core.mjs";
test("paper HTML preserves ordered full-page PNGs without a separate figure or table gallery", () => {
  const pages = [1, 2].map((number) => ({
    number,
    width: 1200,
    height: 1600,
    dataURL:
      "data:image/png;base64," +
      Buffer.from("page-" + number).toString("base64"),
  }));
  const html = paperHTML("<script>title</script>", "2401.12345v1", pages);
  assert.ok(html.indexOf('id="page-1"') < html.indexOf('id="page-2"'));
  assert.equal((html.match(/<img /g) || []).length, 2);
  assert.ok(html.includes(pages[0].dataURL) && html.includes(pages[1].dataURL));
  assert.ok(!html.includes('id="figures"') && !html.includes('id="tables"'));
  assert.ok(!html.includes("<script>title"));
  assert.ok(html.includes("&lt;script&gt;title"));
  assert.throws(
    () =>
      paperHTML("title", "id", [{ ...pages[0], dataURL: "javascript:bad" }]),
    /invalid-page/,
  );
});
