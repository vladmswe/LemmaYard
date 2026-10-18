import { updateRoomPresets } from "@/server/rooms/defaults";

export const dynamic = "force-dynamic";

/** Owner: `{action:"save", preset, makeDefault?}` | `{action:"delete", id}` | `{action:"default", id}` → 200 `{presets, defaultPresetId}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/presets">) {
  const { roomId } = await ctx.params;
  return updateRoomPresets(request, roomId);
}
