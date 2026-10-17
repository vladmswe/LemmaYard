import { removeMember } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Owner: `{}` → 200; not for oneself. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/members/[userId]/remove">) {
  const { roomId, userId } = await ctx.params;
  return removeMember(request, roomId, userId);
}
