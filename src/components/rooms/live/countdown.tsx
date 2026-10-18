"use client";

// Session countdown (docs/specs/rooms.md §7.4): computed from the server's
// `endsAt` and the clock offset, re-evaluated every second and whenever the
// tab becomes visible again (background tabs throttle timers, so the value is
// always recomputed from the clock, never decremented). `role="timer"` with a
// spoken label; milestones (10 min, 1 min) are announced once in a separate
// polite live region, not every second.
import "../rooms.css";

import { TimerIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

import { formatScoreTime } from "@/lib/rooms/scoring";

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
  /** "hero": the giant mono timer of the live screen (DESIGN.md §13.10); "display": 30px; "inline": text. */
  size?: "hero" | "display" | "inline";
  /** Session length: draws the time-remaining track under the hero timer. */
  totalMs?: number;
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
  totalMs,
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

  if (size === "hero") {
    // The colon blinks only in the last 5 minutes (motion-safe; static under reduced motion).
    const blink = remaining > 0 && remaining <= 5 * 60_000;
    const parts = text.split(":");
    const left = totalMs && totalMs > 0 ? Math.min(1, Math.max(0, remaining / totalMs)) : null;
    return (
      <span className={cn("flex flex-col items-end gap-3", className)}>
        <span
          role="timer"
          suppressHydrationWarning
          aria-label={countdownLabel(remaining)}
          data-testid="countdown"
          data-warning={warning || undefined}
          data-blink={blink || undefined}
          className={cn(
            "room-timer font-mono text-[3.5rem]/none font-medium tracking-[-0.04em] tabular-nums min-[1100px]:text-[5rem]/none",
            warning ? "room-warn text-warning" : "text-on-night",
          )}
        >
          {parts.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="room-timer-colon">:</span>}
              {p}
            </span>
          ))}
        </span>
        <span aria-hidden className={cn("text-sm", warning ? "room-warn font-semibold text-warning" : "text-on-night-2")}>
          {totalMs && totalMs > 0 ? (
            <>
              left · {formatScoreTime(Math.max(0, Math.round((totalMs - remaining) / 1000)))} elapsed of{" "}
              {formatScoreTime(Math.round(totalMs / 1000))}
            </>
          ) : (
            "left in this session"
          )}
        </span>
        {left !== null && (
          <span aria-hidden className="room-timer-track">
            <i style={{ transform: `scaleX(${left})` }} data-warning={warning || undefined} />
          </span>
        )}
        {announce && (
          <span className="sr-only" aria-live="polite" data-testid="countdown-announcer">
            {message}
          </span>
        )}
      </span>
    );
  }

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
            ? "font-mono text-[1.75rem]/9 font-medium tracking-[-0.02em]"
            : "font-mono font-medium",
          warning ? "room-warn text-warning" : size === "display" && "text-foreground",
        )}
      >
        {size === "display" && (
          <TimerIcon aria-hidden className={cn("mr-2 inline size-6 align-[-3px]", warning ? "text-warning" : "text-muted-foreground")} />
        )}
        {text}
      </span>
      <span aria-hidden className={cn("text-sm", warning ? "room-warn font-semibold text-warning" : "opacity-75")}>
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
