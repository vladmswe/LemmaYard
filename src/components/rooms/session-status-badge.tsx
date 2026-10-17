import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import type { RoomSessionStatus } from "@/lib/rooms/types";

import { SESSION_STATUSES } from "./session-status";

/** Session status as icon + word (spec §7.4). */
export function SessionStatusBadge({ status, className }: { status: RoomSessionStatus; className?: string }) {
  const meta = SESSION_STATUSES[status];
  const Icon = meta.icon;
  return (
    <Badge variant="status" data-status={status} className={cn(meta.badge, className)}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}
