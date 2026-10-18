import Link from "next/link";
import { cn } from "cn";

import { Logo } from "@/components/brand/logo";
import { HeaderNav } from "@/components/header-nav";
import { HeaderScrollState } from "@/components/header-scroll-state";
import { MobileMenu } from "@/components/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { THEME_TOGGLE_ENABLED } from "@/lib/theme-config";
import { getCurrentUser } from "@/server/auth/session";

/**
 * Sticky translucent paper header (DESIGN.md §12): 68px (60px below 961px;
 * 52px `compact` for the problem workspace). The hairline border appears
 * after an 8px scroll. Nav pills (Problems, Guide, Rooms), then the theme
 * toggle (only when enabled in src/lib/theme-config.ts) and the account menu
 * or Log in / Sign up. Below 961px: primary CTA + burger sheet.
 */
export async function SiteHeader({ compact = false }: { compact?: boolean }) {
  const user = await getCurrentUser();

  return (
    <header
      className={cn(
        "site-header sticky top-0 z-40 border-b border-transparent text-foreground transition-[border-color] duration-200 data-scrolled:border-border",
        compact && "border-border",
      )}
    >
      <HeaderScrollState />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-md focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div
        className={cn(
          "container-page flex items-center gap-3 min-[961px]:gap-8",
          compact ? "h-13" : "h-15 min-[961px]:h-17",
        )}
      >
        <Link
          href="/"
          aria-label="LemmaYard home"
          // after: = invisible 42px-tall hit area around the 26px logo (DESIGN.md §12).
          className="relative flex shrink-0 items-center rounded-md text-foreground after:absolute after:-inset-x-1 after:-inset-y-2"
        >
          <Logo className={compact ? "text-lg" : undefined} markClassName={compact ? "size-[22px]" : undefined} />
        </Link>
        <HeaderNav signedIn={Boolean(user)} />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {THEME_TOGGLE_ENABLED && <ThemeToggle />}
          {user ? (
            // Below 961px the account items live in the mobile menu instead.
            <div className="hidden min-[961px]:block">
              <UserMenu username={user.username} />
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className={buttonVariants({
                  variant: "ghost",
                  size: compact ? "sm" : "default",
                  className: "hidden min-[961px]:inline-flex",
                })}
              >
                Log in
              </Link>
              <Link href="/register" className={buttonVariants({ size: compact ? "sm" : "default", className: "max-[960px]:h-10 max-[960px]:px-4" })}>
                Sign up
              </Link>
            </>
          )}
          <MobileMenu username={user?.username ?? null} />
        </div>
      </div>
    </header>
  );
}
