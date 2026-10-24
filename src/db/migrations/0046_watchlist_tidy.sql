CREATE TABLE "watchlist_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "attention_dismissed" jsonb;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "kept_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "providers_seen" jsonb;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD COLUMN "providers_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watchlist_events" ADD CONSTRAINT "watchlist_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watchlist_events_user_created_idx" ON "watchlist_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "watchlist_events_event_created_idx" ON "watchlist_events" USING btree ("event","created_at");