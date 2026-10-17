import { getSubmission } from "@/server/submissions/get";

export const dynamic = "force-dynamic";

/** The submission DTO for its owner; 404 otherwise; `Cache-Control: no-store`. */
export async function GET(_request: Request, ctx: RouteContext<"/api/submissions/[id]">) {
  const { id } = await ctx.params;
  return getSubmission(id);
}
