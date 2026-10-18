// R3 request rules: session settings bodies, the settings merge, pin and
// search inputs, slot positions; plus the lobby copy and the state snapshot
// builder (spoiler policy, first solvers, ordering).
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_SETTINGS,
  parseSlotPosition,
  pinBodySchema,
  problemSearchQuerySchema,
  resolveSettings,
  sessionSettingsBodySchema,
  touchesDraw,
  type ResolvedSettings,
} from "@/lib/rooms/session-schemas";
import {
  buildSessionSnapshot,
  drawErrorStatus,
  drawErrorView,
  mixLabel,
  noticeView,
  type SnapshotInput,
} from "@/lib/rooms/session-view";

const NOW = new Date("2026-10-17T12:00:00Z");

describe("sessionSettingsBodySchema", () => {
  it("accepts an empty body and every field in range", () => {
    expect(sessionSettingsBodySchema.safeParse({}).success).toBe(true);
    expect(
      sessionSettingsBodySchema.safeParse({
        problemCount: 8,
        durationMin: 240,
        tags: ["array", "dynamic-programming"],
        mixMode: "manual",
        mix: { easy: 2, medium: 4, hard: 2 },
        challenge: "tough",
        avoidSolved: false,
        plannedFor: "2026-10-24T18:00:00Z",
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ problemCount: 0 }],
    [{ problemCount: 9 }],
    [{ problemCount: 2.5 }],
    [{ durationMin: 10 }],
    [{ durationMin: 17 }],
    [{ durationMin: 245 }],
    [{ tags: ["a", "b", "c", "d", "e", "f"] }],
    [{ tags: ["array", "array"] }],
    [{ tags: ["Not A Slug"] }],
    [{ mix: { easy: 1, medium: 1 } }],
    [{ challenge: "brutal" }],
    [{ plannedFor: "tomorrow" }],
    [{ extra: 1 }],
  ])("rejects %j", (body) => {
    expect(sessionSettingsBodySchema.safeParse(body).success).toBe(false);
  });

  it("touchesDraw: only the draw-relevant fields", () => {
    expect(touchesDraw({})).toBe(false);
    expect(touchesDraw({ durationMin: 60, plannedFor: null })).toBe(false);
    expect(touchesDraw({ avoidSolved: false })).toBe(true);
    expect(touchesDraw({ tags: [] })).toBe(true);
  });
});

describe("resolveSettings", () => {
  it("fills the spec defaults for a new session (4 problems, 90 min, suggested, balanced, avoid solved)", () => {
    expect(resolveSettings(null, {}, NOW)).toEqual({
      problemCount: 4,
      durationMin: 90,
      plannedFor: null,
      settings: DEFAULT_SESSION_SETTINGS,
      rated: true,
    });
  });

  const current: ResolvedSettings = {
    problemCount: 3,
    durationMin: 60,
    plannedFor: null,
    settings: { tags: ["string"], mixMode: "manual", mix: { easy: 1, medium: 1, hard: 1 }, challenge: "relaxed", avoidSolved: false },
    rated: true,
  };

  it("keeps omitted fields of the current settings", () => {
    const r = resolveSettings(current, { durationMin: 45 }, NOW);
    expect(r).toEqual({ ...current, durationMin: 45 });
  });

  it("a mix without mixMode means a custom mix; it must add up to N (400)", () => {
    const ok = resolveSettings(null, { problemCount: 2, mix: { easy: 0, medium: 1, hard: 1 } }, NOW);
    expect(ok).toMatchObject({ settings: { mixMode: "manual", mix: { easy: 0, medium: 1, hard: 1 } } });
    const bad = resolveSettings(null, { problemCount: 3, mixMode: "manual", mix: { easy: 0, medium: 1, hard: 1 } }, NOW);
    expect(bad).toEqual({ status: 400, error: "The custom mix must add up to 3 problems", field: "mix" });
    // Changing N alone invalidates an existing custom mix.
    expect(resolveSettings(current, { problemCount: 4 }, NOW)).toMatchObject({ status: 400, field: "mix" });
  });

  it("switching to suggested keeps the old mix only as a placeholder (the draw recomputes it)", () => {
    const r = resolveSettings(current, { mixMode: "suggested", problemCount: 5 }, NOW);
    expect(r).toMatchObject({ problemCount: 5, settings: { mixMode: "suggested" } });
  });

  it("sorts tags; plannedFor parses, clears with null and is bounded to a year ahead", () => {
    const r = resolveSettings(null, { tags: ["string", "array"], plannedFor: "2026-10-24T18:00:00+02:00" }, NOW);
    expect(r).toMatchObject({ settings: { tags: ["array", "string"] }, plannedFor: new Date("2026-10-24T16:00:00Z") });
    expect(resolveSettings({ ...current, plannedFor: NOW }, { plannedFor: null }, NOW)).toMatchObject({ plannedFor: null });
    expect(resolveSettings(null, { plannedFor: "2028-01-01T00:00:00Z" }, NOW)).toMatchObject({ status: 400, field: "plannedFor" });
  });
});

describe("pin, search and positions", () => {
  it("pin body: {slug} or {unpin: true}, nothing else", () => {
    expect(pinBodySchema.safeParse({ slug: "two-sum" }).success).toBe(true);
    expect(pinBodySchema.safeParse({ unpin: true }).success).toBe(true);
    expect(pinBodySchema.safeParse({ unpin: false }).success).toBe(false);
    expect(pinBodySchema.safeParse({ slug: "a", unpin: true }).success).toBe(false);
    expect(pinBodySchema.safeParse({ slug: "" }).success).toBe(false);
  });

  it("search q: 1–60 characters after trim, no control characters", () => {
    expect(problemSearchQuerySchema.parse("  coin  ")).toBe("coin");
    for (const q of ["", "   ", "x".repeat(61), "a\u0000b"]) expect(problemSearchQuerySchema.safeParse(q).success).toBe(false);
    expect(problemSearchQuerySchema.safeParse("x".repeat(60)).success).toBe(true);
  });

  it("slot positions are 1..8 written canonically", () => {
    expect(parseSlotPosition("1")).toBe(1);
    expect(parseSlotPosition("8")).toBe(8);
    for (const raw of ["0", "9", "01", "1.0", "-1", "abc", "", " 1"]) expect(parseSlotPosition(raw)).toBeNull();
  });
});

describe("lobby copy", () => {
  it("E1 pool_too_small and E2 mix_infeasible (§2.6), both 409", () => {
    const e1 = drawErrorView({ ok: false, code: "pool_too_small", counts: { easy: 1, medium: 1, hard: 1 } }, 4, 2);
    expect(e1.error).toBe("Only 3 problems match these topics. Choose fewer problems, add topics, or pick Any topic.");
    const e2 = drawErrorView(
      { ok: false, code: "mix_infeasible", counts: { easy: 6, medium: 4, hard: 1 }, requested: { easy: 1, medium: 1, hard: 2 } },
      4,
      1,
    );
    expect(e2.error).toBe(
      "There is only 1 Hard problem for these topics; your mix asks for 2. Available: 6 Easy · 4 Medium · 1 Hard.",
    );
    expect(e2).toMatchObject({ code: "mix_infeasible", counts: { easy: 6, medium: 4, hard: 1 }, requested: { hard: 2 } });
    expect(drawErrorStatus("pool_too_small")).toBe(409);
    expect(drawErrorStatus("mix_infeasible")).toBe(409);
    expect(drawErrorStatus("too_many_pinned")).toBe(400);
    expect(drawErrorView({ ok: false, code: "too_many_pinned", counts: { easy: 0, medium: 0, hard: 0 } }, 1, 0).error).toBe(
      "Unpin a problem first",
    );
  });

  it("mix label and the re-roll notice", () => {
    expect(mixLabel({ easy: 1, medium: 3, hard: 0 })).toBe("1 Easy · 3 Medium · 0 Hard");
    expect(noticeView({ code: "rerolls_reset", difficulty: "hard" }).message).toBe(
      "No other unused options; showing earlier ones again (Hard)",
    );
  });
});

describe("buildSessionSnapshot", () => {
  const start = new Date("2026-10-24T18:00:00Z");
  const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
    session: { status: "live", startedAt: start, endsAt: new Date("2026-10-24T19:30:00Z"), durationMin: 90, problemCount: 2, hostId: "u-a" },
    problems: [
      { position: 2, slug: "coin-change", title: "Coin Change", difficulty: "medium", tags: ["dynamic-programming"] },
      { position: 1, slug: "valid-anagram", title: "Valid Anagram", difficulty: "easy", tags: ["string"] },
    ],
    participants: [
      {
        userId: "u-c",
        username: "carol",
        joinedAt: new Date(3),
        solvedCount: 1,
        penaltySec: 720,
        rank: 2,
        results: [{ position: 1, attempts: 2, wrongBefore: 1, solveSeconds: 720, firstAcceptedAt: new Date(start.getTime() + 720_000), solvedBefore: true }],
      },
      {
        userId: "u-b",
        username: "bob",
        joinedAt: new Date(2),
        solvedCount: 1,
        penaltySec: 240,
        rank: 1,
        results: [
          { position: 2, attempts: 1, wrongBefore: 1, solveSeconds: null, firstAcceptedAt: null, solvedBefore: false },
          { position: 1, attempts: 1, wrongBefore: 0, solveSeconds: 240, firstAcceptedAt: new Date(start.getTime() + 240_000), solvedBefore: false },
        ],
      },
      { userId: "u-a", username: "alice", joinedAt: new Date(1), solvedCount: 1, penaltySec: 240, rank: 1, results: [] },
    ],
    revealTitles: true,
    ...over,
  });

  it("orders problems by position, participants by rank then username; marks host and first solver", () => {
    const snap = buildSessionSnapshot(input());
    expect(snap.problems.map((p) => p.position)).toEqual([1, 2]);
    expect(snap.problems[0]).toEqual({ position: 1, slug: "valid-anagram", title: "Valid Anagram", difficulty: "easy", tags: ["string"] });
    expect(snap.participants.map((p) => p.username)).toEqual(["alice", "bob", "carol"]);
    expect(snap.participants[0].isHost).toBe(true);
    const bob = snap.participants[1];
    expect(bob.cells).toEqual([
      { position: 1, attempts: 1, wrongBefore: 0, solveSeconds: 240, firstSolver: true, solvedBefore: false },
      { position: 2, attempts: 1, wrongBefore: 1, solveSeconds: null, firstSolver: false, solvedBefore: false },
    ]);
    expect(snap.participants[2].cells[0]).toMatchObject({ firstSolver: false, solvedBefore: true });
    expect(snap.session).toEqual({
      status: "live",
      startedAt: "2026-10-24T18:00:00.000Z",
      endsAt: "2026-10-24T19:30:00.000Z",
      durationMin: 90,
      problemCount: 2,
    });
  });

  it("hides titles and slugs when not revealed (lobby, non-host); no code, verdicts or test data at all", () => {
    const snap = buildSessionSnapshot(
      input({ session: { ...input().session, status: "lobby", startedAt: null, endsAt: null }, revealTitles: false }),
    );
    const text = JSON.stringify(snap);
    expect(text).not.toMatch(/coin-change|Coin Change|valid-anagram|Valid Anagram/);
    expect(snap.problems[0]).toEqual({ position: 1, difficulty: "easy", tags: ["string"] });
    expect(text).not.toMatch(/accepted|wrong_answer|code|stdout|expected/);
  });

  it("lobby without ranks lists participants by join time", () => {
    const snap = buildSessionSnapshot(
      input({ participants: input().participants.map((p) => ({ ...p, rank: null, results: [] })) }),
    );
    expect(snap.participants.map((p) => p.username)).toEqual(["alice", "bob", "carol"]);
  });
});
