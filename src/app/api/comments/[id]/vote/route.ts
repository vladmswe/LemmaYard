import { voteCommentRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** `{value: 1 | -1 | 0}` → `{score, myVote}`. */
export async function PUT(request: Request, ctx: RouteContext<"/api/comments/[id]/vote">) {
  const { id } = await ctx.params;
  return voteCommentRoute(request, id);
}
