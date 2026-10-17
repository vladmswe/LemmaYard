import type { PollingConfig } from "@/lib/submission-dto";
import { getEnv } from "@/server/env";

/** Extra time on top of `WALL_CAP_MS` before a running submission counts as "taking longer" (AC-M5-10). */
export const RUNNING_GRACE_MS = 30_000;

/**
 * Client polling timeouts from the server env. Server components call this
 * and pass the result as a prop to the client component that uses
 * `pollSubmission()`; only these two numbers leave the server.
 */
export function getPollingConfig(): PollingConfig {
  const env = getEnv();
  return {
    queuedTimeoutMs: env.QUEUED_TIMEOUT_MS,
    runningTimeoutMs: env.WALL_CAP_MS + RUNNING_GRACE_MS,
  };
}
