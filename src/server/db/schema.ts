// Database schema (PLAN.md section 4). All schema changes happen in M1 only,
// except migration 0002 (deploy phase): row level security on every table,
// without policies. The app connects as the table owner and bypasses RLS;
// other roles (e.g. Supabase's REST API roles) are denied by default.
// Migration 0003 (Rooms, docs/specs/rooms.md) is the first feature migration.
// Migration 0004 (Rooms v2, docs/specs/rooms-v2.md §8, owner decision D2:
// ratings are PER ROOM, stored on room_members) adds columns only.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { CompareSpec, Signature } from "@/lib/problems/schema";

// Relative (not `@/`) imports for runtime values: drizzle-kit loads this file
// without the tsconfig path alias.
import { wilsonSql } from "../../lib/community/ranking";
import {
  CONTENT_STATUSES,
  MOD_ACTIONS,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGETS,
  THREAD_KINDS,
  USER_ROLES,
} from "../../lib/community/types";
import { ROOM_EVENT_TYPES } from "../../lib/rooms/events";
import type { RoomSchedule, SessionTemplate } from "../../lib/rooms/room-defaults";
import {
  RATING_SOURCES,
  ROOM_ROLES,
  ROOM_SESSION_STATUSES,
  type RoomSessionSettings,
} from "../../lib/rooms/types";

export const difficultyEnum = pgEnum("difficulty", ["easy", "medium", "hard"]);
export const submissionKindEnum = pgEnum("submission_kind", ["run", "submit"]);
export const languageEnum = pgEnum("language", ["python", "javascript"]);
export const submissionStatusEnum = pgEnum("submission_status", [
  "queued",
  "running",
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
  "internal_error",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Community C1 (docs/specs/community.md §B.10): set only by `pnpm user:role`. */
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    /**
     * Rooms v2 §6.4: optional self-reported LeetCode contest rating. Private
     * (only its owner reads it); only seeds a member's first rating in a room.
     */
    leetcodeRating: smallint("leetcode_rating"),
    createdAt: createdAt(),
    /** Community C1: user | moderator | admin (CLI only, no UI). */
    role: userRoleEnum("role").notNull().default("user"),
    /** Community C1: no community writes until this time (reads, practice, rooms still work). */
    communitySuspendedUntil: timestamp("community_suspended_until", { withTimezone: true }),
  },
  (t) => [
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_username_format", sql`${t.username} ~ '^[a-z0-9_]{3,20}$'`),
    check(
      "users_leetcode_rating_range",
      sql`${t.leetcodeRating} IS NULL OR ${t.leetcodeRating} BETWEEN 0 AND 4000`,
    ),
  ],
).enableRLS();

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    difficulty: difficultyEnum("difficulty").notNull(),
    descriptionMd: text("description_md").notNull(),
    signature: jsonb("signature").$type<Signature>().notNull(),
    compare: jsonb("compare").$type<CompareSpec>().notNull(),
    timeLimitMs: integer("time_limit_ms").notNull(),
    memoryLimitMb: integer("memory_limit_mb").notNull(),
    published: boolean("published").notNull().default(false),
    /** Rooms v2: `meta.json` "rating"; null → band default (easy 1200, medium 1600, hard 2000). */
    authorRating: smallint("author_rating"),
    /** Rooms v2: observed drift from rated sessions (global per problem); never written by the importer. */
    ratingAdjust: smallint("rating_adjust").notNull().default(0),
    /** Community C1: ▲/▼ counters, kept in the vote's transaction (`pnpm community:recount` rebuilds them). */
    likeCount: integer("like_count").notNull().default(0),
    dislikeCount: integer("dislike_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("problems_difficulty_idx").on(t.difficulty),
    index("problems_published_idx").on(t.published),
    check("problems_number_positive", sql`${t.number} > 0`),
    check("problems_time_limit_positive", sql`${t.timeLimitMs} > 0`),
    check("problems_memory_limit_positive", sql`${t.memoryLimitMb} > 0`),
    check(
      "problems_author_rating",
      sql`${t.authorRating} IS NULL OR ${t.authorRating} BETWEEN 800 AND 3000`,
    ),
    check("problems_rating_adjust", sql`${t.ratingAdjust} BETWEEN -200 AND 200`),
    check("problems_vote_counts", sql`${t.likeCount} >= 0 AND ${t.dislikeCount} >= 0`),
  ],
).enableRLS();

