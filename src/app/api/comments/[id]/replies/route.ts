import { listRepliesRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** `?cursor=` → the next replies of a top-level comment, oldest first. */
export async function GET(request: Request, ctx: RouteContext<"/api/comments/[id]/replies">) {
  const { id } = await ctx.params;
  return listRepliesRoute(request, id);
}
