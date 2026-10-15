# Watchly v2 — Where to Focus Next

A breakdown of what's done, what's in progress, and what needs attention. Pair with `SPEC.md` (product+architecture overview).

---

## Current State Overview

| Feature                | Status            | Completeness |
| ---------------------- | ----------------- | ------------ |
| Authentication         | **Done (v2)**     | 98%          |
| Search (public)        | Complete          | 95%          |
| Detail pages (public)  | Complete          | 95%          |
| Provider availability  | **Done (v2)**     | 95%          |
| Favorites              | **Done**          | 100%         |
| Watchlists             | **Done (v2.1)**   | 98%          |
| My Profile             | **Done (v2.2)**   | 98%          |
| Activity Feed          | **Done (v2.2)**   | 100%         |
| For You                | **Done (v3)**     | 95%          |
| Social (Follows)       | **Done (v1)**     | 95%          |
| Notifications          | **Done (v1)**     | 95%          |
| Settings               | **Done (v2)**     | 95%          |
| Email Verification     | **Done**          | 100%         |
| Password Recovery      | **Done**          | 100%         |
| Onboarding             | **Done (v1)**     | 95%          |
| Swipe Discovery        | **Done (v1)**     | 95%          |

---

## ✅ Recently Shipped

### Swipe Discovery ("WatchlySwipe") v1 — DONE (2026-05-15)
- ✅ Schema: `title_swipes(userId, titleId, titleType, action, source, scoreSnapshot numeric, metadata jsonb, …)` with unique `(userId, titleId, titleType)`. Migration `0021_graceful_krista_starr.sql`.
- ✅ Service layer: `services/swipe/` — `recordSwipe` (upsert + Save→Favorites via existing `addFavorite`), `getSwipeKeySet`, `getSwipeSignals`, `resetSwipeHistory`.
- ✅ Recommendation engine **reuses For You's pipeline** (`pickSeeds` → `gatherCandidates` → `enrichCandidate`) and layers swipe-specific signals: liked-similar boost via shared seeds, passed-genre penalty (capped), already-swiped exclusion.
- ✅ Cross-feature wiring (all four):
  - For You's `loadExcludeSet` now unions in `getSwipeKeySet` (all actions) — swiped titles drop out of the feed.
  - For You's `pickSeeds` tops up with `saved` + `liked` swipes when favorites + watchlist items don't fill `SEED_LIMIT`.
  - For You's `scoreCandidate` subtracts `min(genreOverlap(passed), 3)` per candidate.
  - `getTasteProfile` folds saved + liked swipes into the input set (after favorites + watched, capped at `TASTE_SAMPLE_LIMIT`).
- ✅ API routes: `GET /api/v1/swipe/deck`, `POST /api/v1/swipe`, `DELETE /api/v1/swipe/history`. Session-or-bearer auth via existing `resolveRequestingUser`. New limiters: `swipeDeck` (30/min) and `swipeRecord` (120/min).
- ✅ Server actions: `recordSwipeAction`, `getSwipeDeckAction`, `resetSwipeHistoryAction` — used directly by the client UI to skip the REST round-trip.
- ✅ UI at `/swipe`: framer-motion drag (left=pass, right=like) + Pass/Like/Save/Details buttons + keyboard shortcuts (←/→/S/Enter). SSR'd first page so the deck paints with content. Stack effect — one card peeks under the active one. Optimistic advance with rollback on failure. Auto-prefetches more pages when the queue drops below 5.
- ✅ Discovery entry points: sidebar nav ("Watchly Swipe", `ArrowLeftRight` icon), CTA on `/for-you` empty state, bootstrap hint on `/me` when favoritesCount + watchedCount < 5.
- ✅ Save action runs through `addFavorite` so it inherits the verification gate, activity recording, and dedup — Favorites stay clean (Likes are NOT folded in, per spec).

### For You v2 — Scoring + per-seed rows + filters + View All — DONE
- **Scrollbar UX**: rows now use a new `.scrollbar-hover` utility — fully hidden by default, fades in (themed slim track + thumb) when the user hovers the row. Falls back to thin on touch (no hover signal). Applied across all For You rows.
- **Row size 6 → 18** — every row now surfaces up to 18 candidates. `SCORING_POOL = 40` bounds the metadata-fetch cost for the formula-based re-rank.
- **Full additive scoring formula** in `services/forYou/index.ts` — replaces the v1 "how many seeds it appeared in" tally:
  - `+5` per genre overlap with any seed
  - `+4` per keyword overlap
  - `+4` per matching director
  - `+3` per matching major cast member (top 5 by `order`)
  - `+3` if available on flatrate in the user's region
  - `+2` if `vote_average >= 7.5`
  - `+1` if trending today (one `/trending/all/day` fetch at orchestrator start, cached as a `Set<"mediaType:id">`)
  - small `0.5 / (tallyRank + 1)` floor so the original tally signal still breaks ties
  - **Counts overlap** (multi-genre matches score higher than single-genre) — intentional tweak over the spec's "+5 if any" reading
- **Seed feature extraction** — `pickSeeds` now fetches each seed with `append_to_response=credits,keywords` (same number of HTTP calls as v1; richer per-response). Extracts `genreIds`, `keywordIds`, top-N `castIds`, `directorIds` (via `crew.job === 'Director'` for movies, `created_by` for TV).
- **Candidate enrichment** — `enrichCandidate` now returns `{ ui, features }`. Same fetch (`credits,keywords,watch/providers`) produces both the UI shape and the scoring features so the orchestrator doesn't double-fetch. `TmdbDetailsFull` interface added.
- **Per-seed "Because You Added" rows** — up to 3 rows below "From Your Favorites", titled `Because you added {seedTitle}`. Items come from `/recommendations` + `/similar` for that single seed, filtered through `excludeSet`. New `getBecauseAddedRows(seeds, excludeSet, region)` helper. New `'because_added'` row id (multiple rows share this id; deduplicated by title in the React key).
- **Quick Picks row** — `getQuickPicksRow(region)` returns a `ROW_SIZE * 2` pool of region-popular titles so the client filter chips have material to slice without refetching. New `'quick_picks'` row id.
- **Per-row filter chips** — new `ForYouFilterableRow` (client component) renders chips above the scroller and filters items locally:
  - `FAVORITES_CHIPS` — `All / Movies / TV Shows / Under 2h`. Applied to From Your Favorites.
  - `QUICK_PICKS_CHIPS` — `All / Under 90 min / Under 2h / Highly Rated`. Applied to Quick Picks.
  - Inline empty state when no items match.
