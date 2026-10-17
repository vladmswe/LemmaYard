// WP-3: the header set of next.config.ts `headers()`, checked without a
// build. Paths are matched with Next's own matcher, and later rules override
// earlier ones for the same key, as Next.js does.
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import {
  contentSecurityPolicy,
  headerRules,
  type HeaderRule,
} from "../../src/server/http/security-headers";

function headersFor(rules: HeaderRule[], pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    if (!getPathMatch(rule.source)(pathname)) continue;
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

const PATHS = [
  "/",
  "/login",
  "/register",
  "/problems",
  "/problems/two-sum",
  "/submissions",
  "/u/alice",
  "/learn",
  "/learn/arrays",
  "/rooms",
  "/rooms/0b6f2c3e-0000-4000-8000-000000000000/sessions/0b6f2c3e-0000-4000-8000-000000000001",
  "/api/auth/login",
  "/api/health",
  "/does-not-exist",
];

const PROD_CSP =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:";

describe("security headers", () => {
  it("next.config.ts headers() returns the rules of security-headers.ts", async () => {
    expect(await nextConfig.headers!()).toEqual(headerRules({ dev: process.env.NODE_ENV === "development" }));
  });

  it.each(PATHS)("%s carries the full header set", (path) => {
    const h = headersFor(headerRules({ dev: false }), path);
    expect(h).toMatchObject({
      "content-security-policy": PROD_CSP,
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
      "cross-origin-opener-policy": "same-origin",
    });
    expect(h["permissions-policy"]).toMatch(/(^|, )camera=\(\)/);
  });

  it("keeps Referrer-Policy no-referrer on /rooms/join only", () => {
    const rules = headerRules({ dev: false });
    expect(headersFor(rules, "/rooms/join")["referrer-policy"]).toBe("no-referrer");
    expect(headersFor(rules, "/rooms/join")["content-security-policy"]).toBe(PROD_CSP);
    expect(headersFor(rules, "/rooms/join/preview")["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("disables unused powerful features but never notifications or clipboard", () => {
    const policy = headersFor(headerRules({ dev: false }), "/")["permissions-policy"];
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb", "serial", "hid"]) {
      expect(policy).toContain(`${feature}=()`);
    }
    expect(policy).not.toMatch(/notifications|clipboard|autoplay/);
  });

  it("adds 'unsafe-eval' in development only", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy({ dev: true })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it("is enforced, not report-only", () => {
    const keys = headerRules({ dev: false }).flatMap((r) => r.headers.map((h) => h.key));
    expect(keys).toContain("Content-Security-Policy");
    expect(keys).not.toContain("Content-Security-Policy-Report-Only");
  });
});
