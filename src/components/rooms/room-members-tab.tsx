import { Link2Icon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { RoomDetail } from "@/server/rooms/queries";

import { InviteLinkCard } from "./invite-link-card";
import { MembersList } from "./members-list";
import { memberCountLabel } from "./room-card";
import { DangerZoneCard, MemberPreferencesCard, RoomSettingsCard } from "./room-settings";

/** Members tab (spec §7.4): list + invite (owner) on the left, settings on the right. */
export function RoomMembersTab({ detail }: { detail: RoomDetail }) {
  const { room, viewer, members, invite } = detail;
  const isOwner = viewer.role === "owner";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-lg/7 font-semibold">Members</h2>
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
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <MemberPreferencesCard roomId={room.id} shareSolutions={viewer.shareSolutions} />
        {isOwner && <RoomSettingsCard roomId={room.id} name={room.name} shareSolutions={room.shareSolutions} />}
        <DangerZoneCard roomId={room.id} roomName={room.name} isOwner={isOwner} memberCount={members.length} />
      </div>
    </div>
  );
}
