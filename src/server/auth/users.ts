import { eq, or } from "drizzle-orm";

import type { RegisterInput } from "@/lib/auth/schemas";
import { getDb } from "@/server/db";
import { users } from "@/server/db/schema";

import { hashPassword } from "./password";

export type CreateUserResult =
  | { ok: true; user: { id: string; username: string } }
  | { ok: false; taken: { email?: true; username?: true } };

function uniqueViolation(error: unknown): string | null {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.cause ?? e;
  return pg.code === "23505" ? (pg.constraint ?? "") : null;
}

/** Inserts a user with an argon2id hash; reports which unique fields are taken. */
export async function createUser(input: RegisterInput): Promise<CreateUserResult> {
  const db = getDb();
  const existing = await db
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(or(eq(users.email, input.email), eq(users.username, input.username)));
  if (existing.length > 0) {
    return {
      ok: false,
      taken: {
        ...(existing.some((u) => u.email === input.email) && { email: true }),
        ...(existing.some((u) => u.username === input.username) && { username: true }),
      },
    };
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(users)
      .values({ email: input.email, username: input.username, passwordHash })
      .returning({ id: users.id, username: users.username });
    return { ok: true, user };
  } catch (error) {
    // Lost a race with a concurrent registration.
    const constraint = uniqueViolation(error);
    if (constraint === null) throw error;
    return {
      ok: false,
      taken: constraint.includes("username") ? { username: true } : { email: true },
    };
  }
}

export async function findUserByEmail(email: string) {
  const [user] = await getDb()
    .select({ id: users.id, username: users.username, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}
