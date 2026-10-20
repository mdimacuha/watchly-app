# Watchly Wrapped (parked)

> Status: **parked**, planned 2026-10-20. Pick it up by early November to launch in the first week of December.

A year-in-review for each member, built on the ticket stubs from the profile's **Library > Watched** tab. The theme writes itself: your year as a stack of tickets ("You tore 42 tickets in 2026").

## Goal

- Give every active member a reason to come back in December and share Watchly.
- Success: share rate (story exports / Wrapped views), Wrapped views / monthly active members, sign-ups that land from a shared Wrapped link.

## What we already have

| Data | Source | Notes |
|---|---|---|
| What was watched, and when | `watched_titles.watched_at` plus `watchlist_items` with `finished` / `rewatch` (`finished_at`, falling back to `updated_at`) | Merged by `getWatchedEntries()` in `src/services/watched`. Reviews count as watches since migration 0040. |
| Ratings and reviews | `user_reviews` (rating, body, `created_at`) | Highest/lowest rated, review count, average. |
| Favorites and shelves | `user_favorites`, `favorite_shelves` | "Added to favorites this year", most-used shelf. |
| Swipes | `title_swipes` | Swipe count, yes rate ("a tough crowd"). Owner-only today; keep it opt-in for sharing. |
| Genres and eras | `getTasteProfile()` | Already drives Taste DNA and Favourite era. |
| Runtimes | TMDB, as in `getWatchlistRuntimes()` | Total hours watched. |
| Share image | `src/server/profile/storyImage.tsx` (Instagram story export) | Reuse its rendering for Wrapped cards. |

## Data caveats to fix before launch

- **Watch dates are approximate.** "Mark as watched" stamps the moment you tap it, not when you watched it. Old reviews were backfilled with the review date. Wrapped should say "logged in 2026", not "watched in 2026".
- **Series count as one ticket.** There's no per-episode tracking, so total hours for a series should be its full runtime only when it's finished; otherwise leave it out or estimate, and say so.
- **Re-watches.** `rewatch` items count once in the merged set; decide whether Wrapped shows them separately ("You went back to Skyfall").
- **Some data is new.** Shelves, swipes and featured titles only exist from mid-2026, so those cards must hide themselves when empty.

## Draft card sequence

1. **Your year in tickets.** Total tickets for the year, with the stub stack animation.
2. **Hours in the dark.** Total runtime, as hours and as "that's N flights to Tokyo"-style comparisons (pick one, not five).
3. **Your busiest month.** From the month groups on the Watched tab ("July: six tickets, five of them Bond").
4. **Taste DNA of the year.** Top genres and the era you lived in.
5. **Films vs series.**
6. **Your top rated and your harshest review.** Spoiler-flagged reviews stay hidden.
7. **Your #1.** From Feature presentation, or the highest rated title of the year.
8. **Watchly Swipe.** Swipes and yes rate (owner-only unless they choose to share).
9. **Share card.** One summary card as the Instagram story image, plus a public link.

Cards with no data are skipped. A member needs at least 5 tickets in the year to get Wrapped; below that, show a "your Wrapped is warming up" state with a nudge to log watches.

## Product decisions to make

- **Window:** count Jan 1 to the launch date, and let December watches update the numbers until Dec 31? Or freeze at launch (simpler, stable share links)?
- **Where it lives:** `/wrapped/2026` (own page, story-style) plus a card at the top of the profile through December, and the changelog promo.
- **Privacy:** follow the profile's visibility rules (`resolveProfileVisibility`). If watched titles are hidden, Wrapped is private to the owner until they choose to share it.
- **Shareable link:** public read-only page per member per year, respecting the above.
- **Notifications:** one in-app notification on launch day ("Your 2026 in tickets is ready").

## Technical sketch

- **Compute:** one service, `src/services/wrapped/`, that builds a `WrappedYear` object from the sources above for a member and year. Reuse the existing helpers rather than new queries where possible.
- **Snapshot:** store the computed result in a `wrapped_snapshots` table (user, year, JSON payload, `computed_at`) so share links are stable and the page is one read. Recompute on demand while the window is open, at most once an hour.
- **TMDB cost:** runtimes for every ticket of the year can mean 100+ lookups per member; compute lazily on first view (not a batch job for every member), cached per title.
- **Region:** functions now run in `sin1` next to the database; keep Wrapped there too.
- **Share image:** extend the story image renderer with a Wrapped layout; no new library.
- **Design:** follow the ticket stub language from the Watched tab (stub notches, `NO. 0014` serials, month headers) instead of a generic "year in review" look. Accent colour comes from the member's profile accent.

## Rough timeline

| When | What |
|---|---|
| Early Nov | Decide window and privacy; data audit on real accounts (dates, runtimes). |
| Mid Nov | Build the service and snapshot table; prototype cards on real data. |
| Late Nov | Share image, public link, empty and low-data states; test with a few members. |
| Dec 1–3 | Launch with a changelog promo and a notification. |
| Jan 15 | Take down the profile card; keep `/wrapped/2026` pages up. |

## Out of scope for v1

- Per-episode tracking for series.
- Comparing with friends ("you and Marc both watched..."). Revisit after launch using the Taste match logic.
- Video exports.
