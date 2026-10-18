// LeetCode problems in rooms (docs/specs/rooms-external-problems.md): strict
// URL parsing (hostile inputs), titles, request bodies, the form validator,
// and the pure view pieces (self-reported cells, feed lines, lobby rules,
// snapshot spoilers). Pure: no DB, no network (nothing is ever fetched from
// leetcode.com).
import { describe, expect, it } from "vitest";

import type { RoomEvent } from "@/lib/rooms/events";
import { validateNewRoomEvent } from "@/lib/rooms/events";
import {
  bankBodySchema,
  EXTERNAL_SLUG_MAX,
  emptyExternalForm,
  externalFormFrom,
  isExternalSlug,
  leetcodeProblemUrl,
  normalizeExternalInput,
  parseLeetCodeUrl,
  selfReportBodySchema,
  sessionExternalBodySchema,
  titleFromSlug,
  validateExternalForm,
} from "@/lib/rooms/external";
import { formFromLobby, mixError, settingsDiff } from "@/lib/rooms/lobby-copy";
import { startBlockedReason } from "@/lib/rooms/lobby-rating";
import { cellSrText, cellView, hasExternalProblems, matrixRows, myProblemStatus, selfReportedPositions } from "@/lib/rooms/live-view";
import { eventNotice, feedLine, type NoticeContext } from "@/lib/rooms/notifications";
import { presetSummary, validatePresetForm, emptyPresetForm, lobbyMatchesPreset } from "@/lib/rooms/preset-form";
import { CODE_DEFAULT_PRESET, presetsSchema } from "@/lib/rooms/room-defaults";
import { resolveSettings, settingsFromTemplate } from "@/lib/rooms/session-schemas";
import { buildSessionSnapshot, type LobbyView } from "@/lib/rooms/session-view";

describe("parseLeetCodeUrl", () => {
  it.each([
    ["https://leetcode.com/problems/two-sum/", "two-sum"],
    ["https://leetcode.com/problems/two-sum", "two-sum"],
    ["  https://leetcode.com/problems/two-sum/  ", "two-sum"],
    ["https://leetcode.com/problems/two-sum/description/", "two-sum"],
    ["https://leetcode.com/problems/two-sum/submissions/1234/", "two-sum"],
    ["https://leetcode.com/problems/two-sum/?envType=study-plan&id=x", "two-sum"],
    ["https://leetcode.com/problems/two-sum/#top", "two-sum"],
    ["HTTPS://LeetCode.com/problems/3sum-closest/", "3sum-closest"],
    ["https://leetcode.com/problems/4sum", "4sum"],
  ])("accepts %j → %s", (input, slug) => {
    expect(parseLeetCodeUrl(input)).toEqual({ ok: true, slug });
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["javascript", "javascript:alert(1)"],
    ["javascript hidden in the path", "javascript://leetcode.com/problems/two-sum/%0aalert(1)"],
    ["data", "data:text/html,<script>alert(1)</script>"],
    ["vbscript", "vbscript:msgbox(1)"],
    ["http", "http://leetcode.com/problems/two-sum/"],
    ["ftp", "ftp://leetcode.com/problems/two-sum/"],
    ["protocol-relative", "//leetcode.com/problems/two-sum/"],
    ["no scheme", "leetcode.com/problems/two-sum/"],
    ["bare slug", "two-sum"],
    ["other host", "https://example.com/problems/two-sum/"],
    ["leetcode.cn", "https://leetcode.cn/problems/two-sum/"],
    ["subdomain", "https://www.leetcode.com/problems/two-sum/"],
    ["suffix host", "https://leetcode.com.evil.io/problems/two-sum/"],
    ["prefix host", "https://evilleetcode.com/problems/two-sum/"],
    ["trailing dot host", "https://leetcode.com./problems/two-sum/"],
    ["userinfo", "https://user@leetcode.com/problems/two-sum/"],
    ["userinfo with password", "https://user:pass@leetcode.com/problems/two-sum/"],
    ["host in userinfo", "https://leetcode.com@evil.io/problems/two-sum/"],
    ["explicit default port", "https://leetcode.com:443/problems/two-sum/"],
    ["other port", "https://leetcode.com:8443/problems/two-sum/"],
    ["Cyrillic e", "https://leеtcode.com/problems/two-sum/"],
    ["Cyrillic in slug", "https://leetcode.com/problems/twо-sum/"],
    ["full-width", "ｈｔｔｐｓ://leetcode.com/problems/two-sum/"],
    ["punycode host", "https://xn--leetcode-xyz.com/problems/two-sum/"],
    ["zero-width space", "https://leetcode.com/problems/two​-sum/"],
    ["tab inside", "https://leet\tcode.com/problems/two-sum/"],
    ["newline inside", "https://leetcode.com/problems/two-sum/\njavascript:alert(1)"],
    ["space in query", "https://leetcode.com/problems/two-sum/?a=b c"],
    ["backslash", "https://leetcode.com\\problems\\two-sum\\"],
    ["backslash host trick", "https://leetcode.com\\@evil.io/problems/two-sum/"],
    ["dot-dot before slug", "https://leetcode.com/problems/../two-sum/"],
    ["dot-dot after slug", "https://leetcode.com/problems/two-sum/../../accounts/logout/"],
    ["single dot", "https://leetcode.com/problems/./two-sum/"],
    ["encoded dot", "https://leetcode.com/problems/%2e%2e/two-sum/"],
    ["encoded slash", "https://leetcode.com/problems/two-sum%2f..%2f..%2fx"],
    ["encoded letter", "https://leetcode.com/problems/%74wo-sum/"],
    ["uppercase slug", "https://leetcode.com/problems/Two-Sum/"],
    ["underscore slug", "https://leetcode.com/problems/two_sum/"],
    ["leading hyphen", "https://leetcode.com/problems/-two-sum/"],
    ["double hyphen", "https://leetcode.com/problems/two--sum/"],
    ["not a problem", "https://leetcode.com/contest/weekly-contest-400/"],
    ["problems root", "https://leetcode.com/problems/"],
    ["double slash", "https://leetcode.com//problems/two-sum/"],
    ["query before path", "https://leetcode.com?x=/problems/two-sum/"],
    ["too long", `https://leetcode.com/problems/${"a".repeat(400)}/`],
  ])("rejects %s", (_name, input) => {
    expect(parseLeetCodeUrl(input).ok).toBe(false);
  });

  it("caps the slug at 100 characters", () => {
    expect(parseLeetCodeUrl(`https://leetcode.com/problems/${"a".repeat(EXTERNAL_SLUG_MAX)}/`).ok).toBe(true);
    expect(parseLeetCodeUrl(`https://leetcode.com/problems/${"a".repeat(EXTERNAL_SLUG_MAX + 1)}/`).ok).toBe(false);
  });

  it("leetcodeProblemUrl builds the canonical link from a valid slug only", () => {
    expect(leetcodeProblemUrl("two-sum")).toBe("https://leetcode.com/problems/two-sum/");
    for (const bad of ["../x", "a/b", "javascript:alert(1)", "", "A", "x y"]) {
      expect(isExternalSlug(bad)).toBe(false);
      expect(() => leetcodeProblemUrl(bad)).toThrow();
    }
  });
});

