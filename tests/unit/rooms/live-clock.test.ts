import { describe, expect, it } from "vitest";

import {
  clockOffset,
  countdownLabel,
  crossedMilestones,
  durationWords,
  formatCountdown,
  isFinalMinutes,
  milestoneMessage,
  nextOffset,
  remainingMs,
} from "@/lib/rooms/live-clock";

describe("server clock offset", () => {
  it("is server minus client at receipt", () => {
    expect(clockOffset("2026-10-24T18:00:05.000Z", Date.parse("2026-10-24T18:00:00.000Z"))).toBe(5000);
    expect(clockOffset("not a date", 123)).toBe(0);
  });

  it("ignores jitter below a second, follows real jumps", () => {
    expect(nextOffset(null, 420)).toBe(420);
    expect(nextOffset(420, 900)).toBe(420);
    expect(nextOffset(420, 3000)).toBe(3000);
  });

  it("time left uses the server clock, not the client clock alone", () => {
    const endsAt = "2026-10-24T19:30:00.000Z";
    const client = Date.parse("2026-10-24T19:00:00.000Z");
    // Client clock 2 minutes behind the server: 28 minutes left, not 30.
    expect(remainingMs(endsAt, 120_000, client)).toBe(28 * 60_000);
    expect(remainingMs(endsAt, 0, Date.parse("2026-10-24T19:31:00.000Z"))).toBe(0);
    expect(remainingMs(null, 0, client)).toBeNull();
  });
});

describe("countdown text", () => {
  it("formats like the scoreboard and rounds up to whole seconds", () => {
    expect(formatCountdown(47 * 60_000 + 12_000)).toBe("47:12");
    expect(formatCountdown(47 * 60_000 + 11_001)).toBe("47:12");
    expect(formatCountdown(3_723_000)).toBe("1:02:03");
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("speaks in words", () => {
    expect(durationWords(2832)).toBe("47 minutes 12 seconds");
    expect(durationWords(3600)).toBe("1 hour");
    expect(durationWords(61)).toBe("1 minute 1 second");
    expect(durationWords(0)).toBe("0 seconds");
    expect(countdownLabel(2_832_000)).toBe("Time left: 47 minutes 12 seconds");
  });

  it("marks the final ten minutes", () => {
    expect(isFinalMinutes(10 * 60_000)).toBe(false);
    expect(isFinalMinutes(10 * 60_000 - 1)).toBe(true);
    expect(isFinalMinutes(null)).toBe(false);
  });
});

describe("milestones", () => {
  it("announces 10 and 1 minute once each, never on the first reading", () => {
    expect(crossedMilestones(null, 9 * 60_000)).toEqual([]);
    expect(crossedMilestones(600_500, 599_500)).toEqual([600_000]);
    expect(crossedMilestones(599_500, 598_500)).toEqual([]);
    expect(crossedMilestones(60_400, 59_400)).toEqual([60_000]);
  });

  it("a throttled tab that skips both still announces both, but not at zero", () => {
    expect(crossedMilestones(11 * 60_000, 30_000)).toEqual([600_000, 60_000]);
    expect(crossedMilestones(61_000, 0)).toEqual([]);
  });

  it("copy", () => {
    expect(milestoneMessage(600_000)).toBe("10 minutes left");
    expect(milestoneMessage(60_000)).toBe("1 minute left");
  });
});
