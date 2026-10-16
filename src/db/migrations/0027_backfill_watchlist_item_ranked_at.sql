-- Existing items keep their current curated order as their ranking. Only
-- items added after this migration start unranked ("Recently Added").
UPDATE "watchlist_items" SET "ranked_at" = "created_at" WHERE "ranked_at" IS NULL;
