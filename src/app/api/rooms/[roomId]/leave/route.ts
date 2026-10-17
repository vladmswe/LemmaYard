import { leaveRoom } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Member: `{}` → 200 `{deleted}`; the owner must transfer first unless alone. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/leave">) {
  const { roomId } = await ctx.params;
  return leaveRoom(request, roomId);
}
