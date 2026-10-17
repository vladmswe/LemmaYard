import { pinSessionSlot } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner, lobby: `{slug}` pins a problem, `{unpin: true}` unpins → 200 `{lobby}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/pin">) {
  const { roomId, sessionId, position } = await ctx.params;
  return pinSessionSlot(request, roomId, sessionId, position);
}
