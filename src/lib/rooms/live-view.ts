// View model of the session scoreboard matrix (docs/specs/rooms-v2.md §3,
// rooms.md §4.1–§4.3, §7.4): person × problem cells (solved / judging /
// tried / not started), the split since a person's previous solve, row and
// column summaries, the N-adaptive layout and the "1✓ 2✗ 3✓ 4·" chips. Pure:
// built only from the state snapshot (+ the v2 `pending` list) or the results
// page data, which by construction carry no code, verdict types or test data.
import { durationWords } from "./live-clock";
import { formatScoreTime } from "./scoring";
import type { PendingCell, SessionSnapshot, SnapshotCell } from "./events";
import type { Difficulty } from "./types";

export type SnapshotProblem = SessionSnapshot["problems"][number];
export type SnapshotParticipant = SessionSnapshot["participants"][number];

/** "Problem 2" (spec copy; positions are 1-based). */
export function problemLabel(position: number): string {
  return `Problem ${position}`;
}

/** "Problem 2 · Coin Change", or just "Problem 2" while titles are hidden. */
export function problemName(problem: Pick<SnapshotProblem, "position" | "title"> | undefined, position: number) {
  return problem?.title ? `${problemLabel(position)} · ${problem.title}` : problemLabel(position);
}

// --- Time formatting ---------------------------------------------------------

/** Split since the previous solve: "+18:20" (h:mm:ss from one hour). */
export function formatSplit(seconds: number): string {
  return `+${formatScoreTime(seconds)}`;
}

/** Whole minutes for the narrow mini-matrix: 1470 → "25′" (rounded). */
export function formatMinuteMark(seconds: number): string {
  return `${Math.round(Math.max(0, seconds) / 60)}′`;
}

/** Axis labels 0 · ¼ · ½ · ¾ · end for a session of `durationSec`. */
export function axisTicks(durationSec: number): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => formatScoreTime(Math.round(durationSec * f)));
}

/** Position of a solve on the session's time track, 0..1. */
export function trackFraction(solveSeconds: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, solveSeconds / durationSec));
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

// --- Layout by N (§3.1) --------------------------------------------------------

export type MatrixVariant = "wide" | "standard" | "narrow" | "compact";

export type MatrixLayout = {
  variant: MatrixVariant;
  /** Width of the participant column (px, desktop table). */
  nameCol: number;
  /** Width of the solved/time column (px). */
  totalCol: number;
  /** Thin time track inside solved cells. */
  track: boolean;
  /** 0 · ¼ · ½ · ¾ · end axis under the problem headers (N ≤ 2). */
  axis: boolean;
  /** "· 1 judging" in the problem header (N < 5). */
  headerJudging: boolean;
  /** "· median 35:00" on results (N ≤ 4). */
  median: boolean;
  /** The words "First" / "first solve" (N ≤ 4; N = 5 keeps only the star). */
  words: boolean;
};

export function matrixLayout(n: number): MatrixLayout {
  if (n <= 2) {
    return { variant: "wide", nameCol: n === 1 ? 300 : 260, totalCol: n === 1 ? 130 : 104, track: true, axis: true, headerJudging: true, median: true, words: true };
  }
  if (n <= 4) {
    return { variant: "standard", nameCol: 230, totalCol: 104, track: true, axis: false, headerJudging: true, median: true, words: true };
  }
  if (n === 5) {
    return { variant: "narrow", nameCol: 210, totalCol: 104, track: true, axis: false, headerJudging: false, median: false, words: false };
  }
  return { variant: "compact", nameCol: 200, totalCol: 96, track: false, axis: false, headerJudging: false, median: false, words: false };
}

// --- Cells (§3.2) ---------------------------------------------------------------

/** The fields a matrix cell needs; a snapshot cell and a results cell both fit. */
export type MatrixCellInput = Pick<
  SnapshotCell,
  "position" | "attempts" | "wrongBefore" | "solveSeconds" | "firstSolver" | "solvedBefore"
>;

/** `attempted` = tried, not solved, nothing being judged (kept from v1 for selectors). */
export type CellState = "solved" | "judging" | "attempted" | "untouched";

export type CellView = {
  position: number;
  state: CellState;
  /** Solve time from the start ("24:30"), solved cells only. */
  time: string | null;
  solveSeconds: number | null;
  /** "+18:20" since this person's previous solve; null for their first solve. */
  split: string | null;
  splitSeconds: number | null;
  /** Counted wrong attempts: before the accept (solved) or all of them (tried). */
  wrong: number;
  attempts: number;
  /** "Judging… attempt k": k = counted attempts + 1. */
  judgingAttempt: number | null;
  firstSolver: boolean;
  solvedBefore: boolean;
  /** A LeetCode slot: a solve here was marked by the participant, not judged (rooms-external-problems §5). */
  selfReported: boolean;
  /** 0..1 on the session's time track (solved cells with a known duration). */
  track: number | null;
  /** Screen-reader sentence (§3.2). */
  srText: string;
};

