import { updateRoomSchedule } from "@/server/rooms/defaults";

export const dynamic = "force-dynamic";

/** Owner: `{schedule: {weekday, time, timeZone, presetId} | null}` → 200 `{schedule}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/schedule">) {
  const { roomId } = await ctx.params;
  return updateRoomSchedule(request, roomId);
}