describe("titles and bodies", () => {
  it("titleFromSlug: Title Case of the words", () => {
    expect(titleFromSlug("two-sum")).toBe("Two Sum");
    expect(titleFromSlug("3sum-closest")).toBe("3sum Closest");
    expect(titleFromSlug("a")).toBe("A");
  });

  it("normalizeExternalInput keeps the slug only and defaults the title", () => {
    expect(normalizeExternalInput({ url: "https://leetcode.com/problems/house-robber/?x=1", title: "  " })).toEqual({
      slug: "house-robber",
      title: "House Robber",
      difficulty: null,
      rating: null,
    });
    expect(() => normalizeExternalInput({ url: "https://evil.io/problems/x/" })).toThrow();
  });

  it("bodies are strict", () => {
    expect(bankBodySchema.safeParse({ action: "add", url: "https://leetcode.com/problems/two-sum/" }).success).toBe(true);
    expect(bankBodySchema.safeParse({ action: "add", url: "https://leetcode.com/problems/two-sum/", slug: "x" }).success).toBe(false);
    expect(bankBodySchema.safeParse({ action: "add", url: "https://leetcode.com/problems/two-sum/", title: "a‮b" }).success).toBe(false);
    expect(bankBodySchema.safeParse({ action: "add", url: "https://leetcode.com/problems/two-sum/", title: "a​b" }).success).toBe(false);
    expect(bankBodySchema.safeParse({ action: "delete", id: "not-a-uuid" }).success).toBe(false);
    expect(sessionExternalBodySchema.safeParse({ action: "remove", position: 9 }).success).toBe(false);
    expect(sessionExternalBodySchema.safeParse({ action: "add", bankId: "00000000-0000-4000-8000-000000000000", url: "x" }).success).toBe(false);
    expect(selfReportBodySchema.safeParse({ solved: true }).success).toBe(true);
    expect(selfReportBodySchema.safeParse({ solved: true, at: "2026-01-01T00:00:00Z" }).success).toBe(false);
    expect(selfReportBodySchema.safeParse({ solved: "yes" }).success).toBe(false);
  });

  it("validateExternalForm mirrors the server's messages", () => {
    expect(validateExternalForm({ ...emptyExternalForm(), url: "https://leetcode.com/problems/two-sum/" })).toEqual({
      ok: true,
      input: { url: "https://leetcode.com/problems/two-sum/", title: "", difficulty: null, rating: null },
    });
    const bad = validateExternalForm({ url: "https://example.com/", title: "", difficulty: "", rating: "12x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(["rating", "url"]);
    const form = externalFormFrom({ slug: "two-sum", title: "Two Sum", difficulty: "easy", rating: 1200 });
    expect(validateExternalForm(form)).toMatchObject({ ok: true, input: { difficulty: "easy", rating: 1200 } });
  });

  it("problem_solved events may carry selfReported; solve_undone has an actor and a position", () => {
    expect(() =>
      validateNewRoomEvent({
        type: "problem_solved",
        actorUserId: "u",
        payload: { position: 2, solveSeconds: 60, wrongBefore: 0, firstSolver: true, solvedCount: 1, selfReported: true },
      }),
    ).not.toThrow();
    expect(() => validateNewRoomEvent({ type: "solve_undone", actorUserId: "u", payload: { position: 2, solvedCount: 0 } })).not.toThrow();
    expect(() => validateNewRoomEvent({ type: "solve_undone", payload: { position: 2, solvedCount: 0 } })).toThrow();
  });
});

describe("self-reported cells and feed", () => {
  const cell = { position: 2, attempts: 1, wrongBefore: 0, solveSeconds: 1470, firstSolver: true, solvedBefore: false };

  it("cells of LeetCode columns are marked and say so to screen readers", () => {
    const v = cellView(cell, 2, { selfReported: true });
    expect(v).toMatchObject({ state: "solved", selfReported: true });
    expect(v.srText).toBe("Problem 2: marked solved (self-reported) 24 minutes 30 seconds after the start, first to solve it");
    expect(cellSrText({ ...v, state: "untouched" })).toBe("Problem 2: not marked solved");
    expect(cellView(cell, 2).selfReported).toBe(false);
  });

  it("matrixRows marks only the LeetCode positions", () => {
    const rows = matrixRows(
      [{ userId: "u", username: "bob", isHost: false, rank: 1, solvedCount: 2, penaltySec: 2000, cells: [{ ...cell, position: 1 }, cell] }],
      [1, 2],
      { viewerId: null, selfReported: selfReportedPositions([{ position: 1 }, { position: 2, external: {} }]) },
    );
    expect(rows[0].cells.map((c) => c.selfReported)).toEqual([false, true]);
    expect(hasExternalProblems([{}])).toBe(false);
  });

  const ctx: NoticeContext = {
    viewerId: "me",
    titles: new Map([[2, "Two Sum"]]),
    problemCount: 2,
    durationMin: 60,
    showAttempts: true,
    links: { scoreboard: "#s", results: "#r", firstProblem: null },
  };
  const solved: RoomEvent = {
    id: "5",
    type: "problem_solved",
    at: "2026-10-24T18:24:30.000Z",
    actor: { userId: "bob", username: "bob" },
    payload: { position: 2, solveSeconds: 1470, wrongBefore: 0, firstSolver: true, solvedCount: 1, selfReported: true },
  };

  it("feed and toast copy say self-reported; undo is a feed line only", () => {
    expect(feedLine(solved, ctx, "2026-10-24T18:00:00.000Z")).toMatchObject({
      kind: "solved",
      text: "bob marked Problem 2 · Two Sum solved (self-reported) (first)",
    });
    expect(eventNotice(solved, ctx, true)?.title).toBe("bob marked Problem 2 · Two Sum solved (self-reported)");
    const undone: RoomEvent = { id: "6", type: "solve_undone", at: solved.at, actor: solved.actor, payload: { position: 2, solvedCount: 0 } };
    expect(feedLine(undone, ctx, null)?.text).toBe("bob undid their self-reported solve of Problem 2 · Two Sum");
    expect(eventNotice(undone, ctx, true)).toBeNull();
  });
});

describe("lobby and presets with LeetCode slots", () => {
  const lobby = (over: Partial<LobbyView> = {}): LobbyView => ({
    sessionId: "s",
    roomId: "r",
    status: "lobby",
    hostId: "h",
    canManage: true,
    problemCount: 3,
    durationMin: 60,
    plannedFor: null,
    settings: { tags: [], mixMode: "manual", mix: { easy: 2, medium: 0, hard: 0 }, challenge: "balanced", avoidSolved: true, mode: "difficulty", external: 1 },
    rerollCount: 0,
    rerollsLeft: 30,
    slots: [
      { position: 1, difficulty: "easy", pinned: false, tags: [] },
      { position: 2, difficulty: "easy", pinned: false, tags: [] },
    ],
    actualMix: { easy: 2, medium: 0, hard: 0 },
    notices: [],
    mode: "difficulty",
    rated: true,
    ...over,
  });

  it("start is blocked until the LeetCode slot is picked", () => {
    expect(startBlockedReason(lobby())).toBe("Pick 1 LeetCode problem to start.");
    const filled = lobby({ slots: [...lobby().slots, { position: 3, difficulty: null, pinned: false, tags: [], external: {} }] });
    expect(startBlockedReason(filled)).toBeNull();
  });

  it("the custom mix adds up to the drawn slots; a preset tile can change the LeetCode count", () => {
    const form = formFromLobby(lobby());
    expect(form.external).toBe(1);
    expect(mixError(form)).toBeNull();
    expect(mixError({ ...form, mix: { easy: 3, medium: 0, hard: 0 } })).toMatch(/must add up to 2 problems \(1 more from LeetCode\)/);
    expect(mixError({ ...form, problemCount: 1, external: 2 })).toMatch(/LeetCode/);
    expect(settingsDiff(lobby(), { ...form, external: 2, mix: { easy: 1, medium: 0, hard: 0 } })).toEqual({
      external: 2,
      mixMode: "manual",
      mix: { easy: 1, medium: 0, hard: 0 },
    });
  });

  it("resolveSettings: N ≥ LeetCode slots, mix = N − LeetCode slots; presets carry the count", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    expect(resolveSettings(null, { problemCount: 2, external: 3 }, now)).toMatchObject({ status: 400, field: "problemCount" });
    expect(resolveSettings(null, { problemCount: 3, external: 1, mixMode: "manual", mix: { easy: 3, medium: 0, hard: 0 } }, now)).toMatchObject({
      status: 400,
      field: "mix",
    });
    const ok = resolveSettings(null, { problemCount: 3, external: 1, mixMode: "manual", mix: { easy: 2, medium: 0, hard: 0 } }, now);
    expect(ok).toMatchObject({ problemCount: 3, settings: { external: 1 } });
    expect(resolveSettings(null, { problemCount: 3 }, now)).not.toHaveProperty("settings.external");
    expect(settingsFromTemplate({ ...CODE_DEFAULT_PRESET, external: 2 }).settings.external).toBe(2);

    expect(presetsSchema.safeParse([{ ...CODE_DEFAULT_PRESET, external: 5 }]).success).toBe(false);
    expect(presetsSchema.safeParse([{ ...CODE_DEFAULT_PRESET, external: 1 }]).success).toBe(true);
    expect(presetSummary({ ...CODE_DEFAULT_PRESET, external: 1 })).toBe("90 min · 4 problems · 1 from LeetCode · by rating · balanced");
    const v = validatePresetForm({ ...emptyPresetForm(), name: "Mixed", mode: "difficulty", mixMode: "manual", mix: { easy: 4, medium: 0, hard: 0 }, external: 1 });
    expect(v.ok).toBe(false);
    const f = { ...emptyPresetForm(), name: "x", external: 1, plannedFor: "" };
    expect(lobbyMatchesPreset(f, { ...CODE_DEFAULT_PRESET })).toBe(false);
    expect(lobbyMatchesPreset(f, { ...CODE_DEFAULT_PRESET, external: 1 })).toBe(true);
  });
});

describe("snapshot spoilers", () => {
  const input = (revealTitles: boolean) => ({
    session: { status: "lobby" as const, startedAt: null, endsAt: null, durationMin: 60, problemCount: 2, hostId: "h" },
    problems: [
      { position: 1, slug: "easy-1", title: "Easy 1", difficulty: "easy" as const, tags: [] },
      { position: 2, slug: null, title: "Two Sum", difficulty: null, tags: [], external: { slug: "two-sum", rating: 1300 } },
    ],
    participants: [],
    revealTitles,
  });

  it("hidden titles hide the LeetCode slug, title and rating too; the slot still says LeetCode", () => {
    const hidden = buildSessionSnapshot(input(false));
    expect(hidden.problems[1]).toEqual({ position: 2, difficulty: null, tags: [], external: {} });
    expect(JSON.stringify(hidden)).not.toMatch(/two-sum|Two Sum|1300/);
    const shown = buildSessionSnapshot(input(true));
    expect(shown.problems[1]).toEqual({ position: 2, title: "Two Sum", difficulty: null, tags: [], external: { slug: "two-sum", rating: 1300 } });
    expect(myProblemStatus(shown, "me", 2)).toEqual({ state: "untouched", text: "Not marked solved" });
  });
});