export type CellOptions = {
  /** Session submits of this person for this problem queued or running now. */
  pending?: number;
  /** Seconds since this person's previous solve (null: this is their first). */
  splitSeconds?: number | null;
  durationSec?: number | null;
  /** The column is a LeetCode slot (self-reported solves). */
  selfReported?: boolean;
};

/** §3.2 sr-only sentences. */
export function cellSrText(
  view: Pick<
    CellView,
    "position" | "state" | "solveSeconds" | "splitSeconds" | "wrong" | "attempts" | "firstSolver" | "solvedBefore" | "selfReported"
  >,
): string {
  const label = problemLabel(view.position);
  switch (view.state) {
    case "solved": {
      const verb = view.selfReported ? "marked solved (self-reported)" : "solved";
      const parts = [`${label}: ${verb} ${durationWords(view.solveSeconds ?? 0)} after the start`];
      if (view.splitSeconds !== null) parts.push(`${durationWords(view.splitSeconds)} after their previous solve`);
      if (view.wrong > 0) parts.push(`after ${plural(view.wrong, "wrong attempt")}`);
      if (view.firstSolver) parts.push("first to solve it");
      if (view.solvedBefore) parts.push("solved before the session");
      return parts.join(", ");
    }
    case "judging":
      return `${label}: a submission is being judged`;
    case "attempted":
      return `${label}: ${plural(view.attempts, "attempt")}, not solved yet`;
    case "untouched":
      return view.selfReported ? `${label}: not marked solved` : `${label}: not attempted`;
  }
}

export function cellView(cell: MatrixCellInput | undefined, position: number, options: CellOptions = {}): CellView {
  const attempts = cell?.attempts ?? 0;
  const solveSeconds = cell?.solveSeconds ?? null;
  const pending = options.pending ?? 0;
  let state: CellState;
  if (solveSeconds !== null) state = "solved";
  else if (pending > 0) state = "judging";
  else if (attempts > 0) state = "attempted";
  else state = "untouched";
  const solved = state === "solved";
  const splitSeconds = solved ? (options.splitSeconds ?? null) : null;
  const durationSec = options.durationSec ?? null;
  const base = {
    position,
    state,
    time: solved ? formatScoreTime(solveSeconds!) : null,
    solveSeconds: solved ? solveSeconds : null,
    split: splitSeconds !== null ? formatSplit(splitSeconds) : null,
    splitSeconds,
    wrong: solved ? (cell?.wrongBefore ?? 0) : attempts,
    attempts,
    judgingAttempt: state === "judging" ? attempts + 1 : null,
    firstSolver: solved && (cell?.firstSolver ?? false),
    solvedBefore: cell?.solvedBefore ?? false,
    selfReported: options.selfReported ?? false,
    track: solved && durationSec ? trackFraction(solveSeconds!, durationSec) : null,
  };
  return { ...base, srText: cellSrText(base) };
}

/**
 * Seconds since the previous solve of the same person, by position: solves are
 * ordered by time; the first one has no split (null). Ties keep position order.
 */
export function splitsByPosition(cells: readonly MatrixCellInput[]): Map<number, number | null> {
  const solved = cells
    .filter((c) => c.solveSeconds !== null)
    .sort((a, b) => a.solveSeconds! - b.solveSeconds! || a.position - b.position);
  const out = new Map<number, number | null>();
  let prev: number | null = null;
  for (const c of solved) {
    out.set(c.position, prev === null ? null : c.solveSeconds! - prev);
    prev = c.solveSeconds!;
  }
  return out;
}

/** Counted wrong attempts on all problems: Σ wrongBefore (solved) + attempts (unsolved). */
export function wrongAttemptTotal(cells: readonly MatrixCellInput[]): number {
  return cells.reduce((sum, c) => sum + (c.solveSeconds !== null ? c.wrongBefore : c.attempts), 0);
}

/** "2 wrong attempts" / "no wrong attempts". */
export function wrongAttemptsLabel(n: number): string {
  return n === 0 ? "no wrong attempts" : plural(n, "wrong attempt");
}

// --- Rows --------------------------------------------------------------------

