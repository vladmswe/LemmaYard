"use client";

import { useState } from "react";

import { COMMUNITY_LIMITS } from "@/lib/community/types";

import { VoteControl } from "./vote-control";

function likeLine(likes: number, dislikes: number, percent: number | null): string {
  const total = likes + dislikes;
  const votes = `${total} ${total === 1 ? "vote" : "votes"}`;
  if (percent === null) return total === 0 ? "No votes yet" : votes;
  return `${percent}% liked · ${votes}`;
}

/**
 * ▲▼ on the problem itself (docs/specs/community.md §B.4, AC-C-VT-4): the
 * number is the like count; "% liked" appears from 10 votes.
 */
export function ProblemVote({
  slug,
  likes,
  dislikes,
  likePercent,
  myVote,
  signedIn,
  disabledReason,
}: {
  slug: string;
  likes: number;
  dislikes: number;
  likePercent: number | null;
  myVote: -1 | 0 | 1;
  signedIn: boolean;
  disabledReason?: string | null;
}) {
  const [counts, setCounts] = useState({ likes, dislikes, percent: likePercent });
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <VoteControl
        endpoint={`/api/problems/${slug}/vote`}
        initialScore={likes}
        initialVote={myVote}
        subject="this problem"
        signedIn={signedIn}
        disabledReason={disabledReason}
        scoreFrom={(data) => Number(data.likes ?? 0)}
        onChange={(data) => {
          const l = Number(data.likes ?? 0);
          const d = Number(data.dislikes ?? 0);
          setCounts({
            likes: l,
            dislikes: d,
            percent:
              typeof data.likePercent === "number"
                ? data.likePercent
                : l + d >= COMMUNITY_LIMITS.likeMinVotes
                  ? Math.floor((l * 100) / (l + d) + 0.5)
                  : null,
          });
        }}
      />
      <span className="text-sm text-muted-foreground tabular-nums" data-testid="problem-like-line">
        {likeLine(counts.likes, counts.dislikes, counts.percent)}
      </span>
    </div>
  );
}
