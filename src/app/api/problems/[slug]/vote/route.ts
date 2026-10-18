import { voteProblemRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** Community: `{value: 1 | -1 | 0}` → `{likes, dislikes, likePercent, myVote}`. */
export async function PUT(request: Request, ctx: RouteContext<"/api/problems/[slug]/vote">) {
  const { slug } = await ctx.params;
  return voteProblemRoute(request, slug);
}
