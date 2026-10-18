// Who may do what with community content (docs/specs/community.md §B.4,
// §B.5, §B.10, §B.11). Pure decisions over plain values: the server modules
// load the rows and call these; the UI uses the same functions to decide
// which buttons to show. HTTP status and error code travel with each "no".
import type { TrustLevel } from "./trust";
import { COMMUNITY_LIMITS, isModeratorRole, type ContentStatus, type UserRole } from "./types";

/** The signed-in user as the community layer sees them (one query, src/server/community/access.ts). */
export type CommunityViewer = {
  id: string;
  username: string;
  role: UserRole;
  trust: TrustLevel;
  suspendedUntil: Date | null;
  createdAt: Date;
};

export type Denial = { status: 401 | 403 | 404 | 409; code: string; message: string; until?: string };
export type Decision = { ok: true } | ({ ok: false } & Denial);

const OK: Decision = { ok: true };
const deny = (status: Denial["status"], code: string, message: string, extra: Partial<Denial> = {}): Decision => ({
  ok: false,
  status,
  code,
  message,
  ...extra,
});

export function isModerator(viewer: Pick<CommunityViewer, "role"> | null): boolean {
  return viewer !== null && isModeratorRole(viewer.role);
}

export function isSuspended(viewer: Pick<CommunityViewer, "suspendedUntil"> | null, now: Date): boolean {
  return viewer?.suspendedUntil != null && viewer.suspendedUntil.getTime() > now.getTime();
}

/** Any community write: signed in and not suspended (AC-C-RP-5). */
export function canWrite(viewer: CommunityViewer | null, now: Date): Decision {
  if (!viewer) return deny(401, "unauthorized", "Log in to continue");
  if (isSuspended(viewer, now)) {
    return deny(403, "suspended", "Your account is suspended from community features.", {
      until: viewer.suspendedUntil!.toISOString(),
    });
  }
  return OK;
}

export type CommentFacts = {
  authorId: string | null;
  status: ContentStatus;
  createdAt: Date;
  depth: 0 | 1;
  replyCount: number;
  hasSpoiler: boolean;
};

/** Author edits for 24 h; a deleted or removed comment cannot be edited (AC-C-CM-3). */
export function canEditComment(comment: CommentFacts, viewer: CommunityViewer | null, now: Date): Decision {
  const write = canWrite(viewer, now);
  if (!write.ok) return write;
  if (comment.authorId !== viewer!.id) return deny(403, "forbidden", "Only the author can edit this comment.");
  if (comment.status === "deleted" || comment.status === "removed") {
    return deny(409, "not_editable", "This comment can no longer be edited.");
  }
  if (now.getTime() - comment.createdAt.getTime() > COMMUNITY_LIMITS.editWindowMs) {
    return deny(409, "edit_window_closed", "Comments can be edited for 24 hours after posting.");
  }
  return OK;
}

/** Author soft delete (AC-C-CM-4); moderators remove instead. */
export function canDeleteComment(comment: CommentFacts, viewer: CommunityViewer | null, now: Date): Decision {
  const write = canWrite(viewer, now);
  if (!write.ok) return write;
  if (comment.authorId !== viewer!.id) return deny(403, "forbidden", "Only the author can delete this comment.");
  if (comment.status === "deleted") return deny(409, "already_deleted", "This comment is already deleted.");
  return OK;
}

/**
 * Votes (AC-C-VT-2): no self-votes and no votes on content that is not
 * visible (409); ▼ needs trust level 1 (403 trust_required). Removing a vote
 * (0) is always allowed on visible content.
 */
export function canVoteOn(
  target: { authorId: string | null; status: ContentStatus },
  viewer: CommunityViewer | null,
  value: -1 | 0 | 1,
  now: Date,
): Decision {
  // Check order (AC-C-GEN-3): role / trust 403 before state 409.
  const allowed = canVoteOnProblem(viewer, value, now);
  if (!allowed.ok) return allowed;
  if (target.authorId !== null && target.authorId === viewer!.id) {
    return deny(409, "self_vote", "You cannot vote on your own comment.");
  }
  if (target.status !== "visible") return deny(409, "not_votable", "This comment cannot be voted on.");
  return OK;
}

/** ▼ on a problem needs the same trust; ▲ needs only a signed-in, unsuspended user. */
export function canVoteOnProblem(viewer: CommunityViewer | null, value: -1 | 0 | 1, now: Date): Decision {
  const write = canWrite(viewer, now);
  if (!write.ok) return write;
  if (value === -1 && viewer!.trust < 1 && !isModerator(viewer)) {
    return deny(
      403,
      "trust_required",
      "Downvotes unlock once your account is 3 days old and has an accepted submission.",
    );
  }
  return OK;
}

/** Reports on comments: never your own, never on deleted content. */
export function canReport(
  target: { authorId: string | null; status: ContentStatus },
  viewer: CommunityViewer | null,
  now: Date,
): Decision {
  const write = canWrite(viewer, now);
  if (!write.ok) return write;
  if (target.authorId !== null && target.authorId === viewer!.id) {
    return deny(409, "own_content", "You cannot report your own comment.");
  }
  if (target.status === "deleted") return deny(409, "not_reportable", "This comment was deleted.");
  return OK;
}

/**
 * How a comment shows up in a list for this viewer (§B.5, AC-C-RP-2):
 * - `full`: body (or spoiler card) with author;
 * - `placeholder`: "deleted by its author" / "removed by a moderator" (only
 *   when replies hang off it, or to its own author for a removal);
 * - `hidden`: not listed at all (no placeholder for hidden_pending).
 */
export type CommentVisibility = "full" | "placeholder" | "hidden";

export function commentVisibility(
  comment: Pick<CommentFacts, "authorId" | "status" | "depth" | "replyCount">,
  viewer: Pick<CommunityViewer, "id" | "role"> | null,
): CommentVisibility {
  const own = viewer !== null && comment.authorId !== null && comment.authorId === viewer.id;
  switch (comment.status) {
    case "visible":
      return "full";
    case "hidden_pending":
      return own || isModerator(viewer) ? "full" : "hidden";
    case "removed":
      if (own || isModerator(viewer)) return "placeholder";
      return comment.depth === 0 && comment.replyCount > 0 ? "placeholder" : "hidden";
    case "deleted":
      return comment.depth === 0 && comment.replyCount > 0 ? "placeholder" : "hidden";
  }
}

/**
 * Whether the body of a "contains a solution" comment is withheld (AC-C-CM-5).
 * A UX courtesy, not access control: authors and solvers see it directly.
 */
export function spoilerMasked(
  comment: Pick<CommentFacts, "hasSpoiler" | "authorId">,
  viewer: Pick<CommunityViewer, "id"> | null,
  viewerSolved: boolean,
): boolean {
  if (!comment.hasSpoiler || viewerSolved) return false;
  return !(viewer !== null && comment.authorId === viewer.id);
}

/** "edited" shows only when the edit came more than 5 minutes after posting. */
export function showEditedMark(createdAt: Date, editedAt: Date | null): boolean {
  return editedAt !== null && editedAt.getTime() - createdAt.getTime() > COMMUNITY_LIMITS.editedMarkAfterMs;
}
