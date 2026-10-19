ALTER TYPE "public"."notification_type" ADD VALUE 'title_available';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'title_leaving';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'title_new_season';--> statement-breakpoint
CREATE TABLE "title_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_type" "watchlist_media_type" NOT NULL,
	"media_id" text NOT NULL,
	"region" text NOT NULL,
	"notify_streaming" boolean DEFAULT false NOT NULL,
	"notify_leaving" boolean DEFAULT false NOT NULL,
	"notify_new_season" boolean DEFAULT false NOT NULL,
	"last_providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_season_number" integer,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "title_alerts" ADD CONSTRAINT "title_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "title_alerts_user_title_unique_idx" ON "title_alerts" USING btree ("user_id","media_type","media_id");--> statement-breakpoint
CREATE INDEX "title_alerts_checked_idx" ON "title_alerts" USING btree ("last_checked_at");