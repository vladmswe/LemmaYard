// Pure community rules (docs/specs/community.md §B.4, §B.5, §B.10, §B.11,
// §C.2, §C.5): trust levels, body limits, links, cursors, rate-limit math,
// permissions and the API's Zod schemas.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  bodyProblem,
  codeBlockStats,
  extractMentions,
  MAX_NESTING,
  nestingDepth,
  normalizeForHash,
} from "@/lib/community/body";
import { decodeCursor, encodeCursor } from "@/lib/community/cursor";
import {
  checkLinks,
  extractLinks,
  hostOf,
  isAllowlisted,
  isShortener,
  normalizeLeetCodeUrl,
} from "@/lib/community/links";
import {
  canDeleteComment,
  canEditComment,
  canReport,
  canVoteOn,
  canVoteOnProblem,
  canWrite,
  commentVisibility,
  showEditedMark,
  spoilerMasked,
  type CommentFacts,
  type CommunityViewer,
} from "@/lib/community/permissions";
import { evaluateWindows, retryHint, rulesFor, RATE_LIMITS } from "@/lib/community/rate-limits";
import {
  createCommentSchema,
  editCommentSchema,
  modActionSchema,
  reportSchema,
  voteSchema,
} from "@/lib/community/schemas";
import { isNewAccount, trustLevel } from "@/lib/community/trust";
import { CONTENT_STATUSES, resolveCodeLanguage } from "@/lib/community/types";

const NOW = new Date("2026-10-18T12:00:00Z");
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const UUID = "3f2b8c1e-5d4a-4b6f-9a1c-2e7d8f9a0b1c";

function viewer(overrides: Partial<CommunityViewer> = {}): CommunityViewer {
  return {
    id: "u-1",
    username: "alice",
    role: "user",
    trust: 1,
    suspendedUntil: null,
    createdAt: ago(30 * 24 * HOUR),
    ...overrides,
  };
}

function comment(overrides: Partial<CommentFacts> = {}): CommentFacts {
  return {
    authorId: "u-1",
    status: "visible",
    createdAt: ago(HOUR),
    depth: 0,
    replyCount: 0,
    hasSpoiler: false,
    ...overrides,
  };
}

describe("trust levels (§B.10)", () => {
  it("needs 72 hours and an accepted submission", () => {
    expect(trustLevel({ createdAt: ago(72 * HOUR), hasAccepted: true }, NOW)).toBe(1);
    expect(trustLevel({ createdAt: ago(72 * HOUR - 1), hasAccepted: true }, NOW)).toBe(0);
    expect(trustLevel({ createdAt: ago(1000 * HOUR), hasAccepted: false }, NOW)).toBe(0);
    expect(trustLevel({ createdAt: ago(HOUR), hasAccepted: false }, NOW)).toBe(0);
  });

  it("knows a new account", () => {
    expect(isNewAccount(ago(71 * HOUR), NOW)).toBe(true);
    expect(isNewAccount(ago(72 * HOUR), NOW)).toBe(false);
  });
});

