import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addon: load from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@node-rs/argon2"],
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

export default nextConfig;
