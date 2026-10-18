// Every variable of the env schema is documented: as a `NAME=` line in
// .env.example (local setup) or by name in docs/DEPLOY.md (platform-provided
// or production-only variables). Add new variables to both the schema and the
// docs (CLAUDE.md "Read env only through getEnv()").
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { envSchema } from "@/server/env";

const schemaKeys = Object.keys(envSchema.shape);
const example = readFileSync(".env.example", "utf8");
const deploy = readFileSync("docs/DEPLOY.md", "utf8");

const exampleKeys = new Set([...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!));
const inDeployDoc = (key: string) => new RegExp(`\\b${key}\\b`).test(deploy);

describe("env documentation", () => {
  it("reads the schema's variables", () => {
    expect(schemaKeys).toContain("DATABASE_URL");
    expect(schemaKeys).toContain("AUTH_SECRET");
  });

  it("documents every schema variable in .env.example or docs/DEPLOY.md", () => {
    const undocumented = schemaKeys.filter((k) => !exampleKeys.has(k) && !inDeployDoc(k));
    expect(undocumented).toEqual([]);
  });

  it(".env.example lists only variables the schema reads", () => {
    expect([...exampleKeys].filter((k) => !schemaKeys.includes(k))).toEqual([]);
  });
});
