import { endSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner: live → finished (idempotent) → 200 `{endedAt, endReason}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/end">) {
  const { roomId, sessionId } = await ctx.params;
  return endSession(request, roomId, sessionId);
}
