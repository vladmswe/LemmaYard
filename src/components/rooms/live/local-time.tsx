"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration (the server and the first client render print UTC). */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function formatLocal(iso: string, options: Intl.DateTimeFormatOptions, client: boolean): string {
  return new Date(iso).toLocaleString("en-US", client ? options : { ...options, timeZone: "UTC" });
}

/** A time in the viewer's zone (UTC until hydrated, like R2's LocalDate). */
export function LocalTime({ iso, options, className }: { iso: string; options: Intl.DateTimeFormatOptions; className?: string }) {
  const client = useIsClient();
  return (
    <time dateTime={iso} className={className}>
      {formatLocal(iso, options, client)}
    </time>
  );
}

export const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
export const CLOCK: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
export const DAY_CLOCK: Intl.DateTimeFormatOptions = { ...DAY, ...CLOCK };
