import { NextResponse } from "next/server";

import { JUDGE_DISABLED_CODE } from "@/lib/judge-availability";
import { getEnv, isJudgeEnabled } from "@/server/env";

/** `JUDGE_ENABLED` / `VERCEL` of this process (see isJudgeEnabled). */
export function judgeEnabled(): boolean {
  return isJudgeEnabled(getEnv());
}

/** 503 `{error, code: "judge_disabled"}`, never cached. Sent before anything is written. */
export function judgeDisabledResponse(error: string): NextResponse {
  return NextResponse.json(
    { error, code: JUDGE_DISABLED_CODE },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
