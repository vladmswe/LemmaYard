import { drawSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner, lobby: new settings and a re-draw of the unpinned slots → 200 `{lobby}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/draw">) {
  const { roomId, sessionId } = await ctx.params;
  return drawSession(request, roomId, sessionId);
}
