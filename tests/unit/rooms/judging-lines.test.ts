// Rooms v2 §9.2: "Judging…" feed lines are derived on the client from the
// state response's `pending` list; they are never stored or toasted.
import { describe, expect, it } from "vitest";

import { judgingFeedLine, nextJudgingEntries } from "@/lib/rooms/notifications";

const names = new Map([
  ["u-bob", "bob"],
  ["u-carol", "carol"],
]);

describe("judging entries", () => {
  it("keep the time first seen, add new pairs, drop finished ones, skip unknown people", () => {
    const t0 = "2026-10-24T18:52:02.000Z";
    const t1 = "2026-10-24T18:52:04.000Z";
    const first = nextJudgingEntries(
      [],
      [
        { userId: "u-bob", position: 2, count: 1 },
        { userId: "u-x", position: 1, count: 1 },
      ],
      names,
      t0,
    );
    expect(first).toEqual([{ userId: "u-bob", position: 2, count: 1, username: "bob", since: t0 }]);
    const second = nextJudgingEntries(
      first,
      [
        { userId: "u-bob", position: 2, count: 2 },
        { userId: "u-carol", position: 4, count: 1 },
      ],
      names,
      t1,
    );
    expect(second.map((e) => [e.username, e.position, e.count, e.since])).toEqual([
      ["carol", 4, 1, t1],
      ["bob", 2, 2, t0],
    ]);
    expect(nextJudgingEntries(second, [], names, t1)).toEqual([]);
  });

  it("feed line: clock from the session start, no verdict", () => {
    const line = judgingFeedLine(
      { userId: "u-carol", position: 4, count: 1, username: "carol", since: "2026-10-24T18:52:02.000Z" },
      "2026-10-24T18:00:00.000Z",
    );
    expect(line).toEqual({
      id: "judging-u-carol:4",
      at: "2026-10-24T18:52:02.000Z",
      kind: "judging",
      clock: "52:02",
      text: "carol submitted Problem 4 · judging…",
    });
    expect(judgingFeedLine({ userId: "u", position: 1, count: 1, username: "u", since: "x" }, null).clock).toBeNull();
  });
});
