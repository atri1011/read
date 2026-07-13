import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/auth/schemas";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  AUTH_RATE_LIMIT,
  clientIp,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit(
    `auth:register:${ip}`,
    AUTH_RATE_LIMIT.limit,
    AUTH_RATE_LIMIT.windowMs,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数无效", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { password, name } = parsed.data;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: name ?? null,
    })
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
    });

  await createSession(user.id);

  return NextResponse.json({ user }, { status: 201 });
}
