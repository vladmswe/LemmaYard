import { addItems, setLayout } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Owner: `{items: [{problemSlug} | {leetcodeUrl, title?}], section?}` → `{added, skipped}`. */
export async function POST(request: Request, ctx: RouteContext<"/api/plans/[id]/items">) {
  const { id } = await ctx.params;
  return addItems(request, id);
}

/** Owner: the full order `{unsectioned, sections: [{id, items}]}`. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/plans/[id]/items">) {
  const { id } = await ctx.params;
  return setLayout(request, id);
}
