"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

import { isActivePath, NAV_LINKS } from "@/components/nav-links";

/** Desktop nav in the masthead; the active link gets a gold underline. */
export function HeaderNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden h-full items-center gap-1 md:flex">
      {NAV_LINKS.filter((l) => signedIn || !l.signedInOnly).map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-md px-3 text-[0.9375rem] font-medium text-header-muted transition-colors duration-120 hover:bg-white/8 hover:text-header-foreground focus-visible:outline-offset-0",
              active &&
                "rounded-none text-header-foreground shadow-[inset_0_-2px_0_var(--gold)] hover:bg-transparent",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
