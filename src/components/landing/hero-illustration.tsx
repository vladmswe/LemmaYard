import { CodeIcon } from "lucide-react";

import { VerdictBadge } from "@/components/judge/verdict-badge";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";

/**
 * Hero "paper sheets": a problem card, a code card and a verdict card built
 * from real components (DESIGN.md §7). Illustrative, so it is labeled
 * "Example" and hidden from assistive tech. Sheets enter one after another.
 */
export function HeroIllustration() {
  return (
    <figure className="relative m-0" aria-label="Example of a solved problem">
      <figcaption className="eyebrow mb-3 flex items-center gap-2 lg:absolute lg:-top-8 lg:right-0 lg:mb-0">
        <span className="rounded-sm border border-border-strong bg-card px-1.5 py-0.5 text-[0.6875rem] tracking-[0.06em] text-muted-foreground">
          Example
        </span>
      </figcaption>
      <div aria-hidden className="grid gap-3 lg:relative lg:block lg:h-[430px]">
        <div
          className="reveal rounded-lg border bg-card px-5.5 py-5 shadow-md lg:absolute lg:top-6 lg:left-0 lg:w-[78%] lg:shadow-lg"
          style={{ "--reveal-delay": "120ms" } as React.CSSProperties}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="eyebrow">Problem 1</span>
            <DifficultyBadge difficulty="easy" />
          </div>
          <p className="mb-1.5 font-heading text-[1.375rem]/7 font-semibold">Two Sum</p>
          <p className="text-sm text-foreground-secondary">
            Given an array of integers{" "}
            <code className="rounded-sm bg-muted px-1.5 py-px font-mono text-[0.78rem]">nums</code>{" "}
            and a target, return the indices of the two numbers that add up to the target.
          </p>
        </div>
        <div
          className="reveal overflow-hidden rounded-lg border bg-card shadow-md lg:absolute lg:top-[150px] lg:right-0 lg:w-[66%] lg:shadow-lg"
          style={{ "--reveal-delay": "220ms" } as React.CSSProperties}
        >
          <div className="flex items-center gap-1.5 border-b bg-surface-sunken px-3.5 py-2.5 text-xs text-muted-foreground">
            <CodeIcon className="size-3.5" />
            solution.py
          </div>
          <pre className="overflow-hidden bg-editor px-3.5 py-3 font-mono text-xs/[19px] text-foreground sm:text-[13px]/[21px]">
            <span className="code-keyword">class</span> Solution:{"\n"}
            {"    "}
            <span className="code-keyword">def</span> <span className="code-function">twoSum</span>
            (self, nums, target):{"\n"}
            {"        "}seen = {"{}"}
            {"\n"}
            {"        "}
            <span className="code-keyword">for</span> i, x <span className="code-keyword">in</span>{" "}
            enumerate(nums):{"\n"}
            {"            "}
            <span className="code-keyword">if</span> target - x <span className="code-keyword">in</span>{" "}
            seen:{"\n"}
            {"                "}
            <span className="code-keyword">return</span> [seen[target - x], i]{"\n"}
            {"            "}seen[x] = i
          </pre>
        </div>
        <div
          className="reveal justify-self-start rounded-lg border bg-card px-4 py-3.5 shadow-md lg:absolute lg:bottom-0 lg:left-[4%] lg:w-[46%] lg:shadow-lg"
          style={{ "--reveal-delay": "320ms" } as React.CSSProperties}
        >
          <VerdictBadge status="accepted" />
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            12 / 12 tests passed · 41 ms · 16.2 MB
          </p>
        </div>
      </div>
    </figure>
  );
}
