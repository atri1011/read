import { z } from "zod";

export const bilingualSegmentSchema = z.object({
  id: z.string().min(1).max(64),
  source: z.string().max(20_000),
  target: z.string().max(20_000),
  origin: z.enum(["extracted", "generated", "edited"]),
});

export const draftSegmentsPayloadSchema = z.object({
  version: z.literal(1),
  segments: z.array(bilingualSegmentSchema).max(20_000),
});

export type DraftSegmentsInput = z.infer<typeof draftSegmentsPayloadSchema>;
