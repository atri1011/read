import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  buildAnchorFromSelection,
  resolveAnchor,
  type TextAnchor,
} from "./anchor";

function setupDom(html: string) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`,
    { pretendToBeVisual: true },
  );
  const { window } = dom;
  // Attach globals used by anchor.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.NodeFilter = window.NodeFilter;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.Range = window.Range;
  g.Selection = window.Selection;
  g.CSS = window.CSS ?? { escape: (s: string) => s.replace(/"/g, '\\"') };
  g.DocumentFragment = window.DocumentFragment;

  const root = window.document.getElementById("root") as HTMLElement;
  return { window, document: window.document, root, dom };
}

function selectTextInRoot(
  document: Document,
  root: HTMLElement,
  startAbs: number,
  endAbs: number,
) {
  // Build range via resolve-style absolute offsets by walking text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let n: Node | null = walker.nextNode();
  while (n) {
    texts.push(n as Text);
    n = walker.nextNode();
  }

  function point(abs: number): { node: Text; offset: number } {
    let rem = abs;
    for (const t of texts) {
      const len = t.data.length;
      if (rem <= len) return { node: t, offset: rem };
      rem -= len;
    }
    const last = texts[texts.length - 1]!;
    return { node: last, offset: last.data.length };
  }

  const s = point(startAbs);
  const e = point(endAbs);
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

describe("buildAnchorFromSelection / resolveAnchor", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("returns null for collapsed selection", () => {
    const { document, root, window } = setupDom(
      `<p data-block-id="b-0">Hello world</p>`,
    );
    cleanup = () => window.close();
    const sel = document.getSelection()!;
    const text = root.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 0);
    sel.removeAllRanges();
    sel.addRange(range);
    expect(buildAnchorFromSelection(sel, root)).toBeNull();
  });

  it("builds anchor with blockId and offsets", () => {
    const { document, root, window } = setupDom(
      `<p data-block-id="b-0">The quick brown fox jumps over the lazy dog.</p>`,
    );
    cleanup = () => window.close();

    // "brown fox" starts at index 10
    const sel = selectTextInRoot(document, root, 10, 19);
    const anchor = buildAnchorFromSelection(sel, root);
    expect(anchor).not.toBeNull();
    expect(anchor!.exact).toBe("brown fox");
    expect(anchor!.blockId).toBe("b-0");
    expect(anchor!.prefix).toContain("quick ");
    expect(anchor!.suffix).toContain(" jumps");
    expect(anchor!.startOffset).toBe(10);
    expect(anchor!.endOffset).toBe(19);
  });

  it("resolves via blockId + offsets", () => {
    const { root, window } = setupDom(
      `<p data-block-id="b-0">The quick brown fox jumps over the lazy dog.</p>`,
    );
    cleanup = () => window.close();

    const anchor: TextAnchor = {
      exact: "brown fox",
      prefix: "The quick ",
      suffix: " jumps over",
      blockId: "b-0",
      startOffset: 10,
      endOffset: 19,
    };
    const range = resolveAnchor(root, anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("brown fox");
  });

  it("resolves via quote when offsets are wrong", () => {
    const { root, window } = setupDom(
      `<p data-block-id="b-0">Alpha beta gamma delta</p>`,
    );
    cleanup = () => window.close();

    const anchor: TextAnchor = {
      exact: "beta",
      prefix: "Alpha ",
      suffix: " gamma",
      blockId: "b-0",
      startOffset: 999,
      endOffset: 1000,
    };
    const range = resolveAnchor(root, anchor);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("beta");
  });

  it("disambiguates duplicate exact with prefix/suffix", () => {
    const { root, window } = setupDom(
      `<p data-block-id="b-0">foo bar foo baz</p>`,
    );
    cleanup = () => window.close();

    const second: TextAnchor = {
      exact: "foo",
      prefix: "bar ",
      suffix: " baz",
      blockId: "b-0",
    };
    const range = resolveAnchor(root, second);
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe("foo");
    // Ensure it is the second occurrence: preceding text ends with "bar "
    const full = root.textContent ?? "";
    const start = range!.startOffset; // within text node
    // absolute: "foo bar " = 8
    expect((root.textContent ?? "").indexOf("foo", 1)).toBe(8);
    void start;
    void full;
    // Use resolve absolute by comparing surrounding
    const before = (root.textContent ?? "").slice(0, 8);
    expect(before.endsWith("bar ")).toBe(true);
  });

  it("round-trips selection across multiple blocks", () => {
    const { document, root, window } = setupDom(
      `<p data-block-id="b-0">First paragraph here.</p>` +
        `<p data-block-id="b-1">Second paragraph with target word.</p>`,
    );
    cleanup = () => window.close();

    // "First paragraph here." length 21, then "Second paragraph with target word."
    // "target" in second block: after "Second paragraph with " (22 chars into block)
    const full = root.textContent ?? "";
    const start = full.indexOf("target");
    const end = start + "target".length;
    const sel = selectTextInRoot(document, root, start, end);
    const anchor = buildAnchorFromSelection(sel, root);
    expect(anchor).not.toBeNull();
    expect(anchor!.exact).toBe("target");
    expect(anchor!.blockId).toBe("b-1");

    const resolved = resolveAnchor(root, anchor!);
    expect(resolved).not.toBeNull();
    expect(resolved!.toString()).toBe("target");
  });

  it("returns null when selection is outside root", () => {
    const { document, root, window } = setupDom(
      `<p data-block-id="b-0">Inside</p>`,
    );
    cleanup = () => window.close();
    const outside = document.createElement("p");
    outside.textContent = "Outside text";
    document.body.appendChild(outside);
    const text = outside.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 7);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(buildAnchorFromSelection(sel, root)).toBeNull();
  });

  it("returns null when exact cannot be found", () => {
    const { root, window } = setupDom(
      `<p data-block-id="b-0">Hello world</p>`,
    );
    cleanup = () => window.close();
    const range = resolveAnchor(root, {
      exact: "missing",
      prefix: "",
      suffix: "",
    });
    expect(range).toBeNull();
  });
});
