import { checkDatabase, healthResponse } from "@/server/health";

export const dynamic = "force-dynamic";

/** Liveness + database reachability for deploy checks. No error details in the body. */
export async function GET() {
  return healthResponse(await checkDatabase());
}
