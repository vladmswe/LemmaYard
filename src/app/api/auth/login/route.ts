import { NextResponse } from "next/server";

import { loginSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookie";
import { verifyDummyPassword, verifyPassword } from "@/server/auth/password";
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

  const user = await findUserByEmail(email);
  if (!user) {
    // Same argon2 cost as a wrong password, so timing does not reveal emails.
    await verifyDummyPassword(password);
    return jsonError(401, INVALID_CREDENTIALS);
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    return jsonError(401, INVALID_CREDENTIALS);
  }

  const response = NextResponse.json(
    { user: { id: user.id, username: user.username } },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, await signSessionToken(user.id));
  return response;
}
