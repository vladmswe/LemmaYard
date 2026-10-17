import { cn } from "cn";

import { Badge } from "@/components/ui/badge";

import { PROBLEM_STATUSES, type ProblemStatus } from "./problem-status";

// Tinted pill next to the difficulty on the problem page. Literal classes only.
const BADGE_CLASSES: Record<ProblemStatus, string> = {
  solved: "bg-success-bg text-success",
  attempted: "bg-warning-bg text-warning",
  todo: "bg-muted text-muted-foreground",
};

/** Problem status as an icon + word pill ("Solved", "Attempted", "Not started"). */
export function ProblemStatusBadge({
  status,
  className,
}: {
  status: ProblemStatus;
  className?: string;
}) {
  const s = PROBLEM_STATUSES[status];
  const Icon = s.icon;
  return (
    <Badge variant="status" data-status={status} className={cn(BADGE_CLASSES[status], className)}>
      <Icon aria-hidden />
      {s.label}
    </Badge>
  );
}
