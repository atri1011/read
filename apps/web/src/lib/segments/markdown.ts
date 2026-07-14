import type { BilingualSegment } from "@/lib/segments/types";

/** Derive plain markdown from sources only (for re-anchor / export). */
export function segmentsToMarkdown(segments: BilingualSegment[]): string {
  return (
    segments
      .map((s) => s.source.trim())
      .filter(Boolean)
      .join("\n\n") + (segments.length > 0 ? "\n" : "")
  );
}
