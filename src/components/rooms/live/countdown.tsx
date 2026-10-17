"use client";

// Session countdown (docs/specs/rooms.md §7.4): computed from the server's
// `endsAt` and the clock offset, re-evaluated every second and whenever the
// tab becomes visible again (background tabs throttle timers, so the value is
// always recomputed from the clock, never decremented). `role="timer"` with a
// spoken label; milestones (10 min, 1 min) are announced once in a separate
// polite live region, not every second.
import { TimerIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

import {
  countdownLabel,
  crossedMilestones,
  formatCountdown,
  isFinalMinutes,
  milestoneMessage,
  remainingMs,
} from "@/lib/rooms/live-clock";

/** Remaining ms on the server clock, ticking on second boundaries; null without an end. */
export function useRemaining(endsAt: string | null, offsetMs: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      // Align to the next whole second of the server clock.
      const left = remainingMs(endsAt, offsetMs, t) ?? 0;
      timer = setTimeout(tick, Math.max(50, (left % 1000) + 5));
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endsAt, offsetMs]);
  return remainingMs(endsAt, offsetMs, now);
}

/** Calls `onMilestone` once per crossed milestone and `onExpire` once at zero. */
export function useCountdownEffects(
  remaining: number | null,
  { onMilestone, onExpire }: { onMilestone?: (ms: number) => void; onExpire?: () => void },
) {
  const prev = useRef<number | null>(null);
  const expired = useRef(false);
  useEffect(() => {
    if (remaining === null) return;
    for (const m of crossedMilestones(prev.current, remaining)) onMilestone?.(m);
    if (remaining === 0 && !expired.current) {
      expired.current = true;
      onExpire?.();
    }
    if (remaining > 0) expired.current = false;
    prev.current = remaining;
  }, [remaining, onMilestone, onExpire]);
}

export type CountdownProps = {
  endsAt: string | null;
  offsetMs: number;
  size?: "display" | "inline";
  className?: string;
  onMilestone?: (ms: number) => void;
  onExpire?: () => void;
  /** Announce milestones in an own live region (off where another region already does). */
  announce?: boolean;
};

export function Countdown({
  endsAt,
  offsetMs,
  size = "display",
  className,
  onMilestone,
  onExpire,
  announce = true,
}: CountdownProps) {
  const remaining = useRemaining(endsAt, offsetMs);
  const [message, setMessage] = useState("");
  useCountdownEffects(remaining, {
    onMilestone: (ms) => {
      setMessage(milestoneMessage(ms));
      onMilestone?.(ms);
    },
    onExpire,
  });
  if (remaining === null) return null;
  const warning = isFinalMinutes(remaining);
  const text = formatCountdown(remaining);

  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span
        role="timer"
        // The server render and the first client render differ by the elapsed second.
        suppressHydrationWarning
        aria-label={countdownLabel(remaining)}
        data-testid="countdown"
        data-warning={warning || undefined}
        className={cn(
          "tabular-nums",
          size === "display"
            ? "font-heading text-[1.875rem]/9 font-semibold tracking-[-0.01em]"
            : "font-semibold",
          warning ? "text-warning" : "text-foreground",
        )}
      >
        {size === "display" && (
          <TimerIcon aria-hidden className={cn("mr-2 inline size-6 align-[-3px]", warning ? "text-warning" : "text-muted-foreground")} />
        )}
        {text}
      </span>
      <span aria-hidden className={cn("text-sm", warning ? "font-semibold text-warning" : "text-muted-foreground")}>
        left
      </span>
      {announce && (
        <span className="sr-only" aria-live="polite" data-testid="countdown-announcer">
          {message}
        </span>
      )}
    </span>
  );
}
