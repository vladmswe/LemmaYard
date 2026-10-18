import { LockIcon, MessageSquareOffIcon, ShieldAlertIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ViewerSummary } from "@/lib/community/dto";
import { formatDateTime } from "@/lib/format";

/** Read-only banner (AC-C-GEN-2): shown on every discussion surface while COMMUNITY_READ_ONLY=1. */
export function ReadOnlyBanner() {
  return (
    <Alert variant="warning" data-testid="community-read-only">
      <MessageSquareOffIcon aria-hidden />
      <AlertTitle>Discussions are read-only for now</AlertTitle>
      <AlertDescription>You can read everything; posting, voting and reporting are paused.</AlertDescription>
    </Alert>
  );
}

/** Why the composer is missing, in place of it. Null when the viewer can post (or read-only, shown elsewhere). */
export function WriteNotice({ viewer, loginNext }: { viewer: ViewerSummary; loginNext: string }) {
  switch (viewer.writeBlock) {
    case "guest":
      return (
        <p className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-foreground-secondary">
          <Link href={`/login?next=${encodeURIComponent(loginNext)}`} className="font-semibold text-link underline underline-offset-2">
            Log in
          </Link>{" "}
          to ask a question or share an insight.
        </p>
      );
    case "suspended":
      return (
        <Alert variant="danger">
          <ShieldAlertIcon aria-hidden />
          <AlertTitle>Your community access is suspended</AlertTitle>
          <AlertDescription>
            {viewer.suspendedUntil ? `Until ${formatDateTime(new Date(viewer.suspendedUntil))}. ` : ""}
            You can still read, practise and use rooms.{" "}
            <Link href="/legal/content-policy" className="underline underline-offset-2">
              Content policy
            </Link>
          </AlertDescription>
        </Alert>
      );
    case "locked":
      return (
        <Alert variant="info">
          <LockIcon aria-hidden />
          <AlertTitle>This discussion is locked</AlertTitle>
          <AlertDescription>A moderator closed it for new comments.</AlertDescription>
        </Alert>
      );
    default:
      return null;
  }
}