describe("body rules (AC-C-CM-2)", () => {
  const fence = (lines: number, lang = "") => `\`\`\`${lang}\n${Array.from({ length: lines }, (_, i) => `x${i}`).join("\n")}\n\`\`\``;

  it("accepts ordinary text with tabs and newlines", () => {
    expect(bodyProblem("hello\tworld\r\nnext line")).toBeNull();
  });

  it("rejects empty and whitespace-only bodies", () => {
    expect(bodyProblem("")).toMatch(/Write something/);
    expect(bodyProblem("  \n\t ")).toMatch(/Write something/);
  });

  it("caps the trimmed length at 10 000 characters", () => {
    expect(bodyProblem("a".repeat(10_000))).toBeNull();
    expect(bodyProblem(`  ${"a".repeat(10_000)}  `)).toBeNull();
    expect(bodyProblem("a".repeat(10_001))).toMatch(/10,000/);
  });

  it("rejects NUL and other control characters", () => {
    expect(bodyProblem("a\u0000b")).toMatch(/control/);
    expect(bodyProblem("a\u0007b")).toMatch(/control/);
    expect(bodyProblem("a\u001Bb")).toMatch(/control/);
    expect(bodyProblem("a\u007Fb")).toMatch(/control/);
  });

  it("allows 8 code blocks, not 9 (``` and ~~~)", () => {
    const eight = Array.from({ length: 8 }, (_, i) => (i % 2 ? "~~~\nx\n~~~" : "```py\nx\n```")).join("\n\n");
    expect(codeBlockStats(eight).count).toBe(8);
    expect(bodyProblem(eight)).toBeNull();
    expect(bodyProblem(`${eight}\n\n\`\`\`\nx\n\`\`\``)).toMatch(/8 code blocks/);
  });

  it("counts an unclosed fence to the end, and a shorter fence does not close it", () => {
    expect(codeBlockStats("````\na\n```\nb")).toEqual({ count: 1, maxLines: 3 });
    expect(codeBlockStats("~~~\na\n```\nb\n~~~")).toEqual({ count: 1, maxLines: 3 });
    expect(codeBlockStats("``` not`a`fence\n")).toEqual({ count: 0, maxLines: 0 });
  });

  it("allows 200 lines per block, not 201", () => {
    expect(bodyProblem(fence(200))).toBeNull();
    expect(bodyProblem(fence(201))).toMatch(/200 lines/);
  });

  it("allows 5 distinct mentions, not 6", () => {
    expect(bodyProblem("@aaa @bbb @ccc @ddd @eee @aaa")).toBeNull();
    expect(bodyProblem("@aaa @bbb @ccc @ddd @eee @fff")).toMatch(/5 @mentions/);
  });

  it("caps quote and list nesting", () => {
    expect(nestingDepth("> > > x")).toBe(3);
    expect(nestingDepth("- a\n  - b\n    - c")).toBe(2);
    expect(nestingDepth("```\n> > > > > > > > > > > > > > > > > > > > > > > > > > > > > > > > > > >\n```")).toBe(0);
    const deep = `${"> ".repeat(MAX_NESTING)}x`;
    expect(bodyProblem(deep)).toBeNull();
    expect(bodyProblem(`> ${deep}`)).toMatch(/nested/);
  });

  it("normalizes for the duplicate hash", () => {
    expect(normalizeForHash("  Hello\n\tWORLD  ")).toBe("hello world");
    expect(normalizeForHash("a  b")).toBe(normalizeForHash("A\nB"));
  });

  it("extracts mentions in order, lowercased, without emails", () => {
    expect(extractMentions("hi @JSun and @mkowal, @jsun again; mail a@b.com")).toEqual(["jsun", "mkowal"]);
    expect(extractMentions("@ab too short, @valid_name ok")).toEqual(["valid_name"]);
  });
});

