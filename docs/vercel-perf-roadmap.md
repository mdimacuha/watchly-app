# Watchly — Vercel Performance & Cost Roadmap

Living plan for keeping Watchly within Vercel **Hobby** limits: Fluid **Active
CPU**, **Image Optimization Transformations**, function **invocations**, and
bandwidth. Tracks what's shipped, what's next, in what order, and how to verify.

- **Authority for the deep analysis:** [`docs/caching-strategy.md`](./caching-strategy.md)
  — render-mode taxonomy, cache-tag scheme, and the explicit *"do NOT cache"* list.
  Read it before any change here; this doc is the forward-looking roadmap.
- **Related:** [`docs/seo-implementation.md`](./seo-implementation.md) (metadata/OG/sitemap touch the same public routes).

_Last updated: 2026-07-11._

---

## Guardrails (permanent — apply to every item below)

1. **Never** globally cache authenticated / private / user-specific data —
   session, notifications, favorites, watchlists, follows, personalized feeds,
   region-specific provider badges.
2. A response may be `public` / `s-maxage` **only if** it does not read
   `cookies()` / `headers()` / `getSession()` and does not vary by user or region.
   If in doubt → `private, no-store`.
3. Every `unstable_cache` entry that involves streaming providers **must include
   `region` in the key** (a `userId`-only key leaks another region's providers).
4. Every per-user cache **must have a mutation-emitted tag** (`updateTag`). The
   tag is the correctness mechanism; the TTL is only a backstop. Confirm
   read-your-writes on next paint.
5. **No new paid infra** (Redis, queues, external image CDN) unless genuinely
   required. Prefer Postgres/React-cache/Next-native primitives.
6. Do **not** blindly raise `maxDuration` to mask an inefficient implementation.
7. Preserve TypeScript strictness; reuse the codebase's existing patterns
   (`unstable_cache` + `updateTag` per `accentCache.ts`, React `cache()` per
   `session.ts`/`rows.ts`).
8. Roll render-mode changes in **one route group at a time** and diff the build's
   static/dynamic route table each step.

---

## Phase A — SHIPPED 2026-07-11 (⚠️ not yet deployed)

Relieves the two **maxed** quotas with low risk. Build + `tsc` + lint green;
runtime-verified locally.

- [x] **Removed the SSE notification stream** — deleted
  `src/app/api/me/notifications/stream/route.ts` + `src/server/notifications/bus.ts`
  + the dead `notify()` calls (`services/notifications/index.ts`,
  `services/activity/record.ts`) + the `EventSource` in `AppSidebar.tsx`. The
  existing 60s visibility-aware poll of `getUnreadNotificationCountAction` is now
  the sole unread-badge mechanism. Kills the 100% error rate, the ~2.1s CPU/inv
  (a `cancel()` cleanup-binding bug leaked the heartbeat interval so the fn always
  ran to the platform kill), and the reconnect treadmill. The in-process bus never
  fired cross-instance in prod anyway.
- [x] **Custom image loader** — `src/lib/imageLoader.ts` via
  `next.config.ts › images.loaderFile`. Serves TMDB straight from
  `image.tmdb.org` (width→nearest bucket), everything else unchanged. **Zero**
  Vercel image transformations (verified: 0 `/_next/image` in rendered HTML) and
  zero Vercel image bandwidth for TMDB. `minimumCacheTTL` → 1yr (now moot but a
  sane default). **This is what fixes "photos don't load" on the free plan.**
- [x] **CDN headers** on the episode + collection-images API routes
  (`public, s-maxage=…, stale-while-revalidate=…`) — sibling parity with the
  season route.
- [x] **Middleware matcher trimmed** to skip `sitemap.xml` / `robots.txt` /
  `manifest.webmanifest` / `avif|woff2|txt|xml` → fewer billed edge invocations.

**Next action: deploy** (`vercel --prod` or push). Then confirm on Vercel:
Image Transformations stop climbing, `/api/me/notifications/stream` disappears
from Functions, error rate drops.

**Known trade-off (documented, accepted):** TMDB images now serve as source JPEG
(no Vercel AVIF/WebP re-encode) → modestly larger bytes over the wire, offset by
no re-encode latency + TMDB's global CDN + browser caching of immutable URLs. See
Phase D for AVIF options if bandwidth becomes a concern.

---

## Phase B — Public-route render modes (largest remaining Active-CPU + invocation win)

The public content routes (title ~46K, artist ~32K, episode ~16K, season ~8.7K,
collection ~1.1K invocations) are **per-request SSR** — each hit is a function
invocation burning ~6.5ms CPU (title/artist/episode ≈ 5m Active CPU *each* in the
snapshot). They're dynamic only because of **two global taints**; lifting them is
the prerequisite for everything in this phase.

### B0 — Prerequisite: lift the two dynamic taints + enable PPR ⬅️ do first
| What | File | Change | Risk |
|---|---|---|---|
| Root maintenance gate | `src/app/layout.tsx` (`await headers()` + `getCurrentMaintenance()`) | Move into a `<Suspense>` `MaintenanceGate` island so the shell prerenders (keep the existing 30s `unstable_cache` + tag). **Do not** move to middleware — Edge can't use the `pg` pool (would need Edge Config/KV = new infra). | Med |
| Public accent/session | `src/app/(public)/layout.tsx` (`await getSession()` + `getAccentColorFor()`) | Push into a `<Suspense>`-wrapped child so the logged-out shell is static and authed accent chrome streams. `getAccentColorFor` is already `unstable_cache`'d. | Med |
| Enable PPR | `next.config.ts` | `experimental: { ppr: 'incremental' }` | Low |

**Verify:** load a detail page **anonymously** and confirm the prerendered HTML
contains **no** favorite state, **no** non-default-region badge, **no** accent
chrome. Diff the build's static/dynamic route table before/after.

### B1 — TV season + episode → ISR (safest, highest invocations-to-effort)
- Files: `src/app/(public)/tv/[seriesId]/season/[seasonNumber]/page.tsx` +
  `.../episode/[episodeNumber]/page.tsx`.
- They read **no** cookies/session — once B0 lands, add `export const revalidate = 86400`
  + `export const dynamicParams = true` + `generateStaticParams` (hot series on the
  season route) + `generateMetadata` for share cards.
- Risk: **Low** — aired-episode/past-season data is immutable and viewer-independent.

### B2 — Title + Artist → PPR shells with dynamic islands (highest absolute volume)
- Files: `src/app/(public)/title/[mediaType]/[id]/page.tsx`,
  `src/app/(public)/artist/[id]/page.tsx`.
- `export const experimental_ppr = true`. Prerender the region-independent TMDB
  shell (default-US badges). Move into `<Suspense>` holes: the **region provider
  badges** (`watchly_region` cookie) and the **favorite/watchlist buttons**
  (`getSession` + `isFavorite` + `isInAnyWatchlist`) so the page no longer awaits
  `cookies()`/`getSession()` at the top level. Add `generateStaticParams` for
  trending/popular ids.
- Risk: **High effort, bounded correctness** — verify anonymously (see B0). Existing
  `revalidatePath` after favorite/watchlist mutations still covers the islands.

### B3 — QuickView title API → CDN-public
- Files: `src/app/api/v1/titles/[mediaType]/[id]/route.ts`,
  `src/components/watchly/QuickViewModal.tsx`.
- Pass the resolved `region` as `?region=` on the client fetch, then **delete the
  `cookies()` region fallback** in the handler, add `export const revalidate = 3600`
  + `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`.
- **Guardrail (correctness-critical):** the handler must NOT read `cookies()` once
  public — region **only** from the URL, or the CDN serves one region's providers
  to another. Remove the cookie read in the *same* change.
- ~46K invocations; provider freshness bounded by 1h + SWR.

### B4 — Collection → PPR shell (do last)
- File: `src/app/(public)/collection/[collectionId]/page.tsx`. Same pattern as B2.
- Lowest volume (~1.1K) → lowest ROI; costliest per-hit TMDB fan-out but rare.

---

## Phase C — Per-user pipeline caching (authed surfaces)

From `caching-strategy.md` §3d/§4. **These are the biggest per-*navigation* compute
wins but carry the highest correctness dependency — the tag busts are merge
blockers, not follow-ups.**

### C0 — Blocker: wire the `for-you` invalidation tag FIRST
`toggleFavoriteAction` (`actions/favorites.ts`) and the watchlist add/remove/status
actions (`actions/watchlists.ts`) currently only `revalidatePath('/for-you')` — a
no-op today. Before caching the feed, they **must** call
`updateTag(\`for-you:${userId}\`)`, else a just-favorited title won't appear until
the TTL lapses. (caching-strategy.md §4 gap #1.)

### C1 — Cache the pipelines (each with `region` in key + a mutation tag)
| Pipeline | Key / TTL / tag |
|---|---|
| `getForYouFeed` base case (`services/forYou/index.ts`) | `['for-you-feed', userId, region]`, 10 min, tag `for-you:${userId}`. Exclude spin/excludeKeys/View-All variants. |
| `getTasteProfile` (`services/profile`) | `['taste-profile', userId, region]`, 1h, tag `taste:${userId}`. |
| `getFollowSuggestions` (`services/social`) | `['follow-suggestions', viewerId]`, 15 min, tag `follow-graph:${viewerId}`. |
| Profile sub-parts (`getBannerPosters`, enriched-watched) | keyed by `userId`, 30–60 min, tags `banner:${userId}` / `watched:${userId}`. **Leave counts / followState / mutualFollowers UNcached.** |
| Public watchlist `/watchlists/[id]` (ISR) | tag `watchlist:${id}` — busts on that list's add/remove/edit (§4 gap #2). |
| Public profile `/user/[username]` | cache public payload only, tag `profile:${username}` (§4 gap #3). Keep `isSelf`/`followState`/`mutualFollowers` per-request. |

**Verify each:** perform the mutation, reload the surface, confirm the change shows
**without** waiting for the TTL. If not → a missing `updateTag`.

---

## Phase D — Smaller follow-ups (opportunistic)

- **`prefetch={false}` on high-fanout `<Link>` lists** while pages are still
  dynamic — cast grids, season/episode lists, collection-part grids (`CastCard`,
  `TvSeasonsEpisodesPanel`, `CollectionCard`/`TmdbCollectionCard`,
  `CollectionDetails`, `GenresTab`). Each visible/hovered link fires an RSC
  prefetch = a billed invocation. **Revert once B1–B4 make the pages static** (then
  prefetch hits the CDN cheaply).
- **Dedup the title metadata fetch** — `generateMetadata`→`getTitleMeta` hits
  `/movie/{id}` (bare) while the page→`getTitlePagePayload` hits
  `/movie/{id}?append_to_response=credits,videos`; different URLs = 2 Data-Cache
  keys = 2 origin fetches on a cold title. Introduce a React `cache()`-wrapped
  `getTitleDetailDoc(mediaType, id)` used by both (align on the appended URL).
  Low priority — same data, one fewer rate-limited upstream call.
- **Image AVIF (only if bandwidth becomes a concern):** TMDB can't serve AVIF, so
  options are Pro (more transforms), selectively routing only large hero/backdrop
  images back through the optimizer, or an external image CDN (new infra). Default:
  stay with the direct-TMDB loader.
- **`ActivityAvatar` raw `<img>` → `next/image`** — moot for the transforms quota
  (raw `<img>` never hit the optimizer), but gives responsive sizing/bandwidth for
  avatar-heavy activity feeds.

---

## Sequencing (priority × effort × impact)

| # | Item | Phase | Priority | Effort | Impact | Depends on |
|---|---|---|---|---|---|---|
| 1 | **Deploy Phase A** | A | P0 | Trivial | Fixes maxed image quota + SSE CPU | — |
| 2 | Lift 2 taints + enable PPR | B0 | P0 | Med | Unlocks all of B | — |
| 3 | TV season/episode ISR | B1 | P0 | Low | High (24.7K inv) | B0 |
| 4 | QuickView API → public | B3 | P0 | Med | High (~46K inv) | client `?region=` |
| 5 | Title + Artist PPR shells | B2 | P1 | High | Highest volume | B0 |
| 6 | `for-you` tag busts | C0 | P1 | Low | Unblocks C1 | — |
| 7 | For-You / taste / suggestions caches | C1 | P1 | Med | Large per-nav CPU | C0 |
| 8 | Collection PPR | B4 | P2 | Med | Low volume | B0 |
| 9 | prefetch=false / dedup / avatar | D | P2 | Low | Med | — |

---

## Verification & observability (per rollout item)

- **`x-vercel-cache`** response header: `HIT` (edge) / `MISS` (fn ran, now cached) /
  `STALE` (SWR) / `BYPASS` (dynamic). Public routes should trend toward `HIT`/`STALE`.
- **Function invocations + GB-s** on the QuickView route and `/for-you` — the two
  metrics the P0 items move most.
- **Image Optimization – Transformations** quota should stay ~flat after Phase A
  (near-zero new transforms from TMDB).
- **`/api/me/notifications/stream`** should no longer appear in the Functions list
  and the SSE 100% error rate should be gone.
- **TMDB call volume** as the leading indicator that Data Cache + pipeline caches
  are absorbing load (and the rate-limit safety margin).
- After enabling PPR, confirm `generateStaticParams` prerendered the hot set at
  build (build output lists static vs dynamic routes).

## Correctness invariants (the things that break silently if ignored)

- PPR static shells must contain **no** per-user data — verify anonymously.
- Region must key every provider-scoped cache entry.
- Every per-user cache needs a mutation tag (read-your-writes on next paint).
- QuickView can only go `public` once the cookie read is removed (region in URL).
- Auth / geo / viewer-relative bits stay uncached dynamic islands.
