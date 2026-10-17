import { createSubmission } from "@/server/submissions/create";

export const dynamic = "force-dynamic";

/** `{language, code}` → 202 `{id}` (PLAN.md section 6). */
export async function POST(request: Request, ctx: RouteContext<"/api/problems/[slug]/submit">) {
  const { slug } = await ctx.params;
  return createSubmission(request, slug, "submit");
}
