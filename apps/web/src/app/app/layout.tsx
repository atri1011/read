import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/app/shelf"
              className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              English Reader
            </Link>
            <nav className="flex items-center gap-3 text-sm text-zinc-600 dark:text-zinc-300">
              <Link
                href="/app/shelf"
                className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                书架
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-zinc-500 sm:inline">
                {user.name || user.email}
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
