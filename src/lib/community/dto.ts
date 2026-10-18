// What the community API and pages hand to the UI (docs/specs/community.md
// §C.2). One serializer on the server builds these (src/server/community/
// comments.ts), so author masking, spoiler masking and placeholders are
// decided in exactly one place. Client-safe types.
import type { CommentSort, ContentStatus, DifficultyFeedback } from "./types";

export type CommentView = {
  id: string;
  parentId: string | null;
  depth: 0 | 1;
  /** Null for deleted / removed placeholders and deleted accounts. */
  author: { username: string } | null;
  /** The reply's author also wrote the top-level comment (the "Author" chip). */
  isThreadStarter: boolean;
  createdAt: string;
  /** "edited" mark (only for edits more than 5 minutes after posting). */
  edited: boolean;
  /** `full` = a normal comment; `placeholder` = deleted / removed (no body, no author). */
  kind: "full" | "placeholder";
  status: ContentStatus;
  /** Null for placeholders and masked spoilers (the body is not sent, AC-C-CM-5). */
  bodyMd: string | null;
  hasSpoiler: boolean;
  spoilerMasked: boolean;
  /** Moderator's reason, on a removed comment's placeholder. */
  removedReason: string | null;
  score: number;
  myVote: -1 | 0 | 1;
  replyCount: number;
  /** Top level only: the first replies, oldest first. */
  replies: CommentView[];
  /** Top level only: more replies exist than are inlined. */
  moreReplies: boolean;
  /** What the viewer may do (UI hints; the API re-checks everything). */
  can: { edit: boolean; delete: boolean; vote: boolean; reply: boolean; report: boolean; moderate: boolean };
};

export type CommentPage = {
  comments: CommentView[];
  nextCursor: string | null;
  sort: CommentSort;
};

export type ProblemCommunitySummary = {
  problemId: string;
  slug: string;
  number: number;
  title: string;
  threadId: string | null;
  commentCount: number;
  locked: boolean;
  likes: number;
  dislikes: number;
  /** Integer percent from 10 votes on, else null (AC-C-VT-4). */
  likePercent: number | null;
  myVote: -1 | 0 | 1;
  /** Null for guests. */
  solved: boolean | null;
  myFeedback: DifficultyFeedback | null;
  feedback: { total: number; verdict: "easier" | "right" | "harder" | null };
  /** Effective rating and difficulty, for the feedback card. */
  rating: number;
  difficulty: "easy" | "medium" | "hard";
};

export type ViewerSummary = {
  signedIn: boolean;
  username: string | null;
  canWrite: boolean;
  /** Why writing is off, for the composer's notice. */
  writeBlock: "guest" | "suspended" | "read_only" | "locked" | null;
  suspendedUntil: string | null;
  trust: 0 | 1;
  moderator: boolean;
};
