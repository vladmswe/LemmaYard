import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { OUTPUT_FILE, UPGRADE_FILE, buildSupabaseSql, buildUpgradeSql } from "../../scripts/export-supabase-sql";

describe("docs/supabase/schema.sql", () => {
  const sql = buildSupabaseSql();

  it("is up to date with drizzle/*.sql (run `pnpm db:export-sql` after adding a migration)", () => {
    expect(readFileSync(OUTPUT_FILE, "utf8")).toBe(sql);
  });

  it("runs in one transaction, refuses a non-empty database and records every migration", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    expect(sql).toContain("RAISE EXCEPTION 'LemmaYard tables already exist");
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { when: number }[] };
    for (const e of journal.entries) expect(sql).toContain(String(e.when));
  });

  it("enables row level security on every table it creates", () => {
    const created = [...sql.matchAll(/^CREATE TABLE "(\w+)" \(/gm)].map((m) => m[1]);
    expect(created.length).toBeGreaterThanOrEqual(13);
    for (const t of created) expect(sql).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
  });
});

describe("docs/supabase/upgrade.sql", () => {
  const sql = buildUpgradeSql();

  it("is up to date with drizzle/*.sql", () => {
    expect(readFileSync(UPGRADE_FILE, "utf8")).toBe(sql);
  });

  it("runs once per migration, guarded by its recorded hash, in one transaction", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { when: number }[] };
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
    expect(sql.match(/IF NOT EXISTS \(SELECT 1 FROM "drizzle"\."__drizzle_migrations" WHERE hash = /g)).toHaveLength(journal.entries.length);
    for (const e of journal.entries) expect(sql).toContain(String(e.when));
  });
});
