// Slot contract of the room page (/rooms/[roomId]) for R3–R5:
// - <RoomOpenSessionRegion>{…}</RoomOpenSessionRegion>: the "open session"
//   card above the tabs (R3/R4 pass their OpenSessionCard as children).
// - <RoomTabs sessions={…} leaderboard={…} members={…} />: R5 passes the
//   history list and leaderboard; R2 owns `members`.
// Without children the session region renders a clearly marked placeholder.
import { CalendarClockIcon } from "lucide-react";
import type { ReactNode } from "react";

export const ROOM_TABS = ["sessions", "leaderboard", "members", "settings"] as const;
export type RoomTab = (typeof ROOM_TABS)[number];
export const DEFAULT_ROOM_TAB: RoomTab = "sessions";

export const ROOM_TAB_LABELS: Record<RoomTab, string> = {
  sessions: "Sessions",
  leaderboard: "Leaderboard",
  members: "Members",
  settings: "Settings",
};

/** `?tab=` value → a known tab (anything else → the default). */
export function parseRoomTab(value: unknown): RoomTab {
  const v = Array.isArray(value) ? value[0] : value;
  return ROOM_TABS.includes(v as RoomTab) ? (v as RoomTab) : DEFAULT_ROOM_TAB;
}

/** Region above the tabs for the room's lobby/live session (R3/R4). */
export function RoomOpenSessionRegion({ children }: { children?: ReactNode }) {
  return (
    <section aria-label="Current session" data-slot="room-open-session">
      {children ?? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border-strong bg-surface-sunken px-5 py-4">
          <CalendarClockIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">Sessions arrive in the next update</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Timed group sessions with a live scoreboard are coming soon. Invite your friends now so everyone is
              ready.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
