import { deleteItem, updateItem } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Owner: `{note?, title?}`. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/plans/[id]/items/[itemId]">) {
  const { id, itemId } = await ctx.params;
  return updateItem(request, id, itemId);
}

/** Owner: `{}`. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/plans/[id]/items/[itemId]">) {
  const { id, itemId } = await ctx.params;
  return deleteItem(request, id, itemId);
}
