import { z } from "zod";

export const ANNOTATION_TYPES = [
  "highlight",
  "underline",
  "strikethrough",
  "note",
] as const;

export const ANNOTATION_COLORS = [
  "yellow",
  "green",
  "blue",
  "pink",
] as const;

export const textAnchorSchema = z.object({
  exact: z.string().min(1).max(10_000),
  prefix: z.string().max(256).default(""),
  suffix: z.string().max(256).default(""),
  blockId: z.string().max(128).optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
});

export const createAnnotationSchema = z.object({
  type: z.enum(ANNOTATION_TYPES),
  color: z.enum(ANNOTATION_COLORS).optional().nullable(),
  body: z.string().max(20_000).optional().nullable(),
  visibility: z.enum(["private", "public"]).default("private"),
  anchor: textAnchorSchema,
});

export const patchAnnotationSchema = z
  .object({
    type: z.enum(ANNOTATION_TYPES).optional(),
    color: z.enum(ANNOTATION_COLORS).optional().nullable(),
    body: z.string().max(20_000).optional().nullable(),
    visibility: z.enum(["private", "public"]).optional(),
    anchor: textAnchorSchema.optional(),
  })
  .refine(
    (v) =>
      v.type !== undefined ||
      v.color !== undefined ||
      v.body !== undefined ||
      v.visibility !== undefined ||
      v.anchor !== undefined,
    { message: "no fields" },
  );

export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
export type PatchAnnotationInput = z.infer<typeof patchAnnotationSchema>;
