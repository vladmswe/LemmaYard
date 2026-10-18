import { updateRoomProfile } from "@/server/rooms/defaults";

export const dynamic = "force-dynamic";

/** Owner: `{name?, description?, color?}` → 200 `{name, description, color}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/profile">) {
  const { roomId } = await ctx.params;
  return updateRoomProfile(request, roomId);
}
