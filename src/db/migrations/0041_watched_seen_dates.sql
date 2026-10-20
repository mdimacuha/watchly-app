CREATE TYPE "public"."watched_precision" AS ENUM('day', 'month', 'year', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."watched_source" AS ENUM('mark', 'review', 'edited', 'backfill');--> statement-breakpoint
ALTER TABLE "watched_titles" ADD COLUMN "seen_on" date;--> statement-breakpoint
ALTER TABLE "watched_titles" ADD COLUMN "seen_precision" "watched_precision";--> statement-breakpoint
ALTER TABLE "watched_titles" ADD COLUMN "source" "watched_source" DEFAULT 'mark' NOT NULL;--> statement-breakpoint
-- Label existing rows that came from a review (the 0040 backfill used the
-- review's date; live reviews were logged within seconds of it).
UPDATE "watched_titles" w SET "source" = 'review'
FROM "user_reviews" r
WHERE r."user_id" = w."user_id"
  AND r."title_type" = w."media_type"::text
  AND r."title_id" = w."media_id"
  AND abs(extract(epoch FROM (w."watched_at" - r."created_at"))) < 10;
