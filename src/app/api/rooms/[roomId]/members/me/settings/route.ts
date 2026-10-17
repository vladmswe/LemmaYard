import { updateMySettings } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** Member: `{shareSolutions}` → 200 (the per-member opt-out). */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/members/me/settings">) {
  const { roomId } = await ctx.params;
  return updateMySettings(request, roomId);
}
