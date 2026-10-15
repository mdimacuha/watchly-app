# Watchly Caching Strategy

**Scope:** Next.js 16 App Router on Vercel — page render modes, API route handlers, expensive per-user pipelines, the TMDB data layer, and static/edge assets.
**Thesis:** Watchly pays a Vercel function invocation on *every* request to *every* page and most read APIs today, even for content that is byte-for-byte identical across all users and all regions. The TMDB data layer is already region-independent and 1h fetch-cached, so the heavy lifting is already viewer-agnostic — we are simply failing to serve it from the CDN. The wins below convert that shared work from per-request compute into cache hits without sacrificing correctness, by isolating the genuinely per-user, mutable, and real-time surfaces as dynamic islands and never caching them.

---

## 1. Executive summary

Five wins carry the overwhelming majority of the payoff. They are ordered by impact-to-risk.

1. **Remove the two global dynamic taints — the single prerequisite for everything else (P0).** The root layout (`src/app/layout.tsx`) does `await headers()` for the maintenance gate, and the public layout (`src/app/(public)/layout.tsx`) does a top-level `getSession()` + `getAccentColorFor()`. Between them, **every route in the app is forced into per-request SSR** — landing, `/terms`, `/privacy`, TV season/episode pages, all of it. These pages fetch zero per-user data yet cost a Node function invocation per hit. Resolving both taints (PPR + a Suspense-wrapped maintenance/accent island, or moving the maintenance gate into `middleware.ts`) is the gate that unlocks every static/ISR/PPR win below. **Payoff: the highest-traffic public and crawler-facing pages move from function invocations to CDN-served HTML; global TTFB drops to edge-cache latency.**

2. **Cache the For You feed per `(userId, region)` (P0).** `getForYouFeed` (`src/services/forYou/index.ts:140`) is fully recomputed on every `/for-you` navigation — one cold build issues **~150–240 TMDB fetches** (seeds, candidates, enrichment over a 40-title pool, Up Next / Popular / Trending / Quick Picks / Because-Added rows) plus multiple DB scans, and re-runs all the scoring/sort even on a warm Data Cache. Wrapping the base case in `unstable_cache` with a 10-minute TTL and a `for-you:${userId}` tag collapses that into a single ~5KB cache read per user per 10 minutes. **Payoff: the largest single reduction in Vercel GB-s wall-time and p95 latency, plus TMDB rate-limit insulation when the shared Data Cache is cold.**

3. **Make the QuickView hot path CDN-cacheable (P0).** `src/app/api/v1/titles/[mediaType]/[id]/route.ts` is the app's most-opened read endpoint. It reads `cookies()` for a region fallback (making it dynamic) and returns `private, max-age=600` (browser-only), so every QuickView open runs `getTitlePagePayload` (~7 parallel TMDB fetches). Requiring `?region=` in the URL and dropping the cookie fallback lets us set `public, s-maxage=3600, stale-while-revalidate=86400` — the CDN keys per region and serves repeat opens of popular titles with **zero function invocations**.

4. **Prerender the public detail pages (title/collection/artist) as PPR shells (P0/P1).** These are Watchly's primary SEO and share-link targets, and the expensive work (multiple TMDB round-trips) is **region- and user-independent**. Prerender the TMDB shell statically; keep only the region-specific provider badges and the favorite/watchlist buttons as `<Suspense>` dynamic holes. Add `generateStaticParams` for hot titles and `generateMetadata` for OG/share cards. **Payoff: eliminates a function invocation plus several TMDB calls for the dominant anonymous/first-view segment.**

5. **Cheap platform hygiene with outsized return (P1).** Raise `images.minimumCacheTTL` from 7 days to 1 year (all image URLs are content-addressed and immutable), add the missing CDN headers to the episode and collection-images routes (siblings already have them), and mark the always-present brand SVGs `immutable`. These are near-zero-risk config changes that cut Vercel image-optimizer re-encodes, TMDB/Google origin fetches, and per-page revalidation round-trips.

**Aggregate payoff:** fewer TMDB calls (protecting a rate-limited, cost-bearing upstream), lower Vercel function-invocation count and GB-s billing, and materially lower TTFB across the highest-traffic public and authed surfaces — with correctness preserved by keeping every per-user/real-time bit as an uncached dynamic island backed by tag invalidation.

---

## 2. Caching principles for Watchly

Three data classes, three postures:

