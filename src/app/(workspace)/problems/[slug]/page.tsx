import { HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EmptyState } from "@/components/empty-state";
import { ConsolePane } from "@/components/problem/console-pane";
import { EditorPane } from "@/components/problem/editor-pane";
import { ProblemDescription } from "@/components/problem/problem-description";
import { ProblemWorkspace } from "@/components/problem/workspace";
import { getCurrentUser } from "@/server/auth/session";
import { getProblemPageData } from "@/server/problem-page";

// Deduped per request: generateMetadata and the page share one load.
const loadProblem = cache(async (slug: string) => {
  const user = await getCurrentUser();
  return getProblemPageData(slug, user?.id ?? null);
});

export async function generateMetadata({ params }: PageProps<"/problems/[slug]">): Promise<Metadata> {
  const problem = await loadProblem((await params).slug);
  return { title: problem ? `${problem.number}. ${problem.title} · leetcopy` : "Page not found · leetcopy" };
}

export default async function ProblemPage({ params }: PageProps<"/problems/[slug]">) {
  const problem = await loadProblem((await params).slug);
  if (!problem) notFound();

  return (
    <ProblemWorkspace
      description={<ProblemDescription problem={problem} />}
      submissions={<SubmissionsPlaceholder />}
      editor={<EditorPane />}
      console={<ConsolePane />}
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
