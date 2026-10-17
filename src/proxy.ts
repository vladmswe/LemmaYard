import { NextResponse, type NextRequest } from "next/server";

import { hasMalformedPathEscape } from "@/lib/url";

// URL hygiene only: no session or auth logic here (see CLAUDE.md). A path with
// a malformed percent escape (`/u/%FF`) makes Next.js fail while decoding
// dynamic params and answer with a bare "Internal Server Error". Answer 404
// instead: JSON for the API, the designed not-found page for everything else.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!hasMalformedPathEscape(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  // No route matches this path, so the root not-found page renders (404).
  return NextResponse.rewrite(new URL("/_invalid-url", request.url));
}

export const config = {
  // Only paths that contain a percent sign; static assets are never touched.
  matcher: ["/((?!_next/).*%.*)"],
};
