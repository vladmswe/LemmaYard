CREATE TYPE "public"."content_status" AS ENUM('visible', 'hidden_pending', 'removed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."mod_action" AS ENUM('hide', 'restore', 'remove', 'lock', 'unlock', 'set_spoiler', 'suspend', 'unsuspend', 'dismiss', 'void_votes', 'approve_company', 'merge_company');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'harassment', 'hate', 'personal_data', 'nda_confidential', 'copyright', 'unmarked_spoiler', 'off_topic', 'malware', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('comment', 'post', 'study_plan', 'company', 'user', 'thread');--> statement-breakpoint
CREATE TYPE "public"."thread_kind" AS ENUM('problem', 'lesson', 'post', 'room_session');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'moderator', 'admin');--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id"),
	CONSTRAINT "comment_votes_value" CHECK ("comment_votes"."value" IN (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "comment_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"parent_id" uuid,
	"depth" smallint NOT NULL,
	"author_id" uuid,
	"body_md" text NOT NULL,
	"body_hash" text NOT NULL,
	"has_spoiler" boolean DEFAULT false NOT NULL,
	"up_count" integer DEFAULT 0 NOT NULL,
	"down_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"score" integer GENERATED ALWAYS AS (up_count - down_count) STORED,
	"rank_best" double precision GENERATED ALWAYS AS (CASE WHEN (up_count + down_count) = 0 THEN 0::double precision ELSE ((up_count::double precision / (up_count + down_count)::double precision) + 1.9208::double precision / (up_count + down_count)::double precision - 1.96::double precision * sqrt(((up_count::double precision / (up_count + down_count)::double precision) * (1::double precision - (up_count::double precision / (up_count + down_count)::double precision)) + 0.9604::double precision / (up_count + down_count)::double precision) / (up_count + down_count)::double precision)) / (1::double precision + 3.8416::double precision / (up_count + down_count)::double precision) END) STORED,
	"status" "content_status" DEFAULT 'visible' NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_depth" CHECK ("comments"."depth" IN (0, 1)),
	CONSTRAINT "comments_parent_depth" CHECK (("comments"."parent_id" IS NULL) = ("comments"."depth" = 0)),
	CONSTRAINT "comments_body" CHECK (char_length("comments"."body_md") <= 10000 AND "comments"."body_md" !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
	CONSTRAINT "comments_body_hash" CHECK ("comments"."body_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "comments_counts" CHECK ("comments"."up_count" >= 0 AND "comments"."down_count" >= 0 AND "comments"."reply_count" >= 0),
	CONSTRAINT "comments_removed_reason" CHECK ("comments"."removed_reason" IS NULL OR (char_length("comments"."removed_reason") BETWEEN 1 AND 200 AND "comments"."removed_reason" !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')),
	CONSTRAINT "comments_body_present" CHECK ("comments"."status" = 'deleted' OR char_length("comments"."body_md") >= 1),
	CONSTRAINT "comments_deleted_at" CHECK (("comments"."status" = 'deleted') = ("comments"."deleted_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"title" text,
	"body_md" text NOT NULL,
	"edited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_title" CHECK ("content_revisions"."title" IS NULL OR char_length("content_revisions"."title") <= 150),
	CONSTRAINT "content_revisions_body" CHECK (char_length("content_revisions"."body_md") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "content_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "discussion_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "thread_kind" NOT NULL,
	"problem_id" uuid,
	"lesson_slug" text,
	"post_id" uuid,
	"room_session_id" uuid,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_threads_one_target" CHECK (num_nonnulls("discussion_threads"."problem_id", "discussion_threads"."lesson_slug", "discussion_threads"."post_id", "discussion_threads"."room_session_id") = 1),
	CONSTRAINT "discussion_threads_kind_target" CHECK (("discussion_threads"."kind" = 'problem' AND "discussion_threads"."problem_id" IS NOT NULL)
        OR ("discussion_threads"."kind" = 'lesson' AND "discussion_threads"."lesson_slug" IS NOT NULL)
        OR ("discussion_threads"."kind" = 'post' AND "discussion_threads"."post_id" IS NOT NULL)
        OR ("discussion_threads"."kind" = 'room_session' AND "discussion_threads"."room_session_id" IS NOT NULL)),
	CONSTRAINT "discussion_threads_lesson_slug" CHECK ("discussion_threads"."lesson_slug" IS NULL OR "discussion_threads"."lesson_slug" ~ '^[a-z0-9-]{1,100}$'),
	CONSTRAINT "discussion_threads_comment_count" CHECK ("discussion_threads"."comment_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "discussion_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "mod_action" NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_actions_reason" CHECK (char_length("moderation_actions"."reason") BETWEEN 1 AND 500 AND "moderation_actions"."reason" !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
	CONSTRAINT "moderation_actions_meta" CHECK ("moderation_actions"."meta" IS NULL OR (jsonb_typeof("moderation_actions"."meta") = 'object' AND octet_length("moderation_actions"."meta"::text) <= 2048))
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "problem_difficulty_feedback" (
	"problem_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_difficulty_feedback_problem_id_user_id_pk" PRIMARY KEY("problem_id","user_id"),
	CONSTRAINT "problem_difficulty_feedback_value" CHECK ("problem_difficulty_feedback"."value" IN (-1, 0, 1))
);
--> statement-breakpoint
ALTER TABLE "problem_difficulty_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "problem_votes" (
	"problem_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problem_votes_problem_id_user_id_pk" PRIMARY KEY("problem_id","user_id"),
	CONSTRAINT "problem_votes_value" CHECK ("problem_votes"."value" IN (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "problem_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_one_per_reporter" UNIQUE("reporter_id","target_type","target_id"),
	CONSTRAINT "reports_details" CHECK ("reports"."details" IS NULL OR (char_length("reports"."details") <= 1000 AND "reports"."details" !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')),
	CONSTRAINT "reports_resolution_note" CHECK ("reports"."resolution_note" IS NULL OR (char_length("reports"."resolution_note") <= 500 AND "reports"."resolution_note" !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')),
	CONSTRAINT "reports_resolved" CHECK (("reports"."status" = 'open') = ("reports"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "dislike_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "community_suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_difficulty_feedback" ADD CONSTRAINT "problem_difficulty_feedback_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_difficulty_feedback" ADD CONSTRAINT "problem_difficulty_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_votes" ADD CONSTRAINT "problem_votes_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_votes" ADD CONSTRAINT "problem_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_votes_user_idx" ON "comment_votes" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_thread_best_idx" ON "comments" USING btree ("thread_id","depth","rank_best" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id") WHERE "comments"."status" = 'visible';--> statement-breakpoint
CREATE INDEX "comments_thread_new_idx" ON "comments" USING btree ("thread_id","depth","created_at" DESC NULLS LAST,"id") WHERE "comments"."status" = 'visible';--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_body_hash_idx" ON "comments" USING btree ("body_hash","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status","created_at") WHERE "comments"."status" = 'hidden_pending';--> statement-breakpoint
CREATE INDEX "content_revisions_target_idx" ON "content_revisions" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_revisions_editor_idx" ON "content_revisions" USING btree ("edited_by","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_threads_problem_unique" ON "discussion_threads" USING btree ("problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_threads_lesson_unique" ON "discussion_threads" USING btree ("lesson_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_threads_post_unique" ON "discussion_threads" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_threads_room_session_unique" ON "discussion_threads" USING btree ("room_session_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_target_idx" ON "moderation_actions" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "moderation_actions_created_idx" ON "moderation_actions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "problem_difficulty_feedback_user_idx" ON "problem_difficulty_feedback" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "problem_votes_user_idx" ON "problem_votes" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_created_idx" ON "reports" USING btree ("reporter_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_vote_counts" CHECK ("problems"."like_count" >= 0 AND "problems"."dislike_count" >= 0);