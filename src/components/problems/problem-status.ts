import { CircleCheckIcon, CircleDashedIcon, CircleIcon, type LucideIcon } from "lucide-react";

/** Per-user problem status in the catalog (AC-M3-3). */
export type ProblemStatus = "solved" | "attempted" | "todo";

export type ProblemStatusMeta = { label: string; icon: LucideIcon; text: string };

// DESIGN.md §4.4 (bottom). Literal class strings only.
export const PROBLEM_STATUSES: Record<ProblemStatus, ProblemStatusMeta> = {
  solved: { label: "Solved", icon: CircleCheckIcon, text: "text-success" },
  attempted: { label: "Attempted", icon: CircleDashedIcon, text: "text-warning" },
  todo: { label: "Not started", icon: CircleIcon, text: "text-input" },
};
