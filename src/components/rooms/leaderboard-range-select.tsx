"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  leaderboardHref,
  LEADERBOARD_RANGE_LABELS,
  LEADERBOARD_RANGES,
  parseLeaderboardRange,
  type LeaderboardRange,
} from "@/lib/rooms/history";

/** Period of the Members tab (rooms-v2 §2.4); the value lives in `?range=`. */
export function LeaderboardRangeSelect({ roomId, range }: { roomId: string; range: LeaderboardRange }) {
  const router = useRouter();
  const labelId = useId();
  const valueId = useId();
  const [pending, startTransition] = useTransition();
  const items = LEADERBOARD_RANGES.map((value) => ({ value, label: LEADERBOARD_RANGE_LABELS[value] }));
  return (
    <div className="flex items-center gap-2" aria-busy={pending || undefined}>
      <span id={labelId} className="text-sm font-semibold">
        Period
      </span>
      <Select
        items={items}
        value={range}
        onValueChange={(v) => {
          const next = parseLeaderboardRange(v);
          startTransition(() => router.replace(leaderboardHref(roomId, next), { scroll: false }));
        }}
      >
        <SelectTrigger aria-labelledby={`${labelId} ${valueId}`} className="w-44" data-testid="leaderboard-range">
          <SelectValue id={valueId} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end">
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
