// Settings tab of the room page (docs/specs/rooms-v2.md §2.4 "Settings",
// module V2-2): room profile, session presets and the weekly schedule (the
// owner edits, members read), plus the viewer's own starting rating. Mounted
// in the `defaults` region of the V2-3 Settings tab (room-settings-tab.tsx),
// which keeps sharing, members, invite link and the danger zone.
import type { BankEntry } from "@/lib/rooms/external";
import type { RoomDetail } from "@/server/rooms/queries";
import type { SessionTag } from "@/server/rooms/session-page";

import { LeetCodeBankCard } from "./leetcode-bank-card";
import { MyRatingCard } from "./my-rating-card";
import { PresetsCard } from "./presets-card";
import { RoomProfileCard } from "./room-profile-card";
import { ScheduleCard } from "./schedule-card";

export function RoomDefaultsCards({
  detail,
  tags,
  bank,
  leetcodeCatalogSize = null,
}: {
  detail: RoomDetail;
  tags: SessionTag[];
  /** LeetCode catalog size, null when auto-pick is unavailable. */
  leetcodeCatalogSize?: number | null;
  /** The room's LeetCode list (rooms-external-problems). */
  bank: BankEntry[];
}) {
  const { room, viewer } = detail;
  const isOwner = viewer.role === "owner";
  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="room-settings-tab">
        <RoomProfileCard
          key={`${room.name}|${room.description ?? ""}|${room.color}`}
          roomId={room.id}
          name={room.name}
          description={room.description}
          color={room.color}
          canEdit={isOwner}
        />
        <PresetsCard
          roomId={room.id}
          presets={room.presets}
          defaultPresetId={room.defaultPresetId}
          canEdit={isOwner}
          tags={tags}
          leetcodeCatalogSize={leetcodeCatalogSize}
        />
        <LeetCodeBankCard roomId={room.id} entries={bank} canEdit={isOwner} catalogAvailable={leetcodeCatalogSize !== null} />
        <ScheduleCard
          // Re-mount after a save so the form starts from the stored schedule.
          key={JSON.stringify(room.schedule)}
          roomId={room.id}
          schedule={room.schedule}
          presets={room.presets}
          defaultPresetId={room.defaultPresetId}
          canEdit={isOwner}
        />
        <MyRatingCard />
    </div>
  );
}
