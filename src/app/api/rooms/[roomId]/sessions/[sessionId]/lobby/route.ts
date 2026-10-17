import { getLobby } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Member: the lobby view (titles for the host/owner only). */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/lobby">) {
  const { roomId, sessionId } = await ctx.params;
  return getLobby(roomId, sessionId);
}
