CREATE TYPE "public"."rating_source" AS ENUM('default', 'self_reported', 'practice');--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "author_rating" smallint;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "rating_adjust" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "rated_pairs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "rated_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_members" ADD COLUMN "rating_source" "rating_source";--> statement-breakpoint
ALTER TABLE "room_session_participants" ADD COLUMN "rating_at_start" smallint;--> statement-breakpoint
ALTER TABLE "room_session_participants" ADD COLUMN "rating_delta" smallint;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD COLUMN "rating_at_start" smallint;--> statement-breakpoint
ALTER TABLE "room_session_problems" ADD COLUMN "rating_delta" smallint;--> statement-breakpoint
ALTER TABLE "room_sessions" ADD COLUMN "rated" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "room_sessions" ADD COLUMN "rated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "color" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "presets" jsonb;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "default_preset_id" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "schedule" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "leetcode_rating" smallint;--> statement-breakpoint
CREATE INDEX "room_sessions_unrated_idx" ON "room_sessions" USING btree ("ended_at") WHERE "room_sessions"."status" = 'finished' AND "room_sessions"."rated" AND "room_sessions"."rated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_author_rating" CHECK ("problems"."author_rating" IS NULL OR "problems"."author_rating" BETWEEN 800 AND 3000);--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_rating_adjust" CHECK ("problems"."rating_adjust" BETWEEN -200 AND 200);--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_rating_range" CHECK ("room_members"."rating" IS NULL OR "room_members"."rating" BETWEEN 400 AND 3500);--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_rating_source" CHECK (("room_members"."rating" IS NULL) = ("room_members"."rating_source" IS NULL));--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_rated_counts" CHECK ("room_members"."rated_pairs" >= 0 AND "room_members"."rated_sessions" >= 0 AND "room_members"."rated_sessions" <= "room_members"."rated_pairs");--> statement-breakpoint
ALTER TABLE "room_sessions" ADD CONSTRAINT "room_sessions_rated_at" CHECK ("room_sessions"."rated_at" IS NULL OR ("room_sessions"."status" = 'finished' AND "room_sessions"."rated"));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_description" CHECK ("rooms"."description" IS NULL OR (char_length("rooms"."description") <= 200 AND "rooms"."description" !~ '[[:cntrl:]]'));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_color" CHECK ("rooms"."color" BETWEEN 0 AND 7);--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_presets" CHECK ("rooms"."presets" IS NULL OR (jsonb_typeof("rooms"."presets") = 'array' AND octet_length("rooms"."presets"::text) <= 4096));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_schedule" CHECK ("rooms"."schedule" IS NULL OR (jsonb_typeof("rooms"."schedule") = 'object' AND octet_length("rooms"."schedule"::text) <= 512));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_leetcode_rating_range" CHECK ("users"."leetcode_rating" IS NULL OR "users"."leetcode_rating" BETWEEN 0 AND 4000);--> statement-breakpoint
-- Rooms v2 §8: sessions that ended before ratings existed never move ratings.
UPDATE "room_sessions" SET "rated" = false WHERE "status" IN ('finished', 'cancelled');
