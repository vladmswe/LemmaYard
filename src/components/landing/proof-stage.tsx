import { CircleCheckIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { TestSquares } from "@/components/judge/test-squares";

// One line of the example solution: tokens as [class, text] pairs.
type Tok = [cls: string, text: string];
const CODE: Tok[][] = [
  [["tok-k", "def"], ["", " "], ["tok-f", "two_sum"], ["", "(nums, target):"]],
  [["", "    seen = {}"]],
  [["", "    "], ["tok-k", "for"], ["", " i, x "], ["tok-k", "in"], ["", " "], ["tok-f", "enumerate"], ["", "(nums):"]],
  [["", "        "], ["tok-k", "if"], ["", " target - x "], ["tok-k", "in"], ["", " seen:"]],
  [["", "            "], ["tok-k", "return"], ["", " [seen[target - x], i]"]],
  [["", "        seen[x] = i"]],
  [["tok-c", "# one pass, O(n) time"]],
];

// The real Two Sum test count (problems/two-sum/tests.json), so the example
// verdict matches what a submit shows.
const TESTS = 13;

/**
 * Hero "proof sheet" of the landing page (DESIGN.md §11.2, §13.1): problem
 * card → code sheet that types itself line by line → Accepted bar whose 12
 * test squares pop in one by one, then a margin note. CSS only, runs once,
 * no hover tracking; under reduced motion everything is in its final state.
 * Illustrative content, labelled "Example" and described by one aria-label.
 */
export function ProofStage() {
  return (
    <div
      className="ly-stage"
      role="img"
      aria-label={`Example: the Two Sum problem, a Python solution, and the verdict Accepted with ${TESTS} of ${TESTS} tests passed`}
    >
      <div className="ly-prob">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="label-mono text-muted-foreground">Problem 1</span>
          <DifficultyBadge difficulty="easy" />
          <span className="example-tag ml-auto">Example</span>
        </div>
        <p className="font-display text-[1.875rem] leading-[1.05]">Two Sum</p>
        <p className="mt-2 text-[0.90625rem] text-foreground-secondary">
          Given an array of integers{" "}
          <code className="rounded-sm border bg-surface-sunken px-1.5 py-px font-mono text-[0.85em]">nums</code>{" "}
          and a target, return the indices of the two numbers that add up to the target.
        </p>
      </div>
      <div className="ly-sheet">
        <div className="flex h-11 items-center gap-2.5 border-b px-4 text-[0.8125rem] text-muted-foreground">
          <span className="flex gap-1.5">
            <i className="size-[9px] rounded-full bg-border-strong" />
            <i className="size-[9px] rounded-full bg-border-strong" />
            <i className="size-[9px] rounded-full bg-border-strong" />
          </span>
          <span className="font-mono">solution.py</span>
          <span className="ml-auto font-mono">Python 3</span>
        </div>
        <div className="ly-code font-mono">
          <div className="ly-ln">
            {CODE.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <div className="min-w-0">
            {CODE.map((line, i) => (
              <div
                key={i}
                className="ly-line"
                data-current={i === 1 || undefined}
                style={{ "--l": i } as CSSProperties}
              >
                {line.map(([cls, text], j) =>
                  cls ? (
                    <span key={j} className={cls}>
                      {text}
                    </span>
                  ) : (
                    text
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="ly-verdict">
          <CircleCheckIcon aria-hidden className="size-[22px] shrink-0" />
          <span className="font-display text-2xl leading-none">Accepted</span>
          <span className="ly-verdict-meta font-mono text-[0.78125rem]">
            {TESTS} / {TESTS} passed
          </span>
          <TestSquares
            className="ml-auto flex-nowrap"
            results={Array.from({ length: TESTS }, () => "pass" as const)}
            animate
            delayMs={1800}
          />
        </div>
      </div>
      <div aria-hidden className="ly-note">
        <b>hash map: O(1) lookups</b>
      </div>
    </div>
  );
}
