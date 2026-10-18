// PLANS_ENABLED (owner decision Q10 (a)): study plans have their own switch,
// independent of COMMUNITY_ENABLED. Off: no plan UI anywhere and every plan
// page and route answers 404.
import { getEnv } from "@/server/env";

export function plansEnabled(): boolean {
  return getEnv().PLANS_ENABLED === "1";
}
