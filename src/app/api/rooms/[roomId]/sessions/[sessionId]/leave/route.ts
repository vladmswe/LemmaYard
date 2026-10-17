import { leaveSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Participant (not the host): leave before the start → 200. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/leave">) {
  const { roomId, sessionId } = await ctx.params;
  return leaveSession(request, roomId, sessionId);
}
