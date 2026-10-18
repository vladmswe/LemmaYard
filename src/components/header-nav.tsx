"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { isActivePath, type NavFlags, visibleNavLinks } from "@/components/nav-links";

/** Desktop nav pills; the active link gets a 5px ∎ dot under it (§12). */
export function HeaderNav({ signedIn, flags }: { signedIn: boolean; flags?: NavFlags }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden h-full items-center gap-1 min-[961px]:flex">
      {visibleNavLinks(signedIn, flags).map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-9 items-center rounded-full px-3 text-[0.9375rem] font-medium text-foreground-secondary transition-colors duration-120 hover:bg-surface-sunken hover:text-foreground dark:hover:bg-white/[0.06]",
              active &&
                "text-foreground after:absolute after:bottom-0.5 after:left-1/2 after:size-[5px] after:-translate-x-1/2 after:bg-primary",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
