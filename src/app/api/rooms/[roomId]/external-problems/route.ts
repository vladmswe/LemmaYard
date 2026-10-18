import { getBank, updateBank } from "@/server/rooms/external";

export const dynamic = "force-dynamic";

/** Member: the room's LeetCode list → 200 `{problems, canEdit}`. Non-members: 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[roomId]/external-problems">) {
  const { roomId } = await ctx.params;
  return getBank(roomId);
}

/** Owner: `{action:"add", url, title?, difficulty?, rating?}` | `{action:"update", id, …}` | `{action:"delete", id}` → `{problems}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/external-problems">) {
  const { roomId } = await ctx.params;
  return updateBank(request, roomId);
}
