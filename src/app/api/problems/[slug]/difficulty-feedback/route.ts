import { difficultyFeedbackRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** Community, solvers only: `{value: -1 | 0 | 1 | null}` (easier / about right / harder / clear). */
export async function PUT(request: Request, ctx: RouteContext<"/api/problems/[slug]/difficulty-feedback">) {
  const { slug } = await ctx.params;
  return difficultyFeedbackRoute(request, slug);
}
