"use client";

import { useEffect } from "react";
import type { AnnotationDto } from "@/lib/annotations/client";
import { resolveAnchor } from "@/lib/annotations/anchor";

type Props = {
  rootRef: React.RefObject<HTMLElement | null>;
  annotations: AnnotationDto[];
  currentUserId: string;
  activeId?: string | null;
  onSelect?: (id: string) => void;
};

const MARK_ATTR = "data-annotation-id";
const MARK_CLASS = "ann-mark";

function colorClass(color: string | null | undefined): string {
  switch (color) {
    case "green":
      return "ann-color-green";
    case "blue":
      return "ann-color-blue";
    case "pink":
      return "ann-color-pink";
    case "yellow":
    default:
      return "ann-color-yellow";
  }
}

function typeClass(type: string): string {
  switch (type) {
    case "underline":
      return "ann-type-underline";
    case "strikethrough":
      return "ann-type-strike";
    case "note":
      return "ann-type-note";
    case "highlight":
    default:
      return "ann-type-highlight";
  }
}

function clearMarks(root: HTMLElement) {
  const marks = Array.from(
    root.querySelectorAll(`span.${MARK_CLASS}[${MARK_ATTR}]`),
  ).reverse();
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

function textNodesInRange(
  range: Range,
): Array<{ node: Text; start: number; end: number }> {
  if (range.collapsed) return [];

  if (
    range.startContainer === range.endContainer &&
    range.startContainer.nodeType === Node.TEXT_NODE
  ) {
    return [
      {
        node: range.startContainer as Text,
        start: range.startOffset,
        end: range.endOffset,
      },
    ];
  }

  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode!
      : range.commonAncestorContainer;

  const result: Array<{ node: Text; start: number; end: number }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    const text = current as Text;
    const len = text.data.length;
    try {
      // entirely before range
      if (range.comparePoint(text, len) < 0) {
        current = walker.nextNode();
        continue;
      }
      // entirely after range
      if (range.comparePoint(text, 0) > 0) break;
    } catch {
      current = walker.nextNode();
      continue;
    }

    const start = range.startContainer === text ? range.startOffset : 0;
    const end = range.endContainer === text ? range.endOffset : len;
    if (start < end) result.push({ node: text, start, end });
    current = walker.nextNode();
  }
  return result;
}

function wrapRange(
  range: Range,
  ann: AnnotationDto,
  isOwn: boolean,
  active: boolean,
) {
  const texts = textNodesInRange(range);
  // reverse so earlier siblings stay valid when splitting
  for (const { node, start, end } of texts.slice().reverse()) {
    if (start === end) continue;
    const full = node.data;
    const before = full.slice(0, start);
    const mid = full.slice(start, end);
    const after = full.slice(end);
    const parent = node.parentNode;
    if (!parent) continue;

    const mark = document.createElement("span");
    mark.className = [
      MARK_CLASS,
      typeClass(ann.type),
      colorClass(ann.color),
      isOwn ? "ann-own" : "ann-other",
      active ? "ann-active" : "",
      ann.orphaned ? "ann-orphaned" : "",
    ]
      .filter(Boolean)
      .join(" ");
    mark.setAttribute(MARK_ATTR, ann.id);
    mark.setAttribute("data-annotation-owner", isOwn ? "self" : "other");
    if (ann.body) mark.setAttribute("title", ann.body.slice(0, 200));
    mark.textContent = mid;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));
    parent.replaceChild(frag, node);
  }
}

/**
 * Applies annotation marks into the article DOM under rootRef.
 */
export function AnnotationLayer({
  rootRef,
  annotations,
  currentUserId,
  activeId,
  onSelect,
}: Props) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    clearMarks(root);

    const sorted = [...annotations].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );

    for (const ann of sorted) {
      if (ann.orphaned) continue;
      const range = resolveAnchor(root, ann.anchor);
      if (!range) continue;
      try {
        wrapRange(
          range,
          ann,
          ann.ownerId === currentUserId,
          ann.id === activeId,
        );
      } catch {
        // ignore individual wrap failures
      }
    }
  }, [rootRef, annotations, currentUserId, activeId]);

  useEffect(() => {
    const root = rootRef.current;
    return () => {
      if (root) clearMarks(root);
    };
  }, [rootRef]);

  // Click an in-article mark to open/focus that annotation.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onSelect) return;

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const mark = target?.closest?.(
        `span.${MARK_CLASS}[${MARK_ATTR}]`,
      ) as HTMLElement | null;
      if (!mark || !root?.contains(mark)) return;
      // Ignore when user is selecting text.
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && (sel.toString()?.length ?? 0) > 0) return;
      const id = mark.getAttribute(MARK_ATTR);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(id);
    }

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [rootRef, onSelect]);

  return null;
}

/** Scroll the first mark for an annotation into view. */
export function scrollToAnnotation(root: HTMLElement, annotationId: string) {
  const escape =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape
      : (s: string) => s.replace(/"/g, '\\"');
  const el = root.querySelector(
    `span.${MARK_CLASS}[${MARK_ATTR}="${escape(annotationId)}"]`,
  ) as HTMLElement | null;
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return true;
  }
  return false;
}
