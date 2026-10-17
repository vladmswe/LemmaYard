import type { NextResponse } from "next/server";

import { getEnv } from "@/server/env";

import { SESSION_TTL_SECONDS } from "./token";

export const SESSION_COOKIE = "leetcopy_session";

function baseOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getEnv().NODE_ENV === "production",
    path: "/",
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    ...baseOptions(),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { ...baseOptions(), maxAge: 0 });
}
