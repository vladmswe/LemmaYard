// Coverage checks for the edge-case arbitraries (S2a): "this arbitrary reaches
// every branch" must not depend on the run's random seed. With a fresh seed
// each run, 200 draws missed a branch about 1 run in 25 (measured over 300
// seeds), so the check samples with a fixed seed; the agreement properties stay
// random and also replay fixed examples that hit every branch.
import fc from "fast-check";

export const COVERAGE_SEED = 20_261_018;

/** The first `runs` values of `arb` for COVERAGE_SEED: the same on every run. */
export function coverageSample<T>(arb: fc.Arbitrary<T>, runs = 200): T[] {
  return fc.sample(arb, { seed: COVERAGE_SEED, numRuns: runs });
}
