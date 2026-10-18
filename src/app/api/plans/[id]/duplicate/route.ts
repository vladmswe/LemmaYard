import { duplicatePlan } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Signed-in reader: `{share?}` → 201 `{id}` of a private copy. */
export async function POST(request: Request, ctx: RouteContext<"/api/plans/[id]/duplicate">) {
  const { id } = await ctx.params;
  return duplicatePlan(request, id);
}
