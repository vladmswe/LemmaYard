import Link from "next/link";
import type { ReactNode } from "react";

import { formatTagLabel } from "@/lib/format";
import { DifficultyBadge } from "@/components/problems/difficulty-badge";
import { ProblemStatusBadge } from "@/components/problems/problem-status-badge";
import { Badge } from "@/components/ui/badge";
import { catalogHref } from "@/lib/catalog/filters";
import { formatSampleInput, formatValue, splitAtConstraints } from "@/lib/problems/samples";
import type { ProblemPageData } from "@/server/problem-page";

import { Markdown } from "./markdown";

/**
 * Left pane body of the problem page (DESIGN.md §13.4): serif 40px title
 * with the number, difficulty pill + topic tags (status pill on the right),
 * the statement at 16/26, then the sample tests as "Example N" blocks
 * (mono rule-heads; sunken IO blocks with a 2px primary rule and a 76px
 * label column) placed before the "Constraints" section, whose list items
 * carry ∎ markers.
 */
export function ProblemDescription({
  problem,
  actions,
}: {
  problem: ProblemPageData;
  /** Extra controls at the end of the pill row (e.g. "Add to plan"). */
  actions?: ReactNode;
}) {
  const { before, after } = splitAtConstraints(problem.descriptionMd);
  // "Not started" adds nothing on the problem page; solved/attempted only.
  const status = problem.status === "solved" || problem.status === "attempted" ? problem.status : null;

  return (
    <article className="px-4 pt-5 pb-10 md:px-7 md:pt-6">
      <h1 className="font-display text-[2.125rem]/[1.05] tracking-[-0.005em] text-balance md:text-[2.5rem]">
        <span className="tabular-nums">{problem.number}.</span> {problem.title}
      </h1>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <DifficultyBadge difficulty={problem.difficulty} />
        {problem.tags.length > 0 && (
          <ul aria-label="Topics" className="contents">
            {problem.tags.map((t) => (
              <li key={t.slug} className="flex">
                <Badge
                  variant="tag"
                  className="relative after:absolute after:-inset-x-0.5 after:-inset-y-2"
                  render={<Link href={catalogHref({ page: 1 }, { tag: t.slug })} />}
                >
                  {formatTagLabel(t.name)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {status && <ProblemStatusBadge status={status} className="ml-auto" />}
        {actions && <div className={status ? undefined : "ml-auto"}>{actions}</div>}
      </div>

      <div className="prose-problem mt-6">
        <Markdown>{before}</Markdown>
        {problem.samples.map((sample, i) => (
          <section key={i} aria-labelledby={`example-${i + 1}`}>
            <h2 id={`example-${i + 1}`}>Example {i + 1}</h2>
            <pre className="sample">
              <span className="sample-row">
                <span className="sample-label">Input</span>
                <span>{formatSampleInput(problem.signature, sample.input)}</span>
              </span>
              <span className="sample-row">
                <span className="sample-label">Output</span>
                <span>{formatValue(sample.expected)}</span>
              </span>
            </pre>
          </section>
        ))}
        {after && <Markdown>{after}</Markdown>}
      </div>
    </article>
  );
}
