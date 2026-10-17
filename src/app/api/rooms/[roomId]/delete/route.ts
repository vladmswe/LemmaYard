import { deleteRoom } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Owner: `{confirmName}` (must equal the name) → 200. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/delete">) {
  const { roomId } = await ctx.params;
  return deleteRoom(request, roomId);
}
