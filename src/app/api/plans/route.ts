import { z } from "zod";

import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http/request";
import { json, planRead, SIGN_IN_REQUIRED } from "@/server/plans/http";
import { listPickerPlans } from "@/server/plans/read";
import { createPlan } from "@/server/plans/write";

export const dynamic = "force-dynamic";

const slugParam = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);

/** The viewer's plans for the add-to-plan dialog; `?problem=<slug>` marks the plans that hold it. */
export function GET(request: Request) {
  return planRead("picker", async () => {
    const user = await getCurrentUser();
    if (!user) return jsonError(401, SIGN_IN_REQUIRED);
    const raw = new URL(request.url).searchParams.get("problem");
    const problem = raw !== null && slugParam.safeParse(raw).success ? raw : null;
    return json({ plans: await listPickerPlans(getDb(), user.id, problem) });
  });
}

/** `{title, description?, visibility?, items?, section?}` → 201 `{id, added, skipped}`. */
export function POST(request: Request) {
  return createPlan(request);
}
