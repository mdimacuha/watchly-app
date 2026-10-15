CREATE TABLE "user_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title_id" text NOT NULL,
	"title_type" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_votes" (
	"watchlist_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_votes_watchlist_id_user_id_pk" PRIMARY KEY("watchlist_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "user_reviews" ADD CONSTRAINT "user_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_votes" ADD CONSTRAINT "watchlist_votes_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_votes" ADD CONSTRAINT "watchlist_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_reviews_title_idx" ON "user_reviews" USING btree ("title_id","title_type");--> statement-breakpoint
CREATE INDEX "user_reviews_user_idx" ON "user_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_reviews_user_title_unique_idx" ON "user_reviews" USING btree ("user_id","title_id","title_type");--> statement-breakpoint
CREATE INDEX "watchlist_votes_watchlist_idx" ON "watchlist_votes" USING btree ("watchlist_id");