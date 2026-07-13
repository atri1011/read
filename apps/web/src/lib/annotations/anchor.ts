/**
 * Text Quote Selector anchors (Readability / W3C-style) for document annotations.
 * Prefer data-block-id + offsets; fall back to prefix/exact/suffix search.
 */

export type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
};

const CONTEXT_LEN = 32;

type TextPoint = { node: Text; offset: number };

/** Collect text nodes under root in document order. */
function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function fullText(root: Node): string {
  return collectTextNodes(root)
    .map((t) => t.data ?? "")
    .join("");
}

/**
 * Absolute character offset of a Range boundary within root's concatenated text.
 * Handles Text nodes and Element boundaries (child index).
 */
function absoluteOffset(root: Node, node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const texts = collectTextNodes(root);
    let acc = 0;
    for (const t of texts) {
      if (t === node) {
        if (offset < 0 || offset > (t.data?.length ?? 0)) return null;
        return acc + offset;
      }
      acc += t.data?.length ?? 0;
    }
    return null;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    // offset = index among childNodes: position is start of childNodes[offset]
    // or end of element if offset === childNodes.length
    if (offset < 0 || offset > el.childNodes.length) return null;

    if (offset < el.childNodes.length) {
      const child = el.childNodes[offset]!;
      if (child.nodeType === Node.TEXT_NODE) {
        return absoluteOffset(root, child, 0);
      }
      const first = collectTextNodes(child)[0];
      if (first) return absoluteOffset(root, first, 0);
      // empty element: find next text after this child, or position after previous
      return absoluteOffsetBeforeNode(root, child);
    }

    // end of element
    const textsInEl = collectTextNodes(el);
    if (textsInEl.length === 0) {
      return absoluteOffsetBeforeNode(root, el) +
        // if el has no text, treat as position just after previous content
        0;
    }
    const last = textsInEl[textsInEl.length - 1]!;
    return absoluteOffset(root, last, last.data?.length ?? 0);
  }

  return null;
}

function absoluteOffsetBeforeNode(root: Node, node: Node): number {
  const texts = collectTextNodes(root);
  let acc = 0;
  for (const t of texts) {
    // If t is the node or follows node → we've reached the insert point
    const pos = node.compareDocumentPosition(t);
    if (node === t || pos & Node.DOCUMENT_POSITION_FOLLOWING) {
      return acc;
    }
    acc += t.data?.length ?? 0;
  }
  return acc;
}

/** Map absolute offset → text node + local offset within root. */
function pointFromAbsolute(root: Node, abs: number): TextPoint | null {
  if (abs < 0) return null;
  const texts = collectTextNodes(root);
  let remaining = abs;
  for (const t of texts) {
    const len = t.data?.length ?? 0;
    if (remaining <= len) {
      return { node: t, offset: remaining };
    }
    remaining -= len;
  }
  if (remaining === 0 && texts.length > 0) {
    const last = texts[texts.length - 1]!;
    return { node: last, offset: last.data?.length ?? 0 };
  }
  return null;
}

function nearestBlockId(node: Node, root: HTMLElement): string | undefined {
  let cur: Node | null =
    node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  while (cur && cur !== root.parentNode) {
    if (cur instanceof HTMLElement) {
      const id = cur.getAttribute("data-block-id");
      if (id) return id;
    }
    if (cur === root) break;
    cur = cur.parentNode;
  }
  return undefined;
}

