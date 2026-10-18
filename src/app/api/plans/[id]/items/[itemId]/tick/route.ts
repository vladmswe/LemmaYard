import { setTick } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Any signed-in reader: `{done, share?}` on an external (LeetCode) item; stored per viewer. */
export async function PUT(request: Request, ctx: RouteContext<"/api/plans/[id]/items/[itemId]/tick">) {
  const { id, itemId } = await ctx.params;
  return setTick(request, id, itemId);
}
