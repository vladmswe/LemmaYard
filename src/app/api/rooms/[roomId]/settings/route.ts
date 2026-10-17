import { updateRoomSettings } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Owner: `{shareSolutions}` → 200. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/settings">) {
  const { roomId } = await ctx.params;
  return updateRoomSettings(request, roomId);
}