export const tags = pgTable("tags", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
}).enableRLS();

export const problemTags = pgTable(
  "problem_tags",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.tagId] }),
    index("problem_tags_tag_idx").on(t.tagId),
  ],
).enableRLS();

export const testCases = pgTable(
  "test_cases",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    expected: jsonb("expected").$type<unknown>().notNull(),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [
    unique("test_cases_problem_position_unique").on(t.problemId, t.position),
    check("test_cases_position_nonnegative", sql`${t.position} >= 0`),
  ],
).enableRLS();

/** `{input, expected, actual}` of the first failing test of a submit. */
export type FailedCase = { input: unknown; expected: unknown; actual: unknown };

/**
 * Per-case result of a Run. Frozen contract shared by M4 (executor) and M5
 * (API/UI), PLAN.md section 4: import it from here. Harness statuses
 * (`ok|error|timeout`) are mapped by the executor into this union. For custom
 * input `expected` is absent and a successful run is `passed`.
 */
export type CaseResultStatus =
  | "passed"
  | "failed"
  | "runtime_error"
  | "time_limit"
  | "memory_limit"
  | "not_run";

export type CaseResult = {
  index: number;
  status: CaseResultStatus;
  input: Record<string, unknown>;
  expected?: unknown;
  actual?: unknown;
  timeMs?: number;
  error?: string;
};

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    kind: submissionKindEnum("kind").notNull(),
    language: languageEnum("language").notNull(),
    code: text("code").notNull(),
    customInput: jsonb("custom_input").$type<Record<string, unknown>>(),
    status: submissionStatusEnum("status").notNull().default("queued"),
    runtimeMs: integer("runtime_ms"),
    memoryKb: integer("memory_kb"),
    passedCount: integer("passed_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    failedTestIndex: integer("failed_test_index"),
    failedCase: jsonb("failed_case").$type<FailedCase>(),
    caseResults: jsonb("case_results").$type<CaseResult[]>(),
    stdout: text("stdout"),
    error: text("error"),
    workerId: text("worker_id"),
    /** Rooms (F6): the session this submit counts for; set explicitly by the client. */
    roomSessionId: uuid("room_session_id").references((): AnyPgColumn => roomSessions.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("submissions_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("submissions_problem_kind_status_idx").on(
      t.problemId,
      t.kind,
      t.status,
    ),
    index("submissions_queued_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'queued'`),
    index("submissions_running_idx")
      .on(t.status, t.startedAt)
      .where(sql`${t.status} = 'running'`),
    // Active-submission limit per user (queued + running).
    index("submissions_user_active_idx")
      .on(t.userId)
      .where(sql`${t.status} IN ('queued', 'running')`),
    // Run rows by age (PLAN.md section 4).
    index("submissions_run_created_idx")
      .on(t.createdAt)
      .where(sql`${t.kind} = 'run'`),
    // Per-problem history of a user.
    index("submissions_user_problem_created_idx").on(
      t.userId,
      t.problemId,
      t.createdAt.desc(),
    ),
    // Rooms: outcome recompute (Q9) and pending judging (Q10).
    index("submissions_room_session_idx")
      .on(t.roomSessionId, t.userId, t.problemId, t.createdAt)
      .where(sql`${t.roomSessionId} IS NOT NULL`),
    check(
      "submissions_room_session_submit_only",
      sql`${t.roomSessionId} IS NULL OR ${t.kind} = 'submit'`,
    ),
    check(
      "submissions_counts_valid",
      sql`${t.passedCount} >= 0 AND ${t.totalCount} >= 0 AND ${t.passedCount} <= ${t.totalCount}`,
    ),
    check(
      "submissions_running_started",
      sql`${t.status} <> 'running' OR ${t.startedAt} IS NOT NULL`,
    ),
    check(
      "submissions_final_finished",
      sql`${t.status} IN ('queued', 'running') OR ${t.finishedAt} IS NOT NULL`,
    ),
    check(
      "submissions_metrics_nonnegative",
      sql`(${t.runtimeMs} IS NULL OR ${t.runtimeMs} >= 0) AND (${t.memoryKb} IS NULL OR ${t.memoryKb} >= 0)`,
    ),
    check(
      "submissions_failed_index_range",
      sql`${t.failedTestIndex} IS NULL OR (${t.failedTestIndex} >= 0 AND ${t.failedTestIndex} < ${t.totalCount})`,
    ),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Rooms (F6, docs/specs/rooms.md §6): private friend rooms with timed
// sessions. Migration 0003. Every table has RLS enabled and no policies.
// Pure domain logic for these tables lives in src/lib/rooms/.
// ---------------------------------------------------------------------------

export const roomRoleEnum = pgEnum("room_role", ROOM_ROLES);
export const roomSessionStatusEnum = pgEnum("room_session_status", ROOM_SESSION_STATUSES);
export const roomEventTypeEnum = pgEnum("room_event_type", ROOM_EVENT_TYPES);
export const ratingSourceEnum = pgEnum("rating_source", RATING_SOURCES);

export type { RoomSessionSettings };

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** sha256(token) as 64 hex chars; null = invite link turned off. */
    inviteTokenHash: text("invite_token_hash").unique(),
    inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
    shareSolutions: boolean("share_solutions").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    // Rooms v2 §4, §5, §10: profile, presets (NULL = code default), weekly schedule.
    description: text("description"),
    color: smallint("color").notNull().default(0),
    presets: jsonb("presets").$type<SessionTemplate[]>(),
    defaultPresetId: text("default_preset_id"),
    schedule: jsonb("schedule").$type<RoomSchedule>(),
  },
  (t) => [
    check("rooms_name_length", sql`char_length(${t.name}) BETWEEN 1 AND 60`),
    check(
      "rooms_description",
      sql`${t.description} IS NULL OR (char_length(${t.description}) <= 200 AND ${t.description} !~ '[[:cntrl:]]')`,
    ),
    check("rooms_color", sql`${t.color} BETWEEN 0 AND 7`),
    check(
      "rooms_presets",
      sql`${t.presets} IS NULL OR (jsonb_typeof(${t.presets}) = 'array' AND octet_length(${t.presets}::text) <= 4096)`,
    ),
    check(
      "rooms_schedule",
      sql`${t.schedule} IS NULL OR (jsonb_typeof(${t.schedule}) = 'object' AND octet_length(${t.schedule}::text) <= 512)`,
    ),
    check(
      "rooms_invite_hash_format",
      sql`${t.inviteTokenHash} IS NULL OR ${t.inviteTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "rooms_invite_pair",
      sql`(${t.inviteTokenHash} IS NULL) = (${t.inviteExpiresAt} IS NULL)`,
    ),
    // Creation rate limit (5/hour per user).
    index("rooms_created_by_idx").on(t.createdBy, t.createdAt),
  ],
).enableRLS();

export const roomMembers = pgTable(
  "room_members",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roomRoleEnum("role").notNull().default("member"),
    /** Per-member opt-out of solution sharing (owner decision D2). */
    shareSolutions: boolean("share_solutions").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Rooms v2 (owner decision D2): the member's rating IN THIS ROOM. Null
     * until first needed (join, lobby, start), then seeded per §6.4.
     * Provisional while `rated_pairs` < 8.
     */
    rating: smallint("rating"),
    ratedPairs: integer("rated_pairs").notNull().default(0),
    ratedSessions: integer("rated_sessions").notNull().default(0),
    ratingSource: ratingSourceEnum("rating_source"),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    check("room_members_rating_range", sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 400 AND 3500`),
    check("room_members_rating_source", sql`(${t.rating} IS NULL) = (${t.ratingSource} IS NULL)`),
    check(
      "room_members_rated_counts",
      sql`${t.ratedPairs} >= 0 AND ${t.ratedSessions} >= 0 AND ${t.ratedSessions} <= ${t.ratedPairs}`,
    ),
    // My rooms (Q1), owned/membership counts.
    index("room_members_user_idx").on(t.userId, t.joinedAt.desc()),
    // At most one owner per room ("exactly one" is kept by the app).
    uniqueIndex("room_members_one_owner").on(t.roomId).where(sql`${t.role} = 'owner'`),
  ],
).enableRLS();

export const roomSessions = pgTable(
  "room_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    hostId: uuid("host_id").references(() => users.id, { onDelete: "set null" }),
    status: roomSessionStatusEnum("status").notNull().default("lobby"),
    durationMin: smallint("duration_min").notNull().default(90),
    problemCount: smallint("problem_count").notNull().default(4),
    settings: jsonb("settings").$type<RoomSessionSettings>().notNull(),
    plannedFor: timestamp("planned_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** 'time' | 'host' (finished), 'cancelled' | 'stale' (cancelled). */
    endReason: text("end_reason"),
    rerolledProblemIds: uuid("rerolled_problem_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    rerollCount: smallint("reroll_count").notNull().default(0),
    createdAt: createdAt(),
    /** Rooms v2 §6.2: results change the room's ratings. */
    rated: boolean("rated").notNull().default(true),
    /** Set once, when the ratings were applied (idempotency guard). */
    ratedAt: timestamp("rated_at", { withTimezone: true }),
  },
  (t) => [
    check("room_sessions_rated_at", sql`${t.ratedAt} IS NULL OR (${t.status} = 'finished' AND ${t.rated})`),
    check(
      "room_sessions_duration",
      sql`${t.durationMin} BETWEEN 15 AND 240 AND ${t.durationMin} % 5 = 0`,
    ),
    check("room_sessions_count", sql`${t.problemCount} BETWEEN 1 AND 8`),
    check("room_sessions_reroll_cap", sql`${t.rerollCount} BETWEEN 0 AND 30`),
    check(
      "room_sessions_end_reason",
      sql`${t.endReason} IS NULL OR ${t.endReason} IN ('time', 'host', 'cancelled', 'stale')`,
    ),
    // Status, timestamps and end reason must agree (stricter than the spec
    // sketch: ends_at and end_reason are pinned per state too). The explicit
    // IS NOT NULL keeps a NULL end_reason from making the CHECK unknown (= pass).
    check(
      "room_sessions_state",
      sql`(${t.status} = 'lobby' AND ${t.startedAt} IS NULL AND ${t.endsAt} IS NULL AND ${t.endedAt} IS NULL AND ${t.endReason} IS NULL)
        OR (${t.status} = 'live' AND ${t.startedAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.endedAt} IS NULL AND ${t.endReason} IS NULL)
        OR (${t.status} = 'finished' AND ${t.startedAt} IS NOT NULL AND ${t.endsAt} IS NOT NULL AND ${t.endedAt} IS NOT NULL AND ${t.endReason} IS NOT NULL AND ${t.endReason} IN ('time', 'host'))
        OR (${t.status} = 'cancelled' AND ${t.startedAt} IS NULL AND ${t.endsAt} IS NULL AND ${t.endedAt} IS NOT NULL AND ${t.endReason} IS NOT NULL AND ${t.endReason} IN ('cancelled', 'stale'))`,
    ),
    check(
      "room_sessions_ends",
      sql`${t.endsAt} IS NULL OR ${t.endsAt} = ${t.startedAt} + make_interval(mins => ${t.durationMin}::int)`,
    ),
    // One open session per room; also serves Q1's "open session" lookup.
    uniqueIndex("room_sessions_one_open")
      .on(t.roomId)
      .where(sql`${t.status} IN ('lobby', 'live')`),
    // History, leaderboard, calibration window (Q2, Q4, Q5).
    index("room_sessions_room_finished_idx")
      .on(t.roomId, t.startedAt.desc())
      .where(sql`${t.status} = 'finished'`),
    // Repeat avoidance (Q7) and session creation rate per room.
    index("room_sessions_room_status_idx").on(t.roomId, t.status),
    // Rooms v2: the worker's backstop for ratings not applied yet (pending judging at the end).
    index("room_sessions_unrated_idx")
      .on(t.endedAt)
      .where(sql`${t.status} = 'finished' AND ${t.rated} AND ${t.ratedAt} IS NULL`),
  ],
).enableRLS();

export const roomSessionProblems = pgTable(
  "room_session_problems",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => roomSessions.id, { onDelete: "cascade" }),
    position: smallint("position").notNull(),
    // RESTRICT: problems are unpublished, never deleted; history must keep them.
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "restrict" }),
    /** Snapshot at pick time (calibration). */
    difficulty: difficultyEnum("difficulty").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    /** Rooms v2: effective problem rating at session start, and its change when ratings were applied. */
    ratingAtStart: smallint("rating_at_start"),
    ratingDelta: smallint("rating_delta"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.position] }),
    unique("room_session_problems_unique_problem").on(t.sessionId, t.problemId),
    check("room_session_problems_position", sql`${t.position} BETWEEN 1 AND 8`),
    index("room_session_problems_problem_idx").on(t.problemId),
  ],
).enableRLS();

