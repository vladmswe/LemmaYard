import { searchLeetCode } from "@/server/rooms/leetcode-search";

export const dynamic = "force-dynamic";

/** Host/owner, lobby: `?q=&difficulty=&min=&max=&tag=` → up to 20 LeetCode catalog problems. */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/leetcode-search">) {
  const { roomId, sessionId } = await ctx.params;
  return searchLeetCode(request, roomId, sessionId);
}
