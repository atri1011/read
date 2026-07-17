import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  applyFindMarks,
  clearFindMarks,
  findQueryRanges,
  normalizeFindQuery,
} from "@/lib/reader/find-in-page";

function mount(html: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  // vitest node env: attach minimal globals used by helper
  Object.assign(globalThis, {
    document: dom.window.document,
    NodeFilter: dom.window.NodeFilter,
    CSS: { escape: (s: string) => s },
  });
  return dom.window.document.body.firstElementChild as HTMLElement;
}

describe("normalizeFindQuery", () => {
  it("trims", () => {
    expect(normalizeFindQuery("  Hello ")).toBe("Hello");
  });
});

describe("findQueryRanges", () => {
  it("finds case-insensitive matches across nodes", () => {
    const root = mount("<div><p>Hello <em>World</em> again hello</p></div>");
    const ranges = findQueryRanges(root, "hello");
    expect(ranges.length).toBe(2);
  });
});

describe("applyFindMarks", () => {
  it("wraps matches and clears them", () => {
    const root = mount("<div><p>alpha beta alpha</p></div>");
    const count = applyFindMarks(root, "alpha", 0);
    expect(count).toBe(2);
    expect(root.querySelectorAll("span.reader-find-mark").length).toBe(2);
    expect(
      root.querySelectorAll("span.reader-find-mark-active").length,
    ).toBe(1);
    clearFindMarks(root);
    expect(root.querySelectorAll("span.reader-find-mark").length).toBe(0);
    expect(root.textContent).toContain("alpha beta alpha");
  });
});