export const roomSessionParticipants = pgTable(
  "room_session_participants",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => roomSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    solvedCount: smallint("solved_count").notNull().default(0),
    penaltySec: integer("penalty_sec").notNull().default(0),
    /** Null until the first scoring pass. */
    rank: smallint("rank"),
    /** Rooms v2: the member's room rating at start (or at a late join). */
    ratingAtStart: smallint("rating_at_start"),
    /** Null until ratings were applied; 0 when not active (no counted submit). */
    ratingDelta: smallint("rating_delta"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.userId] }),
    // Member timeline (Q3).
    index("room_session_participants_user_idx").on(t.userId, t.sessionId),
    check(
      "room_session_participants_nonneg",
      sql`${t.solvedCount} BETWEEN 0 AND 8 AND ${t.penaltySec} >= 0 AND (${t.rank} IS NULL OR ${t.rank} >= 1)`,
    ),
  ],
).enableRLS();

export const roomSessionResults = pgTable(
  "room_session_results",
  {
    sessionId: uuid("session_id").notNull(),
    userId: uuid("user_id").notNull(),
    position: smallint("position").notNull(),
    attempts: smallint("attempts").notNull().default(0),
    wrongBeforeAccept: smallint("wrong_before_accept").notNull().default(0),
    firstAcceptedAt: timestamp("first_accepted_at", { withTimezone: true }),
    firstAcceptedSubmissionId: uuid("first_accepted_submission_id").references(
      () => submissions.id,
      { onDelete: "set null" },
    ),
    solveSeconds: integer("solve_seconds"),
    /** Had an accepted submit for the problem before started_at ("Solved before"). */
    solvedBefore: boolean("solved_before").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.userId, t.position] }),
    foreignKey({
      name: "room_session_results_participant_fk",
      columns: [t.sessionId, t.userId],
      foreignColumns: [roomSessionParticipants.sessionId, roomSessionParticipants.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "room_session_results_problem_fk",
      columns: [t.sessionId, t.position],
      foreignColumns: [roomSessionProblems.sessionId, roomSessionProblems.position],
    }).onDelete("cascade"),
    // Deleting a submission (user deletion, run pruning) must not scan this table.
    index("room_session_results_submission_idx")
      .on(t.firstAcceptedSubmissionId)
      .where(sql`${t.firstAcceptedSubmissionId} IS NOT NULL`),
    check(
      "room_session_results_solved_pair",
      sql`(${t.firstAcceptedAt} IS NULL) = (${t.solveSeconds} IS NULL)`,
    ),
    // A solved cell has the accepted attempt itself on top of the wrong ones.
    check(
      "room_session_results_counts",
      sql`${t.attempts} >= 0 AND ${t.wrongBeforeAccept} BETWEEN 0 AND ${t.attempts}
        AND (${t.solveSeconds} IS NULL OR ${t.solveSeconds} >= 0)
        AND (${t.firstAcceptedAt} IS NULL OR ${t.attempts} > ${t.wrongBeforeAccept})`,
    ),
  ],
).enableRLS();

