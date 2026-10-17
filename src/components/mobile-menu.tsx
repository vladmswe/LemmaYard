"use client";

import {
  HistoryIcon,
  LogInIcon,
  LogOutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
  UserPlusIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { Logo } from "@/components/brand/logo";
import { isActivePath, NAV_LINKS } from "@/components/nav-links";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLogout } from "@/components/user-menu";
import { THEME_TOGGLE_ENABLED } from "@/lib/theme-config";

const accountItemClasses =
  "flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-foreground-secondary transition-colors duration-120 hover:bg-accent hover:text-foreground";

/** From here the header shows the full nav (DESIGN.md §8 breakpoints). */
const DESKTOP_QUERY = "(min-width: 961px)";

const THEME_OPTIONS = [
  { value: "light", label: <><SunIcon aria-hidden className="size-4" />Light</> },
  { value: "dark", label: <><MoonIcon aria-hidden className="size-4" />Dark</> },
  { value: "system", label: <><MonitorIcon aria-hidden className="size-4" />System</> },
] as const;

/**
 * Below 961px (DESIGN.md §13.12): a full-height paper sheet from the right.
 * Nav links in serif 36px with `§` numbers, then the theme control (only
 * when enabled in src/lib/theme-config.ts) and the account items or
 * Log in / Sign up. Focus is trapped and Esc closes it (Base UI dialog).
 */
export function MobileMenu({ username }: { username: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { logout, pending } = useLogout();
  const { theme, setTheme } = useTheme();
  const close = () => setOpen(false);

  // The trigger is hidden from 961px: once the viewport gets there the sheet
  // would stay open over the desktop header with no visible way to close it.
  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [open]);

  const links = NAV_LINKS.filter((l) => username || !l.signedInOnly);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="secondary"
            size="icon"
            className="min-[961px]:hidden"
            aria-label="Open menu"
          />
        }
      >
        <MenuIcon className="size-[18px]" />
      </SheetTrigger>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:max-w-[26rem] data-[side=right]:sm:max-w-[26rem]">
        <div className="flex h-15 shrink-0 items-center border-b px-5">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Logo className="text-foreground" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <nav aria-label="Mobile" className="flex flex-col px-5 pt-4 pb-6">
            {links.map((link, i) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  aria-current={active ? "page" : undefined}
                  className="group/link flex items-baseline gap-4 border-b py-3.5 transition-colors duration-120 last:border-b-0"
                >
                  <span aria-hidden className={cn("sec-no w-10 shrink-0", active && "text-primary")}>
                    § {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "font-display text-[2.25rem] leading-none text-foreground transition-colors duration-120 group-hover/link:text-primary",
                      active && "text-primary italic",
                    )}
                  >
                    {link.label}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-5 border-t px-5 pt-5 pb-8">
            {THEME_TOGGLE_ENABLED && (
              <div className="flex flex-col gap-2">
                <span className="eyebrow">Theme</span>
                <Segmented
                  label="Theme"
                  options={THEME_OPTIONS}
                  value={(theme ?? "system") as (typeof THEME_OPTIONS)[number]["value"]}
                  onValueChange={(v) => setTheme(v)}
                  className="self-start"
                />
              </div>
            )}
            {username ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={username} />
                  <span className="truncate font-semibold">{username}</span>
                </div>
                <Link href={`/u/${username}`} onClick={close} className={accountItemClasses}>
                  <UserIcon aria-hidden className="size-4 text-muted-foreground" />
                  Profile
                </Link>
                <Link href="/submissions" onClick={close} className={accountItemClasses}>
                  <HistoryIcon aria-hidden className="size-4 text-muted-foreground" />
                  Submissions
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={async () => {
                    await logout();
                    close();
                  }}
                  className={cn(accountItemClasses, "w-full cursor-pointer disabled:opacity-50")}
                >
                  <LogOutIcon aria-hidden className="size-4 text-muted-foreground" />
                  {pending ? "Logging out…" : "Log out"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <Link
                  href="/register"
                  onClick={close}
                  className={buttonVariants({ size: "lg", className: "w-full" })}
                >
                  <UserPlusIcon aria-hidden />
                  Sign up
                </Link>
                <Link
                  href="/login"
                  onClick={close}
                  className={buttonVariants({ variant: "secondary", size: "lg", className: "w-full" })}
                >
                  <LogInIcon aria-hidden />
                  Log in
                </Link>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
