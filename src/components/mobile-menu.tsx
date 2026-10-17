"use client";

import { LogInIcon, LogOutIcon, MenuIcon, UserIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "cn";

import { Logo } from "@/components/brand/logo";
import { isActivePath, NAV_LINKS } from "@/components/nav-links";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useLogout } from "@/components/user-menu";

const itemClasses =
  "flex h-11 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-foreground-secondary transition-colors duration-120 hover:bg-accent hover:text-accent-foreground";

/** Tailwind `md` (DESIGN.md §6.4): from here the header shows the full nav. */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Below `md`: the nav links, then the account items (Profile, Log out) or
 * Log in / Sign up, in a sheet from the right. Submissions appears once, in
 * the nav block; the header hides the account menu below `md`.
 */
export function MobileMenu({ username }: { username: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { logout, pending } = useLogout();
  const close = () => setOpen(false);

  // The trigger is `md:hidden`: once the viewport reaches `md` the sheet
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="header" size="icon" className="md:hidden" aria-label="Open menu" />
        }
      >
        <MenuIcon className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(20rem,85vw)] gap-0 p-0">
        <div className="flex h-16 items-center border-b px-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Logo className="text-foreground" />
        </div>
        <nav aria-label="Mobile" className="flex flex-col gap-1 p-3">
          {NAV_LINKS.filter((l) => username || !l.signedInOnly).map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={cn(
                  itemClasses,
                  active && "bg-secondary font-semibold text-secondary-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t p-3">
          {username ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3 px-3 py-2">
                <Avatar name={username} />
                <span className="truncate font-semibold">{username}</span>
              </div>
              <Link href={`/u/${username}`} onClick={close} className={itemClasses}>
                <UserIcon aria-hidden className="size-4 text-muted-foreground" />
                Profile
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  await logout();
                  close();
                }}
                className={cn(itemClasses, "w-full cursor-pointer disabled:opacity-50")}
              >
                <LogOutIcon aria-hidden className="size-4 text-muted-foreground" />
                {pending ? "Logging out…" : "Log out"}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                href="/login"
                onClick={close}
                className={buttonVariants({ variant: "secondary", className: "w-full" })}
              >
                <LogInIcon aria-hidden />
                Log in
              </Link>
              <Link
                href="/register"
                onClick={close}
                className={buttonVariants({ className: "w-full" })}
              >
                <UserPlusIcon aria-hidden />
                Sign up
              </Link>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