export type MatrixParticipantInput = {
  userId: string;
  username: string;
  isHost: boolean;
  rank: number | null;
  solvedCount: number;
  penaltySec: number;
  cells: readonly MatrixCellInput[];
};

export type ScoreRow = {
  userId: string;
  username: string;
  isHost: boolean;
  isViewer: boolean;
  /** Competition rank (1, 1, 3); null before the first scoring pass. */
  rank: number | null;
  solved: number;
  penaltySec: number;
  /** Penalty-inclusive total ("1:26:40"); "—" with nothing solved. */
  time: string;
  wrongTotal: number;
  /** Latest solve time from the start ("51:00"), null with nothing solved. */
  lastSolve: string | null;
  cells: CellView[];
};

export type MatrixOptions = {
  viewerId: string | null;
  /** v2 `pending` of the latest state response. */
  pending?: readonly PendingCell[];
  durationSec?: number | null;
  /** Positions of LeetCode slots (their solves are self-reported). */
  selfReported?: ReadonlySet<number>;
};

/** Pending submit counts by "userId:position". */
export function pendingIndex(pending: readonly PendingCell[] = []): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of pending) map.set(`${p.userId}:${p.position}`, (map.get(`${p.userId}:${p.position}`) ?? 0) + p.count);
  return map;
}

/** One row per participant (input order), one cell per problem position. */
export function matrixRows(
  participants: readonly MatrixParticipantInput[],
  positions: readonly number[],
  options: MatrixOptions,
): ScoreRow[] {
  const pending = pendingIndex(options.pending);
  return participants.map((p) => {
    const byPos = new Map(p.cells.map((c) => [c.position, c]));
    const splits = splitsByPosition(p.cells);
    const solvedTimes = p.cells.filter((c) => c.solveSeconds !== null).map((c) => c.solveSeconds!);
    const last = solvedTimes.length > 0 ? Math.max(...solvedTimes) : null;
    return {
      userId: p.userId,
      username: p.username,
      isHost: p.isHost,
      isViewer: p.userId === options.viewerId,
      rank: p.rank,
      solved: p.solvedCount,
      penaltySec: p.penaltySec,
      time: p.solvedCount > 0 ? formatScoreTime(p.penaltySec) : "—",
      wrongTotal: wrongAttemptTotal(p.cells),
      lastSolve: last === null ? null : formatScoreTime(last),
      cells: positions.map((pos) =>
        cellView(byPos.get(pos), pos, {
          pending: pending.get(`${p.userId}:${pos}`) ?? 0,
          splitSeconds: splits.get(pos) ?? null,
          durationSec: options.durationSec ?? null,
          selfReported: options.selfReported?.has(pos) ?? false,
        }),
      ),
    };
  });
}

/** Positions of LeetCode slots: their solves are self-reported (rooms-external-problems §5). */
export function selfReportedPositions(problems: readonly { position: number; external?: unknown }[]): Set<number> {
  return new Set(problems.filter((p) => p.external).map((p) => p.position));
}

/** True when a session has at least one LeetCode slot ("Includes self-reported LeetCode problems"). */
export function hasExternalProblems(problems: readonly { external?: unknown }[]): boolean {
  return problems.some((p) => p.external);
}

/** Rows of a state snapshot (its order: rank, then username). */
export function scoreboardRows(
  snapshot: SessionSnapshot,
  viewerId: string | null,
  pending: readonly PendingCell[] = [],
): ScoreRow[] {
  return matrixRows(
    snapshot.participants,
    snapshot.problems.map((p) => p.position),
    { viewerId, pending, durationSec: snapshot.session.durationMin * 60, selfReported: selfReportedPositions(snapshot.problems) },
  );
}

// --- Problem columns --------------------------------------------------------------

export type MatrixProblem = {
  position: number;
  /** Absent while titles are hidden. */
  title?: string;
  /** Our problem (absent for a LeetCode slot and while titles are hidden). */
  slug?: string | null;
  /** Null only for a LeetCode slot without a difficulty. */
  difficulty: Difficulty | null;
  /** A LeetCode slot; `slug` is absent while titles are hidden. */
  external?: { slug?: string; rating?: number | null };
};

export type ColumnStats = {
  position: number;
  solvedBy: number;
  judging: number;
  /** Median solve time (seconds) of the people who solved it. */
  medianSeconds: number | null;
};

