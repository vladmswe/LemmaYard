import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { getCurrentUser } from "@/server/auth/session";

type FooterLink = { href: string; label: string };

/** Site footer (DESIGN.md §8.20); not shown in the problem workspace. */
export async function SiteFooter() {
  const user = await getCurrentUser();
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Practice",
      links: [
        { href: "/problems", label: "Problems" },
        ...(user ? [{ href: "/submissions", label: "Submissions" }] : []),
      ],
    },
    {
      title: "Account",
      links: user
        ? [{ href: `/u/${user.username}`, label: "Profile" }]
        : [
            { href: "/login", label: "Log in" },
            { href: "/register", label: "Sign up" },
          ],
    },
  ];

  return (
    <footer className="border-t bg-surface-sunken pt-14 pb-8 text-[0.9375rem]">
      <div className="container-page">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[2fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex rounded-md text-foreground">
              <Logo />
            </Link>
            <p className="mt-3 max-w-[22rem] text-muted-foreground">
              Practice coding problems with an in-browser editor and an isolated judge.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h2 className="eyebrow mb-3">{col.title}</h2>
              <ul className="grid gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-foreground-secondary underline-offset-4 transition-colors duration-120 hover:text-link hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-4 border-t pt-5 text-sm text-muted-foreground">
          <span>© 2026 leetcopy. Problem statements are original.</span>
          <span>A personal practice project.</span>
        </div>
      </div>
    </footer>
  );
}
