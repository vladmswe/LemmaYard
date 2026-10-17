import { afterAll, describe, expect, it, vi } from "vitest";

import { createDb } from "@/server/db";
import { checkDatabase, healthResponse } from "@/server/health";

import { closeTestDb, getTestDb } from "../helpers/db";

afterAll(closeTestDb);

describe("health check", () => {
  it("is up against the real test database", async () => {
    expect(await checkDatabase(getTestDb)).toBe(true);
  });

  it("is down, without throwing, for a closed port, and logs no credentials", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = createDb("postgres://someone:hunter2secret@127.0.0.1:1/nothing", { ssl: "disable" });
    try {
      expect(await checkDatabase(() => broken.db)).toBe(false);
      const logged = errors.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("health.db_down");
      expect(logged).not.toContain("hunter2secret");
    } finally {
      errors.mockRestore();
      await broken.pool.end();
    }
  });

  it("is down when the query exceeds the timeout", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const hang = { execute: () => new Promise(() => {}) } as unknown as ReturnType<typeof getTestDb>;
    try {
      expect(await checkDatabase(() => hang, 50)).toBe(false);
    } finally {
      errors.mockRestore();
    }
  });

  it("is down when the client cannot even be created (invalid env)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        await checkDatabase(() => {
          throw new Error("Invalid environment variables");
        }),
      ).toBe(false);
    } finally {
      errors.mockRestore();
    }
  });

  it("answers 200 / 503 with a fixed body and no-store", async () => {
    const up = healthResponse(true, true);
    expect(up.status).toBe(200);
    expect(await up.json()).toEqual({ ok: true, db: "up", judge: "enabled" });
    const down = healthResponse(false, true);
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ ok: false, db: "down", judge: "enabled" });
    expect(down.headers.get("cache-control")).toBe("no-store");
  });

  it("reports the judge mode without changing the status (DB only)", async () => {
    const up = healthResponse(true, false);
    expect(up.status).toBe(200);
    expect(await up.json()).toEqual({ ok: true, db: "up", judge: "disabled" });
    const down = healthResponse(false, false);
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ ok: false, db: "down", judge: "disabled" });
  });
});
