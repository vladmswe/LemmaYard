// Scoring and ranking of a room session (docs/specs/rooms.md §3.4, §4).
// Pure: results are always recomputed from the session's submissions, so
// out-of-order judging cannot corrupt them.

/** Owner decision D1: 5 minutes per counted wrong attempt before the first accept. */
export const PENALTY_SEC_PER_WRONG = 300;

/** Final statuses that count as an attempt. compile_error and internal_error never count. */
export const COUNTED_STATUSES = [
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
] as const;
export type CountedStatus = (typeof COUNTED_STATUSES)[number];

const COUNTED = new Set<string>(COUNTED_STATUSES);

export function isCountedStatus(status: string): status is CountedStatus {
  return COUNTED.has(status);
}

type Instant = Date | string | number;

function ms(t: Instant): number {
  return t instanceof Date ? t.getTime() : typeof t === "number" ? t : new Date(t).getTime();
}

/** One submit row of (session, user, problem) (query Q9). */
export type ScoringSubmission = {
  id: string;
  status: string;
  createdAt: Instant;
};

/** Mirrors a room_session_results row. */
export type CellOutcome = {
  /** All counted submits (including those after the first accept). */
  attempts: number;
  /** Counted non-accepted submits before the first accept (all of them if unsolved). */
  wrongBefore: number;
  firstAcceptedAt: Date | null;
  firstAcceptedSubmissionId: string | null;
  /** floor(first accepted created_at − started_at) in seconds; null if unsolved. */
  solveSeconds: number | null;
};

/**
 * Counted = counted status and `startedAt <= createdAt < endsAt`. Ordered by
 * (createdAt, id) like Q9.
 */
export function computeCellOutcome(
  submissions: readonly ScoringSubmission[],
  window: { startedAt: Instant; endsAt: Instant },
): CellOutcome {
  const start = ms(window.startedAt);
  const end = ms(window.endsAt);
  const counted = submissions
    .map((s) => ({ ...s, t: ms(s.createdAt) }))
    .filter((s) => isCountedStatus(s.status) && s.t >= start && s.t < end)
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const firstIndex = counted.findIndex((s) => s.status === "accepted");
  const first = firstIndex >= 0 ? counted[firstIndex] : null;
  return {
    attempts: counted.length,
    wrongBefore: first ? firstIndex : counted.length,
    firstAcceptedAt: first ? new Date(first.t) : null,
    firstAcceptedSubmissionId: first ? first.id : null,
    solveSeconds: first ? Math.floor((first.t - start) / 1000) : null,
  };
}

export type ScoringCell = {
  position: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstAcceptedAt?: Instant | null;
};

export type ScoringParticipant = {
  userId: string;
  username: string;
  cells: readonly ScoringCell[];
};

export type ParticipantTotals = { solvedCount: number; penaltySec: number };

/** Σ over solved cells of solve_seconds + 300 × wrong_before. */
export function participantTotals(
  cells: readonly ScoringCell[],
  penaltyPerWrong: number = PENALTY_SEC_PER_WRONG,
): ParticipantTotals {
  let solvedCount = 0;
  let penaltySec = 0;
  for (const c of cells) {
    if (c.solveSeconds === null) continue;
    solvedCount += 1;
    penaltySec += c.solveSeconds + penaltyPerWrong * c.wrongBefore;
  }
  return { solvedCount, penaltySec };
}

export type RankedParticipant = ParticipantTotals & {
  userId: string;
  username: string;
  rank: number;
};

/** Better first: more solved, then less time. */
export function compareTotals(a: ParticipantTotals, b: ParticipantTotals): number {
  return b.solvedCount - a.solvedCount || a.penaltySec - b.penaltySec;
}

/**
 * Standard competition ranking (1, 1, 3): equal solved and equal time share a
 * rank; rows are listed by rank, then username. Participants with zero
 * submits get a rank too.
 */
export function rankParticipants(
  rows: readonly (ParticipantTotals & { userId: string; username: string })[],
): RankedParticipant[] {
  const sorted = [...rows].sort(
    (a, b) =>
      compareTotals(a, b) ||
      (a.username < b.username ? -1 : a.username > b.username ? 1 : 0) ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
  const ranked: RankedParticipant[] = [];
  sorted.forEach((row, i) => {
    const prev = ranked[i - 1];
    const rank = prev && compareTotals(prev, row) === 0 ? prev.rank : i + 1;
    ranked.push({ ...row, rank });
  });
  return ranked;
}

export type SessionScore = {
  participants: RankedParticipant[];
  /** position → user ids with the earliest first accept (several on equal timestamps). */
  firstSolvers: Map<number, string[]>;
};

export function scoreSession(
  participants: readonly ScoringParticipant[],
  penaltyPerWrong: number = PENALTY_SEC_PER_WRONG,
): SessionScore {
  const ranked = rankParticipants(
    participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      ...participantTotals(p.cells, penaltyPerWrong),
    })),
  );
  return { participants: ranked, firstSolvers: firstSolvers(participants) };
}

/**
 * First solver per position: earliest `firstAcceptedAt` (falls back to
 * `solveSeconds` when timestamps are absent).
 */
export function firstSolvers(participants: readonly ScoringParticipant[]): Map<number, string[]> {
  const best = new Map<number, { t: number; users: string[] }>();
  for (const p of participants) {
    for (const c of p.cells) {
      if (c.solveSeconds === null) continue;
      const t = c.firstAcceptedAt != null ? ms(c.firstAcceptedAt) : c.solveSeconds * 1000;
      const cur = best.get(c.position);
      if (!cur || t < cur.t) best.set(c.position, { t, users: [p.userId] });
      else if (t === cur.t) cur.users.push(p.userId);
    }
  }
  return new Map([...best].sort((a, b) => a[0] - b[0]).map(([pos, v]) => [pos, v.users.sort()]));
}

/**
 * `m:ss` under one hour ("6:10", "44:00", as in the spec's examples),
 * `h:mm:ss` otherwise ("1:26:40") (§4.3).
 */
export function formatScoreTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
