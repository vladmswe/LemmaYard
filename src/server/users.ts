import { eq } from "drizzle-orm";
import { cache } from "react";

import { USERNAME_PATTERN } from "@/lib/auth/schemas";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";

/**
 * Public user lookup for `/u/[username]`; null for unknown or malformed names.
 * Deduped within one render, so `generateMetadata` and the page share a query.
 */
export const findUserByUsername = cache(async (username: string) => {
  if (!USERNAME_PATTERN.test(username)) return null;
  const [user] = await getDb()
    .select({ id: users.id, username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return user ?? null;
});
