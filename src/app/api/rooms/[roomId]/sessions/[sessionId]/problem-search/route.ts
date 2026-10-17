import { searchProblems } from "@/server/rooms/sessions";

export const dynamic = "force-dynamic";

/** Host/owner: `?q=` → up to 10 published problems by title. */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[roomId]/sessions/[sessionId]/problem-search">) {
  const { roomId, sessionId } = await ctx.params;
  return searchProblems(request, roomId, sessionId);
}
