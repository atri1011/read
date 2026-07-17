"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function safeNextPath(): string {
    if (typeof window === "undefined") return "/app/shelf";
    try {
      const next = new URLSearchParams(window.location.search).get("next");
      if (next && next.startsWith("/app") && !next.startsWith("//")) {
        return next;
      }
    } catch {
      /* ignore */
    }
    return "/app/shelf";
  }

  const isRegister = mode === "register";
  const title = isRegister ? "注册" : "登录";
  const submitLabel = isRegister ? "创建账号" : "登录";
  const altHref = isRegister ? "/login" : "/register";
  const altLabel = isRegister ? "已有账号？去登录" : "没有账号？去注册";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister
        ? {
            email,
            password,
            ...(name.trim() ? { name: name.trim() } : {}),
          }
        : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "请求失败，请稍后重试");
        return;
      }

      router.push(safeNextPath());
      router.refresh();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 space-y-1">
        <p className="text-sm font-medium text-zinc-500">English Reader</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="text-sm text-zinc-500">
          邮箱 + 密码登录，会话 Cookie 保持登录状态。
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {isRegister && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              昵称（可选）
            </span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="怎么称呼你"
            />
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            邮箱
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="you@example.com"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            密码
          </span>
          <input
            type="password"
            name="password"
            required
            minLength={isRegister ? 8 : 1}
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder={isRegister ? "至少 8 位" : "••••••••"}
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "提交中…" : submitLabel}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href={altHref} className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-100">
          {altLabel}
        </Link>
      </p>
    </div>
  );
}
