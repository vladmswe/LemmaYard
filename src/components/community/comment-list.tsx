import Link from "next/link";

import type { CommentView, ViewerSummary } from "@/lib/community/dto";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

import { CommentFrame } from "./comment-frame";
import { SpoilerCard } from "./spoiler-card";
import { UserMarkdown } from "./user-markdown";

type ListProps = {
  comments: CommentView[];
  slug: string;
  viewer: ViewerSummary;
  now: Date;
  /** Link for "Show N more replies" (the comment's permalink on the full page). */
  moreRepliesHref?: (comment: CommentView) => string;
};

/** Body of one comment: markdown, the spoiler card, or a placeholder sentence. */
async function CommentBody({ view }: { view: CommentView }) {
  if (view.kind === "placeholder") {
    return (
      <p className="text-sm text-muted-foreground italic">
        {view.status === "removed"
          ? `Removed by a moderator${view.removedReason ? `: ${view.removedReason}` : "."}`
          : "This comment was deleted by its author."}
      </p>
    );
  }
  if (view.spoilerMasked || view.bodyMd === null) return <SpoilerCard commentId={view.id} />;
  return <UserMarkdown>{view.bodyMd}</UserMarkdown>;
}

/** One comment with its inline replies (server component). */
export async function CommentItem({ view, slug, viewer, now, moreRepliesHref }: { view: CommentView } & Omit<ListProps, "comments">) {
  const name = view.author?.username ?? "deleted";
  const created = new Date(view.createdAt);
  const canPost = viewer.canWrite || !viewer.signedIn;
  const hiddenReplies = Math.max(0, view.replyCount - view.replies.length);
  return (
    <CommentFrame
      view={view}
      slug={slug}
      timeLabel={formatRelativeTime(created, now)}
      absoluteTime={formatDateTime(created)}
      signedIn={viewer.signedIn}
      canPost={canPost}
      body={<CommentBody view={view} />}
      replies={
        view.replies.length > 0 || view.moreReplies ? (
          <div className="mt-4 border-l-2 border-border-strong pl-4 sm:pl-5">
            <ol aria-label={`Replies to ${name}`} className="grid grid-cols-1 gap-5">
              {view.replies.map((reply) => (
                <li key={reply.id}>
                  <CommentItem view={reply} slug={slug} viewer={viewer} now={now} />
                </li>
              ))}
            </ol>
            {view.moreReplies && moreRepliesHref && (
              <Link
                href={moreRepliesHref(view)}
                className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-link hover:underline"
              >
                {hiddenReplies > 0
                  ? `Show ${hiddenReplies} more ${hiddenReplies === 1 ? "reply" : "replies"}`
                  : "Show more replies"}
              </Link>
            )}
          </div>
        ) : null
      }
    />
  );
}

/** Top-level comments as an ordered list (§B.15: nested `<ol>`s). */
export function CommentList({ comments, ...rest }: ListProps) {
  return (
    <ol aria-label="Comments" className="grid grid-cols-1 divide-y divide-border" data-testid="comment-list">
      {comments.map((view) => (
        <li key={view.id} className="py-5 first:pt-0 last:pb-0">
          <CommentItem view={view} {...rest} />
        </li>
      ))}
    </ol>
  );
}
