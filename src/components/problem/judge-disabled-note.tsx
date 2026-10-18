// The "code execution is off on this deployment" notes of the problem page
// (JUDGE_ENABLED=0 or Vercel). All of their markup lives here so a restyle
// touches one file; the copy is in src/lib/judge-availability.ts.
import { ClockIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JUDGE_DISABLED_NOTE, JUDGE_DISABLED_SHORT } from "@/lib/judge-availability";

/**
 * Console (idle Result tab, or after a 503 `judge_disabled`): the v2
 * "judge unavailable" note (DESIGN.md §13.11), an info panel with a clock,
 * a title, the reason and what still works.
 */
export function JudgeDisabledNotice({ message = JUDGE_DISABLED_NOTE }: { message?: string }) {
  return (
    <Alert variant="info" data-testid="judge-disabled-note" className="gap-y-1 px-4 py-3.5">
      <ClockIcon aria-hidden />
      <AlertTitle className="text-[0.9375rem]">Run and Submit are off</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <p className="label-mono leading-4">Editing and local drafts still work</p>
      </AlertDescription>
    </Alert>
  );
}

/** One line above the mobile action bar, where tooltips are out of reach. */
export function JudgeDisabledBarNote({ id }: { id?: string }) {
  return (
    <p id={id} className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="judge-disabled-bar-note">
      <ClockIcon aria-hidden className="size-3.5 shrink-0 text-info" />
      {JUDGE_DISABLED_SHORT}
    </p>
  );
}
