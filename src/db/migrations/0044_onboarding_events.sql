CREATE TABLE "onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_id" text NOT NULL,
	"event" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_events_created_idx" ON "onboarding_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "onboarding_events_user_created_idx" ON "onboarding_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "onboarding_events_session_idx" ON "onboarding_events" USING btree ("session_id");--> statement-breakpoint
-- Nobody was ever marked onboarded (the old flow never set the flag). The new
-- sign-in sends unfinished accounts back to onboarding, so everyone who
-- signed up before this release counts as onboarded.
UPDATE "user_preferences" SET "onboarding_completed" = true, "onboarding_completed_at" = now() WHERE "onboarding_completed" = false;
