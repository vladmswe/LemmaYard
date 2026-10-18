import { createSection } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Owner: `{title}` → 201 `{id}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/plans/[id]/sections">) {
  const { id } = await ctx.params;
  return createSection(request, id);
}
