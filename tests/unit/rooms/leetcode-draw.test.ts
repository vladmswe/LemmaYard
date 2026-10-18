// Auto-pick of LeetCode problems (docs/specs/leetcode-integration.md AC-LC-4
// to -8, -11): the separate ladder, the suggested mix, repeat avoidance, the
// topic fallback, premium exclusion over the real catalog, re-roll, and what
// non-hosts may see.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { difficultyFromRating } from "@/lib/leetcode/difficulty";
import {
  capRerolled,
  drawLeetCodeSlots,
  rerollLeetCodeSlot,
  type LeetCodeCandidate,
} from "@/lib/rooms/leetcode-draw";
import { ratingTargets } from "@/lib/rooms/rating";
import { createSeededRng } from "@/lib/rooms/rng";
import { PRIOR_RATES, suggestMix } from "@/lib/rooms/selection";
import { buildSessionSnapshot } from "@/lib/rooms/session-view";
import { mixOf } from "@/lib/rooms/types";
import { loadCatalog } from "@/server/leetcode/catalog";

function candidate(slug: string, rating: number | null, extra: Partial<LeetCodeCandidate> = {}): LeetCodeCandidate {
  return {
    slug,
    rating,
    difficulty: rating === null ? null : difficultyFromRating(rating),
    tags: [],
    lastUsedAt: null,
    solvedBy: 0,
    ...extra,
  };
}

/** 151 problems rated 1000, 1010, …, 2500. */
const LADDER = Array.from({ length: 151 }, (_, i) => candidate(`p${1000 + i * 10}`, 1000 + i * 10));

const base = {
  fixed: [],
  tags: [],
  rerolled: [],
  avoidSolved: true,
  ratings: [1500, 1500, 1500],
  challenge: "balanced" as const,
  rates: { ...PRIOR_RATES },
};

describe("rating mode: own ladder (AC-LC-4)", () => {
  it("targets come from the LeetCode ladder of the expected participants; picks within ±100", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = drawLeetCodeSlots({ ...base, mode: "rating", count: 2, candidates: LADDER, rng: createSeededRng(seed) });
      if (!r.ok) throw new Error(r.code);
      const plan = ratingTargets({ ratings: base.ratings, freeCount: 2, challenge: "balanced" });
      expect(r.picks.map((p) => p.target)).toEqual(plan.targets);
      for (const p of r.picks) expect(Math.abs(p.rating! - p.target!)).toBeLessThanOrEqual(100);
      // Warm-up first.
      expect(r.picks[0].target!).toBeLessThan(r.picks[1].target!);
    }
  });

  it("is deterministic for a seed", () => {
    const a = drawLeetCodeSlots({ ...base, mode: "rating", count: 3, candidates: LADDER, rng: createSeededRng(7) });
    const b = drawLeetCodeSlots({ ...base, mode: "rating", count: 3, candidates: [...LADDER].reverse(), rng: createSeededRng(7) });
    expect(a).toEqual(b);
  });

  it("problems without a rating are never auto-picked by rating", () => {
    const r = drawLeetCodeSlots({
      ...base,
      mode: "rating",
      count: 1,
      candidates: [candidate("unrated", null, { difficulty: "easy" }), candidate("rated", 1500)],
      rng: createSeededRng(1),
    });
    expect(r.ok && r.picks.map((p) => p.slug)).toEqual(["rated"]);
  });

  it("a hand-picked LeetCode slot's rating shapes the ladder", () => {
    const free = drawLeetCodeSlots({ ...base, mode: "rating", count: 1, candidates: LADDER, rng: createSeededRng(3) });
    const withHard = drawLeetCodeSlots({
      ...base,
      mode: "rating",
      count: 1,
      fixed: [{ slug: "pinned-hard", difficulty: "hard", rating: 2600 }],
      candidates: LADDER,
      rng: createSeededRng(3),
    });
    if (!free.ok || !withHard.ok) throw new Error();
    expect(withHard.picks[0].target!).toBeLessThan(free.picks[0].target!);
  });
});

