// Rooms v2 (V2-4) lobby view model: mode/challenge copy, slot rating lines
// (host vs non-host), the expectation panel, the explainer, rating display
// visibility and the v2 fields of the settings diff.
import { describe, expect, it } from "vitest";

import { formFromLobby, settingsDiff } from "@/lib/rooms/lobby-copy";
import {
  challengeHelp,
  challengeOptions,
  emptyPositions,
  expectationCopy,
  lobbyMode,
  memberRatingLabel,
  ratingExplainer,
  signed,
  slotRatingLines,
  startBlockedReason,
} from "@/lib/rooms/lobby-rating";
import type { LobbyExpectationView, LobbyView } from "@/lib/rooms/session-view";

const expected: LobbyExpectationView = {
  target: 0.55,
  expectedPerPerson: 2.15,
  share: 0.5375,
  perUser: [
    { userId: "a", username: "alice", rating: 1620, provisional: false, expected: 2.77 },
    { userId: "b", username: "bob", rating: 1540, provisional: false, expected: 2.38 },
    { userId: "c", username: "carol", rating: 1450, provisional: false, expected: 1.91 },
    { userId: "d", username: "dan", rating: 1380, provisional: true, expected: 1.55 },
  ],
  center: 1457,
  widened: false,
  ratingRange: { min: 1380, max: 1620 },
};

const lobby: LobbyView = {
  sessionId: "s",
  roomId: "r",
  status: "lobby",
  hostId: "a",
  canManage: true,
  problemCount: 4,
  durationMin: 90,
  plannedFor: null,
  settings: {
    tags: [],
    mixMode: "suggested",
    mix: { easy: 1, medium: 2, hard: 1 },
    challenge: "balanced",
    avoidSolved: true,
    mode: "rating",
    targets: [1307, 1407, 1507, 1607],
  },
  rerollCount: 0,
  rerollsLeft: 30,
  slots: [1, 2, 3, 4].map((position) => ({ position, difficulty: "easy" as const, pinned: false, tags: [] })),
  actualMix: { easy: 4, medium: 0, hard: 0 },
  notices: [],
  mode: "rating",
  rated: true,
  expected,
};

describe("mode and challenge copy", () => {
  it("rating targets 75/55/35, difficulty keeps 65/50/35", () => {
    expect(challengeOptions("rating").map((o) => `${o.name} ${o.percent}`)).toEqual(["Relaxed 75%", "Balanced 55%", "Tough 35%"]);
    expect(challengeOptions("difficulty").map((o) => o.percent)).toEqual(["65%", "50%", "35%"]);
    expect(challengeHelp("rating", "balanced", 4)).toBe("Each person should solve about 55% of the problems: about 2.2 of 4.");
  });

  it("lobbyMode: v2 field, else the stored settings (pre-v2 = difficulty)", () => {
    expect(lobbyMode(lobby)).toBe("rating");
    expect(lobbyMode({ mode: undefined, settings: { ...lobby.settings, mode: undefined } })).toBe("difficulty");
  });
});

describe("slot rating lines (D3 + AC-V2-SEL-4 visibility)", () => {
  it("host: rating, target with deviation, room chance", () => {
    expect(slotRatingLines({ chance: 0.712, rating: 1330, target: 1307, deviation: 23 })).toEqual({
      chancePercent: 71,
      chance: "~71% of this room should solve it",
      rating: "rating 1330",
      target: "target 1307 (+23)",
    });
    expect(slotRatingLines({ chance: 0.5, rating: 1500, target: 1507, deviation: -7 })!.target).toBe("target 1507 (−7)");
    expect(slotRatingLines({ chance: 0.5, rating: 1500, target: null, deviation: null })!.target).toBe("pinned, no target");
  });

  it("non-host: the chance only (no rating, no target)", () => {
    expect(slotRatingLines({ chance: 0.62 })).toEqual({ chancePercent: 62, chance: "~62% of this room should solve it" });
    expect(slotRatingLines(undefined)).toBeNull();
  });

  it("member ratings: hidden when null, '?' when provisional", () => {
    expect(memberRatingLabel({ rating: null, provisional: true })).toBeNull();
    expect(memberRatingLabel(undefined)).toBeNull();
    expect(memberRatingLabel({ rating: 1380, provisional: true })).toBe("1380?");
    expect(memberRatingLabel({ rating: 1540, provisional: false })).toBe("1540");
    expect(signed(0)).toBe("±0");
  });
});

