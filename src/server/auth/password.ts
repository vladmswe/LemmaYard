import { hash, verify } from "@node-rs/argon2";

// argon2id (the library default) with OWASP-recommended parameters:
// 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
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
