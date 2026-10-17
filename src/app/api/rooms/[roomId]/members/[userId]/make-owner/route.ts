import { makeOwner } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Owner: `{}` → 200; swaps the roles in one transaction. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/members/[userId]/make-owner">) {
  const { roomId, userId } = await ctx.params;
  return makeOwner(request, roomId, userId);
}