describe("links (§B.11, AC-C-RL-3)", () => {
  it("extracts every link-like token and trims trailing punctuation", () => {
    const links = extractLinks(
      "see https://a.example/x. and http://b.example, www.c.example; //d.example/p and mailto:e@f.g!",
    );
    expect(links.map((l) => l.url)).toEqual([
      "https://a.example/x",
      "http://b.example",
      "www.c.example",
      "//d.example/p",
      "mailto:e@f.g",
    ]);
    expect(links.map((l) => l.host)).toEqual(["a.example", "b.example", "c.example", "d.example", null]);
  });

  it("finds markdown link targets", () => {
    expect(extractLinks("[x](https://evil.example/a) and ![i](http://img.example/p.png)")).toHaveLength(2);
  });

  it("reads hosts without www", () => {
    expect(hostOf("https://WWW.GitHub.com/x")).toBe("github.com");
    expect(hostOf("not a url")).toBeNull();
  });

  it("allowlists the known hosts, their subdomains and the site itself", () => {
    const link = (url: string) => extractLinks(url)[0];
    expect(isAllowlisted(link("https://leetcode.com/problems/two-sum/"))).toBe(true);
    expect(isAllowlisted(link("https://gist.github.com/x"))).toBe(true);
    expect(isAllowlisted(link("https://en.wikipedia.org/wiki/Hash_table"))).toBe(true);
    expect(isAllowlisted(link("https://notgithub.com/x"))).toBe(false);
    expect(isAllowlisted(link("https://github.com.evil.example/x"))).toBe(false);
    expect(isAllowlisted(link("https://lemma.example/p"), "lemma.example")).toBe(true);
    expect(isAllowlisted(link("mailto:a@b.c"))).toBe(false);
  });

  it("recognizes shorteners", () => {
    expect(isShortener(extractLinks("https://bit.ly/abc")[0])).toBe(true);
    expect(isShortener(extractLinks("https://t.co/abc")[0])).toBe(true);
    expect(isShortener(extractLinks("https://github.com/abc")[0])).toBe(false);
  });

  it("applies the caps per trust level", () => {
    expect(checkLinks("https://a.example", 0, null)).toEqual({ ok: true, total: 1, external: 1 });
    expect(checkLinks("https://a.example https://b.example", 0, null)).toMatchObject({ ok: false, reason: "too_many_links" });
    expect(checkLinks("https://leetcode.com/x https://github.com/y https://a.example", 0, null)).toMatchObject({ ok: true, external: 1 });
    const ten = Array.from({ length: 10 }, (_, i) => `https://h${i}.example`).join(" ");
    expect(checkLinks(ten, 1, null)).toMatchObject({ ok: true, external: 10 });
    expect(checkLinks(`${ten} https://h10.example`, 1, null)).toMatchObject({ ok: false, reason: "too_many_links" });
  });

  it("rejects shorteners for everyone", () => {
    expect(checkLinks("https://bit.ly/x", 0, null)).toMatchObject({ ok: false, reason: "shortener" });
    expect(checkLinks("https://tinyurl.com/x", 1, null)).toMatchObject({ ok: false, reason: "shortener" });
  });

  it.each([
    ["http://leetcode.com/problems/two-sum/description/?x=1", "https://leetcode.com/problems/two-sum/"],
    ["https://leetcode.com/problems/two-sum/", "https://leetcode.com/problems/two-sum/"],
    ["https://leetcode.com/problems/two-sum", "https://leetcode.com/problems/two-sum/"],
    ["https://www.leetcode.com/problems/two-sum/", "https://leetcode.com/problems/two-sum/"],
    ["HTTPS://LEETCODE.COM/PROBLEMS/TWO-SUM/", "https://leetcode.com/problems/two-sum/"],
    ["https://leetcode.com/problems/two-sum/solutions/123/abc", "https://leetcode.com/problems/two-sum/"],
    ["https://leetcode.com/problems/lru-cache/#frag", "https://leetcode.com/problems/lru-cache/"],
    ["  https://leetcode.com/problems/3sum/  ", "https://leetcode.com/problems/3sum/"],
    ["https://leetcode.com:443/problems/two-sum/", "https://leetcode.com/problems/two-sum/"],
    ["http://leetcode.com:80/problems/two-sum/", "https://leetcode.com/problems/two-sum/"],
    ["https://leetcode.com/problems/two-sum/?envType=study-plan", "https://leetcode.com/problems/two-sum/"],
    ["https://leetcode.com/problems/a/", "https://leetcode.com/problems/a/"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeLeetCodeUrl(raw)).toBe(expected);
  });

  it.each([
    "https://leetcode.cn/problems/two-sum/",
    "https://evil.example/problems/two-sum/",
    "https://leetcode.com.evil.example/problems/two-sum/",
    "https://evilleetcode.com/problems/two-sum/",
    "https://leetcode.com/",
    "https://leetcode.com/problemset/all/",
    "https://leetcode.com/problems/",
    "https://leetcode.com/problems/two_sum/",
    "https://leetcode.com/problems/two%20sum/",
    "https://leetcode.com/discuss/123",
    "https://user:pw@leetcode.com/problems/two-sum/",
    "https://leetcode.com@evil.example/problems/two-sum/",
    "https://leetcode.com:8080/problems/two-sum/",
    "javascript:alert(1)//leetcode.com/problems/two-sum/",
    "ftp://leetcode.com/problems/two-sum/",
    "leetcode.com/problems/two-sum/",
    "//leetcode.com/problems/two-sum/",
    `https://leetcode.com/problems/${"a".repeat(101)}/`,
    "not a url",
    "",
  ])("rejects %s", (raw) => {
    expect(normalizeLeetCodeUrl(raw)).toBeNull();
  });
});

