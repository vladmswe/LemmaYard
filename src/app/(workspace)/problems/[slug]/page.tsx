import { HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EmptyState } from "@/components/empty-state";
import { ProblemDescription } from "@/components/problem/problem-description";
import { SolveWorkspace } from "@/components/problem/solve-workspace";
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

  return (
    <SolveWorkspace
      slug={problem.slug}
      signature={problem.signature}
      samples={problem.samples}
      signedIn={problem.signedIn}
      pollingConfig={getPollingConfig()}
      description={<ProblemDescription problem={problem} />}
      submissions={<SubmissionsPlaceholder />}
    />
  );
}

/** Left "Submissions" tab until M6 lists the user's submissions here. */
function SubmissionsPlaceholder() {
  return (
    <EmptyState icon={HistoryIcon} title="Your submissions will appear here">
      Each solution you submit for this problem will be listed with its verdict.
    </EmptyState>
  );
}
