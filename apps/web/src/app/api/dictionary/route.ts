import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { lookupWord, normalizeQuery } from "@/lib/dictionary/lookup";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("q") ?? "";
  const q = normalizeQuery(raw);
  if (!q) {
    return NextResponse.json({ error: "查询词不能为空" }, { status: 400 });
  }

  try {
    const result = await lookupWord(q);
    if (!result) {
      return NextResponse.json({ error: "查询词不能为空" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[dictionary]", e);
    return NextResponse.json({ error: "词典查询失败" }, { status: 502 });
  }
}
