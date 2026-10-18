import { defineConfig, devices } from "@playwright/test";

import { e2eSettings, exportToTestEnv, loadDotEnv } from "./tests/e2e-support/env";

// `pnpm test:e2e` (AC-M7-1). The global setup (tests/e2e-support/harness.ts)
// creates the isolated database leetcopy_e2e_<worktree>, builds, starts
// `next start` on E2E_PORT (default PORT + 1177) and the real judge worker,
// and tears everything down afterwards. Specs never see the .env database:
// DATABASE_URL in this process (and the test workers) is the e2e one.
loadDotEnv();
const e2e = e2eSettings("main");
exportToTestEnv(e2e);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: Number(process.env.E2E_WORKERS || 2),
  // Keeps traces out of the repo without touching .gitignore.
  outputDir: "node_modules/.cache/playwright-results",
  reporter: [["list"]],
  globalSetup: "./tests/e2e-support/global-setup.ts",
  use: {
    baseURL: e2e.baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", grepInvert: /@judge/, use: { ...devices["Desktop Chrome"] } },
    // Specs judged by the real worker (Docker): at most 2 at a time.
    { name: "judge", grep: /@judge/, workers: 2, use: { ...devices["Desktop Chrome"] } },
  ],
});
