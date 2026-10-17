import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { type Db, getDb } from "@/server/db";
import { logError } from "@/server/log";

export const HEALTH_DB_TIMEOUT_MS = 3_000;

/** `select 1` within `timeoutMs`. Never throws; failures are logged without details in the result. */
export async function checkDatabase(
  getClient: () => Db = getDb,
  timeoutMs = HEALTH_DB_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = getClient().execute(sql`select 1`);
    query.catch(() => {}); // a late rejection after the timeout must not go unhandled
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`database check timed out after ${timeoutMs} ms`)), timeoutMs);
    });
    await Promise.race([query, timeout]);
    return true;
  } catch (error) {
    logError("health.db_down", error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** `{ ok: true, db: "up" }` (200) or `{ ok: false, db: "down" }` (503), never cached. */
export function healthResponse(dbUp: boolean): NextResponse {
  return NextResponse.json(dbUp ? { ok: true, db: "up" } : { ok: false, db: "down" }, {
    status: dbUp ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
