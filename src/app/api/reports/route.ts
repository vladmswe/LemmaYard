import { createReportRoute } from "@/server/community/routes";

export const dynamic = "force-dynamic";

/** `{targetType: "comment", targetId, reason, details?}` → 201. */
export async function POST(request: Request) {
  return createReportRoute(request);
}
