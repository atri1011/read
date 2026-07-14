import { describe, expect, it } from "vitest";
import { segmentsToMarkdown } from "@/lib/segments/markdown";

describe("segmentsToMarkdown", () => {
  it("joins sources with blank lines", () => {
    const md = segmentsToMarkdown([
      { id: "s-0", source: "One.", target: "一。", origin: "generated" },
      { id: "s-1", source: "Two.", target: "二。", origin: "generated" },
    ]);
    expect(md).toBe("One.\n\nTwo.\n");
  });

  it("skips empty sources", () => {
    const md = segmentsToMarkdown([
      { id: "s-0", source: "", target: "x", origin: "edited" },
      { id: "s-1", source: "Keep.", target: "", origin: "generated" },
    ]);
    expect(md).toBe("Keep.\n");
  });
});