describe("difficulty mode: suggested mix (AC-LC-5)", () => {
  it("LeetCode slots follow suggestMix for their own count", () => {
    for (const count of [1, 2, 3, 4]) {
      const r = drawLeetCodeSlots({ ...base, mode: "difficulty", count, candidates: LADDER, rng: createSeededRng(count) });
      if (!r.ok) throw new Error();
      const expected = suggestMix({
        problemCount: count,
        rates: base.rates,
        challenge: "balanced",
        available: mixOf(LADDER.map((c) => ({ difficulty: c.difficulty! }))),
      });
      if (!expected.ok) throw new Error();
      expect(mixOf(r.picks)).toEqual(expected.mix);
      expect(r.picks.every((p) => p.target === null)).toBe(true);
    }
  });

  it("problems with an owner's difficulty but no rating can be picked by difficulty", () => {
    const r = drawLeetCodeSlots({
      ...base,
      mode: "difficulty",
      count: 1,
      candidates: [candidate("classic", null, { difficulty: "medium" })],
      rng: createSeededRng(1),
    });
    expect(r.ok && r.picks[0]).toMatchObject({ slug: "classic", difficulty: "medium", rating: null });
  });
});

describe("repeat avoidance (AC-LC-6)", () => {
  const used = new Date("2026-10-01T18:00:00Z");
  it("a slug used in this room is tier C: never picked while unused ones fit the band", () => {
    const pool = [candidate("used", 1500, { lastUsedAt: used }), candidate("fresh", 1520)];
    for (let seed = 1; seed <= 40; seed++) {
      const r = drawLeetCodeSlots({ ...base, ratings: [1500], challenge: "balanced", mode: "rating", count: 1, candidates: pool, rng: createSeededRng(seed) });
      expect(r.ok && r.picks[0].slug).toBe("fresh");
    }
  });

  it("a slug self-reported solved by an expected participant is avoided with avoid-solved on", () => {
    const pool = [candidate("solved", 1500, { solvedBy: 1 }), candidate("unsolved", 1510)];
    for (let seed = 1; seed <= 40; seed++) {
      const on = drawLeetCodeSlots({ ...base, ratings: [1500], mode: "rating", count: 1, candidates: pool, rng: createSeededRng(seed) });
      expect(on.ok && on.picks[0].slug).toBe("unsolved");
    }
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const off = drawLeetCodeSlots({ ...base, avoidSolved: false, ratings: [1500], mode: "rating", count: 1, candidates: pool, rng: createSeededRng(seed) });
      if (off.ok) seen.add(off.picks[0].slug);
    }
    expect(seen).toEqual(new Set(["solved", "unsolved"]));
  });

  it("re-rolled slugs are avoided until nothing else is left", () => {
    const pool = [candidate("a", 1500), candidate("b", 1500)];
    const r = drawLeetCodeSlots({ ...base, ratings: [1500], mode: "rating", count: 1, candidates: pool, rerolled: ["a"], rng: createSeededRng(1) });
    expect(r.ok && r.picks[0].slug).toBe("b");
    expect(capRerolled(Array.from({ length: 40 }, (_, i) => `s${i}`))).toHaveLength(30);
    expect(capRerolled(["x", "x", "y"])).toEqual(["x", "y"]);
  });
});

describe("topics (AC-LC-7)", () => {
  const tagged = LADDER.map((c, i) => (i % 2 === 0 ? { ...c, tags: ["graph"] } : c));
  it("candidates are filtered by the overlay tags", () => {
    const r = drawLeetCodeSlots({ ...base, mode: "rating", count: 3, candidates: tagged, tags: ["graph"], rng: createSeededRng(5) });
    if (!r.ok) throw new Error();
    const graph = new Set(tagged.filter((c) => c.tags.includes("graph")).map((c) => c.slug));
    expect(r.picks.every((p) => graph.has(p.slug))).toBe(true);
    expect(r.notices).toEqual([]);
  });

  it("with too few matches the topics are ignored and leetcode_topics_ignored is returned", () => {
    const few = LADDER.map((c, i) => (i === 0 ? { ...c, tags: ["trie"] } : c));
    const r = drawLeetCodeSlots({ ...base, mode: "rating", count: 2, candidates: few, tags: ["trie"], rng: createSeededRng(5) });
    if (!r.ok) throw new Error();
    expect(r.picks).toHaveLength(2);
    expect(r.notices).toContainEqual({ code: "leetcode_topics_ignored" });
  });

  it("an empty pool is leetcode_pool_too_small", () => {
    const r = drawLeetCodeSlots({ ...base, mode: "rating", count: 2, candidates: [candidate("only", 1500)], rng: createSeededRng(1) });
    expect(r).toMatchObject({ ok: false, code: "leetcode_pool_too_small" });
  });
});

