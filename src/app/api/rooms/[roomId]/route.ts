import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http/request";
import { json, roomNotFound, SIGN_IN_REQUIRED } from "@/server/rooms/http";
import { getRoomDetail } from "@/server/rooms/queries";

export const dynamic = "force-dynamic";

/** Room, members with roles, invite status (owner only). Non-members: 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[roomId]">) {
  const { roomId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const detail = await getRoomDetail(getDb(), roomId, user.id);
  return detail ? json(detail) : roomNotFound();
}
