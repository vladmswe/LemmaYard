// Database schema (PLAN.md section 4). All schema changes happen in M1 only,
// except migration 0002 (deploy phase): row level security on every table,
// without policies. The app connects as the table owner and bypasses RLS;
// other roles (e.g. Supabase's REST API roles) are denied by default.
// Migration 0003 (Rooms, docs/specs/rooms.md) is the first feature migration.
// Migration 0004 (Rooms v2, docs/specs/rooms-v2.md §8, owner decision D2:
// ratings are PER ROOM, stored on room_members) adds columns only.
// Migration 0005 (docs/specs/rooms-external-problems.md §1): the room's
// LeetCode list and external (LeetCode) session slots.
// Migration 0006 (Java, README "How to add a language") adds the enum value
// `java` and two problem columns: `languages` (derived by the importer from the
// reference solutions present) and `wide_ints`.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
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
export const languageEnum = pgEnum("language", ["python", "javascript", "java"]);
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
    /**
     * Languages a submission may use: those with a reference solution
     * (`solution.<ext>`) in the problem directory, verified by
     * `pnpm problems:verify`. Python and JavaScript are always present.
     */
    languages: languageEnum("languages")
      .array()
      .notNull()
      .default(sql`'{python,javascript}'::language[]`),
    /**
     * Signature positions (parameter names, or "return") whose int values in the
     * tests do not fit in 32 bits: statically typed templates declare them as
     * 64-bit (Java `long`). Derived from tests.json by the importer.
     */
    wideInts: text("wide_ints").array().notNull().default(sql`'{}'::text[]`),
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

/**
 * A room's LeetCode list (rooms-external-problems §1.1). Only the slug is
 * stored; the link is built on render. Owner-entered title, difficulty and
 * rating (display only). Nothing here comes from leetcode.com.
 */
export const roomExternalProblems = pgTable(
  "room_external_problems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    difficulty: difficultyEnum("difficulty"),
    rating: smallint("rating"),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("room_external_problems_room_slug").on(t.roomId, t.slug),
    index("room_external_problems_room_idx").on(t.roomId, t.createdAt),
    check(
      "room_external_problems_slug",
      sql`char_length(${t.slug}) BETWEEN 1 AND 100 AND ${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      "room_external_problems_title",
      sql`char_length(${t.title}) BETWEEN 1 AND 100 AND ${t.title} !~ '[[:cntrl:]]'`,
    ),
    check("room_external_problems_rating", sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 0 AND 4000`),
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
    // Null for a LeetCode slot (rooms-external-problems §1.2).
    problemId: uuid("problem_id").references(() => problems.id, { onDelete: "restrict" }),
    /** Snapshot at pick time (calibration). Null only for a LeetCode slot without one. */
    difficulty: difficultyEnum("difficulty"),
    pinned: boolean("pinned").notNull().default(false),
    /** Rooms v2: effective problem rating at session start, and its change when ratings were applied. */
    ratingAtStart: smallint("rating_at_start"),
    ratingDelta: smallint("rating_delta"),
    /**
     * LeetCode slot (rooms-external-problems §1.2): a snapshot of the bank
     * entry (or of a pasted link) taken when the slot was filled. The bank
     * reference only links back; removing the entry keeps the snapshot.
     */
    externalProblemId: uuid("external_problem_id").references(() => roomExternalProblems.id, {
      onDelete: "set null",
    }),
    externalSlug: text("external_slug"),
    externalTitle: text("external_title"),
    externalRating: smallint("external_rating"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.position] }),
    unique("room_session_problems_unique_problem").on(t.sessionId, t.problemId),
    check("room_session_problems_position", sql`${t.position} BETWEEN 1 AND 8`),
    index("room_session_problems_problem_idx").on(t.problemId),
    uniqueIndex("room_session_problems_unique_external")
      .on(t.sessionId, t.externalSlug)
      .where(sql`${t.externalSlug} IS NOT NULL`),
    index("room_session_problems_external_idx")
      .on(t.externalProblemId)
      .where(sql`${t.externalProblemId} IS NOT NULL`),
    // Exactly one kind: our problem (with a difficulty, no external fields) or a LeetCode snapshot.
    check(
      "room_session_problems_kind",
      sql`(${t.problemId} IS NOT NULL AND ${t.difficulty} IS NOT NULL AND ${t.externalSlug} IS NULL
          AND ${t.externalTitle} IS NULL AND ${t.externalRating} IS NULL AND ${t.externalProblemId} IS NULL)
        OR (${t.problemId} IS NULL AND ${t.externalSlug} IS NOT NULL AND ${t.externalTitle} IS NOT NULL
          AND char_length(${t.externalSlug}) BETWEEN 1 AND 100 AND ${t.externalSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          AND char_length(${t.externalTitle}) BETWEEN 1 AND 100 AND ${t.externalTitle} !~ '[[:cntrl:]]'
          AND (${t.externalRating} IS NULL OR ${t.externalRating} BETWEEN 0 AND 4000)
          AND ${t.ratingAtStart} IS NULL AND ${t.ratingDelta} IS NULL AND NOT ${t.pinned})`,
    ),
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
    // One judged solve event per (session, user, position), even if outcome code runs twice.
    // Self-reported LeetCode solves can be undone and marked again (rooms-external-problems §5).
    uniqueIndex("room_events_one_solve")
      .on(t.sessionId, t.actorUserId, sql`(${t.payload} ->> 'position')`)
      .where(sql`${t.type} = 'problem_solved' AND (${t.payload} ->> 'selfReported') IS NULL`),
    check("room_events_payload_size", sql`octet_length(${t.payload}::text) <= 2048`),
    // Without a numeric position the one-solve index could not deduplicate.
    check(
      "room_events_solve_position",
      sql`${t.type} <> 'problem_solved' OR coalesce(jsonb_typeof(${t.payload} -> 'position'), '') = 'number'`,
    ),
  ],
).enableRLS();
