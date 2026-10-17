import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Integration tests need DATABASE_URL / TEST_DATABASE_URL from .env; workers
// inherit this process's environment.
if (existsSync(".env")) process.loadEnvFile(".env");
// The suites submit and start sessions: always with the judge on, whatever
// .env says. The judge-disabled tests switch it off per file.
process.env.JUDGE_ENABLED = "1";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    // All files share one database and truncate it between tests.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
