import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser } from "@/server/auth/session";

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="shrink-0 font-semibold tracking-tight">
          leet<span className="text-muted-foreground">copy</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          <Link
            href="/problems"
            className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            Problems
          </Link>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {user ? (
            <UserMenu username={user.username} />
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Login
              </Link>
              <Link href="/register" className={buttonVariants({ size: "sm" })}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
