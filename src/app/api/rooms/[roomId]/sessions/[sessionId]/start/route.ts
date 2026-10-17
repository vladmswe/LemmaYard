import { startSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner: lobby → live → 200 `{startedAt, endsAt}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/start">) {
  const { roomId, sessionId } = await ctx.params;
  return startSession(request, roomId, sessionId);
}
