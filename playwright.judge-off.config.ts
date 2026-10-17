import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// "Judge disabled" e2e (tests/e2e-judge-off): its own server with
// JUDGE_ENABLED=0 on PORT + 1, so it never shares a server with the main
// suite (which needs the judge on). Serves the existing production build:
//   pnpm build && pnpm exec playwright test -c playwright.judge-off.config.ts
if (existsSync(".env")) process.loadEnvFile(".env");
const PORT = Number(process.env.PORT ?? 3000) + 1;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e-judge-off",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  outputDir: "node_modules/.cache/playwright-results-judge-off",
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node scripts/next.mjs start --port ${PORT}`,
    url: baseURL,
    // AUTH_URL must match this origin, or every POST (register) is a 403.
    env: { JUDGE_ENABLED: "0", PORT: String(PORT), AUTH_URL: baseURL },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
