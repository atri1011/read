export type SegmentOrigin = "extracted" | "generated" | "edited";

export type BilingualSegment = {
  id: string;
  source: string;
  target: string;
  origin: SegmentOrigin;
};

export type DraftSegmentsPayload = {
  version: 1;
  segments: BilingualSegment[];
};

export function isDraftSegmentsPayload(
  value: unknown,
): value is DraftSegmentsPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.segments)) return false;
  return v.segments.every((seg) => {
    if (!seg || typeof seg !== "object") return false;
    const s = seg as Record<string, unknown>;
    return (
      typeof s.id === "string" &&
      typeof s.source === "string" &&
      typeof s.target === "string" &&
      (s.origin === "extracted" ||
        s.origin === "generated" ||
        s.origin === "edited")
    );
  });
}
