import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { MemberTimelineView } from "@/components/rooms/member-timeline";
import { Avatar } from "@/components/ui/avatar";
import { formatMonthYear } from "@/lib/format";
import { memberTimelineHref } from "@/lib/rooms/history";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getMemberTimeline } from "@/server/rooms/history";

export const dynamic = "force-dynamic";

const loadTimeline = cache(async (roomId: string, username: string) => {
  const user = await getCurrentUser();
  if (!user) return null;
  const timeline = await getMemberTimeline(getDb(), roomId, user.id, username);
  return timeline ? { timeline, roomName: timeline.room.name } : null;
});

export async function generateMetadata({ params }: PageProps<"/rooms/[roomId]/members/[username]">): Promise<Metadata> {
  const { roomId, username } = await params;
  const data = await loadTimeline(roomId, username);
  if (!data) return { title: NOT_FOUND_TITLE };
  return { title: `${data.timeline.member.username} · ${data.roomName} · LemmaYard` };
}

/**
 * A participant's history in one room (spec §5.2, §7.4): per date, rank and
 * which problems they solved. Room members only; 404 for anyone else and for
 * names that are neither members nor past participants.
 */
export default async function MemberTimelinePage({ params }: PageProps<"/rooms/[roomId]/members/[username]">) {
  const { roomId, username } = await params;
  await requireUser(memberTimelineHref(roomId, username));
  const data = await loadTimeline(roomId, username);
  if (!data) notFound();
  const { timeline, roomName } = data;
  const { member } = timeline;

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Rooms", href: "/rooms" },
          { label: roomName, href: `/rooms/${roomId}?tab=members` },
          { label: member.username },
        ]}
        leading={<Avatar name={member.username} size="lg" className={member.isMember ? undefined : "opacity-60"} />}
        title={member.username}
        subtitle={
          member.isMember && member.joinedAt
            ? `Member of ${roomName} since ${formatMonthYear(new Date(member.joinedAt))}`
            : `Left ${roomName}; their past sessions stay in the room's history`
        }
      />
      <div className="container-page py-8">
        <MemberTimelineView roomId={roomId} timeline={timeline} />
      </div>
    </>
  );
}
