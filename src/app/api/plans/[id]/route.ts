import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { json, planNotFound, planRead } from "@/server/plans/http";
import { getPlanPage } from "@/server/plans/read";
import { deletePlan, updatePlan } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** The plan with the viewer's progress (`?share=<token>` for unlisted plans). Others: 404. */
export async function GET(request: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  return planRead("get", async () => {
    const user = await getCurrentUser();
    const share = new URL(request.url).searchParams.get("share");
    const data = await getPlanPage(getDb(), id, user?.id ?? null, share);
    return data ? json(data) : planNotFound();
  });
}

/** Owner: `{title?, description?, visibility?, resetShareLink?}`. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  return updatePlan(request, id);
}

/** Owner: `{}` → the plan and everything in it is deleted. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const { id } = await ctx.params;
  return deletePlan(request, id);
}
