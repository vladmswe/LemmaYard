import { describe, expect, it } from "vitest";

import { DEFAULT_REDIRECT, safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    "/problems",
    "/submissions",
    "/ok/path?x=1",
    "/u/alice#stats",
    "/problems?q=two%20sum&page=2",
  ])("keeps relative path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/problems"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://localhost:3000/problems"],
    ["backslash", "/\\evil.com"],
    ["backslash only", "\\\\evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,hi"],
    ["no leading slash", "problems"],
    ["tab inside", "/\t/evil.com"],
    ["newline", "/ok\n/x"],
    ["NUL", "/ok\u0000"],
    ["DEL", "/ok\u007f"],
    ["empty", ""],
    ["too long", "/" + "a".repeat(3000)],
  ])("rejects %s", (_name, path) => {
    expect(safeRedirectPath(path)).toBe(DEFAULT_REDIRECT);
  });

  it("falls back for non-strings", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(["/a", "/b"])).toBe(DEFAULT_REDIRECT);
  });
});
