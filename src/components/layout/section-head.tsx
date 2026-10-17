import type { ReactNode } from "react";
import { cn } from "cn";

/** `§ 02`: the section number of the proof gutter (mono, gutter ink). */
export function SectionNumber({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-hidden className={cn("sec-no", className)}>
      § {String(n).padStart(2, "0")}
    </span>
  );
}

/**
 * Proof gutter (DESIGN.md §5): a hairline column of mono line numbers
 * (01 02 03 …) beside hero areas; `current` is drawn in primary. Hidden
 * below 961px. Decorative (aria-hidden).
 */
export function ProofGutter({
  lines = 10,
  current,
  className,
}: {
  lines?: number;
  current?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("proof-gutter max-[960px]:hidden", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} data-current={i + 1 === current || undefined}>
          {String(i + 1).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

type SectionHeadProps = {
  /** Section number shown as `§ NN` in the 72px gutter column. */
  n: number;
  /** The heading (usually an h2 with `display-1` / `display-2`). */
  title: ReactNode;
  /** Optional line under the title. */
  description?: ReactNode;
  /** Optional action on the right (e.g. "See all problems →"). */
  action?: ReactNode;
  className?: string;
};

/**
 * Section head of the proof grid (DESIGN.md §8): `§ NN` in a 72px gutter,
 * then the title, then an optional action aligned to the bottom. Below
 * 961px the number sits above the heading.
 */
export function SectionHead({ n, title, description, action, className }: SectionHeadProps) {
  return (
    <div
      className={cn(
        "grid items-end gap-x-6 gap-y-4 min-[961px]:grid-cols-[var(--gutter-w)_minmax(0,1fr)_auto]",
        className,
      )}
    >
      <SectionNumber n={n} className="self-start min-[961px]:pt-[1.2em]" />
      <div className="min-w-0">
        {title}
        {description && <div className="mt-3 text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="max-[960px]:hidden">{action}</div>}
    </div>
  );
}
