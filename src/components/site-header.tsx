import Link from "next/link";
import { cn } from "cn";

import { Logo } from "@/components/brand/logo";
import { HeaderNav } from "@/components/header-nav";
import { MobileMenu } from "@/components/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Navy masthead (DESIGN.md §8.18): 64px row (52px `compact` for the problem
 * workspace) plus the gold/blue rule. The focus ring is lightened here: the
 * default ring (#2457C5) has only 2.65:1 against the navy.
 */
export async function SiteHeader({ compact = false }: { compact?: boolean }) {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 bg-header text-header-foreground [--ring:var(--color-blue-300)] dark:border-b dark:border-border">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-semibold text-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div
        className={cn(
          "container-page flex items-center gap-3 md:gap-6",
          compact ? "h-13" : "h-16",
        )}
      >
        <Link
          href="/"
          aria-label="LemmaYard home"
          className="flex shrink-0 items-center rounded-md text-header-foreground"
        >
          <Logo />
        </Link>
        <HeaderNav signedIn={Boolean(user)} />
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {user ? (
            // Below `md` the account items live in the mobile menu instead.
            <div className="hidden md:block">
              <UserMenu username={user.username} />
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({ variant: "header", className: "hidden md:inline-flex" })}
              >
                Log in
              </Link>
              <Link href="/register" className={buttonVariants({ variant: "header-solid" })}>
                Sign up
              </Link>
            </>
          )}
          <MobileMenu username={user?.username ?? null} />
        </div>
      </div>
      <div aria-hidden className="masthead-rule" />
    </header>
  );
}