export const roomEvents = pgTable(
  "room_events",
  {
    /** Cursor. Allocated in commit order per session via the session advisory lock. */
    id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => roomSessions.id, { onDelete: "cascade" }),
    type: roomEventTypeEnum("type").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    // Replay by cursor (Q6).
    index("room_events_session_id_idx").on(t.sessionId, t.id),
    // One solve event per (session, user, position), even if outcome code runs twice.
    uniqueIndex("room_events_one_solve")
      .on(t.sessionId, t.actorUserId, sql`(${t.payload} ->> 'position')`)
      .where(sql`${t.type} = 'problem_solved'`),
    check("room_events_payload_size", sql`octet_length(${t.payload}::text) <= 2048`),
    // Without a numeric position the one-solve index could not deduplicate.
    check(
      "room_events_solve_position",
      sql`${t.type} <> 'problem_solved' OR coalesce(jsonb_typeof(${t.payload} -> 'position'), '') = 'number'`,
    ),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// Community C1 (docs/specs/community.md §C.1): discussion threads, comments,
// votes on comments and problems, difficulty feedback, reports, moderation
// log and revisions. Migration `community_c1`. Every table has RLS enabled
// and no policies; text columns carry length and control-character CHECKs.
// Counters are kept in the write's transaction (`pnpm community:recount`
// rebuilds them). Pure rules live in src/lib/community/.
// ---------------------------------------------------------------------------

export const threadKindEnum = pgEnum("thread_kind", THREAD_KINDS);
export const contentStatusEnum = pgEnum("content_status", CONTENT_STATUSES);
export const reportTargetEnum = pgEnum("report_target", REPORT_TARGETS);
export const reportReasonEnum = pgEnum("report_reason", REPORT_REASONS);
export const reportStatusEnum = pgEnum("report_status", REPORT_STATUSES);
export const modActionEnum = pgEnum("mod_action", MOD_ACTIONS);

/** No C0 control characters except tab / LF / CR (and no DEL). */
const noControl = (column: AnyPgColumn) =>
  sql`${column} !~ '[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'`;

export const discussionThreads = pgTable(
  "discussion_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: threadKindEnum("kind").notNull(),
    problemId: uuid("problem_id").references(() => problems.id, { onDelete: "cascade" }),
    /** C5: lesson threads (validated in code against published lessons). */
    lessonSlug: text("lesson_slug"),
    /** C3 adds the FK to posts. */
    postId: uuid("post_id"),
    /** C5 adds the FK to room_sessions. */
    roomSessionId: uuid("room_session_id"),
    /** Visible comments (top level + replies). */
    commentCount: integer("comment_count").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "discussion_threads_one_target",
      sql`num_nonnulls(${t.problemId}, ${t.lessonSlug}, ${t.postId}, ${t.roomSessionId}) = 1`,
    ),
    check(
      "discussion_threads_kind_target",
      sql`(${t.kind} = 'problem' AND ${t.problemId} IS NOT NULL)
        OR (${t.kind} = 'lesson' AND ${t.lessonSlug} IS NOT NULL)
        OR (${t.kind} = 'post' AND ${t.postId} IS NOT NULL)
        OR (${t.kind} = 'room_session' AND ${t.roomSessionId} IS NOT NULL)`,
    ),
    check("discussion_threads_lesson_slug", sql`${t.lessonSlug} IS NULL OR ${t.lessonSlug} ~ '^[a-z0-9-]{1,100}$'`),
    check("discussion_threads_comment_count", sql`${t.commentCount} >= 0`),
    // NULLs are distinct: one thread per target.
    uniqueIndex("discussion_threads_problem_unique").on(t.problemId),
    uniqueIndex("discussion_threads_lesson_unique").on(t.lessonSlug),
    uniqueIndex("discussion_threads_post_unique").on(t.postId),
    uniqueIndex("discussion_threads_room_session_unique").on(t.roomSessionId),
  ],
).enableRLS();

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => discussionThreads.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    /** 0 = top level, 1 = reply (two levels only, §B.5). */
    depth: smallint("depth").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    bodyMd: text("body_md").notNull(),
    /** sha256 hex of normalizeForHash(body): duplicate and spam-wave detection. */
    bodyHash: text("body_hash").notNull(),
    hasSpoiler: boolean("has_spoiler").notNull().default(false),
    upCount: integer("up_count").notNull().default(0),
    downCount: integer("down_count").notNull().default(0),
    /** Visible replies (top-level comments only). */
    replyCount: integer("reply_count").notNull().default(0),
    score: integer("score").generatedAlwaysAs(sql`up_count - down_count`),
    /** Wilson lower bound at 95 % (src/lib/community/ranking.ts, parity-tested). */
    rankBest: doublePrecision("rank_best").generatedAlwaysAs(sql.raw(wilsonSql("up_count", "down_count"))),
    status: contentStatusEnum("status").notNull().default("visible"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedReason: text("removed_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("comments_depth", sql`${t.depth} IN (0, 1)`),
    check("comments_parent_depth", sql`(${t.parentId} IS NULL) = (${t.depth} = 0)`),
    check("comments_body", sql`char_length(${t.bodyMd}) <= 10000 AND ${noControl(t.bodyMd)}`),
    check("comments_body_hash", sql`${t.bodyHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "comments_counts",
      sql`${t.upCount} >= 0 AND ${t.downCount} >= 0 AND ${t.replyCount} >= 0`,
    ),
    check(
      "comments_removed_reason",
      sql`${t.removedReason} IS NULL OR (char_length(${t.removedReason}) BETWEEN 1 AND 200 AND ${noControl(t.removedReason)})`,
    ),
    // A visible body is never empty; deleted ones are cleared.
    check("comments_body_present", sql`${t.status} = 'deleted' OR char_length(${t.bodyMd}) >= 1`),
    check("comments_deleted_at", sql`(${t.status} = 'deleted') = (${t.deletedAt} IS NOT NULL)`),
    index("comments_thread_best_idx")
      .on(t.threadId, t.depth, t.rankBest.desc(), t.createdAt.desc(), t.id)
      .where(sql`${t.status} = 'visible'`),
    index("comments_thread_new_idx")
      .on(t.threadId, t.depth, t.createdAt.desc(), t.id)
      .where(sql`${t.status} = 'visible'`),
    index("comments_parent_idx").on(t.parentId, t.createdAt, t.id),
    // Rate limits, export, profile.
    index("comments_author_idx").on(t.authorId, t.createdAt.desc()),
    // Duplicate detection.
    index("comments_body_hash_idx").on(t.bodyHash, t.createdAt.desc()),
    index("comments_status_idx").on(t.status, t.createdAt).where(sql`${t.status} = 'hidden_pending'`),
  ],
).enableRLS();

export const commentVotes = pgTable(
  "comment_votes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId] }),
    check("comment_votes_value", sql`${t.value} IN (-1, 1)`),
    index("comment_votes_user_idx").on(t.userId, t.updatedAt.desc()),
  ],
).enableRLS();

export const problemVotes = pgTable(
  "problem_votes",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.userId] }),
    check("problem_votes_value", sql`${t.value} IN (-1, 1)`),
    index("problem_votes_user_idx").on(t.userId, t.updatedAt.desc()),
  ],
).enableRLS();

/** Easier (−1) / about right (0) / harder (+1). Never feeds ratings (AC-C-VT-5). */
export const problemDifficultyFeedback = pgTable(
  "problem_difficulty_feedback",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: smallint("value").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.userId] }),
    check("problem_difficulty_feedback_value", sql`${t.value} IN (-1, 0, 1)`),
    index("problem_difficulty_feedback_user_idx").on(t.userId, t.updatedAt.desc()),
  ],
).enableRLS();

/** Polymorphic on purpose: no FK on target_id (audit records outlive targets; validated on insert). */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: reportReasonEnum("reason").notNull(),
    details: text("details"),
    status: reportStatusEnum("status").notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("reports_one_per_reporter").on(t.reporterId, t.targetType, t.targetId),
    check(
      "reports_details",
      sql`${t.details} IS NULL OR (char_length(${t.details}) <= 1000 AND ${noControl(t.details)})`,
    ),
    check(
      "reports_resolution_note",
      sql`${t.resolutionNote} IS NULL OR (char_length(${t.resolutionNote}) <= 500 AND ${noControl(t.resolutionNote)})`,
    ),
    check("reports_resolved", sql`(${t.status} = 'open') = (${t.resolvedAt} IS NULL)`),
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId),
    // Rate limit (reports per day).
    index("reports_reporter_created_idx").on(t.reporterId, t.createdAt.desc()),
  ],
).enableRLS();

export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: modActionEnum("action").notNull(),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "moderation_actions_reason",
      sql`char_length(${t.reason}) BETWEEN 1 AND 500 AND ${noControl(t.reason)}`,
    ),
    check(
      "moderation_actions_meta",
      sql`${t.meta} IS NULL OR (jsonb_typeof(${t.meta}) = 'object' AND octet_length(${t.meta}::text) <= 2048)`,
    ),
    index("moderation_actions_target_idx").on(t.targetType, t.targetId, t.createdAt.desc()),
    index("moderation_actions_created_idx").on(t.createdAt.desc()),
  ],
).enableRLS();

/** Append-only previous bodies (moderators only; purged after 90 days in C4). */
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: reportTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    title: text("title"),
    bodyMd: text("body_md").notNull(),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    check("content_revisions_title", sql`${t.title} IS NULL OR char_length(${t.title}) <= 150`),
    check("content_revisions_body", sql`char_length(${t.bodyMd}) <= 20000`),
    index("content_revisions_target_idx").on(t.targetType, t.targetId, t.createdAt.desc()),
    // Rate limit (edits per hour).
    index("content_revisions_editor_idx").on(t.editedBy, t.createdAt.desc()),
  ],
).enableRLS();
