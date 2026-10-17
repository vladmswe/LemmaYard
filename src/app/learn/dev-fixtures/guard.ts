import type { Env } from "@/server/env";

/** The dev-fixture pages exist only when GUIDE_FIXTURES=1 (Playwright runs). */
export function fixturesEnabled(env: Pick<Env, "GUIDE_FIXTURES">): boolean {
  return env.GUIDE_FIXTURES === "1";
}
