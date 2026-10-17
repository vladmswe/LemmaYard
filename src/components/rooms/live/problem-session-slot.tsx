import { getDb } from "@/server/db";
import { getProblemSessionContext } from "@/server/rooms/session-page";

import { SessionBanner } from "./session-banner";

/**
 * Server part of the problem-page banner: one query (behind the page's
 * Suspense boundary) decides whether the viewer sees a session banner. Guests,
 * non-members and problems outside the viewer's sessions render nothing.
 */
export async function ProblemSessionSlot({
  slug,
  userId,
  sessionParam,
}: {
  slug: string;
  userId: string;
  sessionParam: string | null;
}) {
  const context = await getProblemSessionContext(getDb(), slug, userId, sessionParam);
  if (!context) return null;
  return <SessionBanner context={context} viewerId={userId} />;
}
