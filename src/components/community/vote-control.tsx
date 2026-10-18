"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { communityFetch, loginHref } from "./community-api";

type Value = -1 | 0 | 1;

/**
 * ▲ score ▼ (docs/specs/community.md §B.4, §B.15): two real buttons with
 * `aria-pressed` and full names ("Upvote comment by mkowal"), the net score
 * between them, and a polite live region announcing the new score. Clicking
 * the pressed arrow again removes the vote. Optimistic; reverts on error.
 * Status is never colour alone: the pressed arrow is filled and bold.
 */
export function VoteControl({
  endpoint,
  initialScore,
  initialVote,
  subject,
  signedIn,
  disabledReason,
  scoreFrom,
  size = "default",
  onChange,
}: {
  /** e.g. `/api/comments/<id>/vote`. */
  endpoint: string;
  initialScore: number;
  initialVote: Value;
  /** "comment by mkowal" / "this problem": completes "Upvote …". */
  subject: string;
  signedIn: boolean;
  /** Set when voting is not possible (own comment, deleted …): buttons disabled with this title. */
  disabledReason?: string | null;
  /** Maps the API answer to the shown number (problems show likes, comments the net score). */
  scoreFrom?: (data: Record<string, unknown>) => number;
  size?: "default" | "sm";
  onChange?: (data: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const [vote, setVote] = useState<Value>(initialVote);
  const [score, setScore] = useState(initialScore);
  const [pending, setPending] = useState(false);
  const [announce, setAnnounce] = useState("");

  async function cast(next: Value) {
    if (!signedIn) {
      router.push(loginHref());
      return;
    }
    if (pending) return;
    const target: Value = vote === next ? 0 : next;
    const before = { vote, score };
    // Optimistic net score (problems correct it from the answer).
    setVote(target);
    if (!scoreFrom) setScore(score + (target - vote));
    setPending(true);
    const result = await communityFetch<Record<string, unknown>>(endpoint, "PUT", { value: target });
    setPending(false);
    if (!result.ok) {
      setVote(before.vote);
      setScore(before.score);
      toast.error(result.error, { id: `vote-${endpoint}` });
      return;
    }
    const shown = scoreFrom ? scoreFrom(result.data) : Number(result.data.score ?? score);
    setScore(shown);
    setVote((result.data.myVote as Value | undefined) ?? target);
    setAnnounce(`Score ${shown}`);
    onChange?.(result.data);
  }

  const disabled = Boolean(disabledReason);
  const button =
    "relative inline-grid cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-120 hover:bg-surface-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:text-primary after:absolute after:-inset-1";
  const dims = size === "sm" ? "size-7" : "size-8";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border-strong bg-card p-0.5",
        size === "sm" ? "h-8" : "h-9",
      )}
      title={disabledReason ?? undefined}
    >
      <button
        type="button"
        className={cn(button, dims)}
        aria-pressed={vote === 1}
        aria-label={`Upvote ${subject}`}
        disabled={disabled || pending}
        onClick={() => void cast(1)}
      >
        <ChevronUpIcon aria-hidden className={cn("size-4", vote === 1 && "stroke-[3]")} />
      </button>
      <span
        className={cn(
          "min-w-[2ch] px-0.5 text-center text-sm font-semibold tabular-nums",
          vote === 1 ? "text-primary" : vote === -1 ? "text-foreground-secondary" : "text-foreground",
        )}
        data-testid="vote-score"
      >
        {score}
      </span>
      <button
        type="button"
        className={cn(button, dims)}
        aria-pressed={vote === -1}
        aria-label={`Downvote ${subject}`}
        disabled={disabled || pending}
        onClick={() => void cast(-1)}
      >
        <ChevronDownIcon aria-hidden className={cn("size-4", vote === -1 && "stroke-[3]")} />
      </button>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
