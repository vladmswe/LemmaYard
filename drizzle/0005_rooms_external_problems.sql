-- Rooms: LeetCode problems (docs/specs/rooms-external-problems.md §1). Self-contained: one new table (RLS on),
-- nullable internal columns plus LeetCode snapshot columns on room_session_problems, one event type, and the
-- one-solve index limited to judged solves. Renumber at merge if another 0005 lands first.
ALTER TYPE "public"."room_event_type" ADD VALUE 'solve_undone';--> statement-breakpoint
CREATE TABLE "room_external_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"difficulty" "difficulty",
	"rating" smallint,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_external_problems_room_slug" UNIQUE("room_id","slug"),
	CONSTRAINT "room_external_problems_slug" CHECK (char_length("room_external_problems"."slug") BETWEEN 1 AND 100 AND "room_external_problems"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "room_external_problems_title" CHECK (char_length("room_external_problems"."title") BETWEEN 1 AND 100 AND "room_external_problems"."title" !~ '[[:cntrl:]]'),
	CONSTRAINT "room_external_problems_rating" CHECK ("room_external_problems"."rating" IS NULL OR "room_external_problems"."rating" BETWEEN 0 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "room_external_problems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "room_events_one_solve";--> statement-breakpoint
ALTER TABLE "room_session_problems" ALTER COLUMN "problem_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_session_problems" ALTER COLUMN "difficulty" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD COLUMN "external_problem_id" uuid;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD COLUMN "external_slug" text;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD COLUMN "external_title" text;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD COLUMN "external_rating" smallint;--> statement-breakpoint
ALTER TABLE "room_external_problems" ADD CONSTRAINT "room_external_problems_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_external_problems" ADD CONSTRAINT "room_external_problems_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_external_problems_room_idx" ON "room_external_problems" USING btree ("room_id","created_at");--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD CONSTRAINT "room_session_problems_external_problem_id_room_external_problems_id_fk" FOREIGN KEY ("external_problem_id") REFERENCES "public"."room_external_problems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_session_problems_unique_external" ON "room_session_problems" USING btree ("session_id","external_slug") WHERE "room_session_problems"."external_slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "room_session_problems_external_idx" ON "room_session_problems" USING btree ("external_problem_id") WHERE "room_session_problems"."external_problem_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_one_solve" ON "room_events" USING btree ("session_id","actor_user_id",("payload" ->> 'position')) WHERE "room_events"."type" = 'problem_solved' AND ("room_events"."payload" ->> 'selfReported') IS NULL;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD CONSTRAINT "room_session_problems_kind" CHECK (("room_session_problems"."problem_id" IS NOT NULL AND "room_session_problems"."difficulty" IS NOT NULL AND "room_session_problems"."external_slug" IS NULL
          AND "room_session_problems"."external_title" IS NULL AND "room_session_problems"."external_rating" IS NULL AND "room_session_problems"."external_problem_id" IS NULL)
        OR ("room_session_problems"."problem_id" IS NULL AND "room_session_problems"."external_slug" IS NOT NULL AND "room_session_problems"."external_title" IS NOT NULL
          AND char_length("room_session_problems"."external_slug") BETWEEN 1 AND 100 AND "room_session_problems"."external_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          AND char_length("room_session_problems"."external_title") BETWEEN 1 AND 100 AND "room_session_problems"."external_title" !~ '[[:cntrl:]]'
          AND ("room_session_problems"."external_rating" IS NULL OR "room_session_problems"."external_rating" BETWEEN 0 AND 4000)
          AND "room_session_problems"."rating_at_start" IS NULL AND "room_session_problems"."rating_delta" IS NULL AND NOT "room_session_problems"."pinned"));