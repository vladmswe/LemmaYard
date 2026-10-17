import {
  BracesIcon,
  BugIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  CircleXIcon,
  ClockIcon,
  LoaderCircleIcon,
  MemoryStickIcon,
  ServerCrashIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";

import type { CaseResultStatus, submissionStatusEnum } from "@/server/db/schema";

/** `submissions.status` values (type-only import: no DB code in the bundle). */
export type SubmissionStatus = (typeof submissionStatusEnum.enumValues)[number];

export type VerdictMeta = {
  /** Canonical label, Title Case ("Time Limit Exceeded"). */
  label: string;
  /** Narrow table cells below 640px; full label goes to title/aria-label. */
  shortLabel: string;
  icon: LucideIcon;
  /** Static stand-in for an animated icon under prefers-reduced-motion. */
  reducedMotionIcon?: LucideIcon;
  /** Text / icon color. */
  text: string;
  /** Tinted background. */
  bg: string;
  /** Badge colors (text + background). */
  badge: string;
  /** 4px left edge of the submission verdict card (DESIGN.md §9.6). */
  edge: string;
  /** Still waiting for the judge. */
  pending: boolean;
};

// Single source for verdict presentation (DESIGN.md §4.4). Class names are
// literal strings so Tailwind can see them: never build them by interpolation.
export const VERDICTS: Record<SubmissionStatus, VerdictMeta> = {
  accepted: {
    label: "Accepted",
    shortLabel: "Accepted",
    icon: CircleCheckIcon,
    text: "text-verdict-accepted",
    bg: "bg-verdict-accepted-bg",
    badge: "bg-verdict-accepted-bg text-verdict-accepted",
    edge: "border-l-verdict-accepted",
    pending: false,
  },
  wrong_answer: {
    label: "Wrong Answer",
    shortLabel: "Wrong Answer",
    icon: CircleXIcon,
    text: "text-verdict-wrong",
    bg: "bg-verdict-wrong-bg",
    badge: "bg-verdict-wrong-bg text-verdict-wrong",
    edge: "border-l-verdict-wrong",
    pending: false,
  },
  time_limit: {
    label: "Time Limit Exceeded",
    shortLabel: "TLE",
    icon: TimerIcon,
    text: "text-verdict-tle",
    bg: "bg-verdict-tle-bg",
    badge: "bg-verdict-tle-bg text-verdict-tle",
    edge: "border-l-verdict-tle",
    pending: false,
  },
  memory_limit: {
    label: "Memory Limit Exceeded",
    shortLabel: "MLE",
    icon: MemoryStickIcon,
    text: "text-verdict-mle",
    bg: "bg-verdict-mle-bg",
    badge: "bg-verdict-mle-bg text-verdict-mle",
    edge: "border-l-verdict-mle",
    pending: false,
  },
  runtime_error: {
    label: "Runtime Error",
    shortLabel: "Runtime Error",
    icon: BugIcon,
    text: "text-verdict-runtime",
    bg: "bg-verdict-runtime-bg",
    badge: "bg-verdict-runtime-bg text-verdict-runtime",
    edge: "border-l-verdict-runtime",
    pending: false,
  },
  compile_error: {
    label: "Compile Error",
    shortLabel: "Compile Error",
    icon: BracesIcon,
    text: "text-verdict-compile",
    bg: "bg-verdict-compile-bg",
    badge: "bg-verdict-compile-bg text-verdict-compile",
    edge: "border-l-verdict-compile",
    pending: false,
  },
  internal_error: {
    label: "Internal Error",
    shortLabel: "Internal Error",
    icon: ServerCrashIcon,
    text: "text-verdict-internal",
    bg: "bg-verdict-internal-bg",
    badge: "bg-verdict-internal-bg text-verdict-internal",
    edge: "border-l-verdict-internal",
    pending: false,
  },
  queued: {
    label: "Queued",
    shortLabel: "Queued",
    icon: ClockIcon,
    text: "text-verdict-queued",
    bg: "bg-verdict-queued-bg",
    badge: "bg-verdict-queued-bg text-verdict-queued",
    edge: "border-l-verdict-queued",
    pending: true,
  },
  running: {
    label: "Running",
    shortLabel: "Running",
    icon: LoaderCircleIcon,
    reducedMotionIcon: ClockIcon,
    text: "text-verdict-running",
    bg: "bg-verdict-running-bg",
    badge: "bg-verdict-running-bg text-verdict-running",
    edge: "border-l-verdict-running",
    pending: true,
  },
};

export type CaseStatusMeta = Pick<VerdictMeta, "label" | "icon" | "text">;

/** Per-case result of a Run (`CaseResult.status`), e.g. the case pills. */
export const CASE_STATUSES: Record<CaseResultStatus, CaseStatusMeta> = {
  passed: { label: "Passed", icon: CircleCheckIcon, text: "text-verdict-accepted" },
  failed: { label: "Failed", icon: CircleXIcon, text: "text-verdict-wrong" },
  runtime_error: { label: "Runtime Error", icon: BugIcon, text: "text-verdict-runtime" },
  time_limit: { label: "Time Limit Exceeded", icon: TimerIcon, text: "text-verdict-tle" },
  memory_limit: { label: "Memory Limit Exceeded", icon: MemoryStickIcon, text: "text-verdict-mle" },
  not_run: { label: "Not run", icon: CircleMinusIcon, text: "text-muted-foreground" },
};

export function verdictMeta(status: SubmissionStatus): VerdictMeta {
  return VERDICTS[status];
}
