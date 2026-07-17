export type FindMatch = {
  index: number;
  text: string;
};

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "BUTTON",
]);

export function normalizeFindQuery(raw: string): string {
  return raw.normalize("NFKC").trim();
}

/** Collect text nodes suitable for in-article search. */
export function collectSearchableTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    const text = current as Text;
    const parent = text.parentElement;
    if (!parent) {
      current = walker.nextNode();
      continue;
    }
    if (SKIP_TAGS.has(parent.tagName)) {
      current = walker.nextNode();
      continue;
    }
    if (parent.closest(".reader-find-mark")) {
      current = walker.nextNode();
      continue;
    }
    // Skip pure whitespace
    if (!(text.data ?? "").trim()) {
      current = walker.nextNode();
      continue;
    }
    nodes.push(text);
    current = walker.nextNode();
  }
  return nodes;
}

export type TextSlice = {
  node: Text;
  start: number;
  end: number;
};

/**
 * Find case-insensitive occurrences of query across concatenated text nodes.
 * Returns ranges as slices of one or more adjacent text nodes.
 */
export function findQueryRanges(
  root: HTMLElement,
  query: string,
): TextSlice[][] {
  const q = normalizeFindQuery(query);
  if (!q) return [];

  const nodes = collectSearchableTextNodes(root);
  if (nodes.length === 0) return [];

  // Build concatenated lower text + map offsets back to nodes
  type MapEntry = { node: Text; start: number; end: number };
  const map: MapEntry[] = [];
  let haystack = "";
  for (const node of nodes) {
    const data = node.data ?? "";
    const start = haystack.length;
    haystack += data;
    map.push({ node, start, end: haystack.length });
  }

  const lower = haystack.toLowerCase();
  const needle = q.toLowerCase();
  const ranges: TextSlice[][] = [];
  let from = 0;
  while (from <= lower.length - needle.length) {
    const idx = lower.indexOf(needle, from);
    if (idx < 0) break;
    const end = idx + needle.length;
    const slices: TextSlice[] = [];
    for (const entry of map) {
      if (entry.end <= idx || entry.start >= end) continue;
      const localStart = Math.max(0, idx - entry.start);
      const localEnd = Math.min(entry.node.data.length, end - entry.start);
      if (localStart < localEnd) {
        slices.push({
          node: entry.node,
          start: localStart,
          end: localEnd,
        });
      }
    }
    if (slices.length > 0) ranges.push(slices);
    from = idx + Math.max(1, needle.length);
    // Cap matches to keep DOM work bounded on huge articles
    if (ranges.length >= 200) break;
  }
  return ranges;
}

export function clearFindMarks(root: HTMLElement) {
  const marks = Array.from(
    root.querySelectorAll("span.reader-find-mark"),
  ).reverse();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    (parent as HTMLElement).normalize?.();
    parent.normalize();
  }
}

export function applyFindMarks(
  root: HTMLElement,
  query: string,
  activeIndex: number,
): number {
  clearFindMarks(root);
  const ranges = findQueryRanges(root, query);
  if (ranges.length === 0) return 0;

  // Group slices by text node so multi-hit nodes can be split right-to-left.
  type Work = TextSlice & { matchIndex: number };
  const byNode = new Map<Text, Work[]>();
  ranges.forEach((slices, matchIndex) => {
    for (const slice of slices) {
      const list = byNode.get(slice.node) ?? [];
      list.push({ ...slice, matchIndex });
      byNode.set(slice.node, list);
    }
  });

  for (const [node, items] of byNode) {
    // Right-to-left keeps earlier offsets stable on the same original node.
    items.sort((a, b) => b.start - a.start);
    let current: Text | null = node;
    for (const item of items) {
      if (!current || !current.parentNode) break;
      if (item.start < 0 || item.end > current.data.length) continue;
      // After a right-side split, only the left remainder stays in `current`.
      // Offsets from the original node remain valid for that left remainder.
      const full: string = current.data ?? "";
      const before: string = full.slice(0, item.start);
      const mid: string = full.slice(item.start, item.end);
      const after: string = full.slice(item.end);
      const parent = current.parentNode;

      const mark = document.createElement("span");
      mark.className =
        item.matchIndex === activeIndex
          ? "reader-find-mark reader-find-mark-active"
          : "reader-find-mark";
      mark.setAttribute("data-find-index", String(item.matchIndex));
      mark.textContent = mid;

      const afterNode: Text | null = after ? document.createTextNode(after) : null;
      const beforeNode: Text | null = before ? document.createTextNode(before) : null;

      const frag = document.createDocumentFragment();
      if (beforeNode) frag.appendChild(beforeNode);
      frag.appendChild(mark);
      if (afterNode) frag.appendChild(afterNode);
      parent.replaceChild(frag, current);
      // Continue splitting only the left remainder.
      current = beforeNode;
    }
  }
  return ranges.length;
}

export function scrollToFindMatch(root: HTMLElement, index: number): boolean {
  const el = root.querySelector(
    `span.reader-find-mark[data-find-index="${String(index)}"]`,
  ) as HTMLElement | null;
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}
