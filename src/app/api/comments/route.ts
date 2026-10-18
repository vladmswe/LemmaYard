import { createCommentRoute, listCommentsRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** `?target=problem:<slug>&sort=best|new&cursor=` → one page of comments with their first replies. */
export async function GET(request: Request) {
  return listCommentsRoute(request);
}

/** `{target, parentId?, body, hasSpoiler}` → 201 `{comment}`. */
export async function POST(request: Request) {
  return createCommentRoute(request);
}
