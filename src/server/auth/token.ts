import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { getEnv } from "@/server/env";

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALG = "HS256";
const ISSUER = "leetcopy";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

/** Signs a session JWT (HS256, `AUTH_SECRET`) for the given user id. */
export function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the user id from a valid, unexpired token; null for anything else. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [ALG],
      issuer: ISSUER,
    });
    const sub = z.uuid().safeParse(payload.sub);
    return sub.success ? sub.data : null;
  } catch {
    return null;
  }
}
