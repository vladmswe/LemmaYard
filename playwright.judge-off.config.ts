import { defineConfig, devices } from "@playwright/test";

import { e2eSettings, exportToTestEnv, loadDotEnv } from "./tests/e2e-support/env";

// `pnpm test:e2e:judge-off` (tests/e2e-judge-off): the same harness as
// playwright.config.ts with JUDGE_ENABLED=0 and no worker, its own database
// leetcopy_e2e_<worktree>_off and port E2E_PORT + 1, so it never shares a
// server with the main suite. E2E_SKIP_BUILD=1 reuses the last build.
loadDotEnv();
const e2e = e2eSettings("judge-off");
exportToTestEnv(e2e);

export default defineConfig({
  testDir: "tests/e2e-judge-off",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: Number(process.env.E2E_WORKERS || 2),
  outputDir: "node_modules/.cache/playwright-results-judge-off",
  reporter: [["list"]],
  globalSetup: "./tests/e2e-support/global-setup-judge-off.ts",
  use: { baseURL: e2e.baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
