// Write limits of the community layer (docs/specs/community.md §B.11). The
// numbers live here (pure, testable); src/server/community/limits.ts counts
// the user's own rows in each window inside the write transaction, under a
// per-user advisory lock, and calls `evaluateWindows`. C2/C3 add their
// actions to RATE_LIMITS and reuse the same helpers.
import type { TrustLevel } from "./trust";

export type WindowRule = { limit: number; windowMs: number; label: string };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type RateAction = "comment" | "edit" | "vote" | "downvote" | "report";

/** Per trust level; moderators and admins are not limited (§B.11 table). */
export const RATE_LIMITS: Record<RateAction, Record<TrustLevel, WindowRule[]>> = {
  comment: {
    0: [
      { limit: 3, windowMs: 10 * MIN, label: "3 comments per 10 minutes" },
      { limit: 10, windowMs: DAY, label: "10 comments per day" },
    ],
    1: [
      { limit: 10, windowMs: 10 * MIN, label: "10 comments per 10 minutes" },
      { limit: 100, windowMs: DAY, label: "100 comments per day" },
    ],
  },
  edit: {
    0: [{ limit: 10, windowMs: HOUR, label: "10 edits per hour" }],
    1: [{ limit: 30, windowMs: HOUR, label: "30 edits per hour" }],
  },
  // All targets together (comment votes, problem votes, difficulty feedback).
  vote: {
    0: [{ limit: 30, windowMs: HOUR, label: "30 votes per hour" }],
    1: [
      { limit: 120, windowMs: HOUR, label: "120 votes per hour" },
      { limit: 500, windowMs: DAY, label: "500 votes per day" },
    ],
  },
  // On top of `vote`; TL0 cannot downvote at all (403 trust_required).
  downvote: {
    0: [],
    1: [{ limit: 50, windowMs: DAY, label: "50 downvotes per day" }],
  },
  report: {
    0: [{ limit: 5, windowMs: DAY, label: "5 reports per day" }],
    1: [{ limit: 20, windowMs: DAY, label: "20 reports per day" }],
  },
};

export function rulesFor(action: RateAction, trust: TrustLevel, moderator: boolean): WindowRule[] {
  return moderator ? [] : RATE_LIMITS[action][trust];
}

/** Rows in one window: how many, and the oldest one's time (null when none). */
export type WindowStat = { count: number; oldest: Date | null };

export type LimitDecision = { ok: true } | { ok: false; retryAfterSec: number; rule: WindowRule };

/**
 * The first rule that one more write would break, with `Retry-After` = the
 * oldest row in that window + the window − now (at least 1 s). `stats[i]`
 * belongs to `rules[i]`.
 */
export function evaluateWindows(rules: readonly WindowRule[], stats: readonly WindowStat[], now: Date): LimitDecision {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const stat = stats[i] ?? { count: 0, oldest: null };
    if (stat.count >= rule.limit) {
      const freeAt = (stat.oldest ?? now).getTime() + rule.windowMs;
      return { ok: false, rule, retryAfterSec: Math.max(1, Math.ceil((freeAt - now.getTime()) / 1000)) };
    }
  }
  return { ok: true };
}

/** "Try again in 7 minutes." style hint for a 429. */
export function retryHint(seconds: number): string {
  if (seconds < 90) return `Try again in ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `Try again in ${minutes} minutes.`;
  return `Try again in ${Math.ceil(minutes / 60)} hours.`;
}
