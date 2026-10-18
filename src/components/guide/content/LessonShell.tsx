import { ClockIcon, PencilLineIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { MDXContent } from "mdx/types";
import { Fragment } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getLesson } from "@/content/learn";
import { buildRoadmap } from "@/lib/guide/content/roadmap";
import { TRACK_LABELS, type LessonData, type LessonMeta } from "@/lib/guide/content/types";

import { lessonComponents } from "./lesson-components";
import { LessonNav } from "./LessonNav";
import { LessonProgress } from "./LessonProgress";
import { LessonToc } from "./LessonToc";
import { LessonTrackNav } from "./LessonTrackNav";
import { LessonStatusBadge } from "./RoadmapProgress";

const ARTICLE_ID = "lesson-content";

/** "<title> · Learn · LemmaYard", summary as description, article OG type; drafts are noindex. */
export function lessonMetadata(meta: LessonMeta): Metadata {
  const title = `${meta.title} · Learn · LemmaYard`;
  return {
    title,
    description: meta.summary,
    openGraph: { title, description: meta.summary, type: "article" },
    ...(meta.status === "draft" ? { robots: { index: false } } : {}),
  };
}

/** "Stacks: last in, first out" → "Stacks: <em>last in, first out</em>" (the italic phrase of the d2 H1). */
function LessonTitle({ title }: { title: string }) {
  const at = title.indexOf(": ");
  if (at < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, at + 2)}
      <em>{title.slice(at + 2)}</em>
    </>
  );
}

/**
 * Lesson page (DESIGN.md §13.9): lessons by track | header, MDX article,
 * completion toggle, prev/next | "On this page" rail (PLAN-GUIDE 2.8).
 */
export function LessonShell({
  lesson,
  Content,
  published,
}: {
  lesson: LessonData;
  Content: MDXContent;
  published: readonly LessonMeta[];
}) {
  const { meta } = lesson;
  const prereqs = meta.prerequisites.map((s) => getLesson(s)).filter((l): l is LessonMeta => Boolean(l));
  const groups = buildRoadmap(published).map((s) => ({
    label: s.label,
    lessons: s.lessons.map((l) => ({ slug: l.slug, title: l.title, order: l.order })),
  }));
  // Lesson k of the published guide, as in the roadmap and the lesson bar (0 = draft).
  const position = groups.flatMap((g) => g.lessons).findIndex((l) => l.slug === meta.slug) + 1;
  const questionIds = lesson.quizzes.flatMap((q) => q.questions.map((x) => x.id));
  return (
    <div className="container-page guide-lesson py-8 sm:py-10" data-lesson={meta.slug}>
      <div className="guide-lesson-layout">
      <LessonTrackNav groups={groups} current={meta.slug} />
      <article className="guide-lesson-grid" aria-labelledby="lesson-title">
        <header className="guide-lesson-head">
          <Breadcrumb className="mb-3">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/learn" />}>Learn</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <span>{TRACK_LABELS[meta.track]}</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{meta.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {meta.status === "draft" && (
            <Alert variant="warning" className="mb-5" data-draft-banner="">
              <PencilLineIcon aria-hidden />
              <AlertTitle>Draft</AlertTitle>
              <AlertDescription>
                This lesson is still being written. It is not listed on the roadmap yet.
              </AlertDescription>
            </Alert>
          )}
          <p className="eyebrow-accent mb-4" aria-hidden>
            {position > 0 ? `Lesson ${position}` : "Draft"} · {TRACK_LABELS[meta.track]}
          </p>
          <h1 id="lesson-title" className="guide-lesson-title display-2">
            <LessonTitle title={meta.title} />
          </h1>
          <p className="guide-lesson-summary">{meta.summary}</p>
          <p className="guide-lesson-meta">
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon aria-hidden className="size-4" />
              {meta.minutes} min
            </span>
            <LessonStatusBadge slug={meta.slug} questionIds={questionIds} />
            {prereqs.length > 0 && (
              <span data-prerequisites="">
                Before this:{" "}
                {prereqs.map((p, i) => (
                  <Fragment key={p.slug}>
                    {i > 0 && ", "}
                    <Link href={`/learn/${p.slug}`} className="guide-link">
                      {p.title}
                    </Link>
                  </Fragment>
                ))}
              </span>
            )}
          </p>
        </header>

        <div className="guide-lesson-aside">
          <LessonToc articleId={ARTICLE_ID} />
        </div>

        <div id={ARTICLE_ID} className="guide-prose guide-lesson-body">
          <Content components={lessonComponents(lesson)} />
        </div>

        <footer className="guide-lesson-foot">
          <LessonProgress slug={meta.slug} />
          <LessonNav order={meta.order} published={published} />
        </footer>
      </article>
      </div>
    </div>
  );
}
