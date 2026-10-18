import { importPlan } from "@/server/plans/import";

export const dynamic = "force-dynamic";

/** Room member: `{source: "room_session", sessionId}` of a finished session → 201 `{id}`. */
export function POST(request: Request) {
  return importPlan(request);
}
