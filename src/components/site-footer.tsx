import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { cn } from "cn";

import { getCurrentUser } from "@/server/auth/session";
import { isCommunityEnabled } from "@/server/community/flags";

type FooterLink = { href: string; label: string };

/**
 * Site footer (DESIGN.md §12): a night block with grain, four columns (five
 * with the Community column when COMMUNITY_ENABLED=1), the
 * giant serif wordmark with a sky ∎, then the base row. Not shown in the
 * problem workspace.
 */
export async function SiteFooter() {
  const user = await getCurrentUser();
  const community = isCommunityEnabled();
  const columns: { title: string; links: FooterLink[] }[] = [
    {
      title: "Practice",
      links: [
        { href: "/problems", label: "Problems" },
        ...(user
          ? [
              { href: "/submissions", label: "Submissions" },
              { href: "/rooms", label: "Rooms" },
            ]
          : []),
      ],
    },
    {
      title: "Learn",
      links: [
        { href: "/learn", label: "Data Structures guide" },
        { href: "/learn/glossary", label: "Glossary" },
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
    ...(community
      ? [
          {
            title: "Community",
            links: [
              { href: "/legal/content-policy", label: "Content policy" },
              { href: "/legal/report", label: "Report content / copyright" },
              { href: "/legal/terms", label: "Terms" },
              { href: "/legal/privacy", label: "Privacy" },
            ],
          },
        ]
      : []),
  ];

  return (
    <footer className="on-night grain relative overflow-hidden pt-16 pb-8 text-[0.9375rem] shadow-[inset_0_1px_0_var(--night-line)] min-[961px]:pt-22">
      <div className="container-page">
        <div
          className={cn(
            "grid grid-cols-2 gap-8",
            community ? "min-[961px]:grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "min-[961px]:grid-cols-[2fr_1fr_1fr_1fr]",
          )}
        >
          <div className="col-span-2 min-[961px]:col-span-1">
            <Link
              href="/"
              className="relative inline-flex rounded-md text-on-night after:absolute after:-inset-y-1.5"
            >
              <Logo markClassName="text-sky" />
            </Link>
            <p className="mt-4 max-w-[34ch] text-on-night-2">
              Coding practice with clear problems, an in-browser editor, an isolated judge and a
              guide to data structures.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h2 className="label-mono mb-4 text-on-night-2">{col.title}</h2>
              {/* Below 961px each link is a 40px row (touch target). */}
              <ul className="-my-2.5 grid min-[961px]:my-0 min-[961px]:gap-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-10 min-w-10 items-center rounded-sm text-on-night underline-offset-4 transition-colors duration-120 hover:underline min-[961px]:min-h-0"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          aria-hidden
          className="mt-14 mb-7 font-display text-[clamp(3.75rem,15.5vw,14.75rem)] leading-[0.8] tracking-[-0.02em] whitespace-nowrap text-on-night min-[961px]:mt-18"
        >
          LemmaYard
          <span className="qed bg-sky!" />
        </div>
        <div className="flex flex-wrap justify-between gap-4 border-t border-night-line pt-5 text-sm text-on-night-2">
          <span>© 2026 LemmaYard. Problem statements are original.</span>
          <span className="font-mono text-[0.8125rem]">A personal practice project</span>
        </div>
      </div>
    </footer>
  );
}
