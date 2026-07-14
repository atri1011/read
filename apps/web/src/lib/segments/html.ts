import type { BilingualSegment } from "@/lib/segments/types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build bilingual HTML with fixed structure. Does not run through remark.
 * Empty targets omit the translation node.
 */
export function segmentsToHtml(segments: BilingualSegment[]): string {
  const parts: string[] = [];
  let blockIndex = 0;

  for (const seg of segments) {
    const source = seg.source.trim();
    if (!source) continue;

    const target = seg.target.trim();
    const segmentId = escapeHtml(seg.id);
    const blockId = `b-${blockIndex}`;
    blockIndex += 1;

    const sourceHtml = `<p class="bilingual-source" data-block-id="${blockId}">${escapeHtml(source)}</p>`;
    const targetHtml = target
      ? `<p class="bilingual-target" data-masked="true">${escapeHtml(target)}</p>`
      : "";

    parts.push(
      `<div class="bilingual-pair" data-segment-id="${segmentId}">${sourceHtml}${targetHtml}</div>`,
    );
  }

  return parts.join("\n");
}