describe("cursors (§C.5)", () => {
  it("round-trips", () => {
    const c = { k: [0.25, "2026-10-18T12:00:00.123456Z"], id: UUID };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("round-trips any valid cursor (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.double({ noNaN: true, noDefaultInfinity: true }), fc.string({ maxLength: 40 })), { minLength: 1, maxLength: 3 }),
        fc.uuid(),
        (k, id) => {
          const decoded = decodeCursor(encodeCursor({ k, id }));
          expect(decoded).toEqual({ k: k.map((v) => (Object.is(v, -0) ? 0 : v)), id });
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects malformed input", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("!!!")).toBeNull();
    expect(decodeCursor("a".repeat(401))).toBeNull();
    expect(decodeCursor(b64("not json"))).toBeNull();
    expect(decodeCursor(b64(JSON.stringify({ k: [], id: UUID })))).toBeNull();
    expect(decodeCursor(b64(JSON.stringify({ k: [1], id: "nope" })))).toBeNull();
    expect(decodeCursor(b64(JSON.stringify({ k: [1], id: UUID, extra: 1 })))).toBeNull();
    expect(decodeCursor(b64(JSON.stringify({ k: [{}], id: UUID })))).toBeNull();
    expect(decodeCursor(b64(JSON.stringify({ k: [1, 2, 3, 4], id: UUID })))).toBeNull();
  });
});

describe("rate limits (§B.11)", () => {
  const rules = RATE_LIMITS.comment[0];

  it("uses the spec's numbers", () => {
    expect(RATE_LIMITS.comment[0].map((r) => [r.limit, r.windowMs])).toEqual([[3, 600_000], [10, 24 * HOUR]]);
    expect(RATE_LIMITS.comment[1].map((r) => [r.limit, r.windowMs])).toEqual([[10, 600_000], [100, 24 * HOUR]]);
    expect(RATE_LIMITS.edit[0][0].limit).toBe(10);
    expect(RATE_LIMITS.edit[1][0].limit).toBe(30);
    expect(RATE_LIMITS.vote[0].map((r) => r.limit)).toEqual([30]);
    expect(RATE_LIMITS.vote[1].map((r) => r.limit)).toEqual([120, 500]);
    expect(RATE_LIMITS.downvote[1].map((r) => r.limit)).toEqual([50]);
    expect(RATE_LIMITS.report[0][0].limit).toBe(5);
    expect(RATE_LIMITS.report[1][0].limit).toBe(20);
  });

  it("does not limit moderators", () => {
    expect(rulesFor("comment", 0, true)).toEqual([]);
    expect(rulesFor("vote", 1, true)).toEqual([]);
    expect(rulesFor("comment", 0, false)).toBe(RATE_LIMITS.comment[0]);
  });

  it("passes under every window", () => {
    expect(evaluateWindows(rules, [{ count: 2, oldest: ago(60_000) }, { count: 9, oldest: ago(HOUR) }], NOW)).toEqual({ ok: true });
    expect(evaluateWindows(rules, [], NOW)).toEqual({ ok: true });
  });

  it("blocks at the short window with Retry-After = oldest + window − now", () => {
    const d = evaluateWindows(rules, [{ count: 3, oldest: ago(4 * 60_000) }, { count: 3, oldest: ago(4 * 60_000) }], NOW);
    expect(d).toMatchObject({ ok: false, retryAfterSec: 360, rule: rules[0] });
  });

  it("blocks at the daily window (the 11th TL0 comment)", () => {
    const d = evaluateWindows(rules, [{ count: 0, oldest: null }, { count: 10, oldest: ago(23 * HOUR) }], NOW);
    expect(d).toMatchObject({ ok: false, retryAfterSec: 3600, rule: rules[1] });
  });

  it("answers at least 1 second", () => {
    const d = evaluateWindows(rules, [{ count: 3, oldest: ago(600_000) }], NOW);
    expect(d).toMatchObject({ ok: false, retryAfterSec: 1 });
    expect(evaluateWindows(rules, [{ count: 3, oldest: null }], NOW)).toMatchObject({ ok: false, retryAfterSec: 600 });
  });

  it("phrases the wait", () => {
    expect(retryHint(30)).toBe("Try again in 30 seconds.");
    expect(retryHint(360)).toBe("Try again in 6 minutes.");
    expect(retryHint(3 * 3600)).toBe("Try again in 3 hours.");
  });
});

describe("permissions (§B.4, §B.5, §B.10)", () => {
  it("canWrite: guests 401, suspended 403 with until, expired suspension ok", () => {
    expect(canWrite(null, NOW)).toMatchObject({ ok: false, status: 401 });
    const until = new Date(NOW.getTime() + HOUR);
    expect(canWrite(viewer({ suspendedUntil: until }), NOW)).toMatchObject({
      ok: false,
      status: 403,
      code: "suspended",
      until: until.toISOString(),
    });
    expect(canWrite(viewer({ suspendedUntil: ago(1) }), NOW)).toEqual({ ok: true });
  });

  it("canEditComment: author only, 24 h, not deleted or removed", () => {
    expect(canEditComment(comment(), viewer(), NOW)).toEqual({ ok: true });
    expect(canEditComment(comment({ authorId: "u-2" }), viewer(), NOW)).toMatchObject({ status: 403 });
    expect(canEditComment(comment({ createdAt: ago(24 * HOUR + 1) }), viewer(), NOW)).toMatchObject({
      status: 409,
      code: "edit_window_closed",
    });
    expect(canEditComment(comment({ status: "deleted" }), viewer(), NOW)).toMatchObject({ status: 409 });
    expect(canEditComment(comment({ status: "removed" }), viewer(), NOW)).toMatchObject({ status: 409 });
    expect(canEditComment(comment({ status: "hidden_pending" }), viewer(), NOW)).toEqual({ ok: true });
    expect(canEditComment(comment(), null, NOW)).toMatchObject({ status: 401 });
  });

  it("canDeleteComment: author only, not twice", () => {
    expect(canDeleteComment(comment({ createdAt: ago(1000 * HOUR) }), viewer(), NOW)).toEqual({ ok: true });
    expect(canDeleteComment(comment({ authorId: "u-2" }), viewer({ role: "admin" }), NOW)).toMatchObject({ status: 403 });
    expect(canDeleteComment(comment({ status: "deleted" }), viewer(), NOW)).toMatchObject({ status: 409 });
  });

  it("canVoteOn (AC-C-VT-2)", () => {
    const other = { authorId: "u-2", status: "visible" as const };
    expect(canVoteOn(other, viewer(), 1, NOW)).toEqual({ ok: true });
    expect(canVoteOn(other, viewer(), -1, NOW)).toEqual({ ok: true });
    expect(canVoteOn({ authorId: "u-1", status: "visible" }, viewer(), 1, NOW)).toMatchObject({ status: 409, code: "self_vote" });
    for (const status of ["hidden_pending", "removed", "deleted"] as const) {
      expect(canVoteOn({ authorId: "u-2", status }, viewer(), 1, NOW)).toMatchObject({ status: 409, code: "not_votable" });
    }
    expect(canVoteOn(other, viewer({ trust: 0 }), 1, NOW)).toEqual({ ok: true });
    expect(canVoteOn(other, viewer({ trust: 0 }), 0, NOW)).toEqual({ ok: true });
    expect(canVoteOn(other, viewer({ trust: 0 }), -1, NOW)).toMatchObject({ status: 403, code: "trust_required" });
    expect(canVoteOn(other, viewer({ trust: 0, role: "moderator" }), -1, NOW)).toEqual({ ok: true });
    // Suspension is checked first.
    expect(
      canVoteOn({ authorId: "u-1", status: "removed" }, viewer({ suspendedUntil: new Date(NOW.getTime() + HOUR) }), 1, NOW),
    ).toMatchObject({ status: 403, code: "suspended" });
    expect(canVoteOn(other, null, 1, NOW)).toMatchObject({ status: 401 });
  });

  it("canVoteOnProblem", () => {
    expect(canVoteOnProblem(viewer({ trust: 0 }), 1, NOW)).toEqual({ ok: true });
    expect(canVoteOnProblem(viewer({ trust: 0 }), -1, NOW)).toMatchObject({ status: 403, code: "trust_required" });
    expect(canVoteOnProblem(viewer({ trust: 1 }), -1, NOW)).toEqual({ ok: true });
    expect(canVoteOnProblem(null, 1, NOW)).toMatchObject({ status: 401 });
  });

  it("canReport", () => {
    expect(canReport({ authorId: "u-2", status: "visible" }, viewer(), NOW)).toEqual({ ok: true });
    expect(canReport({ authorId: "u-2", status: "hidden_pending" }, viewer(), NOW)).toEqual({ ok: true });
    expect(canReport({ authorId: "u-1", status: "visible" }, viewer(), NOW)).toMatchObject({ status: 409, code: "own_content" });
    expect(canReport({ authorId: "u-2", status: "deleted" }, viewer(), NOW)).toMatchObject({ status: 409 });
    expect(canReport({ authorId: null, status: "visible" }, viewer(), NOW)).toEqual({ ok: true });
  });

  describe("commentVisibility (AC-C-RP-2, AC-C-CM-4)", () => {
    const stranger = { id: "u-9", role: "user" as const };
    const author = { id: "u-1", role: "user" as const };
    const moderator = { id: "u-8", role: "moderator" as const };
    const shapes = {
      topWithReplies: { depth: 0 as const, replyCount: 2 },
      topAlone: { depth: 0 as const, replyCount: 0 },
      reply: { depth: 1 as const, replyCount: 0 },
    };
    // [status][shape] → [guest, stranger, author, moderator]
    const expected: Record<string, Record<keyof typeof shapes, string[]>> = {
      visible: {
        topWithReplies: ["full", "full", "full", "full"],
        topAlone: ["full", "full", "full", "full"],
        reply: ["full", "full", "full", "full"],
      },
      hidden_pending: {
        topWithReplies: ["hidden", "hidden", "full", "full"],
        topAlone: ["hidden", "hidden", "full", "full"],
        reply: ["hidden", "hidden", "full", "full"],
      },
      removed: {
        topWithReplies: ["placeholder", "placeholder", "placeholder", "placeholder"],
        topAlone: ["hidden", "hidden", "placeholder", "placeholder"],
        reply: ["hidden", "hidden", "placeholder", "placeholder"],
      },
      deleted: {
        topWithReplies: ["placeholder", "placeholder", "placeholder", "placeholder"],
        topAlone: ["hidden", "hidden", "hidden", "hidden"],
        reply: ["hidden", "hidden", "hidden", "hidden"],
      },
    };
    for (const status of CONTENT_STATUSES) {
      for (const [shapeName, shape] of Object.entries(shapes) as [keyof typeof shapes, (typeof shapes)[keyof typeof shapes]][]) {
        it(`${status} / ${shapeName}`, () => {
          const c = { authorId: "u-1", status, ...shape };
          expect([null, stranger, author, moderator].map((v) => commentVisibility(c, v))).toEqual(expected[status][shapeName]);
        });
      }
    }
  });

  it("spoilerMasked (AC-C-CM-5)", () => {
    const spoiler = { hasSpoiler: true, authorId: "u-1" };
    expect(spoilerMasked(spoiler, { id: "u-1" }, false)).toBe(false);
    expect(spoilerMasked(spoiler, { id: "u-2" }, true)).toBe(false);
    expect(spoilerMasked(spoiler, { id: "u-2" }, false)).toBe(true);
    expect(spoilerMasked(spoiler, null, false)).toBe(true);
    expect(spoilerMasked({ hasSpoiler: false, authorId: "u-1" }, null, false)).toBe(false);
  });

  it("showEditedMark: 5-minute grace (AC-C-CM-3)", () => {
    const created = ago(HOUR);
    expect(showEditedMark(created, null)).toBe(false);
    expect(showEditedMark(created, new Date(created.getTime() + 5 * 60_000))).toBe(false);
    expect(showEditedMark(created, new Date(created.getTime() + 5 * 60_000 + 1))).toBe(true);
  });
});

describe("API schemas (§C.2)", () => {
  const valid = { target: "problem:two-sum", body: "  hello  ", hasSpoiler: false };

  it("createCommentSchema parses the target and trims the body", () => {
    const r = createCommentSchema.parse(valid);
    expect(r).toEqual({ target: { kind: "problem", slug: "two-sum" }, body: "hello", hasSpoiler: false });
    expect(createCommentSchema.parse({ target: "problem:two-sum", body: "x" }).hasSpoiler).toBe(false);
    expect(createCommentSchema.parse({ ...valid, parentId: UUID }).parentId).toBe(UUID);
  });

  it.each([
    ["unknown target kind", { ...valid, target: "post:abc" }],
    ["bad slug", { ...valid, target: "problem:Two_Sum" }],
    ["double dash slug", { ...valid, target: "problem:two--sum" }],
    ["empty body", { ...valid, body: "   " }],
    ["NUL in body", { ...valid, body: "a\u0000b" }],
    ["too long body", { ...valid, body: "a".repeat(10_001) }],
    ["unknown key", { ...valid, extra: 1 }],
    ["bad parent id", { ...valid, parentId: "123" }],
    ["spoiler not boolean", { ...valid, hasSpoiler: "yes" }],
  ])("createCommentSchema rejects %s", (_n, input) => {
    expect(createCommentSchema.safeParse(input).success).toBe(false);
  });

  it("editCommentSchema", () => {
    expect(editCommentSchema.parse({ body: " x " })).toEqual({ body: "x" });
    expect(editCommentSchema.safeParse({ body: "x", target: "problem:a" }).success).toBe(false);
  });

  it("voteSchema accepts -1, 0, 1 only", () => {
    for (const value of [-1, 0, 1]) expect(voteSchema.parse({ value })).toEqual({ value });
    for (const value of [2, -2, 0.5, "1", null]) expect(voteSchema.safeParse({ value }).success).toBe(false);
  });

  it("reportSchema", () => {
    const base = { targetType: "comment", targetId: UUID, reason: "spam" };
    expect(reportSchema.parse({ ...base, details: "  why  " })).toEqual({ ...base, details: "why" });
    expect(reportSchema.safeParse({ ...base, reason: "boring" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, targetType: "post" }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, details: "a".repeat(1000) }).success).toBe(true);
    expect(reportSchema.safeParse({ ...base, details: "a".repeat(1001) }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, details: "a\u0000" }).success).toBe(false);
  });

  it("modActionSchema", () => {
    const base = { action: "hide", targetType: "comment", targetId: UUID, reason: "  spam  " };
    expect(modActionSchema.parse(base).reason).toBe("spam");
    expect(modActionSchema.safeParse({ ...base, reason: "   " }).success).toBe(false);
    expect(modActionSchema.safeParse({ ...base, reason: "a".repeat(501) }).success).toBe(false);
    expect(modActionSchema.safeParse({ ...base, targetType: "thread" }).success).toBe(false);
    expect(modActionSchema.safeParse({ ...base, action: "lock", targetType: "thread" }).success).toBe(true);
    expect(modActionSchema.safeParse({ ...base, action: "suspend", targetType: "user" }).success).toBe(false);
    expect(modActionSchema.safeParse({ ...base, action: "suspend", targetType: "user", days: 7 }).success).toBe(true);
    expect(modActionSchema.safeParse({ ...base, action: "suspend", targetType: "user", days: 30 }).success).toBe(true);
    expect(modActionSchema.safeParse({ ...base, action: "suspend", targetType: "user", days: 14 }).success).toBe(false);
    expect(modActionSchema.safeParse({ ...base, action: "void_votes" }).success).toBe(false);
  });
});

describe("resolveCodeLanguage", () => {
  it.each([
    ["python", "python"],
    ["PY", "python"],
    ["js", "javascript"],
    ["ts", "typescript"],
    ["c++", "cpp"],
    ["c#", "csharp"],
    ["golang", "go"],
    ["txt", "text"],
    ["brainfuck", null],
    ["", null],
    [null, null],
  ] as const)("%s → %s", (tag, expected) => {
    expect(resolveCodeLanguage(tag)).toBe(expected);
  });
});
