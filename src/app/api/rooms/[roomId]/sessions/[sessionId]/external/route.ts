import { updateSessionExternal } from "@/server/rooms/external";

export const dynamic = "force-dynamic";

/** Host/owner, lobby: `{action:"add", bankId}` | `{action:"add", url, …, saveToBank?}` | `{action:"remove", position}` → 200 `{lobby}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/external">) {
  const { roomId, sessionId } = await ctx.params;
  return updateSessionExternal(request, roomId, sessionId);
}
