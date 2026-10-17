import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

import { getEnv } from "./src/server/env";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: getEnv().DATABASE_URL_DIRECT ?? getEnv().DATABASE_URL },
  strict: true,
});
