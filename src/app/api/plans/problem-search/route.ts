import { PLAN_SEARCH_MAX } from "@/lib/plans/schemas";
import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http/request";
import { json, planRead, SIGN_IN_REQUIRED } from "@/server/plans/http";
import { searchPlanProblems } from "@/server/plans/read";

export const dynamic = "force-dynamic";

/** `?q=` title, slug or number → up to 10 published problems (the plan editor's search). */
export function GET(request: Request) {
  return planRead("problem_search", async () => {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, SIGN_IN_REQUIRED);
    const q = (new URL(request.url).searchParams.get("q") ?? "").replace(/\p{Cc}/gu, " ");
    return json({ problems: await searchPlanProblems(getDb(), [...q].slice(0, PLAN_SEARCH_MAX).join("")) });
  });
}
