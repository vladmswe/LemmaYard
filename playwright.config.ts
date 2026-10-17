import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// PORT comes from .env (each worktree has its own); shell variables win.
if (existsSync(".env")) process.loadEnvFile(".env");
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Keeps traces out of the repo without touching .gitignore.
  outputDir: "node_modules/.cache/playwright-results",
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/next.mjs build && node scripts/next.mjs start",
    url: baseURL,
    env: { GUIDE_FIXTURES: "1" },
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
