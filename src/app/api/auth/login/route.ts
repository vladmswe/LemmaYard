import { NextResponse } from "next/server";

import { loginSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookie";
import { verifyDummyPassword, verifyPassword } from "@/server/auth/password";
import { authLimitKeys, checkLoginLimit, recordLoginFailure } from "@/server/auth/rate-limit";
import { signSessionToken } from "@/server/auth/token";
import { findUserByEmail } from "@/server/auth/users";
import { assertSameOrigin, jsonError, readJsonBody } from "@/server/http/request";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const INVALID_CREDENTIALS = "Invalid email or password";

export async function POST(request: Request) {
  const denied = assertSameOrigin(request);
  if (denied) return denied;

  const body = await readJsonBody(request, loginSchema, MAX_BODY_BYTES);
  if ("response" in body) return body.response;
  const { email, password } = body.data;

  // Before the lookup and argon2: a blocked client costs no hashing, and the
  // 429 is the same whether or not the email exists.
  const limitKeys = authLimitKeys(request, email);
  const limited = checkLoginLimit(limitKeys);
  if (limited) return limited;

  const user = await findUserByEmail(email);
  if (!user) {
    // Same argon2 cost as a wrong password, so timing does not reveal emails.
    await verifyDummyPassword(password);
    recordLoginFailure(limitKeys);
    return jsonError(401, INVALID_CREDENTIALS);
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    recordLoginFailure(limitKeys);
    return jsonError(401, INVALID_CREDENTIALS);
  }

  const response = NextResponse.json(
    { user: { id: user.id, username: user.username } },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, await signSessionToken(user.id));
  return response;
}
