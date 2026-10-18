// Wire shapes of the session routes besides the state poll (docs/specs/rooms.md
// §2.3–§2.6, §7.2), their user-facing copy, and the pure snapshot builder used
// by the state endpoint. Pure module, shared by the server and the lobby UI (R4).
import type { SessionSnapshot } from "./events";
import { firstSolvers } from "./scoring";
import type { DrawError, DrawNotice, Tier } from "./selection";
import {
  DIFFICULTIES,
  type Difficulty,
  type Mix,
  type RoomSessionSettings,
  type RoomSessionStatus,
  type SelectionMode,
} from "./types";

export const SESSION_NOT_FOUND = "Session not found";
export const HOST_ONLY = "Only the host can do this";
export const SESSION_ENDED = "The session has ended";
export const SUBMIT_SESSION_ENDED = "The session has ended; this submission would not count. Submit without the session?";
export const JOIN_FIRST = "Join the session first";
export const NOT_IN_SESSION = "This problem is not part of the session";
export const REROLL_LIMIT = "Re-roll limit reached for this session";
export const DUPLICATE_PROBLEM = "This problem is already in the session";
export const UNPIN_FIRST = "Unpin a problem first";
export const END_INSTEAD = "End the session instead";
export const REROLLS_RESET_NOTICE = "No other unused options; showing earlier ones again";

const LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export function mixLabel(mix: Mix): string {
  return DIFFICULTIES.map((d) => `${mix[d]} ${LABEL[d]}`).join(" · ");
}

export type DrawErrorView = {
  code: DrawError["code"];
  error: string;
  counts: Mix;
  requested?: Mix;
};

/** Copy of §2.6 (E1/E2) and the 400 cases of the draw. */
export function drawErrorView(err: DrawError, problemCount: number, tagCount: number): DrawErrorView {
  const total = err.counts.easy + err.counts.medium + err.counts.hard;
  const topics = tagCount > 0 ? "these topics" : "the catalog";
  let error: string;
  switch (err.code) {
    case "pool_too_small":
      error =
        `Only ${total} problem${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""} ${topics}. ` +
        (tagCount > 0 ? "Choose fewer problems, add topics, or pick Any topic." : "Choose fewer problems.");
      break;
    case "mix_infeasible": {
      const short = DIFFICULTIES.find((d) => err.requested && err.requested[d] > err.counts[d]) ?? "hard";
      const have = err.counts[short];
      const want = err.requested?.[short] ?? 0;
      error =
        `There ${have === 1 ? "is" : "are"} only ${have} ${LABEL[short]} problem${have === 1 ? "" : "s"} for ${topics}; ` +
        `your mix asks for ${want}. Available: ${mixLabel(err.counts)}.`;
      break;
    }
    case "too_many_pinned":
      error = UNPIN_FIRST;
      break;
    case "pinned_exceeds_mix":
      error = "The custom mix has fewer slots of a difficulty than are pinned. Unpin a problem or change the mix.";
      break;
    case "invalid_mix":
      error = `The custom mix must add up to ${problemCount} problem${problemCount === 1 ? "" : "s"}`;
      break;
  }
  return { code: err.code, error, counts: err.counts, ...(err.requested ? { requested: err.requested } : {}) };
}

/** 409 for E1/E2 (§2.6); the other draw errors are request errors (400). */
export function drawErrorStatus(code: DrawError["code"]): 400 | 409 {
  return code === "pool_too_small" || code === "mix_infeasible" ? 409 : 400;
}

export type DrawNoticeView = DrawNotice & { message: string };

export function noticeView(n: DrawNotice): DrawNoticeView {
  if (n.code === "targets_far") {
    return { ...n, message: `Problem ${n.position}: closest available is ${n.rating} (target ${n.target})` };
  }
  return { ...n, message: `${REROLLS_RESET_NOTICE} (${LABEL[n.difficulty]})` };
}

export type LobbySlotView = {
  position: number;
  difficulty: Difficulty;
  pinned: boolean;
  tags: string[];
  /** Host/owner only: titles are revealed to everyone at start. */
  problem?: { slug: string; title: string; published: boolean };
  /** Host/owner only: why this problem was drawn (§2.4 muted note). */
  note?: { tier: Tier | null; solvedBy: number | null; expectedCount: number; lastUsedAt: string | null };
  /** v2, rating mode only. */
  rating?: LobbySlotRatingView;
};

export type CalibrationView = {
  /** Finished sessions that contributed (0..6). */
  sessions: number;
  counts: Record<Difficulty, { solved: number; pairs: number }>;
  rates: Record<Difficulty, number>;
  target: number;
  /** Best feasible mix for the current filters (null when the pool is too small). */
  suggested: Mix | null;
  /** Expected problems solved per person for `suggested`. */
  expectedSolved: number | null;
};

