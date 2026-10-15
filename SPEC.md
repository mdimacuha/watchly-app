# Watchly v2 — Technical & Product Spec

A living document describing what Watchly does, how it's built, and what's still missing. Pair with `NEXT-STEPS.md` (prioritized work plan) and `CLAUDE.md` (agent-facing repo guide). When a feature ships or a decision changes, update this file in the same PR.

---

## 1. Product

**Watchly** answers a single question: *"Where can I stream this?"* It's a region-aware streaming-availability lookup for movies and TV shows, layered with social and personal-collection features (favorites, watchlists, follows, activity).

**Audience.** Casual viewers deciding what to watch tonight; cinephiles tracking releases and people they like; groups who want to share recommendations.

**Differentiators.** Region-accurate provider data sourced from TMDB; public search and detail pages (no signup wall to discover); cinematic dark-mode-first UI; account features build *on top of* a useful public product instead of gating it.

**Core flows.**
1. **Discover** — search or browse trending titles, see streaming availability for your region.
2. **Decide** — open a title to see providers, cast, trailer, related items, season/episode breakdown.
3. **Collect** — favorite items, build watchlists (planned), see what your follows are doing (planned).
4. **Personalize** — set region, manage profile, get tailored recommendations (planned).

---

## 2. Stack

| Layer | Tech |
| ----- | ---- |
| Framework | Next.js 16.1.1 (App Router, React 19, React Compiler enabled) |
| Language | TypeScript (strict) |
| Database | Postgres via `pg` |
| ORM / migrations | Drizzle ORM + `drizzle-kit` (generated migrations, immutable) |
| Validation | Zod |
| Styling | Tailwind v4 (semantic tokens, dark-mode-first) |
| Client state | Zustand (`auth`, `region`, `ui`, `toast`) |
| Animation | `framer-motion` |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` (watchlist reorder) |
| Icons | `lucide-react` |
| External data | TMDB v3 API (Bearer token) |

No test framework configured. No CI defined in repo. Deploy target: Vercel (per build output and template lineage).

---

## 3. Architecture

Strict three-layer separation enforced by `.cursorrules.md`:

```
src/app/api/**/route.ts   ← thin route handlers (no logic)
        ↓
