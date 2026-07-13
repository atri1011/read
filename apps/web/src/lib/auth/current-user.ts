import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUserId } from "@/lib/auth/session";

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function getCurrentUser(): Promise<PublicUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
}