export type LobbyView = {
  sessionId: string;
  roomId: string;
  status: RoomSessionStatus;
  hostId: string | null;
  canManage: boolean;
  problemCount: number;
  durationMin: number;
  plannedFor: string | null;
  settings: RoomSessionSettings;
  rerollCount: number;
  rerollsLeft: number;
  slots: LobbySlotView[];
  /** "Actual: 1 Easy · 2 Medium · 1 Hard" */
  actualMix: Mix;
  /** Host/owner only. */
  calibration?: CalibrationView;
  /** Host/owner only: problems matching the filters, and those never used in this room. */
  pool?: { available: Mix; unused: Mix };
  /** Notices of the request that produced this view (not persisted). */
  notices: DrawNoticeView[];
  /** Set when the draw at create time failed; the slots are then empty. */
  drawError?: DrawErrorView;
  /** v2: how the problems are picked (sessions from before v2 read "difficulty"). */
  mode?: SelectionMode;
  /** v2: whether the results change the room's ratings. */
  rated?: boolean;
  /** v2, rating mode, host/owner only (§6.3 "Shown"). */
  expected?: LobbyExpectationView;
};

/** v2 rating numbers of one slot. Non-hosts get `chance` only (a rating narrows the problem down). */
export type LobbySlotRatingView = {
  /** Room solve chance = mean over the expected participants of P(R_u, R_p). */
  chance: number;
  rating?: number;
  /** Null for a pinned slot. */
  target?: number | null;
  /** rating − target */
  deviation?: number | null;
};

export type LobbyExpectationView = {
  /** τ of the challenge (0.75 / 0.55 / 0.35). */
  target: number;
  /** "about X of N per person". */
  expectedPerPerson: number;
  /** X / N. */
  share: number;
  perUser: { userId: string; username: string; rating: number; provisional: boolean; expected: number }[];
  /** Ladder center (rounded) and whether it was widened for a wide rating spread. */
  center: number | null;
  widened: boolean;
  /** Lowest and highest rating among the expected participants. */
  ratingRange: { min: number; max: number } | null;
};

// --- State snapshot (§7.2) ---

export type SnapshotInput = {
  session: {
    status: RoomSessionStatus;
    startedAt: Date | null;
    endsAt: Date | null;
    durationMin: number;
    problemCount: number;
    hostId: string | null;
  };
  problems: { position: number; slug: string; title: string; difficulty: Difficulty; tags: string[] }[];
  participants: {
    userId: string;
    username: string;
    joinedAt: Date;
    solvedCount: number;
    penaltySec: number;
    rank: number | null;
    results: {
      position: number;
      attempts: number;
      wrongBefore: number;
      solveSeconds: number | null;
      firstAcceptedAt: Date | null;
      solvedBefore: boolean;
    }[];
  }[];
  /** Host/owner, or any member once the session has started (never for a cancelled lobby). */
  revealTitles: boolean;
};

/**
 * Builds the snapshot. Spoilers (§3.5, §8.4): no code, verdicts or test data
 * exist in the inputs; titles and slugs are left out unless `revealTitles`.
 * Participants are listed by rank, then username (lobby: by join time).
 */
export function buildSessionSnapshot(input: SnapshotInput): SessionSnapshot {
  const first = firstSolvers(
    input.participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      cells: p.results.map((r) => ({
        position: r.position,
        wrongBefore: r.wrongBefore,
        solveSeconds: r.solveSeconds,
        firstAcceptedAt: r.firstAcceptedAt,
      })),
    })),
  );
  const participants = [...input.participants].sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    if ((a.rank === null) !== (b.rank === null)) return a.rank === null ? 1 : -1;
    if (a.rank === null) return a.joinedAt.getTime() - b.joinedAt.getTime() || cmp(a.username, b.username);
    return cmp(a.username, b.username);
  });
  return {
    session: {
      status: input.session.status,
      startedAt: input.session.startedAt?.toISOString() ?? null,
      endsAt: input.session.endsAt?.toISOString() ?? null,
      durationMin: input.session.durationMin,
      problemCount: input.session.problemCount,
    },
    problems: [...input.problems]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        position: p.position,
        ...(input.revealTitles ? { slug: p.slug, title: p.title } : {}),
        difficulty: p.difficulty,
        tags: [...p.tags],
      })),
    participants: participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      isHost: input.session.hostId === p.userId,
      solvedCount: p.solvedCount,
      penaltySec: p.penaltySec,
      rank: p.rank,
      cells: [...p.results]
        .sort((a, b) => a.position - b.position)
        .map((r) => ({
          position: r.position,
          attempts: r.attempts,
          wrongBefore: r.wrongBefore,
          solveSeconds: r.solveSeconds,
          firstSolver: r.solveSeconds !== null && (first.get(r.position) ?? []).includes(p.userId),
          solvedBefore: r.solvedBefore,
        })),
    })),
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
