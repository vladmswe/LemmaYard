import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/server/auth/cookie";
import { assertSameOrigin } from "@/server/http/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = assertSameOrigin(request);
  if (denied) return denied;

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearSessionCookie(response);
  return response;
}
