/**
 * Theme switch for the whole site (DESIGN.md §6.5). Both themes stay fully
 * implemented (tokens in globals.css, next-themes, Monaco light/dark); this
 * module only decides whether visitors may choose.
 *
 * While `THEME_TOGGLE_ENABLED` is false the site is dark only: the root
 * layout renders `<html class="dark">` on the server and next-themes gets
 * `forcedTheme`, so neither a stored "light" choice nor the OS preference
 * can override it, and the toggle is not rendered anywhere.
 *
 * Re-enable the toggle (light, dark, system): set THEME_TOGGLE_ENABLED = true.
 */
export const THEME_TOGGLE_ENABLED: boolean = false;

/** The theme every page uses while the toggle is disabled. */
export const FORCED_THEME = "dark" as const;

/** `forcedTheme` for next-themes, or undefined when visitors choose. */
export const forcedTheme: typeof FORCED_THEME | undefined = THEME_TOGGLE_ENABLED
  ? undefined
  : FORCED_THEME;
