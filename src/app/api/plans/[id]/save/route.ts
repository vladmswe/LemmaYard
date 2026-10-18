import { setSaved } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Signed-in reader (not the owner): `{saved, share?}`. */
export async function PUT(request: Request, ctx: RouteContext<"/api/plans/[id]/save">) {
  const { id } = await ctx.params;
  return setSaved(request, id);
}
