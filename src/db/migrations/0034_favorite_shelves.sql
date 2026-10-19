CREATE TABLE "favorite_shelf_items" (
	"shelf_id" uuid NOT NULL,
	"favorite_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_shelf_items_shelf_id_favorite_id_pk" PRIMARY KEY("shelf_id","favorite_id")
);
--> statement-breakpoint
CREATE TABLE "favorite_shelves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favorite_shelf_items" ADD CONSTRAINT "favorite_shelf_items_shelf_id_favorite_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."favorite_shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_shelf_items" ADD CONSTRAINT "favorite_shelf_items_favorite_id_user_favorites_id_fk" FOREIGN KEY ("favorite_id") REFERENCES "public"."user_favorites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_shelves" ADD CONSTRAINT "favorite_shelves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorite_shelf_items_favorite_idx" ON "favorite_shelf_items" USING btree ("favorite_id");--> statement-breakpoint
CREATE INDEX "favorite_shelves_user_idx" ON "favorite_shelves" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_shelves_user_name_unique_idx" ON "favorite_shelves" USING btree ("user_id",lower("name"));