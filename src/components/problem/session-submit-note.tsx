"use client";

// Console strip for a Submit that counts for a room session (Rooms,
// docs/specs/rooms.md §3.4, §7.4 SessionBanner): says plainly whether the
// Submit counts, and explains rejections with their way out ("Join session",
// "Submit anyway (won't count)").
import { CircleAlertIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type { SubmitSessionContext } from "./submit-context";

/** Rejection codes of a Submit with `roomSessionId` (src/server/rooms/submit-context.ts). */
export const SESSION_SUBMIT_CODES: ReadonlySet<string> = new Set([
  "join_first",
  "session_ended",
  "not_in_session",
  "session_not_found",
]);

export type SessionSubmitIssue = { code: string; message: string };

const ISSUE_COPY: Record<string, { title: string; body: string }> = {
  session_ended: {
    title: "The session has ended; this submission would not count.",
    body: "You can still submit it as a normal practice submission.",
  },
  join_first: {
    title: "Join the session first.",
    body: "Only participants' submissions count. Join, then submit again.",
  },
  not_in_session: {
    title: "This problem is not part of the session.",
    body: "Open the problem from the session page, or submit it without the session.",
  },
  session_not_found: {
    title: "The session was not found.",
    body: "You may no longer be a member of this room. You can submit without the session.",
  },
};

export function SessionSubmitNote({
  session,
  issue,
  lastSubmitCounted,
  busy,
  onSubmitWithoutSession,
}: {
  session: SubmitSessionContext | null;
  issue: SessionSubmitIssue | null;
  lastSubmitCounted: boolean | null;
  busy: boolean;
  onSubmitWithoutSession: () => void;
}) {
  const [joining, setJoining] = useState(false);
  if (issue) {
    const copy = ISSUE_COPY[issue.code] ?? { title: issue.message, body: "" };
    return (
      <Alert variant="warning" className="mb-3" data-testid="session-submit-issue" data-code={issue.code}>
        {issue.code === "session_ended" ? <TriangleAlertIcon aria-hidden /> : <CircleAlertIcon aria-hidden />}
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          {copy.body && <p>{copy.body}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {issue.code === "join_first" && session && (
              <Button
                size="sm"
                loading={joining}
                onClick={async () => {
                  setJoining(true);
                  await session.join();
                  setJoining(false);
                }}
              >
                Join session
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={busy} onClick={onSubmitWithoutSession}>
              {issue.code === "session_ended" ? "Submit anyway (won't count)" : "Submit without the session"}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (!session && lastSubmitCounted !== true) return null;
  const text =
    lastSubmitCounted === true
      ? `This submission counts for the session${session ? `: ${session.label}` : ""}.`
      : lastSubmitCounted === false && session
        ? `This submission was sent without the session and does not count. Next Submit counts for ${session.label}.`
        : `Submit counts for the session: ${session!.label}.`;
  return (
    <p
      className="mb-3 flex items-start gap-2 rounded-md border border-info/30 bg-info-bg px-3 py-2 text-sm text-foreground"
      data-testid="session-submit-note"
      data-counted={lastSubmitCounted === null ? undefined : String(lastSubmitCounted)}
    >
      <UsersIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <span>{text}</span>
    </p>
  );
}
