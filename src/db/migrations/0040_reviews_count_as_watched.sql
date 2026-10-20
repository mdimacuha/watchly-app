-- Reviews count as watches: backfill every existing review into watched_titles,
-- dated to when the review was written. Titles already watched keep their date.
INSERT INTO "watched_titles" ("user_id", "media_type", "media_id", "watched_at")
SELECT "user_id", "title_type"::"watchlist_media_type", "title_id", "created_at"
FROM "user_reviews"
WHERE "title_type" IN ('movie', 'tv')
ON CONFLICT DO NOTHING;
