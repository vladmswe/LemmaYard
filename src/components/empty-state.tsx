import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Empty state as an "unfinished proof" (DESIGN.md §12, §13.11): a dashed
 * card with a dashed ∎ box, a serif title, the body and one action. With
 * `given` / `want` it also shows the mono "Given / Want / Proof ▍" lines
 * (e.g. Given: your filters, Want: a problem). Replaces a table body or a
 * page body while a feature has no data.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  given,
  want,
  headingLevel = 2,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** "Given" line of the unfinished proof (what the user has). */
  given?: ReactNode;
  /** "Want" line (what they are looking for). */
  want?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const proof = given !== undefined || want !== undefined;
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "reveal relative mx-auto my-6 flex w-full max-w-xl flex-col items-start rounded-xl border-[1.5px] border-dashed border-border-strong bg-card px-6 py-7 text-left sm:px-8 sm:py-8",
        className,
      )}
    >
      <span aria-hidden className="qed-open absolute -right-2.5 -bottom-2.5 size-10! bg-background" />
      {proof ? (
        <div aria-hidden className="mb-5 font-mono text-[0.875rem]/[1.9] text-foreground-secondary">
          {given !== undefined && (
            <div>
              <span className="text-primary">Given</span> {given}
            </div>
          )}
          {want !== undefined && (
            <div>
              <span className="text-primary">Want</span>&nbsp; {want}
            </div>
          )}
          <div>
            <span className="text-primary">Proof</span>{" "}
            <span className="inline-block h-[1.1em] w-2 bg-primary align-[-0.2em] motion-safe:animate-[caret-blink_1.1s_steps(1)_infinite]" />
          </div>
        </div>
      ) : (
        Icon && (
          <div className="mb-5 grid size-11 place-items-center rounded-md border-[1.5px] border-dashed border-border-strong">
            <Icon aria-hidden className="size-5 text-muted-foreground" strokeWidth={1.75} />
          </div>
        )
      )}
      <Heading className="font-display text-[1.75rem]/[1.1] text-balance text-foreground">{title}</Heading>
      {children && <div className="mt-2.5 max-w-prose text-pretty text-foreground-secondary">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}
