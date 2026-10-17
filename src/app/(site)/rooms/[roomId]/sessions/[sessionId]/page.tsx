import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { SessionScreen } from "@/components/rooms/live/session-screen";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { judgeEnabled } from "@/server/judge";
import { getSessionPageData } from "@/server/rooms/session-page";

export const dynamic = "force-dynamic";

// Deduped per request: generateMetadata and the page share one load.
const load = cache(async (roomId: string, sessionId: string, userId: string) =>
  getSessionPageData(getDb(), roomId, sessionId, userId),
);

export async function generateMetadata({ params }: PageProps<"/rooms/[roomId]/sessions/[sessionId]">): Promise<Metadata> {
  const { roomId, sessionId } = await params;
  const user = await getCurrentUser();
  const data = user ? await load(roomId, sessionId, user.id) : null;
  return { title: data ? `Session · ${data.room.name} · LemmaYard` : NOT_FOUND_TITLE };
}

/**
 * Session screen (docs/specs/rooms.md §7.4): lobby, live, finished or
 * cancelled. Members only; anyone else (and a session of another room) gets
 * the global 404.
 */
export default async function SessionPage({ params }: PageProps<"/rooms/[roomId]/sessions/[sessionId]">) {
  const { roomId, sessionId } = await params;
  const user = await requireUser(`/rooms/${roomId}/sessions/${sessionId}`);
  const data = await load(roomId, sessionId, user.id);
  if (!data) notFound();
  return <SessionScreen data={data} judgeEnabled={judgeEnabled()} />;
}
