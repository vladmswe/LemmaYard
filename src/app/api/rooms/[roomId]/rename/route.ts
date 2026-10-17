import { renameRoom } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Owner: `{name}` → 200. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/rename">) {
  const { roomId } = await ctx.params;
  return renameRoom(request, roomId);
}