- **View All pages** — new dynamic route `/for-you/[rowId]`:
  - Slugs: `/for-you/from-favorites`, `/up-next`, `/popular`, `/trending`, `/quick-picks`
  - Re-uses `getForYouFeedAction()` and surfaces the matching row in a 6-column grid (vs the home row's horizontal scroller)
  - Back link to `/for-you`, empty state when the row has no items
  - Each row in `ForYouFilterableRow` and `ForYouRow` accepts `viewAllHref` — a `View All →` link sits opposite the row title

### For You v1.1 — Polish round — DONE
- **Hero CTA copy** — "Open {provider}" → "Open Film" / "Open Series" (driven by `mediaType`). Works whether or not a provider is available in the user's region; provider chips still render above the actions for context.
- **From Your Favorites — richer candidate pool** — `gatherCandidates` now hits BOTH `/movie/{id}/recommendations` AND `/movie/{id}/similar` (+ tv equivalents) per seed. Tally counts appearances across both endpoints, so candidates that show up in *both* for the same seed score higher. Doubles the per-seed TMDB calls (still 1h-cached) for a meaningfully richer mix.
- **"Available on Your Services" → "Popular Right Now"** — dropped the discover-based row; new `getPopularRightNowRow(region)` uses TMDB `/movie/popular` + `/tv/popular` interleaved 1:1. Reason chip reads "Popular right now."
- **New row "Trending This Week"** — `getTrendingThisWeekRow(region)` calls TMDB `/trending/all/week`, filters to movie+tv (drops people), excludes items in the user's library. Reason chip "Trending this week."
- **Uniform card style across For You + Search** — `ForYouCard` rewritten to mirror `TmdbGridItem` exactly: type badge top-right, hover-revealed provider strip with slide-up animation, same fonts and spacing. Only For You-specific addition is an optional `subtitle` line below the year (for "Added X ago" style metadata in the Up Next row).
- Row id union updated: `'from_favorites' | 'up_next' | 'popular_right_now' | 'trending_this_week'`.

### For You v1 — Personalized Discovery — DONE
- New route `/for-you` (replaces the toast-demo placeholder). Header: **Tonight's Briefing** · "Curated from your library and services. No algorithms." matches the product mockup.
- New service `src/services/forYou/index.ts` — `getForYouFeed(userId, region, opts?)` returns `{ hero, rows }`.
  - **Seed gathering**: reads up to 10 of the user's most-recent favorites + recent watchlist items. Resolves display names per seed (one TMDB detail fetch each, 1h-cached) so reason copy can read "Because you liked Dune".
  - **Candidate scoring (v1)**: simple tally — for each seed hit TMDB `/recommendations`, count how many seeds each candidate appears in, sort desc. Filters out the user's existing favorites + watchlist items via a single `excludeSet`.
  - **Enrichment**: per-candidate TMDB detail with `append_to_response=watch/providers`, picks user-region flatrate first then US fallback, applies `cleanProviderName` + dedupes.
- **Three rows** populated when data exists:
  - **From Your Favorites** — top 6 candidates from the same pool the hero comes from.
  - **Up Next From Your Watchlists** — read `watchlist_items` where `status = 'up_next'` (unblocked by Watchlist Status). Up to 6 items, subtitle "Added X ago" via `formatRelativeAgo`.
  - **Available on Your Services** — TMDB `/discover/movie` + `/discover/tv` filtered by the user's `region` (interleaved 1:1 movie:tv so the row reads mixed). Up to 6.
- **Hero card** (`ForYouHero`) — large poster + reason badge + title + meta (year · runtime · top-2 genres) + provider chips + overview + actions. Two CTAs: "Open {provider}" (links to title page; primary provider name used as label when available) and "Spin Again" (calls `spinHeroAction(currentTmdbId, currentMediaType)` which re-runs the feed with that pick excluded; optimistic in-place swap with refresh icon spin).
- **Compact cards** (`ForYouCard`) used inside rows — poster + title + "year · genre" + optional subtitle. Snap-scroll horizontal row (`scrollbar-thin`, matches the existing board view convention).
- **Actions** (`src/actions/forYou.ts`) — `getForYouFeedAction()` (full feed), `spinHeroAction(excludeId, excludeType)` (fresh hero with one excluded). Region resolved via the same priority used elsewhere: cookie → DB pref → 'US'.
- **Empty state** when user has no favorites + no watchlist items — CTAs to `/search` and `/watchlists`.

### Theme / Appearance Toggle — DONE
- **Light tokens** added to `src/styles/tokens.css` under `:root.light`. Background `#fafafa`, card `#ffffff`, secondary/border `#f4f4f5`/`#e4e4e7`, foreground `#09090b`, muted-foreground `#52525b`, destructive `#dc2626`, lighter shadows. Primary palette (`--primary`, hover/active) unchanged — same indigo accent reads on both.
- **DB persistence**: new `user_preferences.theme` column (nullable text). Migration `0012_remarkable_bloodscream.sql`. Plain text so the value space can grow (e.g. `'auto-dim-after-9pm'`) without schema churn. Service: `getTheme(userId)`, `updateTheme(userId, theme)` in `services/settings/index.ts`. Validator: `themeSchema = z.enum(['system', 'dark', 'light'])`. Action: `updateThemeAction(theme)`.
- **`ThemeProvider`** (`src/components/theme/ThemeProvider.tsx`) — client provider that reads localStorage on mount, listens to `prefers-color-scheme` when in `'system'` mode, applies the resolved class on `document.documentElement`. Exposes `useTheme()` hook returning `{ theme, resolved, setTheme }`. localStorage is the client source of truth; `setTheme` also write-throughs to the DB action best-effort.
- **Anti-FOUC inline script** — terse vanilla-JS snippet (`THEME_INIT_SCRIPT`) rendered via `dangerouslySetInnerHTML` in `<head>` of the root layout. Reads localStorage synchronously and toggles `light` / `dark` class on `<html>` *before* React paints, so users never see a dark→light flash on reload. Falls back to `dark` if localStorage / matchMedia throws.
- **Default = `dark`** for new users + anyone with no stored choice. Existing users keep seeing dark on first load; opting into `'system'` or `'light'` requires the picker. `<html className="dark" suppressHydrationWarning>` is the SSR baseline.
- **Picker UI** at `/settings/appearance` — new 3-card row (System · Dark · Light) with icon + label + description per card. Currently-selected has a primary ring + check. Click instantly applies the theme via `setTheme` (visual immediate) and write-throughs the DB best-effort via `updateThemeAction` (toast on failure but no rollback — localStorage already saved). New Sun icon added to the Settings index alongside Region / Privacy / Account.
- **Cross-device sync deferred (v2)**: DB column is written but not read on signin yet — localStorage stays authoritative across sessions on the same device. Cross-device pickup would need either (a) a cookie set server-side after signin that the anti-FOUC script reads or (b) a server-rendered class on `<html>` based on the user's stored theme. Either fits cleanly; current state is fine for single-device.

### Watchlists v2.1 — Status Enhancements + Notes + Board view — DONE
- **Status enum extended** to 9 values. Added `paused`, `dropped`, `rewatch`, `waiting_for_episode`, `waiting_for_season` alongside the original `just_added | up_next | watching | finished`. Migration `0011_spotty_sister_grimm.sql` uses `ALTER TYPE ... ADD VALUE`. Order across all UI follows the watching journey (pre-watch → in-progress → on-hold → completed → re-experience → abandoned).
- New colors in `STATUS_META`: cyan (waiting for episode), indigo (waiting for season), orange (paused), purple (rewatch), rose (dropped). `STATUS_ORDER` now exported from `StatusChip` and consumed by `StatusFilterBar` so the two stay in sync.
- **Journey timestamps** — `started_at` (timestamptz, set on first transition into `watching` or `rewatch`, never cleared so "started X ago" stays stable across pauses) + `finished_at` (timestamptz, set on entering `finished`, cleared on leaving). `updateItemStatus` is now a transaction that reads current row + applies appropriate set/clear in one roundtrip; ownership gate runs inside the same SELECT.
- "Started X ago" / "Finished X ago" helper line under the status pill on each card. Uses `formatRelativeAgo` and renders for any in-progress / on-hold / finished status.
- **Per-item notes** — new `notes` text column on `watchlist_items` (500-char cap, empty-string normalizes to null). New `updateItemNotes(userId, itemId, notes)` service + `updateItemNotesAction` server action. New `NotesEditor` component on the card: read-only for non-owners; "+ Add note" → inline textarea for owners. Cmd/Ctrl+Enter saves, Escape cancels, blur saves. Optimistic update with rollback + toast on failure. Mid-edit rollback keeps the user in edit mode so text isn't lost.
- **Board view** — new `WatchlistBoardView` Kanban layout. 9 horizontally-scrollable columns, one per status, with cross-column DnD via `@dnd-kit/core`. Drop on a different column calls `updateItemStatusAction`. Empty columns are droppable via `useDroppable`. Drag preview via `DragOverlay`. Optimistic move on `onDragOver` (rolls back on failure or cancel). Non-owners see a static read-only board.
- **View toggle** — new `Grid · Board` pill toggle next to the filter bar. State persists via URL `?view=board` for shareability + browser back. In Board mode the filter bar is hidden (board already shows all status columns) and replaced with a helper hint "Drag cards between columns to change status." Compact `WatchlistBoardCard` used inside columns: poster + title + year + notes line; status chip suppressed since the column header already signals it.
- **Hide-empty polish** — at 9 statuses the filter bar and board both become noisy, so empties are hidden by default:
  - `StatusFilterBar`: only renders chips with `count > 0` (plus the currently-active chip, even if it just dropped to 0 so the filter still has a handle). Small `Show all (+N)` link at the end of the row expands to all 9; `Hide empty` collapses back. Local state — doesn't pollute the URL.
  - `WatchlistBoardView`: only renders columns with items by default. During a drag (keyed off `activeId`), all 9 columns appear so the user can drop into any status; empty ones render at `opacity-40`. The `useDroppable` `isOver` highlight overrides the dim so the hovered drop target reads as live.
- **Board DnD UX fixes** — two follow-up tweaks after first-pass feedback:
  - Card body is draggable from anywhere. Earlier the `<Link>` had `onPointerDown={stopPropagation}` to "let clicks through" — but that swallowed the sortable's pointerdown so dragging only worked from the top border. Removed: dnd-kit's `activationConstraint: { distance: 4 }` already disambiguates (stationary click → Link navigates, 4px+ move → drag starts).
  - `DragOverlay` width set to `w-[224px]` to match the card's actual rendered width (column `w-[240px]` minus `p-2 × 2`). Rotation removed. Cursor switches to `cursor-grabbing` during drag. Net: overlay sits exactly under the cursor.
- **New `.scrollbar-thin` utility** in `globals.css` — 8px track, transparent background, rounded translucent thumb that brightens on hover. Applied to the board view's overflow container so the chunky default browser scrollbar doesn't poke through the dark UI. Pairs with the existing `.no-scrollbar` utility for cases where the affordance should be fully hidden.

### Provider Availability v2 (JustWatch fallback) — DONE
- TMDB's `watch/providers` snapshot lags JustWatch for many regions (e.g. PH for Lost has no TMDB data even though Disney+ is on JustWatch). Old silent US fallback caused Lost in PH to show Hulu — fixed.
- New `src/server/justwatch/` — thin GraphQL client + queries against the private `apis.justwatch.com/graphql` endpoint with 24h Next fetch cache. `searchByTitle` + `getOffersByPath` (uses `... on MovieOrShow` inline fragment required by JustWatch's schema).
- New `src/services/justwatch/index.ts` — `getJustWatchOffers({ tmdbId, mediaType, title, year, region })`. Search-in-US → match by `externalIds.tmdbId` → fetch offers for the user's region by `fullPath`. Maps results back to TMDB `provider_id` via `providersCatalog` so existing `ProviderBadge` styling pipeline keeps working.
- **Three-tier fallback** applied uniformly: (1) TMDB user region → (2) JustWatch user region with "via JustWatch ↗" chip → (3) TMDB US with "Not listed for {region}" chip. Implemented in:
  - `/title/[mediaType]/[id]` — full chain + visible source notes via `ProviderSection`
  - `/search` cards — chain runs silently (no room on cards for notes)
  - Collection part cards — same
  - Watchlist item card chip — same (via `services/watchlists/enrich.ts > resolveProvider`)
- New `cleanProviderName(name)` helper in `src/utils/providers.ts` — collapses "Amazon Prime Video With Ads" → "Prime Video", "Disney Plus" → "Disney+", etc. Adopted across all provider rendering surfaces.
- **Search card UX redesign**: Provider strip on search cards no longer always-visible. Now slides up from the bottom on `group-hover` / `group-focus-visible` with a gradient backdrop. Cap 3 visible + `+N` overflow chip.

### Watchlist Status v1 — DONE
- Schema: `watchlist_item_status` enum (`just_added | up_next | watching | finished`) + `watchlist_items.status` column (notNull, default `just_added`). Migration `0009_brainy_pepper_potts.sql`.
- Service: `updateItemStatus(userId, itemId, status)` in `services/watchlists/index.ts`. Ownership enforced via SQL subquery so cross-user mutation by guessing item IDs is impossible.
- Validator: `watchlistItemStatusSchema` + `updateItemStatusSchema` in `services/watchlists/validators.ts`. Status threaded onto `EnrichedWatchlistItem`.
- Action: `updateItemStatusAction(watchlistId, itemId, status)`.
- UI: new `StatusChip` component — color-coded pill (zinc / blue / amber / green) with a chevron when interactive. Lives in the card *footer* (not on the poster) to avoid colliding with the hover overlay; dropdown opens downward with high z-index so it layers over neighbor cards.
- Filter: new `StatusFilterBar` chip-row above the watchlist grid (`All · Just Added · Up Next · Watching · Finished` with live counts). State persists in URL `?status=watching` for shareability + browser back. DnD reorder is disabled when a filter is active (reordering a subset against a full `sortOrder` array would be confusing). Empty state when a filter has 0 results.

### Profile v2.1 — Accent Color + Top Providers + Region badge — DONE
- **Accent color personalization.** Schema: `user_profiles.accent_color` (nullable text) — migration `0010_careful_lockheed.sql`. Stored as a slug, not enum, so the value space can later include `'auto_from_favorites'` (the future "generate banner from favorite posters' colors" idea the user floated) without a migration.
- New `src/constants/accentColors.ts` — 8-color preset palette (Blue / Purple / Pink / Rose / Orange / Amber / Teal / Emerald), each with `primary`, `primaryHover`, `primaryActive`, `primarySoft`, `ring`. All readable with white text on the dark theme.
- New `<AccentScope accentColor={...}>` component (`src/components/profile/AccentScope.tsx`) — injects both `--primary*` and `--color-primary*` inline CSS variables on its root so Tailwind v4 utilities (`bg-primary`, `text-primary`, `ring-ring`) resolve to the accent inside the subtree regardless of `@theme` flattening. Null = pass-through.
- Applied on `/me` (viewer's accent), `/user/[username]` (owner's accent — visible to visitors), `/watchlists/[id]` (owner's accent), `/watchlists` (viewer's accent). Sidebar / global nav stays default. Owner-driven, not viewer-driven — surfaces adopt the surface owner's context.
- Picker: swatch row in `ProfileEditModal` (1 "Default" + 8 accent swatches, active gets a ring + check). Save propagates through existing `updateProfileAction`.
- **Top providers in taste.** `TasteProfile.providers: string[]` field; `getTasteProfile(userId, { region })` switches per-favorite TMDB fetch to `append_to_response=watch/providers` (one call for genres + decades + providers). Tally is region-scoped, falls back to US tally only if user-region tally is completely empty. `cleanProviderName` + dedupe per favorite so multi-tier listings don't double-count. New "Streams on" pill row rendered between "Loves to watch" and "Era".
- **Region badge on profile card.** `MapPin` row added to `/me` and `/user/[username]` next to "Joined", rendering the country name via `getCountryName(profile.region)`. Region pulled from `user_preferences.regionCode`.

### Settings v1 — DONE
- Schema: added `users.deletedAt` (timestamp, nullable, set when account is soft-deleted) + `user_preferences.hideFavorites` (boolean). Migration `0008_lumpy_shape.sql`.
- Service: `src/services/settings/index.ts` — `getPrivacySettings`, `updatePrivacy`, `changeEmail`, `changePassword`, `deleteAccount`. Password changes invalidate every other session inside a transaction. `changeEmail` flips `isVerified=false` so re-verification is required.
- Actions: `src/actions/settings.ts` — matching server actions, all auth-gated.
- UI: reshaped `/settings` index with Region / Privacy / Account / Delete account sections + Sign out. New pages `/settings/privacy` (3-state visibility dropdowns + hide-favorites toggle) and `/settings/account` (change email + change password forms). New `/settings/delete` page with "type DELETE to confirm" + current-password gate.
- Soft-delete uses a 30-day grace: `isDeleted=true`, `isActive=false`, `deletedAt=now()`. Signin already refuses `isDeleted` users so they can't sign back in. A scheduled hard-delete job is left as a follow-up.

### Activity v2.1 — DONE
- **Localized time grouping.** Server still emits a TZ-server-based `group` hint, but `ActivityPage` ignores it and recomputes TODAY / YESTERDAY / THIS WEEK / OLDER from each item's `createdAt` ISO using the viewer's local clock. Edges feel right regardless of server TZ.
- **Real-time-ish unread badge.** Sidebar polls `getUnreadActivityCountAction()` every 60s while the tab is visible, pauses on hide, and refetches immediately on `visibilitychange`-to-visible. Still also refetches on route change. Cheap (one count query per minute per active user).

### Profile v2 (continued) — DONE
- **Two-column dashboard on the Overview tab.** `lg:grid-cols-3` split: left rail = `TasteProfile` (col-span-1), right column = watchlists + favorites + activity previews (col-span-2). Stacks below `lg`. Other tabs (Watchlists / Favorites / Activity) stay full-width.
- **Taste profile aggregation.** New `getTasteProfile(userId)` service tallies the top 5 genres + top 3 decades from up to 50 movie/TV favorites. Reuses `tmdbFetch`'s 1h cache so repeat visits are cheap. Collections/artists are skipped (no genres/dates to derive).
- **`TasteProfile` component** — `Sparkles` header with two pill rows ("Loves to watch" / "Era"). Empty state copy: "Your taste profile is still learning. Favorite some movies and shows to fill it in."
- **`hideFavorites` honored on the public viewer.** `/user/[username]` now reads the owner's `user_preferences.hideFavorites` and skips the Favorites section for non-owners when set. Owners still see their own.
- **Public taste summary.** Same `TasteProfile` component renders at the bottom of `/user/[username]` when there's data.

### Profile v2 (partial) — DONE (previous round)
- Tab strip on `/me`: Overview / Watchlists / Favorites / Activity. Overview shows everything (current behavior); the other tabs filter to a single section. Reuses the existing `TitleTabs` component.
- Gradient default avatar — `UserAvatar` now renders an 8-color stable hash-based gradient (`bg-gradient-to-br`) when `avatarUrl` is empty, instead of the previous flat `bg-primary/20`. Same user always gets the same swatch.

### Activity Feed v2 — DONE
- **Pagination** — `getActivity` accepts `{ before, pageSize }` and returns `{ items, hasMore }`. First page = 50 events from the last 7 days; subsequent pages expand back to a 90-day hard cap.
- New `OLDER` group label for items older than the 7-day window; `groupFor()` correctly buckets paginated content.
- **Load older activity** button on `/activity` — uses `useTransition`, dedupes by id, hides when `hasMore` is false (with a "That's all your activity from the last 90 days." footer).
- **Per-item navigation** — service computes an `href` per item (favorite → `/title|/collection|/artist`; watchlist_add → `/title/{type}/{id}`; watchlist_create / bulk_add / aggregated → `/watchlists/{id}`; region_update → `/settings/region`). `ActivityRow` wraps in `<Link>` when href is set, with a subtle row-hover.
- **Unread badge in the sidebar** — `getUnreadActivityCountAction()` + `IconButton.count` wired up. Refetches on `usePathname` change so navigating to /activity → mark-all-read clears the dot.

### Activity Feed v1 — DONE
- New `activities` table: `id`, `userId` (feed owner), `actorId` (nullable — null = system event), `type` (`activity_type` enum), `payload` jsonb, `readAt`, `createdAt`. Indexed on `(userId, createdAt)`.
- New `activity_type` enum: `favorite`, `watchlist_create`, `watchlist_add`, `watchlist_bulk_add`, `region_update`, `follow` (follow reserved for social).
- `recordActivity(userId, event, opts?)` writer in `src/services/activity/record.ts`. Failure is swallowed + logged — activity must never break the primary action.
- Real `getActivity(userId)` reader: pulls last 50 events within the past 7 days, groups TODAY / YESTERDAY / THIS WEEK, enriches favorite + watchlist_add items with title + poster from TMDB at read time. `markAllActivityRead(userId)` sets `read_at = now()` on unread rows.
- New `watchlist_bulk_add` event kind + `ActivityRow` rendering ("added N titles to {watchlist}") so collection bulk-adds appear as a single line instead of flooding the feed.
- Recording hooks wired into existing services:
  - `addFavorite` → `favorite` event (only on fresh insert, not re-adds).
  - `createWatchlist` → `watchlist_create`.
  - `addItem` → `watchlist_add` (only on fresh insert).
  - `bulkAddItems` → `watchlist_bulk_add` with `count`.
  - `updateRegion` → `region_update` (system event, `actorId: null`, only when the region actually changes).
- Server actions in `src/actions/activity.ts`: `getActivityAction`, `markAllActivityReadAction`. Page + `MarkAllReadButton` use them; `MarkAllReadButton` calls `router.refresh()` after success so unread dots disappear without a manual reload.
- `/me` "Recent activity" section is now wired to real events (top 5). Empty state CTA points to `/search`. `ProfileOverview.recentActivity` added to the bundled overview payload.
- `MOCK_ACTIVITIES` (`src/services/activity/mock.ts`) deleted — no longer referenced.

### My Profile v1 — DONE
- `/me` page (server-component) renders a profile header card + watchlists preview (≤3) + favorites preview (≤6) + recent-activity empty state. All sections use existing components (`Card`, `WatchlistCard`, `FavoriteCard`, `EmptyState`, `Button`, `UserAvatar`).
- `/user/[username]` public viewer in the `(public)` group: header + public watchlists + recent favorites. Visibility-aware via `userPreferences.profileVisibility` (`followers_only` is treated as private until follows ship).
- Service: `getProfileWithStats`, `getMyProfileOverview`, `getPublicProfileOverview` — bundle profile + stats (favorites + watchlists counts, member-since) + previews in one round-trip. `getFavorites` now supports `{ limit }` + desc-by-createdAt ordering.
- `updateProfile` writes inside a transaction that mirrors `avatarUrl` to both `user_profiles` and `users` so the sidebar / auth store stay in sync. Client-side, the edit modal also calls `setAuthenticated({ ...user, avatarUrl })` so the change is reflected immediately without a refresh.
- Server actions in `src/actions/profile.ts`: `updateProfileAction`, `getMyProfileAction`, `getMyProfileOverviewAction`, `getPublicProfileAction`.
- Avatar upload: server-side optimization via `POST /api/me/avatar`. Sharp pipeline = EXIF-rotate → cover-crop 512×512 → WebP q80. Optimized buffer is the only thing pushed to UploadThing storage (`UTApi.uploadFiles` + `UTFile`); the original is never persisted. New `AvatarUpload` component (hidden file input + existing `Button`) replaces the `UploadButton` slot in `ProfileEditModal` — no layout changes.
- Env: `UPLOADTHING_TOKEN` now validated in `src/env.ts`. `next.config.ts` allows `utfs.io` + `*.ufs.sh` image hosts.
- `FavoriteCard.onRemove` made optional so the profile preview can render read-only without rebuilding the card.
- Bugfix: `UserAvatar` now passes intrinsic `width`/`height` per size variant (24/32/40) so `next/image` doesn't error on remote sources. CSS classes still control rendered size.

### Watchlists v1 — DONE
- Schema: `watchlists` (id, userId, name, description, isPublic, timestamps) + `watchlist_items` (id, watchlistId, mediaType enum, mediaId, sortOrder, timestamps) + `watchlist_media_type` enum. Unique index `(watchlistId, mediaType, mediaId)`.
- Service layer in `src/services/watchlists/`: full CRUD, add/remove items, `getWatchlistsContainingItem` (for picker checkbox state), `getOrCreateDefaultWatchlist`. `getWatchlist` is auth-aware — public lists viewable by non-owners.
- `enrichWatchlistItems()` batch-fetches TMDB details, mirroring favorites pattern.
- Signup transaction auto-creates a default "My Watchlist" alongside user/prefs/profile/session/code.
- Server actions: `src/actions/watchlists.ts`. Includes hybrid `addToWatchlistSmartAction` returning `{ mode: 'direct', watchlist }` for ≤1 list or `{ mode: 'picker' }` for multiple.
- UI: `/watchlists` list page (cards with item count + public/private badge, "New list" button, empty state); `/watchlists/[id]` detail page (header with edit/delete, item grid with optimistic remove). Shared `WatchlistFormModal` for create + edit.
- `AddToWatchlistButton` replaces the stub in `TitleActions`; opens `AddToWatchlistPicker` modal with per-list checkboxes + inline "+ Create new list".
- Added `ForbiddenAppError` (403) to `src/utils/errors.ts`.

### Favorites — DONE
- `userFavorites` table with `favoriteTypeEnum` (`'movie' | 'tv' | 'collection' | 'artist'`) and unique constraint `(userId, favoriteId, favoriteType)`.
- `enrichFavorites()` batch-fetches TMDB details and returns typed `EnrichedFavorite[]`.
- Favorites page with filter pills (All / Movies / TV / Collections / Artists) and sort dropdown (Recently added / A→Z).
- `FavoriteCard` with poster, title, year/subtitle, type badge, in-place remove (optimistic + toast).
- Empty states for both "no favorites" and "no matches for current filter".
- `FavoriteButton` works on title, collection, and artist pages with optimistic UI + toast.

### Public Search + Detail Pages
- `/search` and `/title`, `/tv`, `/collection`, `/artist` are public. Region picker (`RegionToggle`) on search; cookie persists region for SSR detail pages.
- Sign-in carries `?redirect=<pathname>` and applies the account's saved region preference, overriding the unauth pick.
- Auth-only actions (Watchlist, Favorite) are gated by `useAuthStore`; Share + Trailer remain public.
- `(public)/layout.tsx` renders `AuthenticatedShell` for signed-in users and `LandingNav` for visitors.

---

## Watchlists v1 — Follow-Ups Status

- ✅ **Public watchlist viewer route** — `(public)/watchlists/[id]` reachable unauth'd when `isPublic`. Sign-in link in `LandingNav` preserves `?redirect=`. Share button on the detail page when public.
- ✅ **Collection bulk-add** — `AddCollectionToWatchlistButton` wired into `CollectionActions`. Hybrid: direct bulk-add if user has ≤1 list (auto-create default if zero), `BulkAddCollectionPicker` for multi-list users. Server fetches collection parts from TMDB and inserts via `bulkAddItems` (duplicates skipped via unique index).
- ✅ **Reorder UI** — `@dnd-kit/core` + `@dnd-kit/sortable` integrated. Owner-only `SortableWatchlistItem` wraps the card with a grip-handle drag affordance. Optimistic local reorder with rollback on action failure. `sortOrder` is now actively used; `getWatchlist` orders by `(sort_order desc, created_at desc)` so new items land at the top.
- ✅ **Activity events** — `watchlist_create`, `watchlist_add`, and `watchlist_bulk_add` are now recorded from inside the service. Bulk-add emits a single summary row (no fan-out).
- ✅ **Watchlist Status (v1)** — see Recently Shipped. Items track `just_added | up_next | watching | finished`, filterable, owner-editable.

---

## Profile v2 — Remaining Follow-Ups

Tabs, gradient avatar, two-column dashboard, taste profile, `hideFavorites` honoring, accent color, top providers in taste, and region badge all shipped. **Newly shipped:**
- ✅ **Profile banner from favorites** — CSS poster-collage banner derived from the user's top 5 favorite posters (blurred + `--primary` mix-blend overlay). `user_profiles.bannerEnabled` jsonb toggle (default on) with self-service opt-out on `/settings/appearance`. Banner sits flush above the profile card (rounded-t-xl + `rounded-t-none border-t-0` on the Card).
- ✅ **Followers / Following tabs** — added to MyProfileClient alongside Overview / Watchlists / Favorites / Activity. `FollowListTabPanel` lazy-fetches via `listMyFollowersAction` / `listMyFollowingAction` and renders `UserListCard` rows with the viewer's follow state joined in one round-trip.

Still open:
- **"Taste signals" stat** — depends on a swipe feature that doesn't exist yet.
- **Two-column dashboard for tabs other than Overview** — Overview is 2-col; other tabs stay full-width by design. Reconsider if they start feeling sparse.

---

## Activity Feed v2 — Remaining Follow-Ups

Pagination, per-item nav, sidebar unread badge, localized grouping, and tab-visible polling all shipped. **Newly shipped:**
- ✅ **Aggregated-row split nav** — `watchlist_add_aggregated` items now expose `posterHref` (first title) alongside `href` (watchlist). Renders as two sibling Links instead of one outer Link, so the poster goes to the title page and the rest of the row goes to the watchlist.
- ✅ **Follow event recording + follow-back wiring** — landed alongside Social v1; `follow_request`, `follow_accepted`, and `follow_activity` notification types ship with bulk fanout (`INSERT…SELECT` + `LEFT JOIN user_preferences` for opt-out).
- ✅ **Real-time push** — in-process `notificationBus` (EventEmitter, globalThis-persisted for HMR). SSE stream emits on every `createNotification` insert + the bulk fanout `RETURNING`. Bell unread-count updates instantly when the tab is foregrounded.

(No outstanding items.)

---

## Settings — Remaining Follow-Ups

Privacy, Account, Delete, and Theme toggle shipped. **Newly shipped:**
- ✅ **Theme cross-device sync** — signin reads `user_preferences.theme` and writes the `watchly_theme` cookie. The anti-FOUC inline script reads cookie first, then localStorage, so a fresh device picks up the saved theme on first paint. `updateThemeAction` keeps both in lockstep; signout / delete clears the cookie.
- ✅ **Notification preferences** — per-type opt-in/out (`follow_events`, `follow_activity`) stored as jsonb on `user_preferences.notificationSettings`. UI on `/settings/notifications`. `shouldDeliverToUser()` gates every `createNotification` insert and the bulk fanout join.
- ✅ **Restore-account flow** — soft-deleted users can request a signed magic link via `/restore-account`. SHA-256 hashed token, 30-day TTL. Reactivates `users.isActive = true` + clears `deletedAt` on consume.
- ✅ **API tokens** — `api_tokens` table + `/settings/api-tokens` UI. `wkly_<base64url>` tokens stored as SHA-256 digests; `resolveRequestingUser()` accepts either session cookie or `Authorization: Bearer`.
- ✅ **Preferences (selected providers)** — jsonb array of TMDB provider IDs on `user_preferences.selectedProviders`. UI on `/settings/preferences` + modal entry point from For You. Feeds the For You scoring filter.

Still open:
- **Scheduled hard-delete job** — soft-delete sets `users.deletedAt`. A cron should permanently delete data after 30 days. Not built; data lingers until manual cleanup.

---

## For You v3 — Remaining Follow-Ups

v2 shipped (full scoring formula, per-seed "Because You Added" rows, Quick Picks, per-row filter chips, View All pages, scrollbar-hover UX, ROW_SIZE 18). **Newly shipped (v3):**
- ✅ **"Mark as Watched" hero action** — hybrid model: if the title sits in a watchlist, the existing item is flipped to `status='finished'` (`startedAt` defaulted via COALESCE, `finishedAt = now()`); otherwise it lands in a separate `watched_titles` table. Either way it joins the For You `excludeSet` via `getWatchedKeySet`.
- ✅ **Preferences modal + page** — `selectedProviders` jsonb on `user_preferences`. Settings page at `/settings/preferences` + an in-feed `PreferencesPicker` modal. `matchesProviderFilter` runs on enriched candidates so the filter applies across `from-favorites`, `popular`, `trending`, and `quick-picks` rows.
- ✅ **`/api/v1/for-you` REST route** — accepts session cookie or `Authorization: Bearer wkly_*`. Unified via `resolveRequestingUser`.

Still open:
- **"Not Interested" / hidden titles** — schema for `user_hidden_titles` (userId, tmdbId, mediaType, hiddenAt). Would feed the scoring formula's `−10 already hidden` penalty and let users dismiss bad recs.

---

## Lower Priority / Future Work

### Social — Follows & Friends — DONE (v1)
- ✅ `userFollows` table with `status` column (`pending`, `accepted`, `rejected`).
- ✅ `userBlocks` table; `blockUser` / `unblockUser` services + `ProfileMoreMenu` UI.
- ✅ Follow / unfollow / cancel-request / accept-request actions; hybrid approval: public profiles auto-accept, `followers_only` / `private` require approval.
- ✅ Follower / following list services + actions (`listFollowers`, `listFollowing`) feed both the dedicated `/user/:u/followers` + `/following` pages AND the new Profile tabs.
- ✅ Follow suggestions via `getFollowSuggestions` + `FollowSuggestionsRow` on the profile Overview tab.
- ✅ Follow button on the public profile (`FollowButton`) with mutual-followers hint.
- ✅ Follow-requests inbox at `/me/follow-requests`.
- Verification gate (`requireVerifiedOrInGrace`) hooked into requestFollow so unverified users past the 7-day grace can't spam follows.

### Email Verification — DONE
- ✅ Three-tier email transport in `server/email/send.ts` — Resend → MailHog (dev SMTP trapper) → log-only fallback. `EMAIL_FROM` defaults to `dev@watchly.dayonelabs.co`.
- ✅ `/verify-email` page consumes the link; `/api/v1/auth/verify-email` + `/resend` route handlers.
- ✅ Tokens stored as SHA-256 hashes via `services/auth/tokens.ts`; atomic single-use consume via `DELETE … RETURNING`. 7-day grace before gated actions start refusing.
- ✅ `VerifyEmailEmail` React Email template (shared `EmailLayout`).

### Password Recovery — DONE
- ✅ `/forgot-password` page + `POST /api/v1/auth/forgot-password` — no-enumeration response (always 200) to prevent account fishing.
- ✅ `/reset-password` page + `POST /api/v1/auth/reset-password` — token consumed atomically; new password validated with the same Zod schema as signup.
- ✅ `PasswordResetEmail` React Email template.
- ✅ Tokens purpose-discriminated via `token_purpose` enum so a reset link can't be reused as a verification link.

### Onboarding — Title Selection Step — DONE
- ✅ `/onboarding/titles` shows a poster grid (popular movies + TV interleaved, region-aware). Multi-select up to 20, Skip always available, Finish bulk-favorites picks via `submitOnboardingTitlesAction` and redirects to `/for-you`.
- ✅ Seeds feed directly into the "From Your Favorites" For You row — no separate seed table needed.

### Cross-Cutting Cleanups — Mostly DONE
- ✅ Button.asChild — implemented Slot-style `cloneElement` of the child (`<Button asChild><Link/></Button>` now produces `<a class="button-styling"/>` instead of an invalid nested `<button><a/></button>`). Dropped `forwardRef` since no caller passed refs.
- ✅ Consolidated `/signup` and `/sign-up` — canonical is `/signup`; `/sign-up` is a `permanentRedirect`.
- ✅ Structured logger wired into email, auth, social, notifications, activity, and settings services. Audited every log site — no secrets / tokens / passwords / verification codes leak.
- ✅ Pre-existing `react-hooks/set-state-in-effect` lint errors silenced with explanatory disables on the 3 legitimate "fetch-on-open" + "did-mount" patterns.

Still open:
- **API response shape unification** — `{ success, error: string }` shipped vs `.cursorrules.md`'s target `{ ok, error: { code, message } }`. Pick one canonical shape.
- **Server actions vs REST per feature** — both coexist; map and decide.

---

## Security Audit — Findings (2026-05-14)

Spot-verified against the codebase. False-positives from the raw audit (e.g. "signin/reset-password missing input validation" — the services Zod-parse, which is the project's canonical pattern) have been dropped.

### HIGH
- ✅ **Error response leaks internal messages** — `handleRoute` now scrubs `err.message` on non-AppError throws; the title, collection (×3), TV season/episode, and TMDB search routes returned `details: err.message` directly and were rewritten to log via the structured logger + return a generic client message.
- ✅ **Avatar upload MIME check is client-controlled** — `/api/me/avatar/route.ts` now magic-byte sniffs via `file-type` (allowlisted to JPEG/PNG/WebP/GIF/AVIF/HEIC) before handing the buffer to sharp. The old `file.type.startsWith('image/')` early-exit is gone.
- **TMDB search fan-out unbounded** — `src/services/tmdb/search.ts` fetches 3 pages × ~20 results and per-result watch-providers (≤5 at a time). Unauthenticated; no caller-level cap. A single attacker can saturate the 50 req/sec TMDB key. **Mitigation lives with the deferred rate-limit work.**

### MEDIUM
- ✅ **Log redaction shallow** — `lib/log.ts` now deep-walks (depth cap 6, cycle guard, Error special-case) and matches both sensitive key substrings (`password / token / secret / apikey / auth / salt / digest / cookie / session`) **and** sensitive value shapes (`wkly_*`, Bearer headers, hex-64 digests, JWT shape). Applied uniformly across info/warn/error.
- ✅ **Reset-password no-enumeration timing leak** — `services/auth/emailFlows.ts` now sleeps a randomized 80-260ms on the unknown-email branch of `sendPasswordResetEmail` and the unknown-userId branch of `sendRestoreAccountEmail`, masking the timing channel.
- **TMDB client doesn't validate response Content-Type** — `src/server/tmdb/client.ts` parses any 2xx body as JSON. Low impact; deferred.
- ✅ **Theme cookie TTL trimmed** — `watchly_theme` maxAge dropped from 365 → 90 days.

### LOW
- ✅ **`/api/v1/auth/forgot-password` timing leak** — folded into the constant-time mitigation above.
- **Avatar filename uses `Date.now()`** — UploadThing namespaces by team/key, so realistic collision risk is nil. Documented, no fix.
- **Password hashing uses scrypt N=16384** — acceptable but trails Argon2id. Defer unless a security review requests it.

---

## Rate-Limit — DONE (2026-05-14)

In-memory fixed-window limiter shipped. Single-instance state (each warm Node container owns its counter map). Effective limit on multi-instance serverless is `count × instanceCount`; trip-wire for migrating to Redis is "multiple warm prod instances routinely active".

### Backend
- **No external dependency.** Pure in-process Map-backed `FixedWindowLimiter` in `src/server/ratelimit/index.ts`. LRU-bounded at 50k entries with lazy expired-key prune on every `limit()` call.
- Algorithm: fixed-window. Easier in-memory than sliding-window-counter; start-of-window burstiness is acceptable at our granularities. The public API maps 1:1 to `@upstash/ratelimit` so a future Redis swap touches only the limiter file.

### Helpers
- ✅ `src/server/net/clientIp.ts` — `getClientIp(request)` reads `cf-connecting-ip` → `x-real-ip` → first of `x-forwarded-for` → falls back to `'unknown'`.
- ✅ `src/server/ratelimit/response.ts` — `tooManyResponse(retryAfterSeconds)` returns a 429 with `Retry-After` header + the `{ success: false, error }` body shape.
- ✅ `applyLimits([{ limiter, key }, …])` — runs multiple buckets in one call (composite IP+email for forgot-password). Returns the worst `retryAfter` and logs `[ratelimit] hit` once.

### Endpoint coverage

| Endpoint | Bucket | Key |
| -------- | ------ | --- |
| `POST /api/v1/auth/signin` | 10 / 5 min | IP |
| `POST /api/v1/auth/signup` | 5 / hour | IP |
| `POST /api/v1/auth/forgot-password` | 5 / 15 min (IP) **+** 2 / 15 min (email) | composite |
| `POST /api/v1/auth/verify-email/resend` | 5 / 15 min | IP |
| `POST /api/v1/auth/verify-email` | 20 / 15 min | IP |
| `POST /api/v1/auth/reset-password` | 10 / 15 min | IP |
| `POST /api/v1/auth/restore-account` | 5 / hour | IP |
| `GET /api/v1/tmdb/search` | 30 / min | `user:<id>` (authed) or `ip:<addr>` |

### Out of scope
- Server-action rate limiting (follow/unfollow/block). Verification gate already gates the obvious script vector.
- Migration to Redis. Stays in-memory until multi-instance traffic warrants it.

### Endpoint risk inventory

| Endpoint | Currently limited? | Risk |
| -------- | ------------------ | ---- |
| `POST /api/v1/auth/forgot-password` | No | **Critical** — unbounded email to arbitrary address |
| `POST /api/v1/auth/signin` | No | **High** — credential stuffing |
| `POST /api/v1/auth/signup` | No | **High** — account spam + email-send amplification |
| `POST /api/v1/auth/verify-email/resend` | Per-user 60s cooldown only | **High** — no IP gate, multi-account spam |
| `POST /api/v1/auth/reset-password` | No (token is single-use) | **Medium** — brute-force the 32-byte token space is infeasible but no ceiling |
| `POST /api/v1/auth/verify-email` | No (token is single-use) | **Medium** |
| `POST /api/v1/auth/restore-account` | No | **Medium** |
| `GET /api/v1/tmdb/search` | No | **Critical** — fans out to TMDB provider calls per result, drains the 50 req/sec key |
| `POST /api/v1/auth/follow*` (action layer) | Verification gate only | **Medium** — repeat follow/unfollow churn |

### Plan
1. Install `@upstash/ratelimit` + `@upstash/redis`. Use Upstash REST API (works from Edge runtime).
2. Add `getClientIp(request)` helper to read `cf-connecting-ip` → `x-forwarded-for` → `x-real-ip`, with a `'unknown'` fallback.
3. Wrap critical handlers with a small `withRateLimit(handler, { limiter })` decorator. Initial buckets:
   - Email-sending (forgot-password / verify-email resend / restore-account): **5 / 15 min / IP** + 2 / 15 min / email
   - Auth attempts (signin / reset-password): **10 / 5 min / IP**
   - Signup: **5 / hour / IP**
   - TMDB search: **30 / min / IP**
4. Return 429 with `Retry-After` header. Log spillover via `logger.warn` for observability.

---

## Page Navigation Optimization — Plan (2026-05-14)

### HIGH-IMPACT
- ✅ **loading.tsx sweep** — added a shared skeleton kit (`components/watchly/skeletons.tsx`: `SkeletonBox`, `PageHeaderSkeleton`, `PosterCardSkeleton`, `ListRowSkeleton`, `CardBlockSkeleton`). New per-route loading at `/me`, `/activity`, `/notifications`, `/watchlists`, `/for-you`, `/search`, and a cascading one at `/settings` that covers every settings sub-page. `/favorites/loading.tsx` re-aligned to the new tokens.
- ✅ **Per-request DB query in layouts** — extracted `getAccentColorFor(userId)` to `services/profile/accentCache.ts`, wrapped in `unstable_cache` (1h revalidate, per-user tag). Both `(authed)/layout.tsx` and `(public)/layout.tsx` now call the cached helper. `updateProfileAction` busts the tag via Next 16's `updateTag()` so picker changes apply on next nav.
- ✅ **`<img>` in `ProfileForm.tsx`** — converted to `next/image` with explicit width/height.

### MEDIUM-IMPACT
- ✅ **`<Image fill>` without `sizes`** — added in `CollectionCard.tsx` (backdrop + poster) and `TvSeasonsEpisodesPanel.tsx` (season poster grid + episode still).
- ✅ **`router.push` to routes without `loading.tsx`** — addressed by the loading sweep above.
- **No Suspense streaming on heavy server pages** — `/title/[mediaType]/[id]` parallelizes the final fetch but resolves region serially first. Still open; defer until we see measurable cold-fetch impact.

### LOW-IMPACT / NICE-TO-HAVE
- **Dynamic-import heavy client libs** — `@dnd-kit` (~50KB) ships with watchlists; `framer-motion` (~35KB) with LandingNav. Code-split via `next/dynamic` on the leaf component. Defer.
- **`tmdbFetch` revalidate = 3600s** — fine for cards; verify hit rate before tuning.
- **Middleware overhead** — clean today (one cookie check + array `.some()`). No action.

---

## Existing TODOs in Code

| File | TODO |
| ---- | ---- |
| `src/constants/providerStyles.ts:22` | Confirm IDs with the dev route later |
