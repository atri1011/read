import type { TextAnchor } from "./anchor";

export type ExportableAnnotation = {
  type: string;
  color: string | null;
  body: string | null;
  visibility: string;
  orphaned: boolean;
  createdAt: Date | string;
  anchor: TextAnchor | Record<string, unknown>;
};

function quoteBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function typeLabel(type: string, color: string | null): string {
  const base =
    type === "highlight"
      ? "Highlight"
      : type === "underline"
        ? "Underline"
        : type === "strikethrough"
          ? "Strikethrough"
          : type === "note"
            ? "Note"
            : type;
  return color ? `${base} (${color})` : base;
}

function contextHint(anchor: ExportableAnnotation["anchor"]): string {
  const a = anchor as TextAnchor;
  if (a.blockId) return a.blockId;
  const exact = typeof a.exact === "string" ? a.exact : "";
  const snippet = exact.slice(0, 40).replace(/\s+/g, " ");
  return snippet || "selection";
}

/**
 * Build Markdown export of the current user's annotations for one document.
 */
export function annotationsToMarkdown(
  title: string,
  items: ExportableAnnotation[],
): string {
  const lines: string[] = [`# Notes: ${title}`, ""];

  if (items.length === 0) {
    lines.push("_No annotations._", "");
    return lines.join("\n");
  }

  for (const item of items) {
    const a = item.anchor as TextAnchor;
    const exact = typeof a.exact === "string" ? a.exact : "";
    const heading = `## ${typeLabel(item.type, item.color)} — ${contextHint(item.anchor)}`;
    lines.push(heading);
    if (item.orphaned) {
      lines.push("");
      lines.push("> ⚠️ 原文已变更（锚点失效）");
    }
    lines.push("");
    if (exact) {
      lines.push(quoteBlock(exact));
      lines.push("");
    }
    if (item.body && item.body.trim()) {
      lines.push(item.body.trim());
      lines.push("");
    }
    lines.push(`_visibility: ${item.visibility}_`);
    lines.push("");
  }

  return lines.join("\n");
}
