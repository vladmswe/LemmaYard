"use client";

import { PencilIcon, ReplyIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { CommentView } from "@/lib/community/dto";

import { CommentComposer } from "./comment-composer";
import { communityFetch, loginHref } from "./community-api";
import { ReportDialog } from "./report-dialog";
import { VoteControl } from "./vote-control";

const actionClasses = "h-8 gap-1.5 px-2.5 text-muted-foreground";

/**
 * One comment (docs/specs/community.md §B.5, §B.15; mockups 01 and 08): an
 * `<article>` labelled "Comment by <name>, <time>", avatar, name, relative
 * time with the absolute one in `<time datetime>` and a tooltip, "edited",
 * the "Author" chip on replies by the top-level comment's author, the body
 * (server-rendered markdown, a spoiler card or a placeholder, passed in as
 * `body`), then ▲▼, Reply, Edit, Delete, Report. Replies (`replies`) render
 * below. Edit swaps the body for the composer; it is a client shell around
 * server-rendered children.
 */
export function CommentFrame({
  view,
  slug,
  timeLabel,
  absoluteTime,
  body,
  replies,
  signedIn,
  canPost,
}: {
  view: CommentView;
  slug: string;
  timeLabel: string;
  absoluteTime: string;
  body: ReactNode;
  replies?: ReactNode;
  signedIn: boolean;
  /** Viewer may write in this thread now (not read-only / suspended / locked). */
  canPost: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, startTransition] = useTransition();
  const name = view.author?.username ?? (view.kind === "placeholder" ? "deleted" : "deleted user");
  const placeholder = view.kind === "placeholder";
  const subject = `comment by ${name}`;

  async function remove() {
    setDeleting(true);
    const result = await communityFetch(`/api/comments/${view.id}`, "DELETE", {});
    setDeleting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Comment deleted");
    startTransition(() => router.refresh());
  }

  function startReply() {
    if (!signedIn) {
      router.push(loginHref());
      return;
    }
    setReplying(true);
  }

  // A reply to a reply starts with @name and attaches to the top-level comment (server side).
  const replyPrefill = view.depth === 1 && view.author ? `@${view.author.username} ` : "";

  return (
    <article
      id={`comment-${view.id}`}
      tabIndex={-1}
      aria-label={`Comment by ${name}, ${timeLabel}`}
      className="group/comment flex scroll-mt-24 gap-3 rounded-md focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      data-testid="comment"
      data-comment-id={view.id}
    >
      {placeholder ? (
        <span
          aria-hidden
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px] border border-dashed border-border-strong text-[13px] text-muted-foreground"
        >
          ?
        </span>
      ) : (
        <Avatar name={name} className={cn(view.depth === 1 && "size-7 text-xs")} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          {placeholder ? (
            <span className="text-muted-foreground italic">deleted</span>
          ) : view.author ? (
            <a href={`/u/${view.author.username}`} className="font-semibold text-foreground hover:underline">
              {view.author.username}
            </a>
          ) : (
            <span className="font-semibold text-muted-foreground">deleted user</span>
          )}
          {view.isThreadStarter && (
            <span className="rounded-sm border border-border bg-secondary px-1.5 text-[0.72rem] leading-5 font-semibold text-secondary-foreground">
              Author
            </span>
          )}
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <time dateTime={view.createdAt} title={absoluteTime} className="text-muted-foreground">
            {timeLabel}
          </time>
          {view.edited && (
            <>
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
              <span className="text-muted-foreground">edited</span>
            </>
          )}
          {view.status === "hidden_pending" && (
            <span className="ml-1 rounded-sm border border-warning/40 bg-warning-bg px-1.5 text-[0.72rem] leading-5 font-semibold text-warning">
              Waiting for review
            </span>
          )}
        </div>

        <div className="mt-1.5">
          {editing && view.bodyMd !== null ? (
            <CommentComposer
              mode={{ kind: "edit", commentId: view.id }}
              label={`Edit your comment`}
              placeholder="Edit your comment"
              submitLabel="Save"
              initialBody={view.bodyMd}
              initialSpoiler={view.hasSpoiler}
              autoFocus
              compact
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            body
          )}
          {view.status === "hidden_pending" && !editing && (
            <p className="mt-2 text-xs text-muted-foreground">
              Only its author and the moderators can see this until a moderator reviews it.
            </p>
          )}
        </div>

        {!placeholder && !editing && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <VoteControl
              endpoint={`/api/comments/${view.id}/vote`}
              initialScore={view.score}
              initialVote={view.myVote}
              subject={subject}
              signedIn={signedIn}
              size="sm"
              disabledReason={
                !signedIn || view.can.vote
                  ? null
                  : view.can.delete
                    ? "You cannot vote on your own comment"
                    : view.status !== "visible"
                      ? "Voting is closed for this comment"
                      : "Voting is not available right now"
              }
            />
            {(view.can.reply || !signedIn) && canPost !== false && (
              <Button
                variant="ghost"
                size="sm"
                className={actionClasses}
                onClick={startReply}
                aria-expanded={replying}
                aria-label={`Reply to ${name}`}
              >
                <ReplyIcon aria-hidden className="size-3.5" />
                Reply
              </Button>
            )}
            {view.can.edit && (
              <Button variant="ghost" size="sm" className={actionClasses} onClick={() => setEditing(true)} aria-label="Edit your comment">
                <PencilIcon aria-hidden className="size-3.5" />
                Edit
              </Button>
            )}
            {view.can.delete && (
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="ghost" size="sm" className={actionClasses} loading={deleting} />}
                  aria-label="Delete your comment"
                >
                  <Trash2Icon aria-hidden className="size-3.5" />
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {view.replyCount > 0
                        ? "Replies stay; your comment is replaced by “This comment was deleted by its author”."
                        : "It disappears from the discussion. This cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogCancel variant="destructive" onClick={() => void remove()}>
                      Delete
                    </AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {view.can.report && view.author && <ReportDialog commentId={view.id} authorName={view.author.username} />}
          </div>
        )}

        {replying && (
          <div className="mt-3">
            <CommentComposer
              mode={{ kind: "create", slug, parentId: view.id }}
              label={`Reply to ${name}`}
              placeholder={`Reply to ${name}`}
              submitLabel="Reply"
              initialBody={replyPrefill}
              autoFocus
              compact
              onDone={() => setReplying(false)}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}

        {replies}
      </div>
    </article>
  );
}
