// Settings tab of the room page (docs/specs/rooms-v2.md §2.4 "Settings",
// module V2-2): room profile, session presets and the weekly schedule (the
// owner edits, members read), plus the viewer's own starting rating. The
// v1 cards (sharing, invite link, danger zone) stay on the Members tab,
// which module V2-3 reorganizes.
import type { RoomDetail } from "@/server/rooms/queries";
import type { SessionTag } from "@/server/rooms/session-page";

import { MyRatingCard } from "./my-rating-card";
import { PresetsCard } from "./presets-card";
import { RoomProfileCard } from "./room-profile-card";
import { ScheduleCard } from "./schedule-card";

export function RoomSettingsTab({ detail, tags }: { detail: RoomDetail; tags: SessionTag[] }) {
  const { room, viewer } = detail;
  const isOwner = viewer.role === "owner";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]" data-testid="room-settings-tab">
      <div className="flex min-w-0 flex-col gap-6">
        <PresetsCard
          roomId={room.id}
          presets={room.presets}
          defaultPresetId={room.defaultPresetId}
          canEdit={isOwner}
          tags={tags}
        />
        <ScheduleCard
          // Re-mount after a save so the form starts from the stored schedule.
          key={JSON.stringify(room.schedule)}
          roomId={room.id}
          schedule={room.schedule}
          presets={room.presets}
          defaultPresetId={room.defaultPresetId}
          canEdit={isOwner}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <RoomProfileCard
          key={`${room.name}|${room.description ?? ""}|${room.color}`}
          roomId={room.id}
          name={room.name}
          description={room.description}
          color={room.color}
          canEdit={isOwner}
        />
        <MyRatingCard />
      </div>
    </div>
  );
}
