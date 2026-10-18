import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { AddToPlanDialog } from "@/components/plans/add-to-plan-dialog";
import { ProblemDescription } from "@/components/problem/problem-description";
import { SolveWorkspace } from "@/components/problem/solve-workspace";
import { SubmitContextProvider } from "@/components/problem/submit-context";
import { ProblemSessionSlot } from "@/components/rooms/live/problem-session-slot";
import { ProblemSubmissions } from "@/components/submissions/problem-submissions";
import { SubmissionsSkeleton } from "@/components/submissions/submissions-skeleton";
import { getCurrentUser } from "@/server/auth/session";
import { judgeEnabled } from "@/server/judge";
import { plansEnabled } from "@/server/plans/flag";
import { getProblemPageData } from "@/server/problem-page";
import { getPollingConfig } from "@/server/submissions/config";

// Deduped per request: generateMetadata and the page share one load.
const loadProblem = cache(async (slug: string) => {
  const user = await getCurrentUser();
  const problem = await getProblemPageData(slug, user?.id ?? null);
  return problem && { ...problem, signedIn: user !== null };
});

export async function generateMetadata({ params }: PageProps<"/problems/[slug]">): Promise<Metadata> {
  const problem = await loadProblem((await params).slug);
  if (!problem) return { title: NOT_FOUND_TITLE };
  const topics = problem.tags.map((t) => t.name).join(", ");
  return {
    title: `${problem.number}. ${problem.title} · LemmaYard`,
    description: `${problem.title}: a${problem.difficulty === "easy" ? "n" : ""} ${problem.difficulty} problem${topics ? ` on ${topics}` : ""}. Solve it in Python or JavaScript and let the sandboxed judge check every test.`,
  };
}

export default async function ProblemPage({ params, searchParams }: PageProps<"/problems/[slug]">) {
  const problem = await loadProblem((await params).slug);
  if (!problem) notFound();
  // Cached per request: the same session read as in loadProblem.
  const user = await getCurrentUser();
  // Rooms: `?session=<id>` names the session explicitly (spec §1.2 step 8).
  const { session } = await searchParams;
  const sessionParam = typeof session === "string" ? session : null;

  return (
    <SubmitContextProvider>
      {user && (
        // One cheap query, streamed: the editor never waits for the banner.
        <Suspense fallback={null}>
          <ProblemSessionSlot slug={problem.slug} userId={user.id} sessionParam={sessionParam} />
        </Suspense>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <SolveWorkspace
          slug={problem.slug}
          signature={problem.signature}
          samples={problem.samples}
          signedIn={problem.signedIn}
          pollingConfig={getPollingConfig()}
          judgeEnabled={judgeEnabled()}
          description={
            <ProblemDescription
              problem={problem}
              actions={user && plansEnabled() ? <AddToPlanDialog problem={{ slug: problem.slug, title: problem.title }} /> : null}
            />
          }
          submissions={
            // Own boundary: the tab's query (AC-M6-3) streams without holding up the editor.
            <Suspense
              fallback={
                <div className="p-4">
                  <SubmissionsSkeleton rows={4} />
                </div>
              }
            >
              <ProblemSubmissions slug={problem.slug} userId={user?.id ?? null} />
            </Suspense>
          }
        />
      </div>
    </SubmitContextProvider>
  );
}
