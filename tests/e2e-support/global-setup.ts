// Global setup of playwright.config.ts: database, build, web server, worker.
import { e2eSettings, loadDotEnv } from "./env";
import { startHarness } from "./harness";

export default async function globalSetup() {
  loadDotEnv();
  return startHarness(e2eSettings("main"));
}
