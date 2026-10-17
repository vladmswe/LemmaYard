export type NavLink = { href: string; label: string; signedInOnly?: boolean };

/** Main navigation (header, mobile menu). Submissions only for users. */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/problems", label: "Problems" },
  { href: "/submissions", label: "Submissions", signedInOnly: true },
];

/** True when `pathname` is `href` or below it (`/problems/two-sum`). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
