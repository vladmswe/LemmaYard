import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { memberCountLabel } from "@/components/rooms/room-card";
import { OpenSessionCard } from "@/components/rooms/live/open-session-card";
import { RoomHistoryPanel } from "@/components/rooms/room-history";
import { RoomMembersPanel } from "@/components/rooms/room-members-panel";
import { legacyRoomTabRedirect, parseRoomTab, RoomOpenSessionRegion } from "@/components/rooms/room-page-slots";
import { RoomSettingsTab } from "@/components/rooms/room-settings-tab";
import { RoomTabs } from "@/components/rooms/room-tabs";
import { RoomTile } from "@/components/rooms/room-color";
import { AttendanceCard } from "@/components/rooms/schedule/attendance-card";
import { NextSessionCard } from "@/components/rooms/schedule/next-session-card";
import { RoomDefaultsCards } from "@/components/rooms/settings/room-settings-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { membersHref, parseLeaderboardRange, parsePageParam, type LeaderboardRange } from "@/lib/rooms/history";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { requireRoomMember } from "@/server/rooms/access";
import { getRoomHistory, getRoomMemberStats } from "@/server/rooms/history";
import { getRoomDetail, type RoomDetail } from "@/server/rooms/queries";
import { getRoomScheduleData } from "@/server/rooms/schedule";
import { getOpenSessionSummary, listSessionTags } from "@/server/rooms/session-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/rooms/[roomId]">): Promise<Metadata> {
  const { roomId } = await params;
  const user = await getCurrentUser();
  const access = user ? await requireRoomMember(getDb(), roomId, user.id) : null;
  // Non-members get the not-found title, like the page they see.
  return { title: access ? `${access.roomName} · LemmaYard` : NOT_FOUND_TITLE };
}

/**
 * Room home (spec §7.4, rooms-v2 §2.4). Members only; anyone else gets the
 * global 404. Tabs: Sessions (mini-matrix history), Members (attendance,
 * solved, first solves, wins), Settings. `?tab=leaderboard` (v1) redirects
 * to the Members tab, keeping `?range=`.
 */
export default async function RoomPage({ params, searchParams }: PageProps<"/rooms/[roomId]">) {
  const { roomId } = await params;
  const user = await requireUser(`/rooms/${roomId}`);
  const detail = await getRoomDetail(getDb(), roomId, user.id);
  if (!detail) notFound();
  const { tab, page, range } = await searchParams;
  const historyPage = parsePageParam(page);
  const membersRange = parseLeaderboardRange(range);
  if (legacyRoomTabRedirect(tab)) redirect(membersHref(roomId, membersRange));
  const now = new Date();
  const [openSession, schedule, tags] = await Promise.all([
    getOpenSessionSummary(getDb(), roomId, user.id),
    getRoomScheduleData(getDb(), detail.room, now),
    listSessionTags(getDb()),
  ]);
  const isOwner = detail.viewer.role === "owner";
  const sub = [detail.room.description, memberCountLabel(detail.members.length), "team room"].filter(Boolean).join(" · ");

  return (
    <>
      <PageHead
        crumbs={[
          { label: "Rooms", href: "/rooms" },
          { label: detail.room.name },
        ]}
        title={
          <>
            {/* Phones: the tile sits above the name (DOM inside the h1 is aria-hidden). */}
            <RoomTile name={detail.room.name} color={detail.room.color} size="lg" className="mb-4 grid sm:hidden" />
            <span className="break-words">{detail.room.name}</span>
          </>
        }
        leading={<RoomTile name={detail.room.name} color={detail.room.color} size="lg" className="max-sm:hidden" />}
        subtitle={sub}
      />
      <div className="container-page flex flex-col gap-8 py-8">
        {/* Rooms v2 (V2-2): open session or Next session, beside the attendance strip. */}
        <div className="grid items-stretch gap-6 lg:grid-cols-[1.15fr_1fr]">
          <RoomOpenSessionRegion>
            {openSession ? (
              <OpenSessionCard roomId={roomId} session={openSession} />
            ) : (
              <NextSessionCard
                roomId={roomId}
                plan={schedule.next}
                presets={detail.room.presets}
                defaultPresetId={detail.room.defaultPresetId}
                isOwner={isOwner}
                now={now}
              />
            )}
          </RoomOpenSessionRegion>
          <AttendanceCard members={detail.members} sessions={schedule.recent} viewerId={user.id} />
        </div>
        <RoomTabs
          initialTab={parseRoomTab(tab)}
          sessions={
            <Suspense key={historyPage} fallback={<PanelSkeleton />}>
              <SessionsTab roomId={roomId} userId={user.id} page={historyPage} />
            </Suspense>
          }
          members={
            <Suspense key={membersRange} fallback={<PanelSkeleton />}>
              <MembersTab roomId={roomId} userId={user.id} range={membersRange} detail={detail} />
            </Suspense>
          }
          settings={<RoomSettingsTab detail={detail} defaults={<RoomDefaultsCards detail={detail} tags={tags} />} />}
        />
      </div>
    </>
  );
}

/** Sessions tab: one card per past session with its mini-matrix, `?page=`. */
async function SessionsTab({ roomId, userId, page }: { roomId: string; userId: string; page: number }) {
  const history = await getRoomHistory(getDb(), roomId, userId, { page });
  if (!history) notFound();
  return <RoomHistoryPanel roomId={roomId} history={history} viewerId={userId} />;
}

/** Members tab: per-member stats over `?range=`, attendance over the last 8 sessions. */
async function MembersTab({ roomId, userId, range, detail }: { roomId: string; userId: string; range: LeaderboardRange; detail: RoomDetail }) {
  const stats = await getRoomMemberStats(getDb(), roomId, userId, range);
  if (!stats) notFound();
  // Rooms v2 (D2/D3): one rating per member in this room, visible to every member of it.
  const ratings = new Map(
    detail.members.flatMap((m) =>
      m.rating.rating === null ? [] : [[m.userId, { rating: m.rating.rating, provisional: m.rating.provisional }] as const],
    ),
  );
  return <RoomMembersPanel roomId={roomId} viewerId={userId} stats={stats} ratings={ratings} />;
}

function PanelSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Loading…</span>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 rounded-md" />
      ))}
    </div>
  );
}
