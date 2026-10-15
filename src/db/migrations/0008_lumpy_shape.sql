ALTER TABLE "user_preferences" ADD COLUMN "hide_favorites" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;