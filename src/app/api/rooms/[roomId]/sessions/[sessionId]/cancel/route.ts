import { cancelSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner: lobby → cancelled → 200. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/cancel">) {
  const { roomId, sessionId } = await ctx.params;
  return cancelSession(request, roomId, sessionId);
}
