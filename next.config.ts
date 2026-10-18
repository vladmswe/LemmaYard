import createMDX from "@next/mdx";
import type { NextConfig } from "next";

import { headerRules } from "./src/server/http/security-headers";

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` on responses (nothing to gain from announcing it).
  poweredByHeader: false,
  // Native addon: load from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@node-rs/argon2"],
  // Guide lesson pages read code samples and problem metadata with fs at
  // request time (they are dynamic: the site layout reads the session), so
  // serverless traces must ship those files.
  // JUDGE_EXECUTOR=vercel-sandbox: the API routes that judge in-process
  // (src/server/judge-runner.ts) upload the harness files into each microVM.
  outputFileTracingIncludes: {
    "/learn/**": ["./src/content/learn/**/code/*", "./problems/*/meta.json"],
    "/api/**": ["./sandbox/harness.*", "./sandbox/Harness.java"],
  },
  // Security headers + CSP on every route, `Referrer-Policy: no-referrer` on
  // /rooms/join (src/server/http/security-headers.ts, README "Security").
  async headers() {
    return headerRules({ dev: process.env.NODE_ENV === "development" });
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Lessons import `.mdx` files (never routed, so `pageExtensions` stays as is).
// Turbopack needs plugin names as strings.
const withMDX = createMDX({
  options: {
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-slug"],
  },
});

export default withMDX(nextConfig);
