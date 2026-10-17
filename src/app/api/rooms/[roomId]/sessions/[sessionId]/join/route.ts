import { joinSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Member: join the lobby or live session (idempotent) → 200. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/join">) {
  const { roomId, sessionId } = await ctx.params;
  return joinSession(request, roomId, sessionId);
}
