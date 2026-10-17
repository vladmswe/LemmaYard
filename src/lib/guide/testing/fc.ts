// Run count for guide property tests: FC_NUM_RUNS overrides the per-test default
// (the lead reruns the suites with FC_NUM_RUNS=2000).

export function numRuns(defaultRuns: number): number {
  const raw = process.env.FC_NUM_RUNS;
  if (raw === undefined || raw === "") return defaultRuns;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : defaultRuns;
}