| Data class | Examples in Watchly | Posture | Primary Next.js primitive |
|---|---|---|---|
| **Static / public / shared** | TMDB title/collection/person/season/episode payloads, legal & landing copy, brand assets | **Cache hard.** Shared across every user and region; long TTLs. | `fetch` `next.revalidate` (Data Cache), route-segment `revalidate` + ISR, `generateStaticParams`, CDN `Cache-Control: public, s-maxage, stale-while-revalidate` |
| **Per-user computed** | For You feed, taste profile, follow suggestions, profile banner/enriched-watched, public profile payload | **Cache carefully, with tags.** Keyed by `userId`(+`region`); short–medium TTL; every mutation that changes an input emits a tag. | `unstable_cache(fn, keyParts, { revalidate, tags })` + `updateTag()` on mutation (Next 16 pattern, per `accentCache.ts`) |
| **Auth / real-time / viewer-relative** | `getSession`, favorite/watchlist status, region/geo detection, maintenance gate, SSE stream, follow-state, `isOwner`/`isSelf` | **Never cache across requests.** | React `cache()` for per-*request* dedup only; dynamic islands under `<Suspense>`; `Cache-Control: private, no-store` |

**How the primitives compose here.**

- **`fetch` revalidate (Data Cache)** is already the app's workhorse: `tmdbFetch` defaults to `next: { revalidate: 3600 }` (`src/server/tmdb/client.ts`), so TMDB HTTP responses are shared cross-request and cross-user. This is why the detail-page *shells* are cheap once we stop re-rendering them.
- **Route-segment `revalidate` / `dynamic` / ISR** control page HTML caching. Today no *page* sets a segment revalidate; only some API handlers do.
- **PPR (`experimental_ppr`)** is the right tool for the detail pages: a static prerendered shell with per-request dynamic holes. It preserves per-request correctness for the maintenance gate, region badges, and favorite state while making the expensive shared shell static. Enable incrementally via `experimental: { ppr: 'incremental' }` in `next.config.ts`, then opt routes in with `export const experimental_ppr = true`.
- **`unstable_cache`** is for expensive *computed* per-user pipelines that `fetch`-caching can't reach (it caches the aggregate result, not the individual fetches). Always put `region` in the key when providers are involved; always attach an invalidation tag.
- **React `cache()`** is per-request dedup only — it must remain the *only* cache wrapping `getSession`/`getSessionWithUser` and the `rows.ts` readers. Never promote it to `unstable_cache`.
- **CDN `Cache-Control`** on route handlers is what turns a read API from a function invocation into an edge hit. `public, s-maxage=…` is only ever safe when the response does **not** vary by cookie/session; otherwise `private` or `no-store`.

**The cardinal rule:** the boundary between "cache hard" and "never cache" runs *inside* the detail pages, not between them. The shared TMDB shell is cacheable; the region badge and the heart button are not. PPR/islands is how we honor both in one route.

---

## 3. Recommendations by layer

### (a) TMDB data layer

The TMDB layer is the app's foundation and is already in good shape — the recommendations here are about *lengthening* and *extending* existing cache coverage, not introducing it.

| What | Mechanism + TTL | Justification | Staleness risk & coverage |
|---|---|---|---|
| Baseline `tmdbFetch` cache | Already `next: { revalidate: 3600 }` (1h), shared cross-request/cross-user because URLs are region-less and region is selected in JS from `results[region]` | This region-independence is what makes the whole strategy work — the heavy fetches are viewer-agnostic and already shared | 1h bounds metadata staleness; acceptable for near-static movie/TV data |
| Per-credit provider fetches in `person.ts` | Already 6h revalidate | Filmography providers change slowly | Bounded 6h; fine for badges |
| Collection detail fan-out (`getCollectionDetails`) | Costliest TMDB work on the public surface (N per-part provider fetches, concurrency 5, + possible JustWatch). Consider raising the API-route TTL that fronts it (see §3c) to 6h | Membership/line-ups change on the order of months; extending TTL directly reduces cold recomputes and TMDB calls | Provider badges may lag streaming-window changes ≤6h; SWR refreshes in background |

**Principle:** because TMDB is rate-limited and is the heaviest cost/latency source, the correct default is *long* TTLs everywhere the URL is content-addressed. The only reason to keep 1h is provider-badge freshness, and that is better handled by keeping badges as a dynamic island than by shortening the shared shell TTL.

### (b) Page render modes (ISR / PPR)

**Prerequisite (P0): lift the two global taints.** Nothing in this subsection is achievable until:

