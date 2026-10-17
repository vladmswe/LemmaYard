import { rerollSessionSlot } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner, lobby: re-roll one slot → 200 `{lobby}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/reroll">) {
  const { roomId, sessionId, position } = await ctx.params;
  return rerollSessionSlot(request, roomId, sessionId, position);
}
