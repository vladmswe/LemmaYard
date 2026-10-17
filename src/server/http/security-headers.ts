// Response security headers for every route, applied by `headers()` in
// next.config.ts (README "Security"). Pure functions with no imports, so
// next.config.ts can load this file and unit tests can check the output
// without a build.

export type HeaderEntry = { key: string; value: string };
export type HeaderRule = { source: string; headers: HeaderEntry[] };

/**
 * Content-Security-Policy. `'unsafe-inline'` in `script-src` is required
 * because Next.js App Router streams inline bootstrap/flight scripts
 * (`self.__next_f.push(...)`) into every page; without nonces (which would
 * force every page to render dynamically through a proxy) or hashes (they
 * differ per response) the browser would block them. `'unsafe-eval'` is only
 * added in development, where React and Turbopack's HMR need it. `style-src
 * 'unsafe-inline'` covers inline `style` attributes from React, Monaco and
 * next/font. Monaco's editor worker is a bundled same-origin script
 * (`worker-src 'self'`); `blob:` stays allowed for its fallback path.
 * Follow-up: nonce-based CSP (README "Security", "Not covered yet").
 */
export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Dev: Turbopack's HMR websocket is same-origin (`ws:` is covered by
    // 'self' in CSP3 browsers), so no extra source is needed.
    "connect-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/**
 * Powerful features the app never uses are disabled for the page and any
 * frame. Not listed on purpose: notifications (rooms use the Web
 * Notification API, which Permissions-Policy does not gate), clipboard (copy
 * invite link), autoplay (room alert sound) and fullscreen.
 */
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "publickey-credentials-get=()",
  "serial=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

export function securityHeaders({ dev }: { dev: boolean }): HeaderEntry[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/**
 * The `headers()` rules. Order matters: when two rules set the same key for a
 * path, Next.js keeps the last one, so route-specific overrides come after
 * the global rule.
 */
export function headerRules({ dev }: { dev: boolean }): HeaderRule[] {
  return [
    { source: "/:path*", headers: securityHeaders({ dev }) },
    // Invite links carry their token in the fragment; never leak the page URL
    // onward either (docs/specs/rooms.md §8.1).
    { source: "/rooms/join", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
  ];
}
