import { cn } from "cn";

import { PROBLEM_STATUSES, type ProblemStatus } from "./problem-status";

/** Status icon for the catalog with sr-only text ("Solved", …). */
export function ProblemStatusIcon({
  status,
  className,
}: {
  status: ProblemStatus;
  className?: string;
}) {
  const s = PROBLEM_STATUSES[status];
  const Icon = s.icon;
  return (
    <span
      data-status={status}
      title={s.label}
      className={cn("inline-flex size-5 items-center", s.text, className)}
    >
      <Icon aria-hidden className="size-5" strokeWidth={1.75} />
      <span className="sr-only">{s.label}</span>
    </span>
  );
}
