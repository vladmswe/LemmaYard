import type { MetadataRoute } from "next";

import { getEnv } from "@/server/env";

// The sitemap URL is absolute, built from AUTH_URL at request time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = new URL(getEnv().AUTH_URL).origin;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // API, account and private room pages: nothing to index there.
      disallow: ["/api/", "/rooms","/submissions", "/learn/dev-fixtures/"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
