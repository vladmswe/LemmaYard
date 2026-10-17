import { hash, verify } from "@node-rs/argon2";

import { createSemaphore } from "@/server/http/semaphore";

// argon2id (the library default) with OWASP-recommended parameters:
// 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

// At most this many argon2 computations run at once per instance; the rest
// wait in line. argon2 runs on libuv's thread pool (4 threads by default),
// so a login flood can never take every thread from fs/dns work, and memory
// stays bounded (19 MiB each).
export const ARGON2_CONCURRENCY = 2;
const argon2Slots = createSemaphore(ARGON2_CONCURRENCY);

export function hashPassword(password: string): Promise<string> {
  return argon2Slots.run(() => hash(password, OPTIONS));
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2Slots.run(() => verify(passwordHash, password));
  } catch {
    // Malformed stored hash: treat as a mismatch, never as a match.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies `password` against a throwaway hash so that a login for an unknown
 * email costs about the same time as one with a wrong password.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalization");
  await verifyPassword(await dummyHash, password);
}
