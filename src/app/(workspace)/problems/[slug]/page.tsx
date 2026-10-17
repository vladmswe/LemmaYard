import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { ProblemDescription } from "@/components/problem/problem-description";
import { SolveWorkspace } from "@/components/problem/solve-workspace";
import { ProblemSubmissions } from "@/components/submissions/problem-submissions";
import { SubmissionsSkeleton } from "@/components/submissions/submissions-skeleton";
import { getCurrentUser } from "@/server/auth/session";
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
  return { title: problem ? `${problem.number}. ${problem.title} · LemmaYard` : "Page not found · LemmaYard" };
}

export default async function ProblemPage({ params }: PageProps<"/problems/[slug]">) {
  const problem = await loadProblem((await params).slug);
  if (!problem) notFound();
  // Cached per request: the same session read as in loadProblem.
  const user = await getCurrentUser();

  return (
    <SolveWorkspace
      slug={problem.slug}
      signature={problem.signature}
      samples={problem.samples}
      signedIn={problem.signedIn}
      pollingConfig={getPollingConfig()}
      description={<ProblemDescription problem={problem} />}
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
  );
}
