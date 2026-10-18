// The only access points to the session (AC-M2-4): pages, layouts and route
// handlers call getCurrentUser() / requireUser(); nothing else reads the cookie.
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";

import { SESSION_COOKIE } from "./cookie";
import { verifySessionToken } from "./token";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  /** Community C1: user | moderator | admin (set only by `pnpm user:role`). */
  role: "user" | "moderator" | "admin";
};

/**
 * The signed-in user, re-read from the database on every request (deduped
 * within one render). Missing, invalid, expired or forged tokens and tokens
 * of deleted users all mean "guest" (null).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySessionToken(token);
  if (!userId) return null;
  const [user] = await getDb()
    .select({ id: users.id, email: users.email, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
});

/**
 * The signed-in user, or a redirect to `/login?next=<nextPath>` for guests.
 * For pages only; route handlers answer 401 via getCurrentUser() instead.
 */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
