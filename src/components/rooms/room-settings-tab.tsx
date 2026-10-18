import { Link2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { RoomDetail } from "@/server/rooms/queries";

import { InviteLinkCard } from "./invite-link-card";
import { MembersList } from "./members-list";
import { memberCountLabel } from "./room-card";
import { DangerZoneCard, MemberPreferencesCard, RoomSettingsCard } from "./room-settings";

/**
 * Region of the Settings tab for room defaults & presets and the weekly
 * schedule (rooms-v2 §2.4, §4, §5; module V2-2). Renders nothing until that
 * module passes its cards in.
 */
export function RoomDefaultsRegion({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div data-slot="room-defaults" className="flex min-w-0 flex-col gap-6">
      {children}
    </div>
  );
}

/**
 * Settings tab (rooms-v2 §2.4): name and sharing (owner), your preferences,
 * the member list with owner actions, the invite link, room defaults (V2-2)
 * and the danger zone.
 */
export function RoomSettingsTab({ detail, defaults }: { detail: RoomDetail; defaults?: ReactNode }) {
  const { room, viewer, members, invite } = detail;
  const isOwner = viewer.role === "owner";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]" data-testid="room-settings">
      <div className="flex min-w-0 flex-col gap-6">
        {isOwner && <RoomSettingsCard roomId={room.id} shareSolutions={room.shareSolutions} />}
        <RoomDefaultsRegion>{defaults}</RoomDefaultsRegion>
        <Card>
          <CardHeader>
            <h2 className="text-lg/7 font-semibold">People in this room</h2>
            <CardDescription>{memberCountLabel(members.length)} · up to 20 per room</CardDescription>
          </CardHeader>
          <CardContent>
            <MembersList
              roomId={room.id}
              roomName={room.name}
              members={members}
              viewerId={viewer.userId}
              viewerIsOwner={isOwner}
            />
          </CardContent>
        </Card>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <MemberPreferencesCard roomId={room.id} shareSolutions={viewer.shareSolutions} />
        {isOwner && invite ? (
          <InviteLinkCard roomId={room.id} invite={invite} />
        ) : (
          <Card>
            <CardContent className="flex gap-3">
              <Link2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div>
                <h2 className="font-semibold">Invite a friend</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Ask the room owner for an invite link. Only the owner can create one.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        <DangerZoneCard roomId={room.id} roomName={room.name} isOwner={isOwner} memberCount={members.length} />
      </div>
    </div>
  );
}
