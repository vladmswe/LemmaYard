import { createSession } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Member: settings `{problemCount?, durationMin?, tags?, mixMode?, mix?, challenge?, avoidSolved?, plannedFor?}` → 201 `{id, lobby}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions">) {
  const { roomId } = await ctx.params;
  return createSession(request, roomId);
}
