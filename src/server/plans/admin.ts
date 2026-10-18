// Admin takedown for public or link-shared plans (`pnpm plans:unpublish <id>`).
// Reports and the moderation queue are C1/C4; until then the owner (the only
// admin) can make any plan private from the command line. The share token is
// dropped too, so every old link stops working; the owner of the plan can
// share it again later with a new link.
import { eq } from "drizzle-orm";

import type { PlanVisibility } from "@/lib/plans/schemas";
import type { Db } from "@/server/db";
import { studyPlans } from "@/server/db/schema";

import { isPlanId } from "./access";

export async function unpublishPlan(db: Db, planId: string): Promise<{ previous: PlanVisibility } | null> {
  if (!isPlanId(planId)) return null;
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select({ visibility: studyPlans.visibility })
      .from(studyPlans)
      .where(eq(studyPlans.id, planId))
      .for("update");
    if (!plan) return null;
    await tx
      .update(studyPlans)
      .set({ visibility: "private", shareToken: null })
      .where(eq(studyPlans.id, planId));
    return { previous: plan.visibility };
  });
}