src/services/**            ← business logic, DB access, integrations
        ↓
src/db (Drizzle)  ·  src/server/tmdb  ·  src/server/auth
```

**Route handlers** export only the `GET`/`POST`/etc. handlers and call `handleRoute()` from `src/lib/api.ts`. No validation, parsing, or DB access lives there.

**Services** (`src/services/<domain>/`) own all business logic. Each domain has an `index.ts` public API, plus Zod validators where input is parsed. Services may touch the DB and integrations, but **must not** import HTTP primitives (`Request`, `Response`, `cookies`). Server-only HTTP/Next concerns (cookies, sessions, TMDB env) live in `src/server/**`.

**API response shape** (canonical, from `src/lib/api.ts`):
- Success: `{ success: true, data, message? }`
- Error: `{ success: false, error: string, message? }`
- Paginated: `{ success: true, data: T[], pagination: { page, limit, total, totalPages } }`

Errors thrown from services map to HTTP status via `AppError` (`src/utils/errors.ts`): `ValidationAppError → 400`, `UnauthorizedAppError → 401`, `NotFoundAppError → 404`.

> The cursorrules doc describes a target `{ ok, data }` / `{ ok, error: { code, message } }` shape. The implementation uses `{ success, error: string }`. Reconcile in a future cleanup.

---

## 4. Data Model

Source of truth: `src/db/schema.ts`. Generated migrations under `src/db/migrations/` are immutable. Forward-only fixes.

### Implemented tables

| Table | Purpose | Notable columns |
| ----- | ------- | --------------- |
| `users` | Account record | `email`, `username` (both unique), `passwordDigest`, `salt`, flags (`isVerified`, `isActive`, `isSuspended`, `isLocked`, `isDeleted`) |
| `user_sessions` | Session tokens | `sessionToken` (unique), `expiresAt`, 30-day TTL |
| `user_verification_codes` | Signup codes | `code`, `expiresAt` — **generated on signup but never consumed** |
| `user_preferences` | Per-user prefs | `regionCode` (ISO 3166-1 α2), `regionSource` enum, `onboardingCompleted`, `profileVisibility`, `watchlistsVisibility` |
| `user_profiles` | Public-facing profile | `displayName`, `bio`, `avatarUrl` |
| `user_follows` | Directed follow graph | composite PK `(followerId, followingId)` — **schema only, no code** |
| `user_favorites` | Favorited items | `(userId, favoriteId, favoriteType)` unique; `favoriteType` is `favorite_type` enum |
| `watchlists` | User-owned watchlists | `userId` (FK cascade), `name`, `description`, `isPublic`, timestamps; indexed by `userId` |
| `watchlist_items` | Items within a watchlist | `watchlistId` (FK cascade), `mediaType` enum (`movie`/`tv`), `mediaId`, `sortOrder`, timestamps; unique on `(watchlistId, mediaType, mediaId)` |

### Enums
- `region_source`: `manual` · `ip` · `unknown`
- `privacy_level`: `public` · `followers_only` · `private`
- `follow_request_status`: `pending` · `accepted` · `rejected` · `cancelled` *(declared but unused)*
- `favorite_type`: `movie` · `tv` · `collection` · `artist`
- `watchlist_media_type`: `movie` · `tv`

### Gaps in the data model
- **Activity** — no `activities` table; UI runs on mock data (`src/services/activity/mock.ts`).
- **Follow requests** — enum exists but no `follow_requests` table. Currently `user_follows` has no request/accept workflow.
- **Email verification linkage** — codes are inserted but no service consumes them; missing `verifiedAt` field on `users` (only a boolean `isVerified` exists).
- **Watch history / progress** — no tables; not currently planned but a natural extension.
- **Notifications** — no tables; needed if email or in-app notifications get implemented.

---

## 5. Authentication & Sessions

Custom session-cookie auth (no NextAuth, no JWT).

**Cookie** — `watchly_session`, httpOnly, sameSite=lax, secure in production, 30-day expiry. Set by `setSessionCookie()` in `src/utils/server/cookies.ts`. Token is server-generated via `makeSessionToken()`.

**Passwords** — salted hash (`passwordDigest` + `salt` via `src/utils/server/crypto/password.ts`). Never plaintext.

**Session validation**
- `getSession()` — reads cookie, looks up `user_sessions`, checks expiry. Returns `null` if invalid.
- `getSessionWithUser()` — same + joins the user row.
- `requireUser()` — like `getSession()` but redirects to `/signin` if absent. Use in Server Components that need an authenticated user.

**Middleware** (`src/middleware.ts`) gates routes by **cookie presence only** (not validity). Real validation happens server-side. Route lists in `src/lib/routes.ts`:
- `publicRoutes` — `/`, `/signin`, `/signup`, `/sign-up`, `/privacy`, `/terms`, `/search`, `/title`, `/tv`, `/collection`, `/artist` *(informational; not consulted directly by middleware)*
- `authRoutes` — `/signin`, `/signup`, `/sign-up` (signed-in users get redirected to `/`)
- `authenticatedRoutes` — `/onboarding`, `/home`, `/feed`, `/for-you`, `/watchlists`, `/favorites`, `/me`, `/activity`, `/settings`
- `authenticatedApiRoutes` — `/api/me` (returns 401 JSON instead of redirect)
- `devOnlyRoutes` — `/debug`, `/docs` (blocked in production)

### Gaps
- **Email verification flow is incomplete** — codes are generated on signup but never sent (no email service wired) and never validated by a route.
- **Forgot password** — `PATHS.AUTH.FORGOT_PASSWORD = '/forgot-password'` is referenced but the route doesn't exist.
- **Duplicate signup routes** — `/signup` and `/sign-up` both render `SignUpCard`. Pick one and redirect the other.
- **Session rotation / revocation** — no UI to view active sessions or sign out from other devices.
- **Account settings UX** — no change-email, change-password, or delete-account flows.

---

## 6. Region Resolution

Region (`ISO 3166-1 alpha-2`, e.g. `US`, `PH`, `AU`) drives all provider/availability lookups via TMDB.

**Sources, in priority order:**
1. **Explicit query param** (`?region=XX`) — passed by `SearchPageClient`, accepted by `/api/v1/tmdb/search`.
2. **`watchly_region` cookie** — non-httpOnly, 1-year expiry, written by client `setRegion()` and read by SSR pages.
3. **`user_preferences.regionCode`** — fetched server-side for signed-in users via `getUserRegion(userId)`.
4. **Fallback** — `'US'`.

**Client state** — `useRegionStore` (Zustand). `setRegion(code, name)` writes the store *and* the cookie. `hydrateFromCookie()` seeds the store on mount via `AuthHydrator`.

**Sign-in handoff** — `/api/v1/auth/signin` returns `{ user, regionCode }`. `AuthForm` calls `setRegion()` immediately with the account's saved region, overriding whatever the visitor picked while signed out. Search refetches because `regionCode` is in `SearchPageClient`'s effect deps.

**Public region picker** — `RegionToggle` (top-anchored dropdown) is mounted in `SearchPageClient`. Reuses `RegionPicker` content. PATCH to `/api/me/preferences/region` runs only for authenticated users; unauthenticated visitors get cookie + store updates only.

### Gaps
- **Auto-detect by IP** — `/api/geo/ipapi` exists, and `/onboarding/region/auto` page exists, but I haven't verified the loop is fully wired for unauthenticated visitors on first visit.
- **Region picker placement on detail pages** — currently only visible on `/search`. Title/collection/artist pages can render content based on region but offer no in-page picker for unauth users.

---

## 7. Routing & Layouts

```
src/app/
  page.tsx                ← landing (LandingNav + LandingHero + LandingFeatures + LandingFooter)
  signin/  signup/  sign-up/  ← auth (with AuthLayout)
  onboarding/             ← post-signup flow
  s/[slug]/               ← share link redirector (movie-123, co-456, tv-789)
  (public)/               ← public layout: AuthenticatedShell if signed in, else LandingNav
    search/
    title/[mediaType]/[id]/
    tv/[seriesId]/season/[seasonNumber]/[episode/[episodeNumber]/]
    collection/[collectionId]/
    artist/[id]/
  (authed)/               ← AuthenticatedShell (sidebar layout); session-required
    me/  favorites/  watchlists/  for-you/  activity/  settings/
  (debug)/                ← dev-only routes
  (docs)/                 ← dev-only design-system / playground
  api/                    ← see §9
```

**Public-shell switching.** `(public)/layout.tsx` is an async server component that calls `getSession()`. Signed-in visitors get the `AuthenticatedShell` (sidebar). Anonymous visitors get the marketing `LandingNav` (top bar with sign-in / sign-up CTAs). This keeps detail pages public *without* downgrading the experience for authed users.

**Sign-in redirect preservation.** The `Sign In` link in `LandingNav` appends `?redirect=<pathname>` for non-`/` pages. `AuthForm` reads the prop and falls back to `useSearchParams()`. If no redirect is given, it lands on `/search` (chosen as the highest-utility default for the product).

---

## 8. TMDB Integration

**Two-layer client:**
- `src/server/tmdb/` — HTTP client + endpoint wrappers. `tmdbFetch()` handles Bearer auth, default 1-hour revalidate, and throws `TmdbError`. Endpoints under `endpoints/` cover search, movie, tv, person, collection, company, network, keyword, genre, certification, configuration, providers, find, trending, discover.
- `src/services/tmdb/` — app-level mappers and aggregators. `searchContent()`, `getTitlePagePayload()`, `getCollectionDetails()`, `getPersonPagePayload()`, `getTvSeasonDetails()`, `getTvEpisodeDetails()`.

**Env** — `src/server/env/tmdb.ts` (server-only). Requires `TMDB_API_READ_TOKEN`; defaults `TMDB_API_BASE_URL` and `TMDB_IMAGE_BASE_URL`.

**Provider data** — fetched per item via `watchProviders()`, region-keyed. Falls back to `US` providers when the user's region has no data. Maps to `flatrate` / `ads` / `free` / `rent` / `buy` buckets, displays a synthetic `Rent` badge when only rent/buy options exist.

### Gaps
- **No rate-limit handling** — TMDB returns 429 if hammered; current code surfaces a generic error.
- **No caching strategy for personalized lookups** — search result fetches are 1h revalidate, but per-user/per-region keys aren't planned.
- **Provider slug map is hard-coded** in `searchContent()` (`netflix`, `prime`, `disney`, `hulu`, `max`, `apple`). New providers require code changes.

---

## 9. API Surface

| Route | Method | Auth | Status |
| ----- | ------ | ---- | ------ |
| `/api/v1/auth/signup` | POST | public | implemented |
| `/api/v1/auth/signin` | POST | public | implemented (returns `{ user, regionCode }`) |
| `/api/v1/auth/signout` | POST | session | implemented |
| `/api/me` | GET | required (returns 401) | implemented |
| `/api/me/profile` | PATCH | required | implemented |
| `/api/me/preferences/region` | PATCH | required | implemented |
| `/api/v1/tmdb/search` | GET | optional (region from query or session) | implemented |
| `/api/v1/tmdb/collections` | GET | (verify) | implemented |
| `/api/v1/tmdb/collections/[id]` | GET | (verify) | implemented |
| `/api/v1/tmdb/collections/[id]/images` | GET | (verify) | implemented |
| `/api/v1/titles/[mediaType]/[id]` | GET | (verify) | implemented |
| `/api/v1/collections/[collectionId]` | GET | (verify) | implemented |
| `/api/v1/tv/[seriesId]/season/[seasonNumber]` | GET | (verify) | implemented |
| `/api/v1/tv/[seriesId]/season/[seasonNumber]/episode/[episodeNumber]` | GET | (verify) | implemented |
| `/api/geo/ipapi` | GET | public | implemented |
| `/api/dev/tmdb` | GET | dev-only | implemented |
| `/api/dev/tmdb/providers` | GET | dev-only | implemented |

### Server actions
- `src/actions/favorites.ts` — toggle / list / enriched-list.
- `src/actions/watchlists.ts` — CRUD (`createWatchlistAction`, `updateWatchlistAction`, `deleteWatchlistAction`, `listWatchlistsAction`, `getEnrichedWatchlistAction`), item add/remove, picker payload (`getWatchlistsForPickerAction`), and the hybrid `addToWatchlistSmartAction` (direct add when ≤1 list, else returns `{ mode: 'picker' }`).

### Missing endpoints (when their features land)
- `/api/me/activity`, `/api/me/activity/mark-read`
- `/api/users/[username]` (public profile)
- `/api/me/follows`, `/api/me/follows/requests`
- `/api/v1/auth/verify-email`, `/api/v1/auth/resend-code`
- `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`
- Public watchlist viewer (server-component page) — `getWatchlist()` already serves public lists to non-owners; just needs a route.

### Inconsistency to clean up
- **Server actions vs REST.** Favorites and Watchlists use server actions; everything else uses fetch-to-route. Pick a pattern per feature deliberately, or unify.

---

## 10. Feature Inventory

Each feature: status, what's done, what's missing.

### 10.1 Authentication
**Status:** ✅ working, ⚠ verification + recovery missing.
- Sign up, sign in, sign out work end-to-end.
- Session cookie, password hashing, account-status flags all implemented.
- **Missing:** email verification consumption, forgot/reset password, change email/password, "sign out other devices."

### 10.2 Onboarding
**Status:** ⚠ partial.
- Steps exist: `/onboarding/welcome` → profile → region (auto/manual) → titles.
- `onboardingCompleted` flag in `user_preferences`.
- **Missing:** the titles-selection step is a placeholder — should let users pick initial favorites to seed recommendations. No skip / resume handling documented.

### 10.3 Search & Discover (public)
**Status:** ✅ working.
- Full-text search across movies + TV, with year / genre / service / type filters.
- Empty query → trending or discover (with filters).
- Region-aware provider badges.
- Public for everyone; signed-in users get their account region.
- **Possible improvements:** save searches, recent searches, search history, "people" results (cast/crew) currently filtered out.

### 10.4 Title / TV / Collection / Artist detail pages (public)
**Status:** ✅ public + functional.
- Hero with poster, providers, share, trailer.
- Auth-only actions (watchlist, favorite) hidden for visitors via `useAuthStore`.
- Season → episode drill-down for TV.
- **Missing:** related/recommended grid is minimal; no region picker control on these pages (cookie is used but unauth users can't change region without going to `/search`). "Add to Watchlist" is wired on title pages; collection bulk-add ("Add All Parts") is removed pending follow-up.

### 10.5 Favorites
**Status:** ✅ shipped.
- `user_favorites` table with `favorite_type` enum and unique constraint `(userId, favoriteId, favoriteType)`.
- Service + server actions + `enrichFavorites()` (batch TMDB fetch).
- Page with type filter (All / Movies / TV / Collections / Artists), sort dropdown (Recently added / A→Z), empty states, in-place remove (optimistic + toast).
- `FavoriteButton` works on title, collection, and artist pages.

### 10.6 Watchlists
**Status:** ✅ shipped v1.
- Schema: `watchlists` + `watchlist_items` tables + `watchlist_media_type` enum. Unique index on `(watchlistId, mediaType, mediaId)`. `sortOrder` column reserved for future reorder UI.
- Service (`src/services/watchlists/`): full CRUD, add/remove, `getWatchlistsContainingItem`, `getOrCreateDefaultWatchlist`. `getWatchlist` is auth-aware — non-owners can read public lists; private lists 403.
- `enrichWatchlistItems()` TMDB batch-fetch.
- Signup transaction auto-creates a default "My Watchlist".
- Server actions in `src/actions/watchlists.ts` including hybrid `addToWatchlistSmartAction`.
- UI: `/watchlists` (list page with cards, public/private badge, item counts), `/watchlists/[id]` (detail page with edit/delete, grid of items with optimistic remove), shared `WatchlistFormModal`, `AddToWatchlistButton` + `AddToWatchlistPicker` (checkboxes + inline "+ Create new list").
- **Public viewer:** `(public)/watchlists/[id]` reachable unauth'd when `isPublic`. Share button (Share2 icon) appears on the detail page when the list is public — uses `shareWatchlist()` in `lib/share.ts` (navigator.share + clipboard fallback). The list page at `/watchlists` self-guards via `requireUser()`.
- **Collection bulk-add:** `AddCollectionToWatchlistButton` in `CollectionActions` mirrors the single-title hybrid pattern. Service `bulkAddCollectionParts(watchlistId, userId, collectionId)` fetches parts via TMDB and inserts via `bulkAddItems` (duplicates skipped). `BulkAddCollectionPicker` for multi-list users.
- **Reorder:** `@dnd-kit/core` + `@dnd-kit/sortable` (added dependency). Owner-only `SortableWatchlistItem` wraps each card with a grip-handle. `getWatchlist` orders by `(sort_order desc, created_at desc)`; `addItem` and `bulkAddItems` assign `sortOrder = max + 1` so new items appear at the top. `reorderItems` persists the new visual order in a transaction.
- **Deferred to Priority 2:** activity events (`watchlist_add` / `watchlist_create` — recorded when `activities` table lands).

### 10.7 My Profile
**Status:** ⚠ stub page, backend exists.
- `user_profiles` table, `updateProfile()` service, `PATCH /api/me/profile` work.
- Profile setup happens in onboarding.
- **Missing on `/me`:** profile display (name, bio, avatar, stats — favorite count, watchlist count, member-since), edit form, public profile view at `/user/[username]`.

### 10.8 Activity Feed
**Status:** ⚠ UI built, runs on mocks.
- Page groups by Today / Yesterday / This Week.
- Components: `ActivityRow`, `ActivityAvatar`, `RightAccessory`, `MarkAllReadButton`.
- Types support: `watchlist_add`, `favorite`, `watchlist_create`, `follow`, `region_update`.
- **Missing:** `activities` table, event recording in services, real query, mark-as-read persistence, working follow-back button.

### 10.9 For You / Recommendations
**Status:** ❌ placeholder (toast demo).
- Route exists, nothing meaningful renders.
- **Missing:** recommendation strategy (popular-in-region / based-on-favorites / trending blend), service, UI, possibly a periodic refresh job.

### 10.10 Social — Follows & Friends
**Status:** ❌ schema only.
- `user_follows` table + `follow_request_status` enum exist.
- **Missing:** follow/unfollow endpoints, request/accept workflow, public profile (`/user/[username]`), follower/following lists, follow suggestions, mutual-follow indicators, blocking.

### 10.11 Settings
**Status:** ⚠ region only.
- `/settings/region` works.
- **Missing:** privacy toggles (schema supports `profileVisibility`, `watchlistsVisibility` but no UI), account settings (email/password/delete), notification preferences, theme toggle.

### 10.12 Sharing
**Status:** ✅ link-share works.
- `shareTitle()` helper; `/s/[slug]` redirects `movie-123` → `/title/movie/123`, `co-456` → `/collection/456`, etc.
- **Missing:** OG image generation for shared links, copy-to-clipboard UX, share-to-X / SMS deeplinks.

---

## 11. UI / Design System

- **Tokens** (`docs/style-guide.md`): `bg-background`, `bg-card`, `bg-secondary`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `border-border`. Never hardcoded hex (ESLint warns).
- **Typography**: `.text-h1`/`h2`/`h3`, `.text-body-lg`/`body-regular`, `.text-meta`.
- **Radii**: `rounded-sm` (4), `rounded-md` (8), `rounded-lg` (12), `rounded-xl` (16), `rounded-pill`.
- **Components**: `Button` (with `buttonVariants` for `Link`-as-button), `Badge`, `Input`, `ExpandableText`, `UserAvatar`, `PosterCard`, `ProviderBadge`, `WatchlySearch`, etc.
- **Animations**: `framer-motion` for transitions and popovers.
- **Toasts**: in-app via `useToast` / `ToastProvider`.

### Known UI debt
- `Button` exposes an `asChild` prop in its type but the implementation ignores it ("Radix removed: always use button"). Wraps that try to render a `Link` inside a `Button` create invalid `<a>`-in-`<button>` markup. Fix: re-add Slot behavior or delete the dead prop. Workaround in use: style a `Link` via `buttonVariants()`.
- Two signup routes (`/signup`, `/sign-up`) render the same card.
- Mock suggestion list inside `LandingNav` is hard-coded.

---

## 12. Observability, Logging, Errors

- **Logging**: `src/lib/log.ts` exists. Cursor rules prescribe structured JSON with secret redaction and request timing, but most route handlers currently use `console.log` / `console.error`. Bring routes in line.
- **Sentry**: scaffolded but commented out in `src/lib/api.ts`. Not wired.
- **Error mapping**: `AppError` + subclasses map to HTTP codes; `apiErrorFromError()` produces `{ code, message, details }`. Clients receive the `{ success: false, error: string }` shape; the structured `code` isn't currently surfaced to clients.

### Gaps
- No structured request logging on most routes.
- No error tracking integration (Sentry, etc.).
- No analytics / product metrics.
- No rate limiting (route or middleware level).

---

## 13. Security Notes

- Passwords are salted-hashed; never logged.
- Session cookie is httpOnly + secure-in-prod.
- `redirect` query param after sign-in is checked to start with `/` and not `//` (open-redirect guard in `AuthForm`).
- TMDB token lives in server-only env (`src/server/env/tmdb.ts`).

### Gaps
- **CSRF**: cookies use `sameSite=lax`, which guards most cases, but no explicit CSRF tokens on state-changing endpoints.
- **Rate limiting**: none.
- **Input validation**: most routes parse via Zod; verify every state-changing endpoint does so.
- **Password policy**: not enforced beyond presence (verify against `signUpSchema`).
- **Verification-code storage**: stored as plaintext `code` field; should be hashed (`code_hash`) before consumption is wired up.
- **`watchly_region` cookie is non-httpOnly** — intentional (client needs to read/write it) but means it's user-controllable; treat as untrusted input on the server, validate against ISO list before using.

---

## 14. Deployment & Ops

- Build: `npm run build` (Next 16, React Compiler).
- Migrations: `npm run db:migrate` (runs `src/db/migrate.ts` with `dotenv/config`; works without Next.js).
- Studio: `npm run db:studio` (requires `.env`).
- Env validation: `src/env.ts` fails fast at module load.
- **Missing:** documented deployment target (Vercel assumed), env-vars list, CI pipeline, staging environment, backup/restore policy for Postgres.

---

## 15. Roadmap (mapped to current gaps)

Lifted from `NEXT-STEPS.md`, restated as product outcomes:

1. **Make Profile a real page** — display + edit on `/me`; lay foundation for public profile at `/user/[username]`.
2. **Replace Activity mocks with real events** — `activities` table, record events from existing services (favorites toggle, **watchlist add/create**, follow, region change), mark-read persistence.
3. **Expand Settings** — privacy toggles, account settings (change email/password), notifications, delete account.
4. **Email verification flow** — wire an email provider, build verify + resend pages, consume codes (hash before store).
5. **Forgot / reset password** — page + endpoint with expiring reset codes.
6. **For You** — pick a recommendation strategy and ship a v1.
7. **Social** — public profile, follow/unfollow endpoints, follower lists. Decide public vs request-based following based on `profileVisibility`.
8. **Onboarding titles step** — replace placeholder with a real picker that seeds favorites.

Cross-cutting cleanups: unify response shape (`success` vs `ok`), bring logging up to the cursorrules standard, fix `Button.asChild`, consolidate the two signup routes, decide server actions vs REST per feature.

---

## 16. Out of Scope (current iteration)

Not on the near-term plan. Listed so they're not accidentally pulled in:

- Native mobile apps.
- Watch-history / progress tracking.
- Comments / reviews / ratings.
- Premium/paid tier.
- Localization beyond region (no i18n strings; UI is English).
- In-app notifications and push.
- Browser extension.
- Federated / OAuth providers (Google, Apple, etc.).
