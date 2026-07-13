import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentRevisions, documents } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/auth/current-user";

export type DocumentRow = typeof documents.$inferSelect;
export type RevisionRow = typeof documentRevisions.$inferSelect;

export function isOwner(doc: Pick<DocumentRow, "ownerId">, user: PublicUser | null) {
  return !!user && doc.ownerId === user.id;
}

export function canReadPublished(
  doc: Pick<DocumentRow, "ownerId" | "status" | "shelfVisibility">,
  user: PublicUser | null,
): boolean {
  if (user && doc.ownerId === user.id) return true;
  return doc.status === "published" && doc.shelfVisibility === "public";
}

export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestRevision(
  documentId: string,
): Promise<RevisionRow | null> {
  const rows = await db
    .select()
    .from(documentRevisions)
    .where(eq(documentRevisions.documentId, documentId))
    .orderBy(desc(documentRevisions.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function getNextRevisionVersion(documentId: string): Promise<number> {
  const latest = await getLatestRevision(documentId);
  return (latest?.version ?? 0) + 1;
}

export { and, eq };
