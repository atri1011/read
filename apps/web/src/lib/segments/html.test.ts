import { describe, expect, it } from "vitest";
import { segmentsToHtml } from "@/lib/segments/html";

describe("segmentsToHtml", () => {
  it("builds pair structure with block and segment ids", () => {
    const html = segmentsToHtml([
      {
        id: "s-0",
        source: "Hello world.",
        target: "你好，世界。",
        origin: "generated",
      },
    ]);
    expect(html).toContain('class="bilingual-pair"');
    expect(html).toContain('data-segment-id="s-0"');
    expect(html).toContain('data-block-id="b-0"');
    expect(html).toContain('class="bilingual-source"');
    expect(html).toContain('class="bilingual-target"');
    expect(html).toContain('data-masked="true"');
    expect(html).toContain("Hello world.");
    expect(html).toContain("你好，世界。");
  });

  it("escapes HTML in source and target", () => {
    const html = segmentsToHtml([
      {
        id: "s-0",
        source: '<script>alert(1)</script>',
        target: "<b>x</b>",
        origin: "edited",
      },
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("omits empty targets", () => {
    const html = segmentsToHtml([
      {
        id: "s-1",
        source: "Only English.",
        target: "  ",
        origin: "generated",
      },
    ]);
    expect(html).toContain("Only English.");
    expect(html).not.toContain("bilingual-target");
  });

  it("assigns sequential block ids and skips blank sources", () => {
    const html = segmentsToHtml([
      { id: "s-0", source: "A.", target: "甲。", origin: "extracted" },
      { id: "s-1", source: "   ", target: "空", origin: "edited" },
      { id: "s-2", source: "B.", target: "乙。", origin: "extracted" },
    ]);
    expect(html).toContain('data-block-id="b-0"');
    expect(html).toContain('data-block-id="b-1"');
    expect(html).not.toContain('data-segment-id="s-1"');
  });
});
