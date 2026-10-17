// The "code execution is off on this deployment" notes of the problem page
// (JUDGE_ENABLED=0 or Vercel). All of their markup lives here so a restyle
// touches one file; the copy is in src/lib/judge-availability.ts.
import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JUDGE_DISABLED_NOTE, JUDGE_DISABLED_SHORT } from "@/lib/judge-availability";

/** Console (idle Result tab, or after a 503 `judge_disabled`). */
export function JudgeDisabledNotice({ message = JUDGE_DISABLED_NOTE }: { message?: string }) {
  return (
    <Alert variant="info" data-testid="judge-disabled-note">
      <InfoIcon aria-hidden />
      <AlertTitle>Run and Submit are off</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** One line above the mobile action bar, where tooltips are out of reach. */
export function JudgeDisabledBarNote({ id }: { id?: string }) {
  return (
    <p id={id} className="text-xs text-muted-foreground" data-testid="judge-disabled-bar-note">
      {JUDGE_DISABLED_SHORT}
    </p>
  );
}
