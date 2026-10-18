import { deleteSection, renameSection } from "@/server/plans/write";

export const dynamic = "force-dynamic";

/** Owner: `{title}`. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/plans/[id]/sections/[sectionId]">) {
  const { id, sectionId } = await ctx.params;
  return renameSection(request, id, sectionId);
}

/** Owner: `{}`; the section's items move to the end of the top list. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/plans/[id]/sections/[sectionId]">) {
  const { id, sectionId } = await ctx.params;
  return deleteSection(request, id, sectionId);
}
