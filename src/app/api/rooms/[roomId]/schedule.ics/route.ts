import { getScheduleIcs } from "@/server/rooms/schedule";

export const dynamic = "force-dynamic";

/** Member: the weekly schedule as an iCalendar file (`text/calendar`, attachment). Others: 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[roomId]/schedule.ics">) {
  const { roomId } = await ctx.params;
  return getScheduleIcs(roomId);
}
