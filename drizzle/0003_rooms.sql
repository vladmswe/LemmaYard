CREATE TYPE "public"."room_event_type" AS ENUM('participant_joined', 'lobby_updated', 'session_started', 'problem_solved', 'attempt_failed', 'session_ended', 'session_cancelled');--> statement-breakpoint
CREATE TYPE "public"."room_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."room_session_status" AS ENUM('lobby', 'live', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "room_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "room_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" uuid NOT NULL,
	"type" "room_event_type" NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "room_events_payload_size" CHECK (octet_length("room_events"."payload"::text) <= 2048),
	CONSTRAINT "room_events_solve_position" CHECK ("room_events"."type" <> 'problem_solved' OR coalesce(jsonb_typeof("room_events"."payload" -> 'position'), '') = 'number')
);
--> statement-breakpoint
ALTER TABLE "room_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "room_role" DEFAULT 'member' NOT NULL,
	"share_solutions" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "room_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_session_participants" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"solved_count" smallint DEFAULT 0 NOT NULL,
	"penalty_sec" integer DEFAULT 0 NOT NULL,
	"rank" smallint,
	CONSTRAINT "room_session_participants_session_id_user_id_pk" PRIMARY KEY("session_id","user_id"),
	CONSTRAINT "room_session_participants_nonneg" CHECK ("room_session_participants"."solved_count" BETWEEN 0 AND 8 AND "room_session_participants"."penalty_sec" >= 0 AND ("room_session_participants"."rank" IS NULL OR "room_session_participants"."rank" >= 1))
);
--> statement-breakpoint
ALTER TABLE "room_session_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_session_problems" (
	"session_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"problem_id" uuid NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	CONSTRAINT "room_session_problems_session_id_position_pk" PRIMARY KEY("session_id","position"),
	CONSTRAINT "room_session_problems_unique_problem" UNIQUE("session_id","problem_id"),
	CONSTRAINT "room_session_problems_position" CHECK ("room_session_problems"."position" BETWEEN 1 AND 8)
);
--> statement-breakpoint
ALTER TABLE "room_session_problems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_session_results" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"wrong_before_accept" smallint DEFAULT 0 NOT NULL,
	"first_accepted_at" timestamp with time zone,
	"first_accepted_submission_id" uuid,
	"solve_seconds" integer,
	"solved_before" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_session_results_session_id_user_id_position_pk" PRIMARY KEY("session_id","user_id","position"),
	CONSTRAINT "room_session_results_solved_pair" CHECK (("room_session_results"."first_accepted_at" IS NULL) = ("room_session_results"."solve_seconds" IS NULL)),
	CONSTRAINT "room_session_results_counts" CHECK ("room_session_results"."attempts" >= 0 AND "room_session_results"."wrong_before_accept" BETWEEN 0 AND "room_session_results"."attempts"
        AND ("room_session_results"."solve_seconds" IS NULL OR "room_session_results"."solve_seconds" >= 0)
        AND ("room_session_results"."first_accepted_at" IS NULL OR "room_session_results"."attempts" > "room_session_results"."wrong_before_accept"))
);
--> statement-breakpoint
ALTER TABLE "room_session_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "room_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"host_id" uuid,
	"status" "room_session_status" DEFAULT 'lobby' NOT NULL,
	"duration_min" smallint DEFAULT 90 NOT NULL,
	"problem_count" smallint DEFAULT 4 NOT NULL,
	"settings" jsonb NOT NULL,
	"planned_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"rerolled_problem_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"reroll_count" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_sessions_duration" CHECK ("room_sessions"."duration_min" BETWEEN 15 AND 240 AND "room_sessions"."duration_min" % 5 = 0),
	CONSTRAINT "room_sessions_count" CHECK ("room_sessions"."problem_count" BETWEEN 1 AND 8),
	CONSTRAINT "room_sessions_reroll_cap" CHECK ("room_sessions"."reroll_count" BETWEEN 0 AND 30),
	CONSTRAINT "room_sessions_end_reason" CHECK ("room_sessions"."end_reason" IS NULL OR "room_sessions"."end_reason" IN ('time', 'host', 'cancelled', 'stale')),
	CONSTRAINT "room_sessions_state" CHECK (("room_sessions"."status" = 'lobby' AND "room_sessions"."started_at" IS NULL AND "room_sessions"."ends_at" IS NULL AND "room_sessions"."ended_at" IS NULL AND "room_sessions"."end_reason" IS NULL)
        OR ("room_sessions"."status" = 'live' AND "room_sessions"."started_at" IS NOT NULL AND "room_sessions"."ends_at" IS NOT NULL AND "room_sessions"."ended_at" IS NULL AND "room_sessions"."end_reason" IS NULL)
        OR ("room_sessions"."status" = 'finished' AND "room_sessions"."started_at" IS NOT NULL AND "room_sessions"."ends_at" IS NOT NULL AND "room_sessions"."ended_at" IS NOT NULL AND "room_sessions"."end_reason" IS NOT NULL AND "room_sessions"."end_reason" IN ('time', 'host'))
        OR ("room_sessions"."status" = 'cancelled' AND "room_sessions"."started_at" IS NULL AND "room_sessions"."ends_at" IS NULL AND "room_sessions"."ended_at" IS NOT NULL AND "room_sessions"."end_reason" IS NOT NULL AND "room_sessions"."end_reason" IN ('cancelled', 'stale'))),
	CONSTRAINT "room_sessions_ends" CHECK ("room_sessions"."ends_at" IS NULL OR "room_sessions"."ends_at" = "room_sessions"."started_at" + make_interval(mins => "room_sessions"."duration_min"::int))
);
--> statement-breakpoint
ALTER TABLE "room_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"share_solutions" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_invite_token_hash_unique" UNIQUE("invite_token_hash"),
	CONSTRAINT "rooms_name_length" CHECK (char_length("rooms"."name") BETWEEN 1 AND 60),
	CONSTRAINT "rooms_invite_hash_format" CHECK ("rooms"."invite_token_hash" IS NULL OR "rooms"."invite_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rooms_invite_pair" CHECK (("rooms"."invite_token_hash" IS NULL) = ("rooms"."invite_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "room_session_id" uuid;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_session_id_room_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."room_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_participants" ADD CONSTRAINT "room_session_participants_session_id_room_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."room_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_participants" ADD CONSTRAINT "room_session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD CONSTRAINT "room_session_problems_session_id_room_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."room_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD CONSTRAINT "room_session_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_results" ADD CONSTRAINT "room_session_results_first_accepted_submission_id_submissions_id_fk" FOREIGN KEY ("first_accepted_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_results" ADD CONSTRAINT "room_session_results_participant_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."room_session_participants"("session_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_session_results" ADD CONSTRAINT "room_session_results_problem_fk" FOREIGN KEY ("session_id","position") REFERENCES "public"."room_session_problems"("session_id","position") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_events_session_id_idx" ON "room_events" USING btree ("session_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_one_solve" ON "room_events" USING btree ("session_id","actor_user_id",("payload" ->> 'position')) WHERE "room_events"."type" = 'problem_solved';--> statement-breakpoint
CREATE INDEX "room_members_user_idx" ON "room_members" USING btree ("user_id","joined_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "room_members_one_owner" ON "room_members" USING btree ("room_id") WHERE "room_members"."role" = 'owner';--> statement-breakpoint
CREATE INDEX "room_session_participants_user_idx" ON "room_session_participants" USING btree ("user_id","session_id");--> statement-breakpoint
CREATE INDEX "room_session_problems_problem_idx" ON "room_session_problems" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "room_session_results_submission_idx" ON "room_session_results" USING btree ("first_accepted_submission_id") WHERE "room_session_results"."first_accepted_submission_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "room_sessions_one_open" ON "room_sessions" USING btree ("room_id") WHERE "room_sessions"."status" IN ('lobby', 'live');--> statement-breakpoint
CREATE INDEX "room_sessions_room_finished_idx" ON "room_sessions" USING btree ("room_id","started_at" DESC NULLS LAST) WHERE "room_sessions"."status" = 'finished';--> statement-breakpoint
CREATE INDEX "room_sessions_room_status_idx" ON "room_sessions" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "rooms_created_by_idx" ON "rooms" USING btree ("created_by","created_at");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_room_session_id_room_sessions_id_fk" FOREIGN KEY ("room_session_id") REFERENCES "public"."room_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_room_session_idx" ON "submissions" USING btree ("room_session_id","user_id","problem_id","created_at") WHERE "submissions"."room_session_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_room_session_submit_only" CHECK ("submissions"."room_session_id" IS NULL OR "submissions"."kind" = 'submit');