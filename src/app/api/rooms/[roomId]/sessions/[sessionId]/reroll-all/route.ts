import { rerollAllSlots } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner, lobby: re-roll every unpinned slot (counts as one re-roll) → 200 `{lobby}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/reroll-all">) {
  const { roomId, sessionId } = await ctx.params;
  return rerollAllSlots(request, roomId, sessionId);
}
