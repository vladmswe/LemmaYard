ALTER TYPE "public"."language" ADD VALUE 'java';--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "languages" "language"[] DEFAULT '{python,javascript}'::language[] NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "wide_ints" text[] DEFAULT '{}'::text[] NOT NULL;