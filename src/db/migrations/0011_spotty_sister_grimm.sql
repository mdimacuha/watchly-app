ALTER TYPE "public"."watchlist_item_status" ADD VALUE 'waiting_for_episode' BEFORE 'finished';--> statement-breakpoint
ALTER TYPE "public"."watchlist_item_status" ADD VALUE 'waiting_for_season' BEFORE 'finished';--> statement-breakpoint
ALTER TYPE "public"."watchlist_item_status" ADD VALUE 'paused' BEFORE 'finished';--> statement-breakpoint
ALTER TYPE "public"."watchlist_item_status" ADD VALUE 'rewatch';--> statement-breakpoint
ALTER TYPE "public"."watchlist_item_status" ADD VALUE 'dropped';--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "notes" text;