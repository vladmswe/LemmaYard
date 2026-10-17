import { ArrowRightIcon } from "lucide-react";

import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import type { PracticeLink } from "@/lib/guide/content/types";
import { getPracticeProblem } from "@/server/guide/problems";

export const PRACTICE_FALLBACK_NOTE = "Practice problems for this topic are coming.";

async function resolve(links: readonly PracticeLink[]) {
  return Promise.all(links.map(async (l) => ({ ...l, problem: await getPracticeProblem(l.slug) })));
}

function List({ items }: { items: Awaited<ReturnType<typeof resolve>> }) {
  return (
    <ul className="guide-practice-list" role="list">
      {items.map(({ slug, why, problem }) => (
        <li key={slug} className="guide-practice-item" data-practice={slug}>
          <a href={`/problems/${slug}`} className="guide-practice-link">
            <span className="guide-practice-title">{problem.title}</span>
            <ArrowRightIcon aria-hidden className="size-4 shrink-0" />
          </a>
          <DifficultyBadge difficulty={problem.difficulty} />
          <p className="guide-practice-why">{why}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * `<PracticeLinks />`: the lesson's `meta.practice` with title and difficulty
 * from problems/<slug>/meta.json. Links are plain hrefs, so they work even
 * while /problems/<slug> is a placeholder. An empty list shows the note plus
 * related problems from the prerequisite lessons.
 */
export async function PracticeLinks({
  practice,
  related = [],
}: {
  practice: readonly PracticeLink[];
  related?: readonly PracticeLink[];
}) {
  if (practice.length > 0) return <List items={await resolve(practice)} />;
  const rel = await resolve(related);
  return (
    <div data-practice-empty="">
      <p className="guide-practice-note">{PRACTICE_FALLBACK_NOTE}</p>
      {rel.length > 0 && (
        <>
          <p>Meanwhile, these related problems from earlier lessons use the same ideas:</p>
          <List items={rel} />
        </>
      )}
    </div>
  );
}