function findBlockElement(
  root: HTMLElement,
  blockId: string,
): HTMLElement | null {
  if (root.getAttribute("data-block-id") === blockId) return root;
  const escape =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape
      : (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return root.querySelector(`[data-block-id="${escape(blockId)}"]`);
}

function rangeWithinRoot(range: Range, root: HTMLElement): boolean {
  try {
    const rootRange = document.createRange();
    rootRange.selectNodeContents(root);
    return (
      rootRange.compareBoundaryPoints(Range.START_TO_START, range) <= 0 &&
      rootRange.compareBoundaryPoints(Range.END_TO_END, range) >= 0
    );
  } catch {
    return false;
  }
}

function blockTextStartAbs(root: HTMLElement, blockEl: HTMLElement): number {
  const first = collectTextNodes(blockEl)[0];
  if (!first) return absoluteOffsetBeforeNode(root, blockEl);
  return absoluteOffset(root, first, 0) ?? 0;
}

/**
 * Build a TextAnchor from the current Selection relative to `root`.
 * Returns null if selection is collapsed, empty, or outside root.
 */
export function buildAnchorFromSelection(
  sel: Selection,
  root: HTMLElement,
): TextAnchor | null {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!range || range.collapsed) return null;
  if (!root.contains(range.commonAncestorContainer)) return null;
  if (!rangeWithinRoot(range, root)) return null;

  const exact = range.toString();
  if (!exact) return null;

  const docText = fullText(root);
  const startAbs = absoluteOffset(
    root,
    range.startContainer,
    range.startOffset,
  );
  const endAbs = absoluteOffset(root, range.endContainer, range.endOffset);
  if (startAbs == null || endAbs == null || endAbs < startAbs) return null;

  const prefix = docText.slice(Math.max(0, startAbs - CONTEXT_LEN), startAbs);
  const suffix = docText.slice(
    endAbs,
    Math.min(docText.length, endAbs + CONTEXT_LEN),
  );

  const blockId = nearestBlockId(range.startContainer, root);
  let startOffset: number | undefined;
  let endOffset: number | undefined;

  if (blockId) {
    const blockEl = findBlockElement(root, blockId);
    if (blockEl) {
      const blockStart = blockTextStartAbs(root, blockEl);
      const so = startAbs - blockStart;
      const eo = endAbs - blockStart;
      if (so >= 0 && eo >= so) {
        startOffset = so;
        endOffset = eo;
      }
    }
  }

  return {
    exact,
    prefix,
    suffix,
    ...(blockId ? { blockId } : {}),
    ...(startOffset !== undefined ? { startOffset, endOffset } : {}),
  };
}

function rangeFromOffsets(
  scope: HTMLElement,
  startOffset: number,
  endOffset: number,
): Range | null {
  const start = pointFromAbsolute(scope, startOffset);
  const end = pointFromAbsolute(scope, endOffset);
  if (!start || !end) return null;
  try {
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    if (range.collapsed && startOffset !== endOffset) return null;
    return range;
  } catch {
    return null;
  }
}

/**
 * Find absolute index of `exact` using prefix/suffix disambiguation.
 * Returns start index or -1.
 */
function findQuoteIndex(
  haystack: string,
  exact: string,
  prefix: string,
  suffix: string,
): number {
  if (!exact) return -1;

  if (prefix || suffix) {
    const needle = prefix + exact + suffix;
    const idx = haystack.indexOf(needle);
    if (idx !== -1) return idx + prefix.length;

    let from = 0;
    let soft = -1;
    while (from <= haystack.length) {
      const i = haystack.indexOf(exact, from);
      if (i === -1) break;
      const pre = haystack.slice(Math.max(0, i - prefix.length), i);
      const suf = haystack.slice(
        i + exact.length,
        i + exact.length + suffix.length,
      );
      if ((!prefix || pre.endsWith(prefix)) && (!suffix || suf.startsWith(suffix))) {
        return i;
      }
      if (
        (!prefix || pre.endsWith(prefix) || prefix.endsWith(pre)) &&
        (!suffix || suf.startsWith(suffix) || suffix.startsWith(suf))
      ) {
        if (soft === -1) soft = i;
      }
      from = i + 1;
    }
    if (soft !== -1) return soft;
  }

  return haystack.indexOf(exact);
}

/**
 * Resolve a TextAnchor back to a DOM Range within `root`.
 * Strategy: blockId + offsets → block quote → root quote.
 */
export function resolveAnchor(
  root: HTMLElement,
  anchor: TextAnchor,
): Range | null {
  if (!anchor?.exact) return null;

  const normalize = (s: string) => s.replace(/\s+/g, " ");

  // 1) blockId + offsets
  if (
    anchor.blockId &&
    typeof anchor.startOffset === "number" &&
    typeof anchor.endOffset === "number"
  ) {
    const block = findBlockElement(root, anchor.blockId);
    if (block) {
      const byOffset = rangeFromOffsets(
        block,
        anchor.startOffset,
        anchor.endOffset,
      );
      if (byOffset) {
        const text = byOffset.toString();
        if (
          text === anchor.exact ||
          normalize(text) === normalize(anchor.exact)
        ) {
          return byOffset;
        }
      }
    }
  }

  // 2) quote search within block, then root
  const scopes: HTMLElement[] = [];
  if (anchor.blockId) {
    const block = findBlockElement(root, anchor.blockId);
    if (block) scopes.push(block);
  }
  scopes.push(root);

  for (const scope of scopes) {
    const text = fullText(scope);
    const idx = findQuoteIndex(
      text,
      anchor.exact,
      anchor.prefix ?? "",
      anchor.suffix ?? "",
    );
    if (idx === -1) continue;
    const range = rangeFromOffsets(scope, idx, idx + anchor.exact.length);
    if (range) return range;
  }

  return null;
}
