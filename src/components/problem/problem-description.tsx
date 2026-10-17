import Link from "next/link";

import { formatTagLabel } from "@/lib/format";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { ProblemStatusBadge } from "@/components/problems/problem-status-badge";
import { Badge } from "@/components/ui/badge";
import { catalogHref } from "@/lib/catalog/filters";
import { formatSampleInput, formatValue, splitAtConstraints } from "@/lib/problems/samples";
import type { ProblemPageData } from "@/server/problem-page";

import { Markdown } from "./markdown";

/**
 * Left pane body of the problem page (DESIGN.md §9.4): serif title with the
 * number, difficulty + status + tags, the statement, then the sample tests as
 * "Example N" blocks placed before the "Constraints" section.
 */
export function ProblemDescription({ problem }: { problem: ProblemPageData }) {
  const { before, after } = splitAtConstraints(problem.descriptionMd);
  // "Not started" adds nothing on the problem page; solved/attempted only.
  const status = problem.status === "solved" || problem.status === "attempted" ? problem.status : null;

  return (
    <article className="px-5 pt-5 pb-10 md:px-6">
      <h1 className="font-display text-[1.75rem]/[2.125rem] tracking-[-0.005em] text-balance">
        <span className="tabular-nums">{problem.number}.</span> {problem.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DifficultyBadge difficulty={problem.difficulty} />
        {status && <ProblemStatusBadge status={status} />}
        {problem.tags.length > 0 && (
          <>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-border-strong" />
            <ul aria-label="Topics" className="flex flex-wrap gap-1.5">
              {problem.tags.map((t) => (
                <li key={t.slug}>
                  <Badge variant="tag" render={<Link href={catalogHref({ page: 1 }, { tag: t.slug })} />}>
                    {formatTagLabel(t.name)}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="prose-problem mt-5">
        <Markdown>{before}</Markdown>
        {problem.samples.map((sample, i) => (
          <section key={i} aria-labelledby={`example-${i + 1}`}>
            <h2 id={`example-${i + 1}`}>Example {i + 1}</h2>
            <pre className="mt-3">
              <span className="sample-label">Input:</span>{" "}
              {formatSampleInput(problem.signature, sample.input)}
              {"\n"}
              <span className="sample-label">Output:</span> {formatValue(sample.expected)}
            </pre>
          </section>
        ))}
        {after && <Markdown>{after}</Markdown>}
      </div>
    </article>
  );
}
