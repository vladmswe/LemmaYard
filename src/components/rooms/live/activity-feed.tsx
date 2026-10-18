"use client";

// Activity feed (docs/specs/rooms.md §3.5, §7.4): newest on top, the single
// polite live region of the session screen (`role="log"`), 50 lines with
// "Show earlier". Lines replayed from before the page loaded are rendered
// without being announced (they are present at mount). "Judging…" lines
// (rooms-v2 §9.2) sit above the log, outside the live region: they are never
// announced, stored or toasted.
import {
  BanIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  FlagIcon,
  PlayIcon,
  Undo2Icon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import type { FeedLine } from "@/lib/rooms/notifications";

const KIND: Record<FeedLine["kind"], { icon: LucideIcon; className: string }> = {
  solved: { icon: CircleCheckIcon, className: "text-success" },
  self: { icon: CircleCheckIcon, className: "text-success" },
  undone: { icon: Undo2Icon, className: "text-muted-foreground" },
  attempt: { icon: CircleXIcon, className: "text-danger" },
  judging: { icon: CircleDashedIcon, className: "text-info" },
  joined: { icon: UserPlusIcon, className: "text-info" },
  started: { icon: PlayIcon, className: "text-info" },
  ended: { icon: FlagIcon, className: "text-info" },
  cancelled: { icon: BanIcon, className: "text-muted-foreground" },
};

export const FEED_PAGE = 50;

function Line({ line }: { line: FeedLine }) {
  const k = KIND[line.kind];
  const Icon = k.icon;
  return (
    <li data-kind={line.kind} className="flex gap-3 border-b py-3 text-sm/5 last:border-b-0">
      {line.kind === "solved" ? (
        // Accepted in feeds: the ∎ (DESIGN.md §5).
        <span aria-hidden className="mt-1 ml-0.5 size-2.5 shrink-0 bg-success" />
      ) : (
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", k.className)} />
      )}
      <span className="min-w-0 flex-1">
        {line.clock && <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums">{line.clock}</span>}
        <span className="text-foreground">{line.text}</span>
      </span>
    </li>
  );
}

export function ActivityFeed({
  lines,
  judging = [],
  className,
}: {
  lines: FeedLine[];
  /** Transient "carol submitted Problem 4 · judging…" lines, newest first. */
  judging?: FeedLine[];
  className?: string;
}) {
  const [limit, setLimit] = useState(FEED_PAGE);
  const shown = lines.slice(0, limit);
  return (
    <div className={className}>
      {judging.length > 0 && (
        <ul aria-label="Being judged now" className="flex flex-col border-b" data-testid="activity-judging">
          {judging.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </ul>
      )}
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Activity" data-testid="activity-feed">
        <ol className="flex flex-col">
          {shown.length === 0 && judging.length === 0 && (
            <li className="py-2 text-sm text-muted-foreground">No activity yet.</li>
          )}
          {shown.map((line) => (
            <Line key={line.id} line={line} />
          ))}
        </ol>
      </div>
      {lines.length > limit && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLimit((l) => l + FEED_PAGE)}>
          Show earlier
        </Button>
      )}
    </div>
  );
}
