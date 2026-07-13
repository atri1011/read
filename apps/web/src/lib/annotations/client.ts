import type { TextAnchor } from "./anchor";

export type AnnotationDto = {
  id: string;
  documentId: string;
  revisionId: string;
  ownerId: string;
  type: "highlight" | "underline" | "strikethrough" | "note" | string;
  color: string | null;
  body: string | null;
  visibility: "private" | "public" | string;
  anchor: TextAnchor;
  orphaned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateAnnotationPayload = {
  type: string;
  color?: string | null;
  body?: string | null;
  visibility: "private" | "public";
  anchor: TextAnchor;
};

export async function fetchAnnotations(
  documentId: string,
  includePublic: boolean,
): Promise<AnnotationDto[]> {
  const qs = includePublic ? "?include_public=1" : "";
  const res = await fetch(`/api/documents/${documentId}/annotations${qs}`, {
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as {
    annotations?: AnnotationDto[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? "加载批注失败");
  }
  return data.annotations ?? [];
}

export async function createAnnotation(
  documentId: string,
  payload: CreateAnnotationPayload,
): Promise<AnnotationDto> {
  const res = await fetch(`/api/documents/${documentId}/annotations`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    annotation?: AnnotationDto;
    error?: string;
  };
  if (!res.ok || !data.annotation) {
    throw new Error(data.error ?? "创建批注失败");
  }
  return data.annotation;
}

export async function updateAnnotation(
  id: string,
  patch: Partial<{
    type: string;
    color: string | null;
    body: string | null;
    visibility: "private" | "public";
  }>,
): Promise<AnnotationDto> {
  const res = await fetch(`/api/annotations/${id}`, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = (await res.json().catch(() => ({}))) as {
    annotation?: AnnotationDto;
    error?: string;
  };
  if (!res.ok || !data.annotation) {
    throw new Error(data.error ?? "更新批注失败");
  }
  return data.annotation;
}

export async function deleteAnnotation(id: string): Promise<void> {
  const res = await fetch(`/api/annotations/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "删除批注失败");
  }
}

export function exportAnnotationsUrl(documentId: string): string {
  return `/api/documents/${documentId}/annotations/export`;
}
