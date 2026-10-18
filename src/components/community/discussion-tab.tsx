import { ArrowRightIcon, MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import { cache } from "react";

import { buttonVariants } from "@/components/ui/button";
import { DIFFICULTIES } from "@/components/problems/difficulty";
import type { CommentPage, ProblemCommunitySummary, ViewerSummary } from "@/lib/community/dto";
import { feedbackSentence } from "@/lib/community/ranking";
import { getDb } from "@/server/db";
import { communityFlags } from "@/server/community/flags";
import { getDiscussionTabData } from "@/server/community/pages";

import { CommentComposer } from "./comment-composer";
import { CommentList } from "./comment-list";
import { DifficultyFeedbackCard } from "./difficulty-feedback";
import { ProblemVote } from "./problem-vote";
import { SortSwitch } from "./sort-switch";
import { ReadOnlyBanner, WriteNotice } from "./write-notice";

// One load per request: the tab label and the tab body share it.
const loadTab = cache((slug: string, userId: string | null) => getDiscussionTabData(getDb(), slug, userId, new Date()));

export function discussHref(slug: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams(params).toString();
  return `/problems/${slug}/discuss${qs ? `?${qs}` : ""}`;
}

/** Problem ▲▼ and the public difficulty summary (both pages). */
export function ProblemCommunityHeader({ summary, viewer }: { summary: ProblemCommunitySummary; viewer: ViewerSummary }) {
  return (
    <div className="grid gap-1.5">
      <ProblemVote
        slug={summary.slug}
        likes={summary.likes}
        dislikes={summary.dislikes}
        likePercent={summary.likePercent}
        myVote={summary.myVote}
        signedIn={viewer.signedIn}
        disabledReason={viewer.signedIn && !viewer.canWrite && viewer.writeBlock !== "locked" ? "Voting is not available right now" : null}
      />
      {summary.feedback.verdict && (
        <p className="text-sm text-muted-foreground" data-testid="difficulty-summary">
          {feedbackSentence(summary.feedback.verdict)} (n = {summary.feedback.total})
        </p>
      )}
    </div>
  );
}

function TabList({ page, summary, viewer, now }: { page: CommentPage; summary: ProblemCommunitySummary; viewer: ViewerSummary; now: Date }) {
  if (page.comments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center">
        <MessagesSquareIcon aria-hidden className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold">No comments yet</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Ask the first question or share what clicked for you.</p>
      </div>
    );
  }
  return (
    <CommentList
      comments={page.comments}
      slug={summary.slug}
      viewer={viewer}
      now={now}
      moreRepliesHref={(c) => discussHref(summary.slug, { comment: c.id })}
    />
  );
}

/**
 * The problem workspace's Discussion tab (docs/specs/community.md §B.3,
 * AC-C-CM-7; mockup 01): problem ▲▼ with "% liked", the difficulty card for
 * solvers, the composer, then the top 5 comments by Best or New and a link
 * to the full discussion. Rendered in its own Suspense boundary so the
 * statement never waits for it (≤ 3 queries).
 */
export async function DiscussionTab({ slug, userId }: { slug: string; userId: string | null }) {
  const now = new Date();
  const data = await loadTab(slug, userId);
  if (!data) return null;
  const { summary, viewer, best, latest } = data;
  const flags = communityFlags();
  const total = summary.commentCount;

  return (
    <div className="grid grid-cols-1 gap-5 px-4 pt-4 pb-10 md:px-6" data-testid="discussion-tab">
      <h2 className="sr-only">Discussion</h2>
      {flags.readOnly && <ReadOnlyBanner />}
      <SortSwitch
        header={<ProblemCommunityHeader summary={summary} viewer={viewer} />}
        best={<TabList page={best} summary={summary} viewer={viewer} now={now} />}
        latest={<TabList page={latest} summary={summary} viewer={viewer} now={now} />}
        between={
          <>
            {summary.solved && (
              <DifficultyFeedbackCard
                slug={summary.slug}
                initial={summary.myFeedback}
                rating={summary.rating}
                difficultyLabel={DIFFICULTIES[summary.difficulty].label}
                disabled={!viewer.canWrite}
              />
            )}
            {viewer.canWrite ? (
              <CommentComposer
                mode={{ kind: "create", slug: summary.slug }}
                label="Add a comment"
                placeholder="Ask a question or share an insight. Mark full solutions as spoilers."
                submitLabel="Comment"
              />
            ) : (
              <WriteNotice viewer={viewer} loginNext={`/problems/${summary.slug}`} />
            )}
          </>
        }
      />
      {total > 0 && (
        <Link
          href={discussHref(summary.slug)}
          className={buttonVariants({ variant: "secondary", className: "justify-self-start" })}
          data-testid="open-full-discussion"
        >
          Open the full discussion ({total})
          <ArrowRightIcon data-arrow aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** "Discussion 14": the count for the tab label, from the same cached summary query. */
export async function DiscussionCount({ slug, userId }: { slug: string; userId: string | null }) {
  const data = await loadTab(slug, userId);
  const n = data?.summary.commentCount ?? 0;
  if (n === 0) return null;
  return (
    <span className="rounded-sm border border-border bg-surface-sunken px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums">
      {n}
      <span className="sr-only"> comments</span>
    </span>
  );
}

/** Mobile (< 768px): the Problem tab links to the full discussion page instead of a fourth tab. */
export async function DiscussionMobileLink({ slug, userId }: { slug: string; userId: string | null }) {
  const data = await loadTab(slug, userId);
  if (!data) return null;
  const n = data.summary.commentCount;
  return (
    <div className="border-t px-4 py-4">
      <Link
        href={discussHref(slug)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent"
        data-testid="mobile-discussion-link"
      >
        <span className="inline-flex items-center gap-2">
          <MessagesSquareIcon aria-hidden className="size-4 text-muted-foreground" />
          Discussion
          <span className="font-normal text-muted-foreground tabular-nums">
            {n === 0 ? "No comments yet" : `${n} ${n === 1 ? "comment" : "comments"}`}
          </span>
        </span>
        <ArrowRightIcon aria-hidden className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
