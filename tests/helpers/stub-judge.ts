// Test-only judge for UI tests that need a verdict without Docker
// (docs/specs/rooms.md §9.3): claims ONE given queued submission by id and
// finalizes it through the worker's real `finalize()`, so the room-session
// outcome, scores and events are produced exactly as in production. No user
// code runs. Never import this from app code.
import { and, eq, sql } from "drizzle-orm";

import { createDb } from "@/server/db";
import { submissions } from "@/server/db/schema";

import { finalize, toFinalFields } from "../../worker/queue";

export type StubVerdict = "accepted" | "wrong_answer" | "time_limit" | "runtime_error" | "compile_error";

export async function stubJudge(databaseUrl: string, id: string, status: StubVerdict = "accepted"): Promise<void> {
  const { db, pool } = createDb(databaseUrl);
  try {
    const claimed = await db
      .update(submissions)
      .set({ status: "running", startedAt: sql`now()`, workerId: "e2e-stub" })
      .where(and(eq(submissions.id, id), eq(submissions.status, "queued")))
      .returning({ id: submissions.id });
    if (claimed.length !== 1) throw new Error(`submission ${id} is not queued (is a real worker running?)`);
    const ok = await finalize(
      db,
      id,
      toFinalFields("submit", {
        status,
        passedCount: status === "accepted" ? 3 : 1,
        totalCount: 3,
        runtimeMs: 12,
        memoryKb: 9000,
        failedTestIndex: null,
        failedCase: null,
        caseResults: [],
        stdout: "",
        error: null,
      }),
    );
    if (!ok) throw new Error(`submission ${id} was not finalized`);
  } finally {
    await pool.end();
  }
}
