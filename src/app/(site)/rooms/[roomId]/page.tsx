import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { memberCountLabel } from "@/components/rooms/room-card";
import { OpenSessionCard } from "@/components/rooms/live/open-session-card";
import { RoomMembersTab } from "@/components/rooms/room-members-tab";
import {
  LeaderboardPlaceholder,
  parseRoomTab,
  RoomOpenSessionRegion,
  SessionsPlaceholder,
} from "@/components/rooms/room-page-slots";
import { RoomTabs } from "@/components/rooms/room-tabs";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { requireRoomMember } from "@/server/rooms/access";
import { getRoomDetail } from "@/server/rooms/queries";
import { getOpenSessionSummary } from "@/server/rooms/session-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/rooms/[roomId]">): Promise<Metadata> {
  const { roomId } = await params;
  const user = await getCurrentUser();
  const access = user ? await requireRoomMember(getDb(), roomId, user.id) : null;
  // Non-members get the not-found title, like the page they see.
  return { title: access ? `${access.roomName} · LemmaYard` : NOT_FOUND_TITLE };
}

/**
 * Room home (spec §7.4). Members only; anyone else gets the global 404.
 * R3–R5 plug in through the slots: children of RoomOpenSessionRegion and the
 * `sessions` / `leaderboard` props of RoomTabs (see room-page-slots.tsx).
 */
export default async function RoomPage({ params, searchParams }: PageProps<"/rooms/[roomId]">) {
  const { roomId } = await params;
  const user = await requireUser(`/rooms/${roomId}`);
  const detail = await getRoomDetail(getDb(), roomId, user.id);
  if (!detail) notFound();
  const { tab } = await searchParams;
  const openSession = await getOpenSessionSummary(getDb(), roomId, user.id);
  const isOwner = detail.viewer.role === "owner";

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Rooms", href: "/rooms" },
          { label: detail.room.name },
        ]}
        title={<span className="break-words">{detail.room.name}</span>}
        subtitle={`${memberCountLabel(detail.members.length)}${isOwner ? " · You are the owner" : ""}`}
      />
      <div className="container-page flex flex-col gap-8 py-8">
        <RoomOpenSessionRegion>
          <OpenSessionCard roomId={roomId} session={openSession} />
        </RoomOpenSessionRegion>
        <RoomTabs
          initialTab={parseRoomTab(tab)}
          sessions={<SessionsPlaceholder />}
          leaderboard={<LeaderboardPlaceholder />}
          members={<RoomMembersTab detail={detail} />}
        />
      </div>
    </>
  );
}
