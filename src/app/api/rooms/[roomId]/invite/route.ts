import { manageInvite } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Owner: `{action:"rotate", expiresInDays}` → `{url, expiresAt}` (only time the token is sent) or `{action:"disable"}` → `{}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/invite">) {
  const { roomId } = await ctx.params;
  return manageInvite(request, roomId);
}
