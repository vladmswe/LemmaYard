// Community layer (docs/specs/community.md): enum tuples and limits shared by
// the DB schema, the server modules and client components. Pure and
// client-safe (no DB or server imports), like src/lib/rooms. The DB enums in
// src/server/db/schema.ts are built from these tuples, so they never drift.

/** `users.role` (§B.10). Set only by `pnpm user:role <email> <role>`. */
export const USER_ROLES = ["user", "moderator", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Moderators and admins act on content (§B.10). */
export function isModeratorRole(role: UserRole | null | undefined): boolean {
  return role === "moderator" || role === "admin";
}

/** What a discussion thread hangs off (§B.5). C1 uses `problem` only. */
export const THREAD_KINDS = ["problem", "lesson", "post", "room_session"] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];

/** Lifecycle of user content (comments now, posts in C3). */
export const CONTENT_STATUSES = ["visible", "hidden_pending", "removed", "deleted"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * Targets of reports, moderation actions and revisions (polymorphic, no FK).
 * `thread` exists for lock / unlock only (it cannot be reported).
 */
export const REPORT_TARGETS = ["comment", "post", "study_plan", "company", "user", "thread"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "personal_data",
  "nda_confidential",
  "copyright",
  "unmarked_spoiler",
  "off_topic",
  "malware",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Labels for the report dialog and the moderation queue (sentence case). */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or advertising",
  harassment: "Harassment",
  hate: "Hate speech",
  personal_data: "Personal data of others",
  nda_confidential: "NDA or confidential material",
  copyright: "Copyright (copied statement or editorial)",
  unmarked_spoiler: "Unmarked solution spoiler",
  off_topic: "Off topic",
  malware: "Malware or phishing link",
  other: "Something else",
};

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Moderation actions (§B.16 AC-C-RP-3). `dismiss` closes the open reports on a
 * target without changing it; the C3/C4 values are declared now so later
 * phases need no `ALTER TYPE`.
 */
export const MOD_ACTIONS = [
  "hide",
  "restore",
  "remove",
  "lock",
  "unlock",
  "set_spoiler",
  "suspend",
  "unsuspend",
  "dismiss",
  "void_votes",
  "approve_company",
  "merge_company",
] as const;
export type ModAction = (typeof MOD_ACTIONS)[number];

/** Allowed values of a vote (0 = remove my vote). */
export const VOTE_VALUES = [-1, 0, 1] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

/** Difficulty feedback after solving: easier / about right / harder (§A.3). */
export const DIFFICULTY_FEEDBACK_VALUES = [-1, 0, 1] as const;
export type DifficultyFeedback = (typeof DIFFICULTY_FEEDBACK_VALUES)[number];
export const DIFFICULTY_FEEDBACK_LABELS: Record<DifficultyFeedback, string> = {
  [-1]: "Easier",
  0: "About right",
  1: "Harder",
};

/** Comment sort orders (§B.4). Replies are always oldest first. */
export const COMMENT_SORTS = ["best", "new"] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];

/** Limits and thresholds of C1 (§B.5, §B.11, §C.5). */
export const COMMUNITY_LIMITS = {
  bodyMaxChars: 10_000,
  codeBlocksMax: 8,
  codeBlockLinesMax: 200,
  mentionsMax: 5,
  reportDetailsMax: 1_000,
  modReasonMax: 500,
  removedReasonMax: 200,
  /** Request body cap for comment writes (10 000 chars of 4-byte UTF-8 + JSON). */
  bodyMaxBytes: 64 * 1024,
  /** Other community JSON bodies (votes, reports, moderation). */
  smallBodyMaxBytes: 8 * 1024,
  editWindowMs: 24 * 60 * 60 * 1000,
  /** Edits within this grace period after posting show no "edited" mark. */
  editedMarkAfterMs: 5 * 60 * 1000,
  pageSize: 20,
  inlineReplies: 3,
  repliesPageSize: 20,
  /** Workspace tab preview. */
  tabPreview: 5,
  /** "% liked" appears from this many problem votes (AC-C-VT-4). */
  likeMinVotes: 10,
  /** The difficulty-feedback summary appears from this many answers (AC-C-VT-5). */
  feedbackMinAnswers: 10,
  /** Distinct trusted reports that hide content until a moderator decides (§B.11). */
  autoHideReports: 3,
  /** Distinct authors posting the same body within 24 h before later copies are held. */
  spamWaveAuthors: 3,
  /** TL0 accounts younger than this: their first comments with a link are held. */
  newAccountMs: 72 * 60 * 60 * 1000,
  newAccountHeldComments: 3,
  /** Suspension lengths offered in the moderation UI (days). */
  suspensionDays: [7, 30] as const,
} as const;

/** Allowlisted languages of fenced code blocks (§B.5); anything else renders as plain text. */
export const CODE_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "c",
  "go",
  "rust",
  "kotlin",
  "swift",
  "csharp",
  "sql",
  "text",
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** Common fence aliases mapped onto the allowlist ("py" → python). */
export const CODE_LANGUAGE_ALIASES: Record<string, CodeLanguage> = {
  py: "python",
  python3: "python",
  js: "javascript",
  ts: "typescript",
  "c++": "cpp",
  cc: "cpp",
  cs: "csharp",
  "c#": "csharp",
  golang: "go",
  rs: "rust",
  kt: "kotlin",
  txt: "text",
  plaintext: "text",
};

/** The allowlisted language of a fence tag, or null (unknown → plain text). */
export function resolveCodeLanguage(tag: string | null | undefined): CodeLanguage | null {
  if (!tag) return null;
  const lower = tag.trim().toLowerCase();
  if ((CODE_LANGUAGES as readonly string[]).includes(lower)) return lower as CodeLanguage;
  return CODE_LANGUAGE_ALIASES[lower] ?? null;
}
