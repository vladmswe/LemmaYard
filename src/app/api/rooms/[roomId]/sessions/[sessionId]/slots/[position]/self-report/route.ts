import { selfReport } from "@/server/rooms/external";

export const dynamic = "force-dynamic";

/** Participant, live, LeetCode slot: `{solved: boolean}` → 200 `{position, solved, solveSeconds}`. */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/self-report">,
) {
  const { roomId, sessionId, position } = await ctx.params;
  return selfReport(request, roomId, sessionId, position);
}
