CREATE TYPE "public"."plan_source" AS ENUM('manual', 'interview_post', 'room_session', 'clone');--> statement-breakpoint
CREATE TYPE "public"."plan_visibility" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "study_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"section_id" uuid,
	"position" integer NOT NULL,
	"problem_id" uuid,
	"external_slug" text,
	"external_title" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plan_items_problem_unique" UNIQUE("plan_id","problem_id"),
	CONSTRAINT "study_plan_items_external_unique" UNIQUE("plan_id","external_slug"),
	CONSTRAINT "study_plan_items_target" CHECK (num_nonnulls("study_plan_items"."problem_id", "study_plan_items"."external_slug") = 1),
	CONSTRAINT "study_plan_items_external_slug" CHECK ("study_plan_items"."external_slug" IS NULL OR (char_length("study_plan_items"."external_slug") <= 100 AND "study_plan_items"."external_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
	CONSTRAINT "study_plan_items_external_title" CHECK ("study_plan_items"."external_title" IS NULL OR ("study_plan_items"."external_slug" IS NOT NULL AND char_length("study_plan_items"."external_title") BETWEEN 1 AND 120 AND "study_plan_items"."external_title" !~ '[[:cntrl:]]')),
	CONSTRAINT "study_plan_items_note" CHECK ("study_plan_items"."note" IS NULL OR (char_length("study_plan_items"."note") BETWEEN 1 AND 280 AND "study_plan_items"."note" !~ '[[:cntrl:]]')),
	CONSTRAINT "study_plan_items_position" CHECK ("study_plan_items"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "study_plan_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_plan_saves" (
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"share_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plan_saves_user_id_plan_id_pk" PRIMARY KEY("user_id","plan_id"),
	CONSTRAINT "study_plan_saves_share_token" CHECK ("study_plan_saves"."share_token" IS NULL OR "study_plan_saves"."share_token" ~ '^[A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
ALTER TABLE "study_plan_saves" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_plan_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plan_sections_title" CHECK (char_length("study_plan_sections"."title") BETWEEN 1 AND 80 AND "study_plan_sections"."title" !~ '[[:cntrl:]]'),
	CONSTRAINT "study_plan_sections_position" CHECK ("study_plan_sections"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "study_plan_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_plan_ticks" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"done_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plan_ticks_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "study_plan_ticks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"visibility" "plan_visibility" DEFAULT 'private' NOT NULL,
	"share_token" text,
	"source" "plan_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"forked_from_id" uuid,
	"item_count" integer DEFAULT 0 NOT NULL,
	"save_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plans_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "study_plans_title" CHECK (char_length("study_plans"."title") BETWEEN 1 AND 80 AND "study_plans"."title" !~ '[[:cntrl:]]'),
	CONSTRAINT "study_plans_description" CHECK ("study_plans"."description" IS NULL OR (char_length("study_plans"."description") BETWEEN 1 AND 2000 AND translate("study_plans"."description", E'\n', '') !~ '[[:cntrl:]]')),
	CONSTRAINT "study_plans_share_token" CHECK ("study_plans"."share_token" IS NULL OR "study_plans"."share_token" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "study_plans_unlisted_token" CHECK ("study_plans"."visibility" <> 'unlisted' OR "study_plans"."share_token" IS NOT NULL),
	CONSTRAINT "study_plans_item_count" CHECK ("study_plans"."item_count" BETWEEN 0 AND 300),
	CONSTRAINT "study_plans_save_count" CHECK ("study_plans"."save_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "study_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_section_id_study_plan_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."study_plan_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_items" ADD CONSTRAINT "study_plan_items_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_saves" ADD CONSTRAINT "study_plan_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_saves" ADD CONSTRAINT "study_plan_saves_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_sections" ADD CONSTRAINT "study_plan_sections_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_ticks" ADD CONSTRAINT "study_plan_ticks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plan_ticks" ADD CONSTRAINT "study_plan_ticks_item_id_study_plan_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."study_plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_forked_from_id_study_plans_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."study_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_plan_items_plan_idx" ON "study_plan_items" USING btree ("plan_id","section_id","position");--> statement-breakpoint
CREATE INDEX "study_plan_items_section_idx" ON "study_plan_items" USING btree ("section_id") WHERE "study_plan_items"."section_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "study_plan_saves_plan_idx" ON "study_plan_saves" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "study_plan_saves_user_idx" ON "study_plan_saves" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "study_plan_sections_plan_idx" ON "study_plan_sections" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "study_plan_ticks_user_done_idx" ON "study_plan_ticks" USING btree ("user_id","done_at");--> statement-breakpoint
CREATE INDEX "study_plan_ticks_item_idx" ON "study_plan_ticks" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "study_plans_owner_idx" ON "study_plans" USING btree ("owner_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "study_plans_public_idx" ON "study_plans" USING btree ("save_count" DESC NULLS LAST,"updated_at" DESC NULLS LAST) WHERE "study_plans"."visibility" = 'public';--> statement-breakpoint
CREATE INDEX "study_plans_forked_from_idx" ON "study_plans" USING btree ("forked_from_id") WHERE "study_plans"."forked_from_id" IS NOT NULL;