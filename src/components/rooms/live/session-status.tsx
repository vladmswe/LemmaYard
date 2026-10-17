// Session status: icon + word, never color alone (docs/specs/rooms.md §7.4
// "session-status-badge"): Lobby `Clock` muted, Live `Radio` info, Finished
// `Flag` outline, Cancelled `Ban` muted. Literal class strings only.
import { BanIcon, ClockIcon, FlagIcon, RadioIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import type { RoomSessionStatus } from "@/lib/rooms/types";

export const SESSION_STATUSES: Record<RoomSessionStatus, { label: string; icon: LucideIcon; className: string }> = {
  lobby: { label: "Lobby", icon: ClockIcon, className: "bg-muted text-foreground-secondary" },
  live: { label: "Live", icon: RadioIcon, className: "bg-info-bg text-info" },
  finished: { label: "Finished", icon: FlagIcon, className: "border-border-strong text-foreground-secondary" },
  cancelled: { label: "Cancelled", icon: BanIcon, className: "bg-muted text-muted-foreground" },
};

export function SessionStatusBadge({ status, className }: { status: RoomSessionStatus; className?: string }) {
  const s = SESSION_STATUSES[status];
  const Icon = s.icon;
  return (
    <Badge variant="status" data-status={status} className={cn(s.className, className)}>
      <Icon aria-hidden />
      {s.label}
    </Badge>
  );
}
