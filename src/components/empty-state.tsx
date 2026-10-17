import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Empty state (DESIGN.md §8.13): icon in a muted circle (the only allowed
 * icon-in-circle), title, body, optional action. Replaces a table body or a
 * page body while a feature has no data.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  headingLevel = 2,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("reveal flex flex-col items-center px-4 py-16 text-center", className)}>
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-muted">
        <Icon aria-hidden className="size-8 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <Heading className="text-lg font-semibold text-foreground">{title}</Heading>
      {children && <div className="mt-1.5 max-w-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
