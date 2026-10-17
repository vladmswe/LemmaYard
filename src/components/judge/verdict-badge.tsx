import { cn } from "cn";

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

/** Verdict name as a heading-style label (serif), e.g. the console result. */
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
        "inline-flex items-center gap-2 font-heading text-[1.375rem]/7 font-semibold",
        v.text,
        className,
      )}
    >
      <VerdictIcon status={status} className="size-5.5" />
      {v.label}
    </span>
  );
}

/** The verdict's icon; a spinning one turns static under reduced motion. */
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
      <Icon aria-hidden className={cn("animate-spin-slow motion-reduce:hidden", className)} />
      <Static aria-hidden className={cn("hidden motion-reduce:block", className)} />
    </>
  );
}
