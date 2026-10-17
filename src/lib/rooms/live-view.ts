// View model of the live and finished session screens (docs/specs/rooms.md
// §4.1–§4.3, §7.4): scoreboard rows and cells, the viewer's own problem
// status, banner progress. Pure: built only from the state snapshot, which by
// construction carries no code, verdict types or test data (spoiler policy).
import { durationWords } from "./live-clock";
import { formatScoreTime } from "./scoring";
import type { SessionSnapshot, SnapshotCell } from "./events";

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

export type CellState = "solved" | "attempted" | "untouched";

export type CellView = {
  position: number;
  state: CellState;
  /** Solve time from the start ("23:41"), solved cells only. */
  time: string | null;
  /** Counted wrong attempts as "−2" (solved: before the accept; attempted: all). */
  wrong: string | null;
  firstSolver: boolean;
  solvedBefore: boolean;
  /** Screen-reader sentence, e.g. "Problem 2: solved at 23 minutes 41 seconds after 1 wrong attempt, first to solve". */
  srText: string;
};

function attemptsWord(n: number, adjective = ""): string {
  const a = adjective ? `${adjective} ` : "";
  return `${n} ${a}attempt${n === 1 ? "" : "s"}`;
}

export function cellView(cell: SnapshotCell | undefined, position: number): CellView {
  const label = problemLabel(position);
  if (cell && cell.solveSeconds !== null) {
    const parts = [`${label}: solved at ${durationWords(cell.solveSeconds)}`];
    if (cell.wrongBefore > 0) parts.push(`after ${attemptsWord(cell.wrongBefore, "wrong")}`);
    let text = parts.join(" ");
    if (cell.firstSolver) text += ", first to solve";
    if (cell.solvedBefore) text += ", solved before the session";
    return {
      position,
      state: "solved",
      time: formatScoreTime(cell.solveSeconds),
      wrong: cell.wrongBefore > 0 ? `−${cell.wrongBefore}` : null,
      firstSolver: cell.firstSolver,
      solvedBefore: cell.solvedBefore,
      srText: text,
    };
  }
  if (cell && cell.attempts > 0) {
    return {
      position,
      state: "attempted",
      time: null,
      wrong: `−${cell.attempts}`,
      firstSolver: false,
      solvedBefore: cell.solvedBefore,
      srText: `${label}: not solved yet, ${attemptsWord(cell.attempts)}`,
    };
  }
  return {
    position,
    state: "untouched",
    time: null,
    wrong: null,
    firstSolver: false,
    solvedBefore: cell?.solvedBefore ?? false,
    srText: `${label}: no attempts`,
  };
}

export type ScoreRow = {
  userId: string;
  username: string;
  isHost: boolean;
  isViewer: boolean;
  /** Competition rank (1, 1, 3); null before the first scoring pass. */
  rank: number | null;
  solved: number;
  /** Penalty-inclusive total ("1:26:40"); "—" with nothing solved. */
  time: string;
  cells: CellView[];
};

/** Rows in the snapshot's order (rank, then username), one cell per problem. */
export function scoreboardRows(snapshot: SessionSnapshot, viewerId: string | null): ScoreRow[] {
  const positions = snapshot.problems.map((p) => p.position);
  return snapshot.participants.map((p) => {
    const byPos = new Map(p.cells.map((c) => [c.position, c]));
    return {
      userId: p.userId,
      username: p.username,
      isHost: p.isHost,
      isViewer: p.userId === viewerId,
      rank: p.rank,
      solved: p.solvedCount,
      time: p.solvedCount > 0 ? formatScoreTime(p.penaltySec) : "—",
      cells: positions.map((pos) => cellView(byPos.get(pos), pos)),
    };
  });
}

export type MyProblemStatus = { state: CellState; text: string };

/** The viewer's own status on one problem: "Solved 23:41" / "Attempted" / "Not started". */
export function myProblemStatus(
  snapshot: SessionSnapshot,
  viewerId: string | null,
  position: number,
): MyProblemStatus {
  const me = snapshot.participants.find((p) => p.userId === viewerId);
  const view = cellView(me?.cells.find((c) => c.position === position), position);
  if (view.state === "solved") return { state: "solved", text: `Solved ${view.time}` };
  if (view.state === "attempted") return { state: "attempted", text: "Attempted" };
  return { state: "untouched", text: "Not started" };
}

/** Banner mini progress: "You 1/4 · Leader 2/4". `mine` is null for non-participants. */
export function progressSummary(snapshot: SessionSnapshot, viewerId: string | null) {
  const total = snapshot.problems.length || snapshot.session.problemCount;
  const me = snapshot.participants.find((p) => p.userId === viewerId);
  const leader = snapshot.participants.reduce((max, p) => Math.max(max, p.solvedCount), 0);
  return { mine: me ? me.solvedCount : null, leader, total };
}

export function progressText(summary: ReturnType<typeof progressSummary>): string {
  const parts: string[] = [];
  if (summary.mine !== null) parts.push(`You ${summary.mine}/${summary.total}`);
  parts.push(`Leader ${summary.leader}/${summary.total}`);
  return parts.join(" · ");
}

/** Finished screen, per problem: "solved by 2 of 3 · first: alice 24:30". */
export function problemSummary(snapshot: SessionSnapshot, position: number): string {
  let solved = 0;
  const first: { username: string; time: number }[] = [];
  for (const p of snapshot.participants) {
    const c = p.cells.find((x) => x.position === position);
    if (c?.solveSeconds != null) {
      solved += 1;
      if (c.firstSolver) first.push({ username: p.username, time: c.solveSeconds });
    }
  }
  const base = `solved by ${solved} of ${snapshot.participants.length}`;
  if (first.length === 0) return base;
  return `${base} · first: ${first.map((f) => `${f.username} ${formatScoreTime(f.time)}`).join(", ")}`;
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

/** R5's results page (placeholder link until it ships). */
export function resultsHref(roomId: string, sessionId: string): string {
  return `${sessionHref(roomId, sessionId)}/results`;
}
