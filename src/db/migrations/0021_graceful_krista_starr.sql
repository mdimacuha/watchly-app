CREATE TABLE "title_swipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" text NOT NULL,
	"title_type" text NOT NULL,
	"action" text NOT NULL,
	"source" text DEFAULT 'swipe_discovery' NOT NULL,
	"score_snapshot" numeric,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "title_swipes" ADD CONSTRAINT "title_swipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "title_swipes_user_id_idx" ON "title_swipes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "title_swipes_user_action_idx" ON "title_swipes" USING btree ("user_id","action");--> statement-breakpoint
CREATE INDEX "title_swipes_user_title_type_idx" ON "title_swipes" USING btree ("user_id","title_type");--> statement-breakpoint
CREATE INDEX "title_swipes_title_idx" ON "title_swipes" USING btree ("title_id","title_type");--> statement-breakpoint
CREATE UNIQUE INDEX "title_swipes_user_title_unique_idx" ON "title_swipes" USING btree ("user_id","title_id","title_type");