/** Median (the mean of the two middle values for an even count, floored). */
export function medianSeconds(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

export function columnStats(rows: readonly ScoreRow[], position: number): ColumnStats {
  const cells = rows.map((r) => r.cells.find((c) => c.position === position)).filter((c) => c !== undefined);
  const times = cells.filter((c) => c.state === "solved").map((c) => c.solveSeconds!);
  return {
    position,
    solvedBy: times.length,
    judging: cells.filter((c) => c.state === "judging").length,
    medianSeconds: medianSeconds(times),
  };
}

/** "3 solved · 1 judging" (live) / "4 solved · median 6:10" (final), per layout. */
export function columnMetaText(stats: ColumnStats, layout: MatrixLayout, final: boolean): string {
  const parts = [`${stats.solvedBy} solved`];
  if (!final && layout.headerJudging && stats.judging > 0) parts.push(`${stats.judging} judging`);
  if (final && layout.median && stats.medianSeconds !== null) parts.push(`median ${formatScoreTime(stats.medianSeconds)}`);
  return parts.join(" · ");
}

// --- Chips summary ("You: 1✓ 2✗ 3✓ 4·") ---------------------------------------------

export type Chip = { position: number; state: CellState; mark: "✓" | "✗" | "…" | "·" };

const MARK: Record<CellState, Chip["mark"]> = { solved: "✓", attempted: "✗", judging: "…", untouched: "·" };
const CHIP_WORD: Record<CellState, string> = {
  solved: "solved",
  attempted: "tried, not solved",
  judging: "being judged",
  untouched: "not started",
};

export function chips(cells: readonly Pick<CellView, "position" | "state">[]): Chip[] {
  return cells.map((c) => ({ position: c.position, state: c.state, mark: MARK[c.state] }));
}

/** "1✓ 2✗ 3✓ 4·" */
export function chipsText(list: readonly Chip[]): string {
  return list.map((c) => `${c.position}${c.mark}`).join(" ");
}

/** "Problem 1 solved, Problem 2 tried, not solved, …" for screen readers. */
export function chipsSrText(list: readonly Chip[]): string {
  return list.map((c) => `${problemLabel(c.position)} ${CHIP_WORD[c.state]}`).join(", ");
}

/** The viewer's chips in a snapshot, or null when they are not a participant. */
export function viewerChips(
  snapshot: SessionSnapshot,
  viewerId: string | null,
  pending: readonly PendingCell[] = [],
): Chip[] | null {
  const row = scoreboardRows(snapshot, viewerId, pending).find((r) => r.isViewer);
  return row ? chips(row.cells) : null;
}

// --- The viewer's own status (problem legend) -----------------------------------

export type MyProblemStatus = { state: CellState; text: string };

/** "Solved 23:41" / "Judging…" / "Attempted" / "Not started". */
export function myProblemStatus(
  snapshot: SessionSnapshot,
  viewerId: string | null,
  position: number,
  pending: readonly PendingCell[] = [],
): MyProblemStatus {
  const me = snapshot.participants.find((p) => p.userId === viewerId);
  const count = pendingIndex(pending).get(`${viewerId}:${position}`) ?? 0;
  const view = cellView(me?.cells.find((c) => c.position === position), position, { pending: count });
  const external = snapshot.problems.some((p) => p.position === position && p.external);
  if (external) {
    // LeetCode slot: honor system, no judging or attempts (rooms-external-problems §5).
    return view.state === "solved"
      ? { state: "solved", text: `Marked solved ${view.time} (self-reported)` }
      : { state: "untouched", text: "Not marked solved" };
  }
  if (view.state === "solved") return { state: "solved", text: `Solved ${view.time}` };
  if (view.state === "judging") return { state: "judging", text: "Judging…" };
  if (view.state === "attempted") return { state: "attempted", text: "Attempted" };
  return { state: "untouched", text: "Not started" };
}

/** "Judging 1 submission… results may still change" (§4.1), or null. */
export function pendingJudgingText(pending: number): string | null {
  if (pending <= 0) return null;
  return `Judging ${pending} submission${pending === 1 ? "" : "s"}… results may still change`;
}

/** Position of a slug in the session, for links and the banner. */
export function positionOfSlug(snapshot: SessionSnapshot, slug: string): number | null {
  return snapshot.problems.find((p) => p.slug === slug)?.position ?? null;
}

/** Problem page link that carries the session context (§1.2 step 8). */
export function sessionProblemHref(slug: string, sessionId: string): string {
  return `/problems/${encodeURIComponent(slug)}?session=${encodeURIComponent(sessionId)}`;
}

export function sessionHref(roomId: string, sessionId: string): string {
  return `/rooms/${roomId}/sessions/${sessionId}`;
}

export function resultsHref(roomId: string, sessionId: string): string {
  return `${sessionHref(roomId, sessionId)}/results`;
}
