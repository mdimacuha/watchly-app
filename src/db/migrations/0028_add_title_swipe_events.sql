CREATE TABLE "title_swipe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" text NOT NULL,
	"title_type" text NOT NULL,
	"event" text NOT NULL,
	"source" text DEFAULT 'swipe_discovery' NOT NULL,
	"score_snapshot" numeric,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "title_swipe_events" ADD CONSTRAINT "title_swipe_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "title_swipe_events_user_created_idx" ON "title_swipe_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "title_swipe_events_title_idx" ON "title_swipe_events" USING btree ("title_id","title_type");