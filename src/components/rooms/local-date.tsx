"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * A date in the viewer's time zone. The server (and the first client render)
 * prints UTC so hydration matches; the browser then switches to local time.
 */
export function LocalDate({
  iso,
  options = { month: "short", day: "numeric" },
  className,
}: {
  iso: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const local = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const date = new Date(iso);
  const text = date.toLocaleDateString("en-US", local ? options : { ...options, timeZone: "UTC" });
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
