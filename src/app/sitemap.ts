import { asc, eq } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { publishedLessons } from "@/content/learn";
import { getDb } from "@/server/db";
import { problems } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { logError } from "@/server/log";

// Read at request time: the origin comes from AUTH_URL and the problem list
// from the database, neither of which exists at build time.
export const dynamic = "force-dynamic";

/** Public pages only: no account, room or submission pages (they need a session). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = new URL(getEnv().AUTH_URL).origin;
  const at = (path: string) => `${origin}${path}`;

  let slugs: string[] = [];
  try {
    const rows = await getDb()
      .select({ slug: problems.slug })
      .from(problems)
      .where(eq(problems.published, true))
      .orderBy(asc(problems.number));
    slugs = rows.map((r) => r.slug);
  } catch (error) {
    // Without the database the static pages are still listed.
    logError("sitemap.problems_unavailable", error);
  }

  return [
    { url: at("/"), changeFrequency: "weekly", priority: 1 },
    { url: at("/problems"), changeFrequency: "weekly", priority: 0.9 },
    ...slugs.map((slug) => ({ url: at(`/problems/${slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: at("/learn"), changeFrequency: "weekly", priority: 0.8 },
    ...publishedLessons().map((l) => ({ url: at(`/learn/${l.slug}`), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: at("/learn/glossary"), changeFrequency: "monthly", priority: 0.4 },
  ];
}
