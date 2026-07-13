import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/auth/schemas";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  AUTH_RATE_LIMIT,
  clientIp,
  rateLimit,
  rateLimitHeaders,
} from "@/lib/rate-limit";

const INVALID = "邮箱或密码错误";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = await rateLimit(
    `auth:login:${ip}`,
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  await createSession(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}
