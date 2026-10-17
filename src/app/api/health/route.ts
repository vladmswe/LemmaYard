import { checkDatabase, healthResponse } from "@/server/health";
import { judgeEnabled } from "@/server/judge";

export const dynamic = "force-dynamic";

/** Liveness + database reachability for deploy checks, plus the judge mode. No error details in the body. */
export async function GET() {
  return healthResponse(await checkDatabase(), judgeEnabled());
}
