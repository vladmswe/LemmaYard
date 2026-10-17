import { cn } from "cn";

import { QedLoader } from "@/components/brand/qed-loader";
import { Badge } from "@/components/ui/badge";

import { VERDICTS, type SubmissionStatus } from "./verdict";

/**
 * Verdict pill: color + icon + word, always (DESIGN.md §3.3, §4.4).
 * `compact` uses TLE / MLE below 640px with the full label as aria-label.
 */
export function VerdictBadge({
  status,
  compact = false,
  className,
}: {
  status: SubmissionStatus;
  compact?: boolean;
  className?: string;
}) {
  const v = VERDICTS[status];
  const short = compact && v.shortLabel !== v.label;
  return (
    <Badge
      variant="status"
      className={cn(v.badge, className)}
      title={short ? v.label : undefined}
      data-status={status}
    >
      <VerdictIcon status={status} />
      {short ? (
        <>
          <span aria-hidden className="sm:hidden">
            {v.shortLabel}
          </span>
          <span className="sr-only sm:not-sr-only">{v.label}</span>
        </>
      ) : (
        v.label
      )}
    </Badge>
  );
}

/**
 * Verdict name as a display word (Instrument Serif, 28px by default: the
 * serif is never smaller), e.g. the console result or the submission head.
 */
export function VerdictLabel({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  const v = VERDICTS[status];
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-2.5 font-display text-[1.75rem]/[1.1] font-normal tracking-[-0.005em]",
        v.text,
        className,
      )}
    >
      <VerdictIcon status={status} className="size-5.5" />
      {v.label}
    </span>
  );
}

/**
 * The verdict's icon. "Running" shows the ∎ loader (DESIGN.md §6.2), which
 * turns into a static clock under reduced motion.
 */
export function VerdictIcon({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  const v = VERDICTS[status];
  const Icon = v.icon;
  const Static = v.reducedMotionIcon;
  if (!Static) return <Icon aria-hidden className={className} />;
  return (
    <>
      <span
        aria-hidden
        className={cn("inline-grid size-4 shrink-0 place-items-center motion-reduce:hidden", className)}
      >
        <QedLoader className="size-[70%]" />
      </span>
      <Static aria-hidden className={cn("hidden motion-reduce:block", className)} />
    </>
  );
}
