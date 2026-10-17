import { describe, expect, it } from "vitest";

import {
  availableLine,
  calibrationCopy,
  durationLabel,
  formFromLobby,
  humanizeTag,
  mixError,
  settingsDiff,
  slotNote,
  slotSummary,
  unusedLine,
} from "@/lib/rooms/lobby-copy";
import { calibrationFromCounts } from "@/lib/rooms/selection";
import type { CalibrationView, LobbyView } from "@/lib/rooms/session-view";

function view(counts: Parameters<typeof calibrationFromCounts>[0], sessions: number, suggested: CalibrationView["suggested"], expectedSolved: number | null): CalibrationView {
  const c = calibrationFromCounts(counts, sessions);
  return { ...c, target: 0.5, suggested, expectedSolved };
}

describe("calibration panel copy (§2.3)", () => {
  it("Example B: the room struggles with hard", () => {
    const cal = view(
      { easy: { solved: 11, pairs: 12 }, medium: { solved: 9, pairs: 24 }, hard: { solved: 0, pairs: 12 } },
      3,
      { easy: 1, medium: 3, hard: 0 },
      2.066,
    );
    const copy = calibrationCopy(cal, 4, "balanced");
    expect(copy.suggested).toBe("Suggested: 1 Easy · 3 Medium · 0 Hard");
    expect(copy.basis).toBe(
      "Based on your last 3 sessions (people who submitted): Easy 11 of 12 solved, Medium 9 of 24, Hard 0 of 12.",
    );
    expect(copy.expected).toBe("Expected: about 2.1 of 4 solved per person (target: Balanced, about half).");
    expect(copy.rates.map((r) => r.rate)).toEqual(["89%", "39%", "6%"]);
    expect(copy.explainer).toMatch(/starting guess \(Easy 80%, Medium 50%, Hard 25%\) worth 4 attempts/);
  });

  it("cold start", () => {
    const cal = view(
      { easy: { solved: 0, pairs: 0 }, medium: { solved: 0, pairs: 0 }, hard: { solved: 0, pairs: 0 } },
      0,
      { easy: 1, medium: 2, hard: 1 },
      2.05,
    );
    const copy = calibrationCopy(cal, 4, "tough");
    expect(copy.basis).toBe("No finished sessions yet, so we start with a standard mix. It adapts after your first session.");
    expect(copy.expected).toMatch(/target: Tough, about a third/);
  });

  it("pool lines and slot notes (§2.4 Example D)", () => {
    expect(unusedLine({ easy: 7, medium: 2, hard: 0 })).toBe("Unused in this room: 7 easy, 2 medium, 0 hard");
    expect(availableLine({ easy: 6, medium: 4, hard: 1 })).toBe("Available: 6 Easy · 4 Medium · 1 Hard");
    const fmt = () => "Oct 3";
    expect(slotNote({ tier: "B", solvedBy: 1, expectedCount: 3, lastUsedAt: null }, fmt)).toBe("1 of 3 people has solved this before");
    expect(slotNote({ tier: "B", solvedBy: 2, expectedCount: 3, lastUsedAt: null }, fmt)).toBe("2 of 3 people have solved this before");
    expect(slotNote({ tier: "C", solvedBy: 0, expectedCount: 3, lastUsedAt: "2026-10-03T18:00:00Z" }, fmt)).toBe("Used in this room on Oct 3");
    expect(slotNote({ tier: "A", solvedBy: 0, expectedCount: 3, lastUsedAt: null }, fmt)).toBeNull();
    expect(slotNote(undefined, fmt)).toBeNull();
  });

  it("slot summary for non-hosts has no title", () => {
    const tags = (s: string) => humanizeTag(s);
    expect(slotSummary({ position: 2, difficulty: "medium", tags: ["dynamic-programming"] }, tags)).toBe(
      "Problem 2 · Medium · Dynamic programming",
    );
    expect(durationLabel(90)).toBe("90 min (1 h 30 min)");
    expect(durationLabel(120)).toBe("120 min (2 h)");
    expect(durationLabel(45)).toBe("45 min");
  });
});

const lobby: LobbyView = {
  sessionId: "s",
  roomId: "r",
  status: "lobby",
  hostId: "h",
  canManage: true,
  problemCount: 4,
  durationMin: 90,
  plannedFor: null,
  settings: { tags: ["array"], mixMode: "suggested", mix: { easy: 1, medium: 2, hard: 1 }, challenge: "balanced", avoidSolved: true },
  rerollCount: 0,
  rerollsLeft: 30,
  slots: [],
  actualMix: { easy: 1, medium: 2, hard: 1 },
  notices: [],
};

describe("settings diff for /draw", () => {
  it("unchanged form sends nothing", () => {
    expect(settingsDiff(lobby, formFromLobby(lobby))).toEqual({});
  });

  it("only changed fields; tags sorted", () => {
    const form = { ...formFromLobby(lobby), durationMin: 60, tags: ["string", "array"], avoidSolved: false };
    expect(settingsDiff(lobby, form)).toEqual({ durationMin: 60, tags: ["array", "string"], avoidSolved: false });
  });

  it("custom mix sends mode and mix; a count change in custom mode resends the mix", () => {
    const form = { ...formFromLobby(lobby), mixMode: "manual" as const, mix: { easy: 0, medium: 3, hard: 1 } };
    expect(settingsDiff(lobby, form)).toEqual({ mixMode: "manual", mix: { easy: 0, medium: 3, hard: 1 } });
    const manual: LobbyView = { ...lobby, settings: { ...lobby.settings, mixMode: "manual" } };
    const more = { ...formFromLobby(manual), problemCount: 5, mix: { easy: 1, medium: 3, hard: 1 } };
    expect(settingsDiff(manual, more)).toEqual({ problemCount: 5, mixMode: "manual", mix: { easy: 1, medium: 3, hard: 1 } });
    expect(settingsDiff(manual, { ...formFromLobby(manual), mixMode: "suggested" })).toEqual({ mixMode: "suggested" });
  });

  it("custom mix must add up to the count", () => {
    expect(mixError({ ...formFromLobby(lobby), mixMode: "manual", mix: { easy: 1, medium: 1, hard: 1 } })).toBe(
      "The custom mix adds up to 3; it must add up to 4 problems",
    );
    expect(mixError(formFromLobby(lobby))).toBeNull();
  });
});
