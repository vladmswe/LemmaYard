export type NavLink = { href: string; label: string; signedInOnly?: boolean };

/**
 * Main navigation (header, mobile menu; DESIGN.md §12): Problems, Guide,
 * Rooms (signed-in only). Submissions and Profile live in the account menu.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/problems", label: "Problems" },
  { href: "/learn", label: "Guide" },
  { href: "/rooms", label: "Rooms", signedInOnly: true },
];

/** True when `pathname` is `href` or below it (`/problems/two-sum`). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
