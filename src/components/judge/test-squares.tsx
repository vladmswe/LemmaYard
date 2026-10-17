import type { CSSProperties } from "react";
import { cn } from "cn";

export type TestSquareState = "pass" | "fail" | "pending";

/**
 * Per-case states for `TestSquares` from passed/total counts: `passed`
 * passes, then (when the run failed) one failure, then pending.
 */
export function squaresFromCounts(passed: number, total: number, failed = passed < total): TestSquareState[] {
  const n = Math.max(0, Math.trunc(total));
  const p = Math.min(Math.max(0, Math.trunc(passed)), n);
  return Array.from({ length: n }, (_, i): TestSquareState =>
    i < p ? "pass" : i === p && failed ? "fail" : "pending",
  );
}

type TestSquaresProps = {
  /** One entry per test case, in order. */
  results: readonly TestSquareState[];
  /** Pop the squares in one by one (70 ms apart, after `delayMs`). */
  animate?: boolean;
  delayMs?: number;
  className?: string;
};

/**
 * Test squares (DESIGN.md §5): one 9px square per test — filled green =
 * passed, rotated red diamond = failed, outline = not run. Always
 * aria-hidden: put the text summary ("7 / 15 passed") next to it.
 */
export function TestSquares({ results, animate = false, delayMs, className }: TestSquaresProps) {
  return (
    <span
      aria-hidden
      data-animate={animate || undefined}
      className={cn("test-squares", className)}
      style={delayMs ? ({ "--tick-delay": `${Math.round(delayMs)}ms` } as CSSProperties) : undefined}
    >
      {results.map((state, i) => (
        <i
          key={i}
          data-state={state}
          style={animate ? ({ "--i": String(Math.min(i, 24)) } as CSSProperties) : undefined}
        />
      ))}
    </span>
  );
}
