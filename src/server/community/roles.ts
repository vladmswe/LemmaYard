// Roles (docs/specs/community.md §B.10; owner decision: the owner is the only
// admin at launch). `users.role` is user | moderator | admin and is changed
// ONLY by `pnpm user:role <email> <role>` (scripts/user-role.ts), which
// connects with DATABASE_URL_DIRECT / DATABASE_URL. There is no UI and no API
// for it. Code checks roles with `isModeratorRole` (src/lib/community/types)
// or `isModerator(viewer)` (src/lib/community/permissions); C2–C4 reuse them.
import { eq } from "drizzle-orm";
import { z } from "zod";

import { USER_ROLES, type UserRole } from "@/lib/community/types";
import type { Db } from "@/server/db";
import { users } from "@/server/db/schema";

export const roleArgsSchema = z.object({
  // Trim and lowercase first: emails are stored lowercase (users_email_lowercase).
  email: z.string().trim().toLowerCase().pipe(z.email("Give the account's email address")),
  role: z.enum(USER_ROLES, { message: `Role must be one of: ${USER_ROLES.join(", ")}` }),
});

/** Sets the role of the account with `email`; returns its username and the previous role, or null if unknown. */
export async function setUserRole(
  db: Pick<Db, "update" | "select">,
  email: string,
  role: UserRole,
): Promise<{ username: string; previous: UserRole } | null> {
  const [current] = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!current) return null;
  await db.update(users).set({ role }).where(eq(users.id, current.id));
  return { username: current.username, previous: current.role };
}
