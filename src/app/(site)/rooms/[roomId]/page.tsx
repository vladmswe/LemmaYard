import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { memberCountLabel } from "@/components/rooms/room-card";
import { OpenSessionCard } from "@/components/rooms/live/open-session-card";
import { RoomMembersTab } from "@/components/rooms/room-members-tab";
import { RoomHistoryPanel } from "@/components/rooms/room-history";
import { RoomLeaderboardPanel } from "@/components/rooms/room-leaderboard";
import { parseRoomTab, RoomOpenSessionRegion } from "@/components/rooms/room-page-slots";
import { RoomTabs } from "@/components/rooms/room-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { parseLeaderboardRange, parsePageParam, type LeaderboardRange } from "@/lib/rooms/history";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { requireRoomMember } from "@/server/rooms/access";
import { getRoomHistory, getRoomLeaderboard } from "@/server/rooms/history";
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
 * R3/R4 plug in through RoomOpenSessionRegion; R5 fills the
 * `sessions` / `leaderboard` panels of RoomTabs (see room-page-slots.tsx).
 */
export default async function RoomPage({ params, searchParams }: PageProps<"/rooms/[roomId]">) {
  const { roomId } = await params;
  const user = await requireUser(`/rooms/${roomId}`);
  const detail = await getRoomDetail(getDb(), roomId, user.id);
  if (!detail) notFound();
  const { tab, page, range } = await searchParams;
  const historyPage = parsePageParam(page);
  const leaderboardRange = parseLeaderboardRange(range);
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
          sessions={
            <Suspense key={historyPage} fallback={<PanelSkeleton />}>
              <SessionsTab roomId={roomId} userId={user.id} page={historyPage} />
            </Suspense>
          }
          leaderboard={
            <Suspense key={leaderboardRange} fallback={<PanelSkeleton />}>
              <LeaderboardTab roomId={roomId} userId={user.id} range={leaderboardRange} />
            </Suspense>
          }
          members={<RoomMembersTab detail={detail} />}
        />
      </div>
    </>
  );
}

/** Sessions tab (R5): history list with `?page=`. */
async function SessionsTab({ roomId, userId, page }: { roomId: string; userId: string; page: number }) {
  const history = await getRoomHistory(getDb(), roomId, userId, { page });
  if (!history) notFound();
  return <RoomHistoryPanel roomId={roomId} history={history} />;
}

/** Leaderboard tab (R5): standings over `?range=`. */
async function LeaderboardTab({ roomId, userId, range }: { roomId: string; userId: string; range: LeaderboardRange }) {
  const leaderboard = await getRoomLeaderboard(getDb(), roomId, userId, range);
  if (!leaderboard) notFound();
  return <RoomLeaderboardPanel roomId={roomId} viewerId={userId} leaderboard={leaderboard} />;
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
