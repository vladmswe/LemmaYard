import { getSessionRatings } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Member: the session's rating ledger (before, delta, expected per participant; problem before/after). */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/ratings">) {
  const { roomId, sessionId } = await ctx.params;
  return getSessionRatings(roomId, sessionId);
}
