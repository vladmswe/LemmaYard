import { BanIcon, ClockIcon, FlagIcon, RadioIcon, type LucideIcon } from "lucide-react";

import type { RoomSessionStatus } from "@/lib/rooms/types";

export type SessionStatusMeta = {
  label: string;
  icon: LucideIcon;
  /** Badge classes (literal strings, DESIGN.md §11.2). */
  badge: string;
};

// Spec §7.4: Lobby `Clock` muted, Live `Radio` info, Finished `Flag` outline,
// Cancelled `Ban` muted; always word + icon.
export const SESSION_STATUSES: Record<RoomSessionStatus, SessionStatusMeta> = {
  lobby: { label: "Lobby", icon: ClockIcon, badge: "bg-muted text-muted-foreground" },
  live: { label: "Live", icon: RadioIcon, badge: "bg-info-bg text-info" },
  finished: { label: "Finished", icon: FlagIcon, badge: "border-border-strong font-medium text-foreground-secondary" },
  cancelled: { label: "Cancelled", icon: BanIcon, badge: "bg-muted text-muted-foreground" },
};
