// Global setup of playwright.judge-off.config.ts: own database, JUDGE_ENABLED=0, no worker.
import { e2eSettings, loadDotEnv } from "./env";
import { startHarness } from "./harness";

export default async function globalSetup() {
  loadDotEnv();
  return startHarness(e2eSettings("judge-off"));
}
