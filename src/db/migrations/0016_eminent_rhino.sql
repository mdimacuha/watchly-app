CREATE TABLE "watched_titles" (
	"user_id" uuid NOT NULL,
	"media_type" "watchlist_media_type" NOT NULL,
	"media_id" text NOT NULL,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_titles_user_id_media_type_media_id_pk" PRIMARY KEY("user_id","media_type","media_id")
);
--> statement-breakpoint
ALTER TABLE "watched_titles" ADD CONSTRAINT "watched_titles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watched_titles_user_idx" ON "watched_titles" USING btree ("user_id");