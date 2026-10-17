import { NextResponse } from "next/server";

import { AUTH_MESSAGES, registerSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookie";
import { authLimitKeys, hitRegisterLimit } from "@/server/auth/rate-limit";
import { signSessionToken } from "@/server/auth/token";
import { createUser } from "@/server/auth/users";
import { assertSameOrigin, jsonError, readJsonBody } from "@/server/http/request";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request) {
  const denied = assertSameOrigin(request);
  if (denied) return denied;

  const body = await readJsonBody(request, registerSchema, MAX_BODY_BYTES);
  if ("response" in body) return body.response;

  // Every valid attempt counts (a 409 too), checked before argon2 hashing.
  const limited = hitRegisterLimit(authLimitKeys(request, body.data.email));
  if (limited) return limited;

  const result = await createUser(body.data);
  if (!result.ok) {
    return jsonError(409, "Email or username is already taken", {
      ...(result.taken.email && { email: AUTH_MESSAGES.emailTaken }),
      ...(result.taken.username && { username: AUTH_MESSAGES.usernameTaken }),
    });
  }

  const response = NextResponse.json(
    { user: result.user },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, await signSessionToken(result.user.id));
  return response;
}
