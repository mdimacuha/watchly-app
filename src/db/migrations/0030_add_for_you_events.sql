CREATE TABLE "for_you_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"event" text NOT NULL,
	"title_key" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "for_you_events" ADD CONSTRAINT "for_you_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "for_you_events_user_created_idx" ON "for_you_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "for_you_events_session_idx" ON "for_you_events" USING btree ("session_id");