1. **`src/app/layout.tsx` (lines 37–42)** stops tainting the tree. `headers().get('x-pathname')` at the root opts *every* page into dynamic rendering. Fix: enable `experimental: { ppr: 'incremental' }`, then either (a) extract the maintenance gate into a `<MaintenanceGate>` Suspense island so it becomes a per-request dynamic hole while the shell stays static, or (b) move maintenance detection into `middleware.ts` (which already stamps `x-pathname`) using an Edge-readable flag (Edge Config/KV — the `pg` pool can't run in Edge) and rewrite to `/maintenance` when active, removing `headers()` from the layout entirely. `getCurrentMaintenance()` already has a 30s `unstable_cache` + `MAINTENANCE_CACHE_TAG`, so per-request evaluation stays cheap either way.
2. **`src/app/(public)/layout.tsx` (lines 12–27)** stops tainting public routes. Push the `getSession()` + `getAccentColorFor()` reads into a Suspense-wrapped child so the logged-out shell (LandingNav + static `<main>`) prerenders and the authed accent chrome streams as a dynamic hole. `getAccentColorFor` is already `unstable_cache`'d (1h + per-user tag), so the authed path stays cheap.

**Why this is the top-of-funnel win:** these two calls block *every* CDN win downstream. Removing them is the prerequisite for landing, legal, TV, and detail-page caching alike, and directly cuts function-invocation cost on the highest-traffic public surfaces.

Once the taints are lifted:

| Route | Mode + mechanism | Dynamic holes (never baked) | Justification | Staleness & coverage |
|---|---|---|---|---|
| `src/app/page.tsx` (landing) | Static shell (prerenders for free; `experimental_ppr = true` if maintenance stays the sole root island) | Maintenance banner | Highest-traffic public entry, zero personalization | None — static copy; maintenance toggle still surfaces via island |
| `(public)/terms`, `(public)/privacy` | `force-static` (optionally relocate to a `(legal)` group with a session-free layout) or auto-static under PPR; revalidate on deploy | none | Identical for all users; changes only on deploy | None — deploy-time constant |
| `(public)/tv/[seriesId]/season/[seasonNumber]` | ISR: `export const revalidate = 86400` + `generateStaticParams` for hot series (`dynamicParams = true`) + `generateMetadata` | none (zero personalization) | Past-season data is immutable and identical for every user/region; re-SSR wastes a function invocation + TMDB calls | Airing seasons gain episodes; 24h revalidate keeps fresh; past seasons never change |
| `(public)/tv/.../episode/[episodeNumber]` | ISR: `revalidate = 86400`; rely on `dynamicParams = true` (fan-out too large to pre-generate) + `generateMetadata` | none | Aired-episode metadata is immutable and viewer-independent | Very low; unaired episodes covered by 24h revalidate |
| `(public)/title/[mediaType]/[id]` | PPR: `experimental_ppr = true`; static TMDB shell (default-region US badges) + `generateStaticParams` for trending/popular + `generateMetadata`; optional `revalidate = 3600` | region provider badges (reads `watchly_region` cookie); favorite/watchlist buttons (`getSession` + `isFavorite` + `isInAnyWatchlist`) | Main SEO/share destination; costly work is region- and user-independent — prerendering removes a function invocation + several TMDB calls for the dominant anonymous/first-view segment | Shell bounded by 1h revalidate; islands stay fresh; existing `revalidatePath` after favorite/watchlist mutations still covers the islands |
| `(public)/collection/[collectionId]` | PPR: static hero + parts grid + `generateStaticParams` (bounded, well-known set) | per-part region badges; single favorite button | Bounded, stable, viewer-independent dataset; dynamic bits are tiny. Mirror the `api/v1/tmdb/collections/[id]` TTL (3600) | Membership rarely changes; 1h shell TTL ample; favorite covered by `revalidatePath` |
| `(public)/artist/[id]` | PPR: static bio + filmography grid + `generateStaticParams` (popular persons); optional `revalidate = 21600` to match `person.ts` 6h provider TTL | favorite button; any per-credit region badges | Stable viewer-independent SEO target; filmography changes infrequently | New credits bounded by 6h revalidate; favorite is an island |
| `(public)/watchlists/[id]` (shareable) | ISR keyed by id via `unstable_cache` tagged `watchlist:${id}` | owner-only controls (`isOwner`-gated edit/reorder) | Shared links attract repeat/anon traffic; list body is identical across viewers | **Tag bust from add/remove/edit actions is the required correctness mechanism** — without it an ISR shell shows a stale list |
| `(public)/user/[username]` | **Keep render dynamic**; cache only the target-user *public* payload via `unstable_cache` tagged `profile:${username}` | `isSelf`, `followState`, `mutualFollowers` computed per-request | Popular profiles viewed by many; public portion is identical across viewers — a data-cache win, not a render-mode change | Public-payload staleness bounded by tag bust on the owner's profile/privacy/follow mutations |
| `(public)/search` | Static shell prerenders for free (already `<Suspense><SearchPageClient/></Suspense>`, no server data) | none server-side (results client-fetched) | Content-free shell identical for all users | None; result freshness handled at the API layer |
| `signin` / `signup` / `sign-up` / `forgot-password` / `reset-password` / `restore-account` / `verify-email` / `onboarding/**` | Static form shells under PPR (`experimental_ppr = true`) | redirect-if-already-authed check kept as a small dynamic island / client guard, not a top-level await | Form shells are identical across anon users; common entry point | Redirect correctness preserved by keeping the auth check dynamic |
| `(authed)/**` (for-you, me, favorites, watchlists, swipe, activity, notifications, settings) | **Keep bodies dynamic.** Optional PPR refinement: prerender the `AuthenticatedShell` chrome, stream the per-user body | entire page body | Fully personalized — body caching would leak/stale personal data | Shell-only PPR carries no data-leak risk (frame holds no per-user data) |

### (c) API route handlers (CDN)

Two classes already exist: public TMDB read routes that CDN-cache correctly (`v1/tmdb/collections`, `v1/tmdb/collections/[id]`, `v1/collections/[collectionId]`, `v1/tv/.../season/[seasonNumber]` — all set `revalidate = 3600` + `public, s-maxage=3600, stale-while-revalidate=86400`), and authed/dynamic routes through `handleRoute()` that set no `Cache-Control` at all. The gaps:

| Route | Change | TTL / directive | Justification | Risk & coverage |
|---|---|---|---|---|
| `v1/titles/[mediaType]/[id]` (QuickView hot path) — **P0** | Require `?region=` from the client, drop the `cookies()` fallback so the handler is no longer dynamic; then make it public | `public, s-maxage=3600, stale-while-revalidate=86400` (+ optional `revalidate = 3600`) | Single highest-traffic read path; converts per-open function invocation into edge hits for popular titles | Provider availability bounded by 1h + SWR. **Correctness depends on region ALWAYS in the URL** — if the cookie fallback is kept, response varies by cookie and must stay `private` |
| `v1/tv/.../episode/[episodeNumber]` — **P1** | Add the CDN headers its sibling season route already has (oversight) | `revalidate = 3600` + `public, s-maxage=3600, stale-while-revalidate=86400` (6h defensible) | Non-personalized, near-static; removes needless function invocations | Very low; no region, so shared caching is correct |
| `v1/tmdb/collections/[id]/images` — **P1** | Add CDN caching | `revalidate = 86400` + `public, s-maxage=86400, stale-while-revalidate=604800` | Image path lists are non-personalized and about as static as TMDB gets | Minimal; set of images changes very rarely |
| `v1/tmdb/collections`, `v1/tmdb/collections/[id]`, `v1/collections/[collectionId]`, `v1/tv/.../season/[seasonNumber]` — **P2** | Optionally lengthen existing TTL | `revalidate = 21600` + `s-maxage=21600, stale-while-revalidate=604800` (6h) | The per-part provider fan-out in `getCollectionDetails` is the costliest public TMDB work; volatility is very low | Badges may lag ≤6h; acceptable for card previews, covered by SWR |
| `v1/tmdb/search` — **P2** | **Keep private** (defensive note, not a change) | Leave `private, max-age=300`; optionally add `stale-while-revalidate=300` | Personalizes provider badges by region/user via `searchContent(params, userId)`; rate-limited per session/IP | CDN-caching this would leak region-specific results across users — must stay private |
| `api/me` — **P2** | Add explicit header (defense-in-depth; cookie read already prevents sharing) | `private, no-store` | Highest-frequency authed GET (every navigation); per-user identity + region must never land in a shared cache | None — stays fully dynamic |
| `geo/ipapi`, `v1/for-you`, `v1/swipe/deck` — **P2** | Add explicit header (via an optional header path in `handleRoute`) | `private, no-store` — never any `s-maxage`/`public` | Cheap defense-in-depth so a future refactor removing a cookie read (or an edge proxy) can never share per-user feed/deck/geo | CDN-caching any of these would serve one user's feed/deck/geo to another — a privacy defect; `no-store` prevents it with zero staleness downside |

### (d) Expensive pipelines + DB dedup

Request-level dedup is already well done: `getSession`/`getSessionWithUser` (`session.ts:34,55`) and `getUserRowById`/`getUserProfileRow`/`getUserPreferencesRow` (`rows.ts:16-30`) are all React-`cache()`-wrapped, and `getUserRegion` delegates to the cached prefs row. The gap is that **no expensive per-user *computed* pipeline is cached across requests** — they are all recomputed on every navigation because the pages are dynamic.

| Pipeline | Mechanism | TTL / tag | Justification | Staleness & invalidation |
|---|---|---|---|---|
| **`getForYouFeed` base case** (`forYou/index.ts:140`) — **P0** | `unstable_cache(fn, ['for-you-feed', userId, region], { revalidate: 600, tags: [\`for-you:${userId}\`] })`. Keep spin/`excludeKeys`/View-All variants OUT of the cache | 10 min; `for-you:${userId}` | Highest-cost pipeline in the app: ~150–240 TMDB fetches + heavy scoring per navigation, collapsed to a ~5KB read per user/10min. Slashes GB-s and p95, shields TMDB when the Data Cache is cold | A just-favorited/swiped/watched title could linger ≤10min. Covered by `updateTag(\`for-you:${userId}\`)` on all input mutations (read-your-writes on next paint); TTL is only a backstop. **See §4 for the must-fix tag gaps.** `region` must be in the key |
| **`getTasteProfile`** (`profile/index.ts:331`) — **P1** | `unstable_cache(fn, ['taste-profile', userId, region], { revalidate: 3600, tags: [\`taste:${userId}\`] })` | 1h; `taste:${userId}` | Up to 50 provider-enriched TMDB detail calls per call — second-biggest fan-out — and it runs on both `/me` and *every* visitor to a public profile | Taste drifts ≤1h; fully covered by tag bust on favorite toggle, mark-watched, swipe save/like. `region` in key keeps PH vs US tallies correct |
| **`getFollowSuggestions`** (`social/index.ts:492`) — **P1** | `unstable_cache(fn, ['follow-suggestions', viewerId], { revalidate: 900, tags: [\`follow-graph:${viewerId}\`] })` | 15 min; `follow-graph:${viewerId}` | Runs on every `/me` load; the popularity fallback (`social/index.ts:594-598`) `ORDER BY`s the **entire users table** on a correlated follower-count subquery — an O(users) latent scaling cost on Postgres | A newly-followed account may appear as a suggestion ≤15min; advisory/fuzzy data, low correctness impact. Bust in `requestFollow`/`acceptFollow`/`unfollow`/`cancelFollow`/`blockUser`/`unblockUser` |
| **Profile overview TMDB sub-parts** (`profile/index.ts:260`/`482`) — **P1** | Wrap `getBannerPosters(userId)` and the enriched-watched (`take:60`) layer in `unstable_cache` keyed by `userId`, tags `banner:${userId}` / `watched:${userId}`. **Leave counts, `followState`, `followSummary`, `mutualFollowers` UNCACHED** | 30–60 min; `banner:${userId}`, `watched:${userId}` | Splits the semi-stable heavy TMDB enrichment (dozens of fetches) from personalized must-be-fresh social data, cutting the largest profile-page TMDB cost without staleness on social state | Banner/watched stale ≤30–60min; covered by mark-watched (`actions/watched.ts`) and banner/appearance (`actions/profileBanner.ts`). **Must NOT fold `followState`/counts into the same entry** |
| **`getSwipeSignals`** (`swipe/index.ts:195`) — **P2** | Wrap in React `cache()` (per-request); optionally derive `getSwipeKeySet` from it | per-request | Within one feed build, `title_swipes` is scanned redundantly: `loadPassedGenreSet` (`:357`) and `pickSeeds` (`:503`) both call it, plus a 3rd scan via `getSwipeKeySet` — 2–3 identical full scans per request | None — per-request, per-userId; recomputed each request. Zero-risk, matches existing `rows.ts` pattern |
| **`getForYouRow` pool** (View All infinite scroll, `forYou/index.ts:1135`) — **P2** | `unstable_cache` the pool builders: `gatherCandidates` keyed by `userId`+seed-set (tag `for-you:${userId}`); `buildRegionPopularPool` keyed by `region`+`rowId` (shared tag `for-you-pool:${region}:${rowId}`) | 300–600s | During infinite scroll a user pages 3–6 times in seconds; each page currently re-runs pool generation (re-`pickSeeds` for `from_favorites`, re-walk up to 5 TMDB list pages for popular/trending). Enrichment of the requested window stays per-request | Pool stable within a scroll session by design (pages don't overlap); covered by the same `for-you` tag |

### (e) Assets / images / edge

The `next.config.ts` images block is already well-tuned (avif/webp, explicit sizes, correct `remotePatterns`), fonts self-host under `_next/static/media` with immutable headers, and the middleware matcher already skips hashed static assets. Remaining wins:

| What | Mechanism | Justification | Risk |
|---|---|---|---|
| **Image optimizer TTL** (`next.config.ts:11`) — **P1** | Raise `minimumCacheTTL` 604800 → **31536000 (1yr)** | Every source is content-addressed/immutable per URL (TMDB `/t/p/size/hash.jpg`, UploadThing unique keys, Google s2/favicons stable per domain). After 7d the optimizer needlessly re-fetches origin + re-encodes for bytes that never change — extra optimizer invocations, TTFB spikes, and hits against rate-limited TMDB/Google | Very low — all three hosts change the URL when content changes, so a long TTL never serves stale content |
| **Root-layout `headers()` blocks landing/legal static** (`layout.tsx:37`) — **P1** | Relocate the maintenance gate to `middleware.ts` (or the `(authed)` layout), then `force-static` (or `revalidate = 86400`) on `page.tsx`, `(public)/privacy`, `(public)/terms` | These are the highest-traffic unauthenticated, crawler-first pages; copy is hardcoded `SECTIONS` arrays. Converts per-request Node invocations into CDN static HTML | Low — a rebuild/ISR picks up edits; the maintenance banner still reaches them via middleware, which runs on every request regardless of static HTML |
| **Raw `<img>` avatar** (`ActivityAvatar.tsx:33`) — **P1** | Replace with `next/image` (`width={40} height={40}`; host already whitelisted) | Activity feeds render many avatar rows; each raw `<img>` bypasses AVIF/WebP, responsive sizing, and the optimizer's edge cache — re-fetching the full original from `utfs.io` on every render | Low — UploadThing keys are unique per upload, so an avatar change yields a new URL; no stale-image risk under a long TTL |
| **Unhashed `/public` brand assets** — **P2** | Add an async `headers()` block: `public, max-age=31536000, immutable` for `/brand-light.svg`, `/providers/:file*`, other static SVGs | `brand-light.svg` is requested on virtually every page (landing nav, authed sidebar/shell, auth layout, maintenance screen); default `max-age=0, must-revalidate` forces a 304 round-trip on every load | With `immutable`, a logo change won't reach clients until the filename changes or TTL lapses — **version the filename on brand updates** (`brand-light.v2.svg`) or use a 1-day `max-age` without `immutable` |
| **Share-link resolver** (`s/[slug]/page.tsx`) — **P2** | Move the pure slug→redirect logic into `middleware.ts` (`NextResponse.redirect`), keep the page as fallback | Share links are a hot public entry path; resolving in the already-running middleware saves one RSC function invocation per click and shaves latency (edge redirect vs Node RSC) | Low — deterministic mapping; keep the invalid-slug → `/` fallback |
| **Middleware matcher** (`middleware.ts:64`) — **P2** | *If* `robots.txt`/`sitemap.xml`/`site.webmanifest`/public `.avif` files are added later, extend the negative-lookahead to include `avif|webmanifest|txt|xml|woff2` | Pre-empts unnecessary (billed) edge invocations on static metadata files that don't need the auth gate | None — additive; no change needed until such files exist |

---

## 4. Cache invalidation & tag taxonomy

Every cross-request cache entry must be **either** short-TTL-only **or** tag-invalidated. For per-user data, the tag is the correctness mechanism and the TTL is only a backstop.

### Tag scheme

| Tag | Subscribing cached read(s) | Emitting mutation(s) |
|---|---|---|
| `for-you:${userId}` | `getForYouFeed` base case; `getForYouRow` pools (favorites path) | `recordSwipeAction`, `undoSwipeAction`, `resetSwipeHistory` (`actions/swipe.ts`); `markAsWatchedAction` (`actions/forYou.ts:105`) + `actions/watched.ts`; **`toggleFavoriteAction` (`actions/favorites.ts`)**; **watchlist add/remove/status (`actions/watchlists.ts`)**; `updateSelectedProviders` (`actions/forYouPrefs.ts`); `updateRegion` (`services/preferences`) |
| `taste:${userId}` | `getTasteProfile` | favorite toggle, mark-watched, swipe save/like |
| `follow-graph:${viewerId}` | `getFollowSuggestions` | `requestFollow`, `acceptFollow`, `unfollow`, `cancelFollow`, `blockUser`, `unblockUser` (`actions/social.ts`) |
| `banner:${userId}` | `getBannerPosters` | banner/appearance changes (`actions/profileBanner.ts`) |
| `watched:${userId}` | enriched-watched layer | mark-watched (`actions/watched.ts`) |
| `profile:${username}` | public profile payload (`user/[username]`) | that user's profile/privacy/follow mutations |
| `watchlist:${id}` | public watchlist ISR shell (`watchlists/[id]`) | that list's add/remove/edit actions |
| `for-you-pool:${region}:${rowId}` | `buildRegionPopularPool` | (shared/global; TTL-bounded) |
| *(existing)* per-user accent tag | `getAccentColorFor` | `invalidateAccentColorFor` on profile edit |
| *(existing)* `MAINTENANCE_CACHE_TAG` | `getCurrentMaintenance` (30s) | admin maintenance toggle |

Use Next 16 `updateTag()` on the mutation path (same pattern as `accentCache.ts`), not just `revalidatePath`. `region` (from `resolveRegion` / the `watchly_region` cookie) must be resolved per-request and passed *in* as a cache key — `unstable_cache` cannot read cookies.

### Staleness bugs found (must-fix before enabling the caches)

These are correctness gaps that turn a safe cache into a stale-data bug if introduced naively:

1. **`toggleFavoriteAction` and the watchlist add/remove/status actions do NOT currently revalidate `/for-you`.** Today the ~82 `revalidatePath('/for-you')` calls are cost no-ops (the page is dynamic, nothing is stored). The moment `getForYouFeed` is cached, **these two mutation paths must call `updateTag(\`for-you:${userId}\`)`** or a just-favorited/added title won't reflect in the feed until the 10-minute TTL lapses. This is the single highest-risk gap — the feed cache is unsafe to ship without it.
2. **Public watchlist ISR (`watchlists/[id]`) requires the tag bust from its mutation actions.** Without `updateTag(\`watchlist:${id}\`)` on add/remove/edit, the ISR shell shows a stale list. The tag is the required correctness mechanism, not the TTL.
3. **Public profile cache (`profile:${username}`) requires the tag bust on the owner's mutations.** Without it, cached favorites/watchlists/taste on a popular profile lag behind the owner's edits.
4. **QuickView CDN promotion requires region in the URL.** If `v1/titles/[mediaType]/[id]` keeps the `cookies()` region fallback, the response varies by cookie and **must stay `private`** — promoting it to `public` while it reads a cookie would serve one region's providers to another.

---

## 5. What we intentionally do NOT cache

These stay dynamic/uncached by design. Caching any of them is a correctness or privacy defect, not an optimization.

- **`getSession` / `getSessionWithUser` (`session.ts`).** Must reflect real-time DB state — logout, expiry, and revocation must take effect immediately. Correctly wrapped in React `cache()` for per-*request* dedup only; **never** a cross-request `unstable_cache`, or a revoked/expired cookie could be served as valid.
- **Favorite / watchlist status (`isFavorite`, `isInAnyWatchlist`) on title/collection/artist pages.** Per-user, mutable state that flips the instant the user taps the heart/bookmark. Stays a dynamic island; baking it into a shared shell would show wrong state and leak one user's state to others.
- **Maintenance gate (`getCurrentMaintenance`).** Must be evaluated per request so an admin toggle gates the whole app near-instantly. Keep it a dynamic island (already 30s `unstable_cache` + tag for cheap reads with instant bust). Never bake the OFF state into a static page.
- **Region-specific provider badges (`results[region]` selection).** Streaming availability varies by the viewer's region (`watchly_region` cookie / DB fallback). Where the TMDB shell is prerendered/shared, badges must be a dynamic Suspense hole — otherwise every viewer sees the default (US) region's availability.
- **`api/me/notifications/stream` (SSE).** Real-time server-sent-events stream — already `force-dynamic`, `runtime='nodejs'`, `no-cache`. Caching would freeze the live notification feed and the in-process notification bus. *(Platform caveat, not a caching fix: each connection holds a long-lived Node function alive with 25s heartbeats, billed as wall-clock duration + concurrency, and the in-process bus is per-instance — consider `maxDuration` bounds or a polling fallback if SSE cost/consistency becomes an issue.)*
- **Viewer-relative profile fields (`isSelf`, `followState`, `mutualFollowers`).** Depend on *who* is viewing, not on the profile owner. Computed per-request even when the owner's public payload is cached per-username. A just-accepted/blocked follow must reflect immediately (read-your-writes).
- **Public watchlist owner controls (`isOwner`).** Viewer-relative gate for edit/reorder UI. The list body can be ISR-cached per id, but ownership must never be baked into the shared shell.
- **All `(authed)` page bodies** (for-you feed, me, favorites, watchlists, swipe queue, notifications, settings). Fully personalized — caching any body across requests would leak personal data or serve stale personal state. Only the outer shell chrome is safe to prerender.
- **Profile stat counts (`favoritesCount`, `watchlistsCount`, `watchedCount`).** Cheap `COUNT(*)` backing visible numbers; leave dynamic (or cache only with strict per-user tag busting) so displayed counts never contradict a just-performed action.
- **Geo/region detection (`api/geo/ipapi`, `onboarding/region/auto`).** Reads request-specific geo/IP (already `cache: 'no-store'`). Next's URL-keyed fetch cache would serve the first caller's country to everyone — must stay fresh per request.
- **Auth mutations (`v1/auth/*`), profile/region/avatar mutations, swipe POST/DELETE, uploadthing.** Set cookies, mutate state, or sign uploads — inherently uncacheable.

---

## 6. Prioritized rollout plan

Ordered safest-and-highest-impact first. Effort is relative engineering cost; impact is combined TMDB-call, function-invocation, and latency reduction.

| # | Item | Layer | Priority | Effort | Impact | Notes / dependency |
|---|---|---|---|---|---|---|
| 1 | Image optimizer TTL 7d→1yr | Assets | P1 | Trivial | High | One-line config; zero risk; do first |
| 2 | Episode + collection-images route CDN headers | API | P1 | Trivial | Med | Mirror existing sibling routes |
| 3 | `getSwipeSignals` React `cache()` dedup | Pipeline | P2 | Trivial | Med | Zero-risk per-request dedup |
| 4 | Lift root-layout `headers()` taint (maintenance → middleware / PPR island) | Render | **P0** | Med | **Very high** | **Prerequisite for items 5–9** |
| 5 | Lift `(public)` layout `getSession` taint (session/accent → Suspense island) | Render | **P0** | Med | **Very high** | Depends on #4 (PPR enabled) |
| 6 | Landing + legal → static/ISR | Render | P1 | Low | High | Depends on #4/#5 |
| 7 | TV season/episode → ISR (`revalidate=86400`, `generateStaticParams`, `generateMetadata`) | Render | P0/P1 | Low | High | Depends on #4/#5; zero personalization |
| 8 | QuickView `v1/titles/[id]` → public CDN (region in URL) | API | **P0** | Med | **Very high** | Requires client change to pass `?region=`; **must not stay cookie-varying + public** |
| 9 | Title/collection/artist → PPR shells + islands + `generateStaticParams`/`generateMetadata` | Render | P0/P1 | High | **Very high** | Depends on #4/#5; main SEO/share win |
| 10 | For You feed `unstable_cache` per `(userId, region)` + tags | Pipeline | **P0** | High | **Very high** | **Blocked until §4 gap #1 fixed** — add `for-you` tag to favorite/watchlist actions first |
| 11 | Taste profile + follow suggestions + profile TMDB sub-parts caches | Pipeline | P1 | Med | High | Independent of render-mode work; big public-profile win |
| 12 | Explicit `private, no-store` on `api/me`, `for-you`, `swipe/deck`, `geo/ipapi` | API | P2 | Low | Low (defensive) | Defense-in-depth for future refactors/proxies |
| 13 | `ActivityAvatar` → `next/image` | Assets | P1 | Low | Med | Independent |
| 14 | Brand-asset `immutable` headers (with filename versioning) | Assets | P2 | Low | Med | Version filenames on brand change |
| 15 | Public watchlist / public profile caches | Render/Pipeline | P2 | Med | Med | **Blocked until §4 gaps #2/#3 fixed** (tag busts) |
| 16 | Share-link resolver → middleware; auth/onboarding PPR shells; View-All pool cache; middleware matcher | Edge/Render/Pipeline | P2 | Low–Med | Low–Med | Opportunistic follow-ups |

**Sequencing logic:** ship the zero-risk config/dedup wins (1–3) immediately for early payoff. Then land the two taint fixes (4–5) as one PPR-enablement workstream — they unblock the entire public-page cascade. Fix the invalidation gaps in §4 *before* the feed and shared-content caches (10, 15). The feed cache (10) is the biggest single compute win but has the highest correctness dependency, so it follows its tag-fix prerequisite.

---

## 7. Risks & guardrails

**Never serve private data from a shared cache.**
- A response may be `public`/`s-maxage` **only** if it does not read `cookies()`, `headers()`, or `getSession()` and does not vary by user or region. The QuickView promotion (item 8) is the canonical trap: it is safe *only* once region moves into the URL and the cookie fallback is removed. If in doubt, `private, no-store`.
- Every `unstable_cache` entry that involves streaming providers **must include `region` in the key**. A feed or taste-profile entry keyed by `userId` alone would show a user another region's providers.
- PPR static shells must contain **no per-user data** — verify by loading a prerendered detail page as an anonymous user and confirming no favorite state, no non-default-region badges, and no accent chrome leak into the static output. All of those must render only inside `<Suspense>` holes.

**Never serve stale data past a mutation.**
- For every per-user cache, confirm **read-your-writes on next paint**: perform the mutation, reload the surface, and confirm the change is visible without waiting for the TTL. If it isn't, the mutation is missing its `updateTag` call — most likely one of the §4 gaps.
- Treat the §4 bugs as merge-blockers for their dependent caches, not as follow-ups.

**Verification & monitoring.**
- Inspect the **`x-vercel-cache`** response header: `HIT` (served from edge), `MISS` (function ran, now cached), `STALE` (SWR served stale + revalidating), `BYPASS` (dynamic). After each rollout item, the target route should trend toward `HIT`/`STALE` and away from `BYPASS`/`MISS`.
- Track **cache HIT rate** per route in Vercel analytics and watch **function invocation count** and **GB-s** on the QuickView route and `/for-you` — those are the two metrics the P0 items are designed to move.
- Watch **TMDB call volume** as the leading indicator that the Data Cache and the new pipeline caches are absorbing load (and as the rate-limit safety margin).
- For ISR/PPR pages, confirm `generateStaticParams` prerendered the hot set at build (build output lists static vs. dynamic routes) and that long-tail params render on first hit then serve cached (`dynamicParams = true`).
- After enabling `experimental: { ppr: 'incremental' }`, roll routes in one at a time via `experimental_ppr = true` and diff the build's static/dynamic route table each step — this keeps a mistaken taint from silently re-dynamizing a page you expected to be static.

**Guardrail summary:** the strategy is safe precisely because the cache boundary runs *inside* each surface. As long as (1) shared caches never read request-scoped inputs, (2) region keys every provider-scoped entry, (3) every per-user cache has a mutation-emitted tag, and (4) auth/geo/SSE/viewer-relative bits stay uncached dynamic islands, we capture the full TMDB/function/latency payoff with no correctness regression.