describe("expectation panel (§6.5 A numbers)", () => {
  it("headline, detail, range, provisional, per person", () => {
    const c = expectationCopy(expected, 4, "balanced");
    expect(c.headline).toBe("Expected: about 2.1 of 4 solved per person");
    expect(c.detail).toBe("(54%; target Balanced 55%)");
    expect(c.range).toBe("The room rating range is 1380–1620.");
    expect(c.provisional).toBe("dan's rating is provisional (the first sessions move it faster).");
    expect(c.coarse).toBeNull();
    expect(c.people.map((p) => `${p.username} ${p.rating} ${p.expected}`)).toEqual([
      "alice 1620 2.8 of 4",
      "bob 1540 2.4 of 4",
      "carol 1450 1.9 of 4",
      "dan 1380? 1.6 of 4",
    ]);
  });

  it("widened ladder, one rating, and a coarse catalog", () => {
    const wide = expectationCopy({ ...expected, widened: true, ratingRange: { min: 1250, max: 1900 }, share: 0.4 }, 4, "balanced");
    expect(wide.range).toBe("Ratings here span 1250–1900, so the problems span wider.");
    expect(wide.coarse).toBe("The catalog has few problems near these targets.");
    const one = expectationCopy({ ...expected, perUser: [], ratingRange: { min: 1500, max: 1500 } }, 4, "tough");
    expect(one.range).toBe("Everyone here is rated 1500.");
    expect(one.provisional).toBeNull();
    const two = expectationCopy(
      { ...expected, perUser: expected.perUser.map((u) => ({ ...u, provisional: u.username !== "alice" })) },
      4,
      "balanced",
    );
    expect(two.provisional).toBe("bob, carol and dan's ratings are provisional (the first sessions move it faster).");
  });
});

describe("explainer", () => {
  it("Elo example from the formula, ladder for N, targets for the host only", () => {
    const e = ratingExplainer(lobby);
    expect(e.example).toContain("about 50% of the time, a 1700 problem about 24%, and a 1300 problem about 76%");
    expect(e.ladder).toContain("(−150, −50, +50, +150)");
    expect(e.ladder).toContain("is 55%");
    expect(e.targets).toBe("Targets here: 1307 · 1407 · 1507 · 1607.");
    expect(ratingExplainer({ ...lobby, expected: undefined, settings: { ...lobby.settings, targets: undefined } }).targets).toBeNull();
    expect(ratingExplainer({ ...lobby, problemCount: 1 }).ladder).toContain("one problem, at the center");
    expect(ratingExplainer({ ...lobby, problemCount: 6 }).ladder).toContain("(−200, −120, −40, +40, +120, +200)");
  });
});

describe("start gating (manual mode)", () => {
  it("names how many problems are missing", () => {
    const manual: LobbyView = { ...lobby, mode: "manual", slots: lobby.slots.slice(0, 1) };
    expect(emptyPositions(manual)).toEqual([2, 3, 4]);
    expect(startBlockedReason(manual)).toBe("Pick 3 more problems with Pin to start.");
    expect(startBlockedReason({ ...manual, slots: lobby.slots.slice(0, 3) })).toBe("Pick 1 more problem with Pin to start.");
    expect(startBlockedReason({ ...lobby, slots: [] })).toBe("Fill every problem slot to start.");
    expect(startBlockedReason(lobby)).toBeNull();
    const gone = { ...lobby, slots: [{ ...lobby.slots[0], problem: { slug: "x", title: "X", published: false } }, ...lobby.slots.slice(1)] };
    expect(startBlockedReason(gone)).toBe("Re-roll the problem that is no longer available.");
  });
});

describe("settingsDiff: v2 fields", () => {
  it("mode and rated changes are sent", () => {
    const form = formFromLobby(lobby);
    expect(form.mode).toBe("rating");
    expect(form.rated).toBe(true);
    expect(settingsDiff(lobby, form)).toEqual({});
    expect(settingsDiff(lobby, { ...form, mode: "difficulty" })).toEqual({ mode: "difficulty" });
    expect(settingsDiff(lobby, { ...form, mode: "manual" })).toEqual({ mode: "manual" });
    expect(settingsDiff(lobby, { ...form, rated: false })).toEqual({ rated: false });
    expect(settingsDiff(lobby, { ...form, challenge: "tough" })).toEqual({ challenge: "tough" });
  });

  it("difficulty → custom mix keeps the v1 body", () => {
    const diffLobby: LobbyView = { ...lobby, mode: "difficulty", settings: { ...lobby.settings, mode: "difficulty" } };
    const form = { ...formFromLobby(diffLobby), mixMode: "manual" as const, mix: { easy: 0, medium: 3, hard: 1 } };
    expect(settingsDiff(diffLobby, form)).toEqual({ mixMode: "manual", mix: { easy: 0, medium: 3, hard: 1 } });
  });

  it("leaving a stored custom mix for rating mode resets it and says the mode", () => {
    const custom: LobbyView = {
      ...lobby,
      mode: "difficulty",
      settings: { ...lobby.settings, mode: "difficulty", mixMode: "manual", mix: { easy: 0, medium: 3, hard: 1 } },
    };
    const form = { ...formFromLobby(custom), mode: "rating" as const, mixMode: "suggested" as const };
    expect(settingsDiff(custom, form)).toEqual({ mixMode: "suggested", mode: "rating" });
    // A count change in rating mode with a stale custom mix stored also resets it.
    const ratingStale: LobbyView = { ...custom, mode: "rating", settings: { ...custom.settings, mode: "rating" } };
    expect(settingsDiff(ratingStale, { ...formFromLobby(ratingStale), problemCount: 2 })).toEqual({
      problemCount: 2,
      mixMode: "suggested",
      mode: "rating",
    });
  });
});
