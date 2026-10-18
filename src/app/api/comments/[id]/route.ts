import { deleteCommentRoute, editCommentRoute, getCommentRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** One comment; `?reveal=1` includes a spoiler's body ("Show anyway"). */
export async function GET(request: Request, ctx: RouteContext<"/api/comments/[id]">) {
  const { id } = await ctx.params;
  return getCommentRoute(request, id);
}

/** Author edit within 24 h: `{body, hasSpoiler?}`. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/comments/[id]">) {
  const { id } = await ctx.params;
  return editCommentRoute(request, id);
}

/** Author delete (soft): `{}`. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/comments/[id]">) {
  const { id } = await ctx.params;
  return deleteCommentRoute(request, id);
}
