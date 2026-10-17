import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addon: load from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@node-rs/argon2"],
  // Guide lesson pages read code samples and problem metadata with fs at
  // request time (they are dynamic: the site layout reads the session), so
  // serverless traces must ship those files.
  outputFileTracingIncludes: {
    "/learn/**": ["./src/content/learn/**/code/*", "./problems/*/meta.json"],
  },
  // Invite links carry their token in the fragment; never leak the page URL
  // onward either (docs/specs/rooms.md §8.1).
  async headers() {
    return [{ source: "/rooms/join", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
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
