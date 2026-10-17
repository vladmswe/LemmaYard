import { getSessionState } from "@/server/rooms/state";

export const dynamic = "force-dynamic";

/** Member: `?after=<cursor>[&snapshot=1]` → events after the cursor, snapshot when needed. */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/state">) {
  const { roomId, sessionId } = await ctx.params;
  return getSessionState(request, roomId, sessionId);
}
