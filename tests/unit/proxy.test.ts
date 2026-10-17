import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { hasMalformedPathEscape } from "@/lib/url";
import { proxy } from "@/proxy";

describe("hasMalformedPathEscape", () => {
  it.each(["/", "/u/alice", "/u/%61lice", "/u/%00", "/u/%E2%82%AC", "/problems/two-sum", "/a%20b"])(
    "accepts %s",
    (path) => expect(hasMalformedPathEscape(path)).toBe(false),
  );

  it.each(["/u/%FF", "/u/a%FFb", "/u/%E0%A4%A", "/u/%", "/u/%zz", "/api/submissions/%C0"])(
    "rejects %s",
    (path) => expect(hasMalformedPathEscape(path)).toBe(true),
  );
});

describe("proxy", () => {
  const req = (path: string) => new NextRequest(`http://localhost${path}`);

  it("passes well-formed paths through", () => {
    const res = proxy(req("/u/%61lice"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites a malformed page path to an unmatched route (the 404 page)", () => {
    const res = proxy(req("/u/%FF"));
    expect(new URL(res.headers.get("x-middleware-rewrite")!).pathname).toBe("/_invalid-url");
  });

  it("answers a malformed API path with a JSON 404", async () => {
    const res = proxy(req("/api/submissions/%FF"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
