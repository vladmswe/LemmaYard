import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { CommentComposer } from "@/components/community/comment-composer";
import { CommentItem, CommentList } from "@/components/community/comment-list";
import { DifficultyFeedbackCard } from "@/components/community/difficulty-feedback";
import { discussHref, ProblemCommunityHeader } from "@/components/community/discussion-tab";
import { ThreadLockControl } from "@/components/community/mod-controls";
import { SortLinks } from "@/components/community/sort-switch";
import { ReadOnlyBanner, WriteNotice } from "@/components/community/write-notice";
import { NOT_FOUND_TITLE } from "@/components/not-found-content";
import { PageHead } from "@/components/page-head";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import { buttonVariants } from "@/components/ui/button";
import { COMMENT_SORTS, type CommentSort } from "@/lib/community/types";
import { getCurrentUser } from "@/server/auth/session";
import { requireCommunityPage } from "@/server/community/flags";
import { getCommentThread, getDiscussPageData } from "@/server/community/pages";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

type Search = { sort?: string; cursor?: string; comment?: string; rcursor?: string };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const load = cache(async (slug: string, sort: CommentSort, cursor: string | undefined) => {
  const user = await getCurrentUser();
  try {
    return await getDiscussPageData(getDb(), { slug, userId: user?.id ?? null, sort, cursor });
  } catch {
    // A malformed cursor (hand-edited URL): start from the first page.
    return getDiscussPageData(getDb(), { slug, userId: user?.id ?? null, sort });
  }
});

function parseSort(value: string | undefined): CommentSort {
  return (COMMENT_SORTS as readonly string[]).includes(value ?? "") ? (value as CommentSort) : "best";
}

export async function generateMetadata({ params }: PageProps<"/problems/[slug]/discuss">): Promise<Metadata> {
  requireCommunityPage();
  const data = await load((await params).slug, "best", undefined);
  if (!data) return { title: NOT_FOUND_TITLE };
  return {
    title: `Discussion · ${data.summary.number}. ${data.summary.title} · LemmaYard`,
    description: `Questions and insights about ${data.summary.title} on LemmaYard. Solutions are hidden until you solve it.`,
  };
}

/**
 * Full discussion of a problem (docs/specs/community.md §B.2, AC-C-CM-6/8;
 * mockup 08): Best / New as links, cursor pagination, a comment permalink
 * (`?comment=<id>`) with all its replies, the composer at the end. ≤ 5
 * queries; works without JavaScript for reading.
 */
export default async function DiscussPage({ params, searchParams }: PageProps<"/problems/[slug]/discuss">) {
  const flags = requireCommunityPage();
  const { slug } = await params;
  const sp = (await searchParams) as Record<string, string | string[] | undefined>;
  const search: Search = { sort: one(sp.sort), cursor: one(sp.cursor), comment: one(sp.comment), rcursor: one(sp.rcursor) };
  const sort = parseSort(search.sort);
  const data = await load(slug, sort, search.cursor);
  if (!data) notFound();
  const { summary, viewer, page } = data;
  const now = new Date();
  const problemHref = `/problems/${summary.slug}`;
  const here = discussHref(summary.slug, sort === "best" ? {} : { sort });

  // Permalink mode: one top-level comment and all of its replies.
  const thread =
    search.comment && /^[0-9a-f-]{36}$/i.test(search.comment)
      ? await getCommentThread(getDb(), { data, commentId: search.comment, cursor: search.rcursor, now }).catch(() => null)
      : null;
  const focused = thread?.comment ?? null;
  const focusedRepliesCursor = thread?.nextCursor ?? null;

  const count = summary.commentCount;
  return (
    <>
      <PageHead
        crumbs={[
          { label: "Problems", href: "/problems" },
          { label: `${summary.number}. ${summary.title}`, href: problemHref },
          { label: "Discussion" },
        ]}
        title="Discussion"
        subtitle={
          <span className="tabular-nums" data-testid="discussion-count">
            {count === 0 ? "No comments yet" : `${count} ${count === 1 ? "comment" : "comments"}`} on{" "}
            <Link href={problemHref} className="text-link underline underline-offset-4">
              {summary.number}. {summary.title}
            </Link>
          </span>
        }
        actions={viewer.moderator && summary.threadId ? <ThreadLockControl threadId={summary.threadId} locked={summary.locked} /> : undefined}
      />
      <div className="container-page grid max-w-3xl grid-cols-1 gap-6 pt-8 pb-16">
        {flags.readOnly && <ReadOnlyBanner />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ProblemCommunityHeader summary={summary} viewer={viewer} />
          {!focused && (
            <SortLinks
              current={sort}
              hrefs={{ best: discussHref(summary.slug), new: discussHref(summary.slug, { sort: "new" }) }}
            />
          )}
        </div>
        {summary.solved && (
          <DifficultyFeedbackCard
            slug={summary.slug}
            initial={summary.myFeedback}
            rating={summary.rating}
            difficultyLabel={DIFFICULTIES[summary.difficulty].label}
            disabled={!viewer.canWrite}
          />
        )}

        {focused ? (
          <section aria-labelledby="thread-title" className="grid grid-cols-1 gap-4">
            <h2 id="thread-title" className="sr-only">
              One comment and its replies
            </h2>
            <Link href={here} className="text-sm font-semibold text-link hover:underline">
              ← All comments
            </Link>
            <CommentItem view={focused} slug={summary.slug} viewer={viewer} now={now} />
            {focusedRepliesCursor && (
              <Link
                href={discussHref(summary.slug, { comment: focused.id, rcursor: focusedRepliesCursor })}
                className={buttonVariants({ variant: "secondary", className: "justify-self-start" })}
              >
                More replies
              </Link>
            )}
          </section>
        ) : (
          <section aria-labelledby="comments-title" className="grid grid-cols-1 gap-5">
            <h2 id="comments-title" className="sr-only">
              Comments
            </h2>
            {page.comments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-strong px-5 py-8 text-center">
                <p className="font-semibold">{search.cursor ? "No more comments" : "No comments yet"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {search.cursor ? "You reached the end." : "Ask the first question or share what clicked for you."}
                </p>
              </div>
            ) : (
              <CommentList
                comments={page.comments}
                slug={summary.slug}
                viewer={viewer}
                now={now}
                moreRepliesHref={(c) => discussHref(summary.slug, { comment: c.id })}
              />
            )}
            <nav aria-label="Comment pages" className="flex flex-wrap gap-3">
              {search.cursor && (
                <Link href={here} className={buttonVariants({ variant: "ghost" })}>
                  First page
                </Link>
              )}
              {page.nextCursor && (
                <Link
                  href={discussHref(summary.slug, { ...(sort === "best" ? {} : { sort }), cursor: page.nextCursor })}
                  className={buttonVariants({ variant: "secondary" })}
                  data-testid="next-comments"
                >
                  More comments
                </Link>
              )}
            </nav>
          </section>
        )}

        <section aria-labelledby="add-comment-title" className="grid grid-cols-1 gap-3">
          <h2 id="add-comment-title" className="text-base font-semibold">
            Add a comment
          </h2>
          {viewer.canWrite ? (
            <CommentComposer
              mode={{ kind: "create", slug: summary.slug }}
              label="Add a comment"
              placeholder="Add a comment"
              submitLabel="Comment"
            />
          ) : flags.readOnly ? null : (
            <WriteNotice viewer={viewer} loginNext={here} />
          )}
        </section>
      </div>
    </>
  );
}
