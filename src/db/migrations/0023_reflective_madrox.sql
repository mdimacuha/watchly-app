CREATE INDEX "activities_user_unread_idx" ON "activities" USING btree ("user_id") WHERE "activities"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "user_favorites_user_created_idx" ON "user_favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_follows_following_status_idx" ON "user_follows" USING btree ("following_id","status");--> statement-breakpoint
CREATE INDEX "user_follows_follower_status_idx" ON "user_follows" USING btree ("follower_id","status");--> statement-breakpoint
CREATE INDEX "users_username_live_idx" ON "users" USING btree ("username") WHERE "users"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "watchlist_items_watchlist_status_idx" ON "watchlist_items" USING btree ("watchlist_id","status");--> statement-breakpoint
CREATE INDEX "watchlist_items_watchlist_created_idx" ON "watchlist_items" USING btree ("watchlist_id","created_at");