describe("premium and excluded problems (AC-LC-8)", () => {
  it("are never drawn over seeds 1–200 (real catalog, every fifth problem flagged)", () => {
    const catalogRaw = JSON.parse(readFileSync("src/server/leetcode/catalog.json", "utf8")) as { problems: { slug: string }[] };
    const problems: Record<string, { premium?: boolean; exclude?: boolean }> = {};
    catalogRaw.problems.forEach((p, i) => {
      if (i % 5 === 0) problems[p.slug] = i % 10 === 0 ? { premium: true } : { exclude: true };
    });
    const loaded = loadCatalog(catalogRaw, { version: 1, problems });
    if (!loaded.ok) throw new Error(loaded.issues.join("\n"));
    const hidden = new Set(Object.keys(problems));
    const candidates = loaded.catalog.visible.map((p) =>
      candidate(p.slug, p.rating, { difficulty: p.difficulty, tags: p.tags }),
    );
    expect(candidates.some((c) => hidden.has(c.slug))).toBe(false);
    for (let seed = 1; seed <= 200; seed++) {
      for (const mode of ["rating", "difficulty"] as const) {
        const r = drawLeetCodeSlots({ ...base, mode, count: 4, candidates, rng: createSeededRng(seed) });
        if (!r.ok) throw new Error();
        for (const p of r.picks) expect(hidden.has(p.slug)).toBe(false);
      }
    }
  });
});

describe("re-roll one auto slot (AC-LC-10, pure part)", () => {
  it("changes the slug, keeps the target, adds the old slug to the re-rolled list", () => {
    const r = rerollLeetCodeSlot({
      mode: "rating",
      slot: { slug: "p1500", difficulty: "medium", rating: 1500 },
      target: 1500,
      candidates: LADDER,
      tags: [],
      rerolled: [],
      rerollCount: 3,
      avoidSolved: true,
      rng: createSeededRng(9),
    });
    if (!r.ok) throw new Error(r.code);
    expect(r.pick.slug).not.toBe("p1500");
    expect(Math.abs(r.pick.rating! - 1500)).toBeLessThanOrEqual(100);
    expect(r.pick.target).toBe(1500);
    expect(r.rerolled).toContain("p1500");
  });

  it("difficulty mode keeps the difficulty; the limit is enforced", () => {
    const r = rerollLeetCodeSlot({
      mode: "difficulty",
      slot: { slug: "p2000", difficulty: "hard", rating: 2000 },
      target: null,
      candidates: LADDER,
      tags: [],
      rerolled: [],
      rerollCount: 0,
      avoidSolved: true,
      rng: createSeededRng(2),
    });
    expect(r.ok && r.pick.difficulty).toBe("hard");
    const limited = rerollLeetCodeSlot({
      mode: "difficulty",
      slot: { slug: "p2000", difficulty: "hard", rating: 2000 },
      target: null,
      candidates: LADDER,
      tags: [],
      rerolled: [],
      rerollCount: 30,
      avoidSolved: true,
      rng: createSeededRng(2),
    });
    expect(limited).toEqual({ ok: false, code: "reroll_limit" });
  });
});

describe("hidden before the start (AC-LC-11, snapshot part)", () => {
  it("the snapshot shows a LeetCode slot's slug, rating and estimates only once titles are revealed", () => {
    const input = (revealTitles: boolean) => ({
      session: { status: "lobby" as const, startedAt: null, endsAt: null, durationMin: 60, problemCount: 1, hostId: null },
      problems: [
        {
          position: 1,
          slug: null,
          title: "Secret Title",
          difficulty: "medium" as const,
          tags: [],
          external: {
            slug: "secret-slug",
            rating: 1612,
            provenance: { difficultyEstimated: true, ratingSource: "zerotrac" as const, tagsEstimated: false },
          },
        },
      ],
      participants: [],
      revealTitles,
    });
    const hidden = JSON.stringify(buildSessionSnapshot(input(false)));
    for (const leak of ["Secret Title", "secret-slug", "1612", "zerotrac"]) expect(hidden).not.toContain(leak);
    const shown = buildSessionSnapshot(input(true));
    expect(shown.problems[0].external).toEqual({
      slug: "secret-slug",
      rating: 1612,
      provenance: { difficultyEstimated: true, ratingSource: "zerotrac", tagsEstimated: false },
    });
  });
});
