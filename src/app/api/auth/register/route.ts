import { NextResponse } from "next/server";

import { registerSchema } from "@/lib/auth/schemas";
import { setSessionCookie } from "@/server/auth/cookie";
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

  const result = await createUser(body.data);
  if (!result.ok) {
    return jsonError(409, "Email or username is already taken", {
      ...(result.taken.email && { email: "This email is already registered" }),
      ...(result.taken.username && { username: "This username is taken" }),
    });
  }

  const response = NextResponse.json(
    { user: result.user },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, await signSessionToken(result.user.id));
  return response;
}
