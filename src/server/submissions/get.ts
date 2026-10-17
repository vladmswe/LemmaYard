// GET /api/submissions/:id (PLAN.md section 6): owner only; another user's
// id, an unknown id and a malformed id are all 404 (never 403).
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import type { SubmissionDto } from "@/lib/submission-dto";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import { problems, submissions } from "@/server/db/schema";
import { jsonError } from "@/server/http/request";

import { toSubmissionDto } from "./serialize";

const idSchema = z.uuid();

/** The submission as its owner may see it, or null (unknown id or not the owner). */
export async function findOwnSubmission(
  db: Db,
  userId: string,
  id: string,
): Promise<SubmissionDto | null> {
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await db
    .select({
      id: submissions.id,
      kind: submissions.kind,
      status: submissions.status,
      language: submissions.language,
      customInput: submissions.customInput,
      passedCount: submissions.passedCount,
      totalCount: submissions.totalCount,
      runtimeMs: submissions.runtimeMs,
      memoryKb: submissions.memoryKb,
      error: submissions.error,
      stdout: submissions.stdout,
      caseResults: submissions.caseResults,
      failedCase: submissions.failedCase,
      createdAt: submissions.createdAt,
      finishedAt: submissions.finishedAt,
      problem: { slug: problems.slug, title: problems.title },
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(and(eq(submissions.id, id), eq(submissions.userId, userId)))
    .limit(1);
  return row ? toSubmissionDto(row) : null;
}

export async function getSubmission(id: string): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to view submissions");
  const dto = await findOwnSubmission(getDb(), user.id, id);
  if (!dto) return jsonError(404, "Submission not found");
  return NextResponse.json(dto, { headers: { "Cache-Control": "no-store" } });
}
