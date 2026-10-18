// Judged specs (tag @judge) run in the "judge" project against the real
// worker the harness starts. They are skipped only on an explicit
// E2E_JUDGE=0 (e.g. `pnpm test:e2e:guide`); a missing Docker or sandbox image
// fails the run in global setup instead.
import { test } from "@playwright/test";

export const JUDGE_TAG = "@judge";

/** Call at the top of a judged describe block. */
export function requireJudge(): void {
  test.skip(process.env.E2E_JUDGE === "0", "E2E_JUDGE=0: the harness started no judge worker");
}
