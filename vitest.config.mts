import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Property tests (fast-check) are CPU heavy; the default 5 s flaked when parallel builds loaded the host.
    testTimeout: 30_000,
  },
});
