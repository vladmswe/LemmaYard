/** Feature switches that hide nav items (read on the server, passed down). */
export type NavFlags = { plans?: boolean };

export type NavLink = { href: string; label: string; signedInOnly?: boolean; flag?: keyof NavFlags };

/**
 * Main navigation (header, mobile menu; DESIGN.md §12): Problems, Guide,
 * Rooms (signed-in only), Plans (when PLANS_ENABLED). Submissions and Profile live in the account menu.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/problems", label: "Problems" },
  { href: "/learn", label: "Guide" },
  { href: "/rooms", label: "Rooms", signedInOnly: true },
  // Study plans (community C2): only with PLANS_ENABLED=1.
  { href: "/plans", label: "Plans", flag: "plans" },
];

/** The links to show for this viewer and these feature switches. */
export function visibleNavLinks(signedIn: boolean, flags: NavFlags = {}): NavLink[] {
  return NAV_LINKS.filter((l) => (signedIn || !l.signedInOnly) && (!l.flag || flags[l.flag]));
}

/** True when `pathname` is `href` or below it (`/problems/two-sum`). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
