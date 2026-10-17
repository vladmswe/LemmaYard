import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http/request";
import { json, SIGN_IN_REQUIRED } from "@/server/rooms/http";
import { getSessionSolution, SOLUTION_NOT_FOUND } from "@/server/rooms/results";

export const dynamic = "force-dynamic";

/**
 * Member: the accepted code of one (participant, problem) cell of a finished
 * session (spec §4.5, §7.2). Not a member, unknown ids, live session, sharing
 * off, opted out or an unsolved cell all answer the same 404.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/solutions/[userId]/[position]">,
) {
  const { roomId, sessionId, userId, position } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const solution = await getSessionSolution(getDb(), roomId, sessionId, user.id, { userId }, position);
  if (!solution) return jsonError(404, SOLUTION_NOT_FOUND);
  return json({
    language: solution.language,
    code: solution.code,
    runtimeMs: solution.runtimeMs,
    memoryKb: solution.memoryKb,
  });
}
