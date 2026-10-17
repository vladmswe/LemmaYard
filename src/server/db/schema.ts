// Database schema (PLAN.md section 4). All schema changes happen in M1 only.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { CompareSpec, Signature } from "@/lib/problems/schema";

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

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_username_format", sql`${t.username} ~ '^[a-z0-9_]{3,20}$'`),
  ],
);

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
  ],
);

export const tags = pgTable("tags", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

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
  (t) => [primaryKey({ columns: [t.problemId, t.tagId] })],
);

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
);

/** `{input, expected, actual}` of the first failing test of a submit. */
export type FailedCase = { input: unknown; expected: unknown; actual: unknown };

/** Per-case result of a Run. */
export type CaseResult = {
  index: number;
  status: string;
  input: unknown;
  expected?: unknown;
  actual?: unknown;
  timeMs: number;
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
    check(
      "submissions_counts_valid",
      sql`${t.passedCount} >= 0 AND ${t.totalCount} >= 0 AND ${t.passedCount} <= ${t.totalCount}`,
    ),
  ],
);
