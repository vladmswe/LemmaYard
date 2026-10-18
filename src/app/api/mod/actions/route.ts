import { modActionRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** Moderators: `{action, targetType, targetId, reason, days?, value?}`. */
export async function POST(request: Request) {
  return modActionRoute(request);
}
