// Study plans (community C2, AC-C-SP-4): LeetCode links are validated
// strictly, normalized to the problem slug (the only part stored) and turned
// back into the canonical URL on render. Nothing is fetched.
import { describe, expect, it } from "vitest";

import {
  isLeetCodeSlug,
  leetCodeProblemUrl,
  parseLeetCodeProblemUrl,
  titleFromSlug,
} from "@/lib/plans/leetcode";
import { leetCodeUrlSchema } from "@/lib/plans/schemas";

describe("parseLeetCodeProblemUrl", () => {
  it.each([
    ["https://leetcode.com/problems/two-sum/", "two-sum"],
    ["https://leetcode.com/problems/two-sum", "two-sum"],
    ["http://leetcode.com/problems/two-sum/description/?x=1", "two-sum"],
    ["https://www.leetcode.com/problems/two-sum/", "two-sum"],
    ["https://LEETCODE.com/problems/Two-Sum/", "two-sum"],
    ["https://leetcode.com/problems/meeting-rooms-ii/solutions/123/abc/", "meeting-rooms-ii"],
    ["https://leetcode.com/problems/3sum/#comments", "3sum"],
    ["  https://leetcode.com/problems/lru-cache/  ", "lru-cache"],
    ["https://leetcode.com:443/problems/two-sum/", "two-sum"], // default port is dropped by the parser
  ])("accepts %s", (input, slug) => {
    expect(parseLeetCodeProblemUrl(input)).toBe(slug);
  });

  it.each([
    // other hosts and look-alikes
    "https://leetcode.cn/problems/two-sum/",
    "https://leetcode.com.evil.example/problems/two-sum/",
    "https://evil.example/leetcode.com/problems/two-sum/",
    "https://evil.example/?u=https://leetcode.com/problems/two-sum/",
    "https://evil.example#https://leetcode.com/problems/two-sum/",
    "https://api.leetcode.com/problems/two-sum/",
    "https://leetcode.com./problems/two-sum/",
    "https://leеtcode.com/problems/two-sum/", // Cyrillic "е"
    "https://xn--letcode-u2e.com/problems/two-sum/",
    "https://104.18.0.1/problems/two-sum/",
    // credentials, ports, schemes
    "https://user:pass@leetcode.com/problems/two-sum/",
    "https://leetcode.com@evil.example/problems/two-sum/",
    "https://leetcode.com:8443/problems/two-sum/",
    "ftp://leetcode.com/problems/two-sum/",
    "javascript:alert(1)//leetcode.com/problems/two-sum/",
    "data:text/html,https://leetcode.com/problems/two-sum/",
    "//leetcode.com/problems/two-sum/",
    "leetcode.com/problems/two-sum/",
    // not a problem page
    "https://leetcode.com/",
    "https://leetcode.com/problems/",
    "https://leetcode.com/problemset/all/",
    "https://leetcode.com/discuss/post/1/two-sum/",
    "https://leetcode.com/problems/../contest/",
    "https://leetcode.com/u/problems/two-sum/",
    // slug tricks
    "https://leetcode.com/problems/two%2Dsum/",
    "https://leetcode.com/problems/two_sum/",
    "https://leetcode.com/problems/-two-sum/",
    "https://leetcode.com/problems/two--sum/",
    "https://leetcode.com/problems/two-sum-/",
    `https://leetcode.com/problems/${"a".repeat(101)}/`,
    "https://leetcode.com/problems/<script>/",
    "https://leetcode.com/problems/two sum/",
    // whitespace and controls the URL parser would silently drop or rewrite
    "https://leet\ncode.com/problems/two-sum/",
    "https://leetcode.com/problems/two-\tsum/",
    "https:\\\\leetcode.com\\problems\\two-sum\\",
    "https://leetcode.com/problems/two-sum/\u0000",
    "https://leetcode.com/problems/two-sum‮/",
    "",
    "   ",
    `https://leetcode.com/problems/two-sum/?${"x".repeat(400)}`,
  ])("rejects %j", (input) => {
    expect(parseLeetCodeProblemUrl(input)).toBeNull();
  });
});

describe("canonical URL and titles", () => {
  it("builds the canonical link from a stored slug", () => {
    expect(leetCodeProblemUrl("two-sum")).toBe("https://leetcode.com/problems/two-sum/");
  });

  it("refuses to build a link from a slug that is not one", () => {
    for (const bad of ["../x", "a/b", "A", "", "x?y", "javascript:alert(1)"]) {
      expect(isLeetCodeSlug(bad)).toBe(false);
      expect(() => leetCodeProblemUrl(bad)).toThrow();
    }
  });

  it("derives a default title from the slug", () => {
    expect(titleFromSlug("longest-substring-without-repeating-characters")).toBe(
      "Longest Substring Without Repeating Characters",
    );
    expect(titleFromSlug("3sum")).toBe("3sum");
  });

  it("the Zod field normalizes to the slug and explains the format", () => {
    expect(leetCodeUrlSchema.parse("http://leetcode.com/problems/two-sum/description/?x=1")).toBe("two-sum");
    const bad = leetCodeUrlSchema.safeParse("https://example.com/problems/two-sum/");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toMatch(/leetcode\.com\/problems\/two-sum/);
  });
});
