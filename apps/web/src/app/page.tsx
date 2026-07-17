import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/app/shelf");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <p className="text-sm font-medium text-zinc-500">English Reader</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          优雅阅读 · 标注 · 书架
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          小范围同学共享的英文阅读站。上传文章、Markdown 审阅后发布，支持高亮笔记与公共书架。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            注册
          </Link>
        </div>
      </div>
    </main>
  );
}
