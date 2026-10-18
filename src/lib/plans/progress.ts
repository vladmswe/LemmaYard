// Per-viewer progress on a study plan (docs/specs/community.md §B.8,
// AC-C-SP-3). Our problems follow the viewer's submits with the catalog rule
// (solved = an accepted submit, attempted = a submit without one, otherwise
// not started); external items follow the viewer's own tick. Problems that are
// no longer published stay listed but count nowhere. Pure.

export type Difficulty = "easy" | "medium" | "hard";
export type ProblemStatus = "solved" | "attempted" | "todo";

/** The viewer's submit summary for one problem (absent = no submit). */
export type SubmitSummary = { solved: boolean; firstSolvedAt: Date | null; wrongCount: number };

export type ItemState =
  | { kind: "problem"; status: ProblemStatus; solvedAt: Date | null; wrongCount: number }
  | { kind: "external"; done: boolean }
  | { kind: "unavailable" };

export type ProgressItem = {
  id: string;
  /** null for external items. */
  difficulty: Difficulty | null;
  state: ItemState;
};

export type Tally = { done: number; total: number };

export type PlanProgress = {
  done: number;
  total: number;
  byDifficulty: Record<Difficulty, Tally>;
  external: Tally;
  /** First item in plan order that is not done yet, or null when everything is. */
  nextItemId: string | null;
};

/** State of one of our problems from the viewer's submits (`null` viewer → not started). */
export function problemState(summary: SubmitSummary | undefined, published: boolean): ItemState {
  if (!published) return { kind: "unavailable" };
  if (!summary) return { kind: "problem", status: "todo", solvedAt: null, wrongCount: 0 };
  return {
    kind: "problem",
    status: summary.solved ? "solved" : "attempted",
    solvedAt: summary.solved ? summary.firstSolvedAt : null,
    wrongCount: summary.wrongCount,
  };
}

export function isDone(state: ItemState): boolean {
  return (state.kind === "problem" && state.status === "solved") || (state.kind === "external" && state.done);
}

/** Totals over `items` in plan order. */
export function summarizeProgress(items: ProgressItem[]): PlanProgress {
  const tally = (): Tally => ({ done: 0, total: 0 });
  const byDifficulty: Record<Difficulty, Tally> = { easy: tally(), medium: tally(), hard: tally() };
  const external = tally();
  let nextItemId: string | null = null;
  for (const item of items) {
    if (item.state.kind === "unavailable") continue;
    const bucket = item.state.kind === "external" ? external : item.difficulty ? byDifficulty[item.difficulty] : null;
    if (!bucket) continue;
    bucket.total += 1;
    if (isDone(item.state)) bucket.done += 1;
    else nextItemId ??= item.id;
  }
  const all = [byDifficulty.easy, byDifficulty.medium, byDifficulty.hard, external];
  return {
    done: all.reduce((n, t) => n + t.done, 0),
    total: all.reduce((n, t) => n + t.total, 0),
    byDifficulty,
    external,
    nextItemId,
  };
}
