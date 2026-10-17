"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * A time ("18:00") or date + time in the viewer's time zone. Like LocalDate:
 * the server and the first client render print UTC (with "UTC" appended), the
 * browser then switches to local time.
 */
export function LocalTime({
  iso,
  withDate = false,
  className,
}: {
  iso: string;
  withDate?: boolean;
  className?: string;
}) {
  const local = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const date = new Date(iso);
  const zone = local ? {} : { timeZone: "UTC" };
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...zone });
  const day = withDate ? `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...zone })}, ` : "";
  return (
    <time dateTime={iso} className={className}>
      {day}
      {time}
      {local ? "" : " UTC"}
    </time>
  );
}
