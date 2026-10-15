# Watchly SEO, Social Sharing & Indexing

> **⚠️ STRATEGY REVERSAL (2026‑07‑12): the APP is now intentionally `noindex`.**
> The decision changed: only the **marketing site (gowatchly.com / watchly-business)**
> is search-indexed. The **app (app.gowatchly.com / watchly-v2) is NOT** — it was
> driving a crawler explosion + Vercel usage across its huge dynamic route space.
> Current app state: root layout metadata `robots: { index:false, follow:false }`
> (whole app inherits `noindex`); `robots.txt` **disallows** search crawlers from
> `/title /artist /tv /collection` + all app/auth routes, while **allowing**
> social-preview bots so shared links still unfurl; `src/app/sitemap.ts` **deleted**
> (no app sitemap). OG/Twitter metadata + generateMetadata are **kept** (social
> previews). ISR caching (docs/vercel-perf-roadmap.md Phase B) makes any residual
> crawl cheap. The sections below describe the ORIGINAL SEO-enabled design and are
> retained for reference / the marketing site — read them with the reversal in mind.

Technical SEO foundation for Watchly on Next.js 16 App Router. Canonical
production origin: **`https://app.gowatchly.com`** (previous: `watchly.dayonelabs.co`).

---

## 1. Audit summary (before)

| Area | State found |
|---|---|
| Root metadata | Only `{ title: "Watchly", description: "…watchlist manager" }` — no `metadataBase`, template, canonical, OG, Twitter, robots, or icons |
| Favicon | Default Next.js `favicon.ico`; no SVG icon, apple-touch-icon, or manifest |
| `robots.txt` / `sitemap.xml` | **None** |
| `generateMetadata` | **None** on any route |
| JSON-LD / structured data | **None** |
| OG / Twitter cards | **None** — shared links had no title/description/thumbnail |
| Canonicals | **None** |
| Crawlability | Public pages **are** server-rendered (title page emits a real `<h1>` from server-fetched data) → crawlable, but no metadata |
| Data layer | `movie.details` / `tv.details` / `person.details` are single, URL-cached TMDB calls (1h) — reusable for metadata + OG without extra upstream traffic |

## 2. Issues found

1. Zero discoverability metadata — no titles, descriptions, canonicals, or sitemaps.
2. Shared links (Slack/Discord/iMessage/X/FB) rendered as bare URLs (no card).
3. Movie/TV pages — the primary SEO asset — had generic site-wide title only.
4. Default Next.js favicon (no brand identity).
5. No robots policy → private/authed/thin surfaces equally exposed to crawlers.
6. Old-domain content could dilute ranking signals (no canonical consolidation).

## 3. Files changed

**New**
```
src/lib/seo.ts                                     # SITE_URL, names, defaults, helpers
src/services/tmdb/meta.ts                          # lightweight cache-sharing meta fetchers
src/components/seo/JsonLd.tsx                       # <JsonLd> + WebsiteJsonLd graph
src/app/manifest.ts                                # PWA web manifest
src/app/robots.ts                                  # /robots.txt
src/app/sitemap.ts                                 # /sitemap.xml (bounded, ISR daily)
src/app/opengraph-image.tsx                        # default branded 1200×630 OG
src/app/icon.svg                                   # play-mark favicon (source of truth)
src/app/apple-icon.png                             # 180×180 (full-bleed, iOS)
public/icon-192.png / icon-512.png / icon-512-maskable.png   # manifest icons
src/app/(public)/title/[mediaType]/[id]/opengraph-image.tsx  # composed title OG
docs/seo-implementation.md                         # this file
```

**Modified**
```
src/app/layout.tsx                                 # full root metadata + viewport + WebsiteJsonLd
src/app/page.tsx                                   # homepage canonical + og:url
src/app/favicon.ico                                # replaced default with branded PNG-in-ICO
src/services/tmdb/index.ts                          # export * from "./meta"
src/app/(public)/title/[mediaType]/[id]/page.tsx   # generateMetadata + Movie/TVSeries JSON-LD
src/app/(public)/collection/[collectionId]/page.tsx# generateMetadata (backdrop OG)
src/app/(public)/artist/[id]/page.tsx              # generateMetadata
src/app/(public)/user/[username]/page.tsx          # generateMetadata (shareable, noindex)
src/app/(public)/watchlists/[id]/page.tsx          # generateMetadata (shareable, noindex)
src/app/(public)/search/page.tsx                   # noindex
src/app/(public)/verify-email/page.tsx             # noindex
src/app/(public)/restore-account/page.tsx          # noindex
src/app/signin/page.tsx / signup/page.tsx          # noindex
```

## 4. Metadata architecture

- **`metadataBase = https://app.gowatchly.com`** in the root layout makes every
  relative canonical / OG / Twitter URL absolute to the new domain — the core of
  the old-domain consolidation (see §11).
- **Title template** `%s | Watchly`; homepage uses the bare
  `Watchly — Find Where to Stream Movies & TV Shows`.
- **No root-level canonical or `og:url`** — those would cascade to every child
  route and mark them duplicates of `/`. Each page sets its own; the homepage's
  live in `app/page.tsx`.
- Per-route `generateMetadata` uses `src/services/tmdb/meta.ts`
  (`getTitleMeta` / `getCollectionMeta` / `getPersonMeta`) — single `/{type}/{id}`
  detail calls that **share the Next Data Cache** with the page render and the OG
  route, so metadata + share cards add **no** upstream TMDB traffic once warm.
  Each returns `null` on 404 → fallback metadata + `noindex`.

## 5. Social sharing (§Phase 3)

Every public page emits `og:title`, `og:description`, `og:image`, `og:url`
(where set), `og:type`, `og:site_name`, plus `twitter:card = summary_large_image`
and Twitter title/description/image. Verified in rendered HTML (see §16).

## 6. Dynamic OG image strategy (§Phase 6)

- **Default** (`app/opengraph-image.tsx`) — branded 1200×630 card (play-mark +
  wordmark + tagline on a dark blue-glow gradient). Inherited by home, legal,
  and artist pages.
- **Movie & TV** (`title/[mediaType]/[id]/opengraph-image.tsx`) — composed card:
  dimmed backdrop, poster thumbnail, "WHERE TO WATCH" label, title, `year •
  Movie/TV • genres` line, Watchly lockup. Built with `next/og` `ImageResponse`
  (built-in font, no network font fetch). Falls back to the branded card for a
  404 title.
- **Collections** — use the TMDB backdrop (w1280) directly via
  `openGraph.images` (cheaper than a composed render, already wide).
- **Profiles / watchlists** — inherit the branded default (they're `noindex`; a
  bespoke card isn't worth the heavy per-entity fetch — see §15 tradeoffs).
- **Cost control:** OG routes reuse the cached detail fetch; crawlers that
  request OG independently of the page hit the same Data Cache entry.

## 7. Custom favicon concept (§Phase 7)

Watchly's wordmark embeds a **blue play triangle** (`#3B82F6`→`#1E40AF`). The
favicon distills that into an app tile: the brand blue gradient with a rounded
off-white play glyph and a subtle top gloss — a single, instantly legible motif
(play = watch/stream) that reads at 16px and sits credibly beside Plex /
JustWatch / Letterboxd tiles. Not a letter "W", not a mascot, not generic SaaS.

Source: `src/app/icon.svg` (scalable, primary). Rasterized with `sharp`:
`favicon.ico` (16/32/48 PNG-in-ICO), `apple-icon.png` (180, full-bleed for iOS
masking), `public/icon-{192,512}.png` + `icon-512-maskable.png` (Android /
manifest). Regenerate with `scratchpad/generate-icons.cjs` if the SVG changes.

## 8. Robots strategy (§Phase 8)

`app/robots.ts` → `/robots.txt`. **Allow** `/` (home, `/title/*`, `/collection/*`,
`/artist/*`, `/privacy`, `/terms`). **Disallow** `/api/`, `/s/`, the entire
authenticated app (`/me`, `/settings`, `/onboarding`, `/for-you`, `/favorites`,
`/activity`, `/notifications`, `/swipe`, `/watchlists`), `/user/`, all auth flows
(`/signin`, `/signup`, `/sign-up`, `/forgot-password`, `/reset-password`,
`/verify-email`, `/restore-account`), `/search`, `/debug`, `/docs`. References the
sitemap + declares `host`.

## 9. Sitemap strategy (§Phase 9)

`app/sitemap.ts` → `/sitemap.xml`, **ISR `revalidate = 86400`**. Emits static
pages (`/privacy`, `/terms` — **not** `/`, which redirects; see §10) + a
**bounded, stable** set of movie/TV IDs
from TMDB **popular + top-rated** (5 + 3 pages/type → ~300 high-value URLs;
verified 305). Watchly persists **no local title table**, so generating from the
whole TMDB catalog would be unbounded, crawl-budget-hostile, and API-cost-heavy —
explicitly avoided. **Scaling path:** once a local `titles` table exists, switch
to `generateSitemaps()` chunks of ≤50k URLs keyed off DB rows.

## 10. Canonical strategy (§Phase 10)

Every indexable page sets `alternates.canonical` to its clean path
(`/title/movie/550`, `/collection/10`, `/artist/287`, `/`). `metadataBase`
resolves them absolute to `app.gowatchly.com`. Query params (`?region=`,
trackers, filters) never appear in the canonical, so param variants and
old-domain URLs collapse to one canonical. `/search` result permutations are
`noindex` + robots-disallowed rather than canonicalized.

### Root route decoupled from the app

The marketing landing now lives on **`gowatchly.com`** (the separate
`watchly-business` app), so `app.gowatchly.com/` is no longer a landing page.
`middleware.ts` (fast edge path, cookie-presence) + `app/page.tsx` (session-aware
fallback) redirect `/`:

- **signed-out** (incl. crawlers) → `https://gowatchly.com` (marketing home)
- **signed-in** → `/me`

Both use **307** (temporary), not 308 — the target varies by the auth cookie, so
a permanent redirect would be wrongly browser-cached across login/logout. `/` is
removed from the sitemap (a redirecting URL must not be listed), and the app's
indexable content (`/title/*`, `/collection/*`, `/artist/*`) is unaffected. The
shared public nav (`LandingNav`) stays — its logo now links straight to the app
(`/me`) for signed-in users and to `gowatchly.com` for signed-out ones, skipping
the `/` redirect hop. `LandingHero`/`LandingFeatures`/`LandingFooter` were removed
as dead code. Net SEO effect: `gowatchly.com`
becomes the brand's canonical homepage; `app.gowatchly.com` is the app + its
indexable title catalog.

## 11. Old-domain migration findings (§Phase 11)

**Finding:** the app is intentionally served on **both** hosts during the move,
with the client-side "we've moved" nudge (`src/components/migration/*`). A hard
301 in middleware would delete that product feature. **Implemented interim:**
**canonical consolidation** — `metadataBase` pins every canonical / OG / JSON-LD
URL to `app.gowatchly.com`, so even when `watchly.dayonelabs.co` serves identical
content, search engines consolidate all ranking signals to the new domain. No
stale old-domain URLs exist in metadata, manifest, sitemap, structured data, or
OG (all derive from `SITE_URL`). **Gotcha fixed:** `SITE_URL` must **not** derive from `PUBLIC_APP_URL` — in
production that env var is the app's current runtime origin (still the OLD
`watchly.dayonelabs.co` host, used for email links), so canonical/OG/sitemap URLs
were resolving to the old domain. That both broke the GSC sitemap (property =
`app.gowatchly.com`, URLs = old domain → *all* URLs rejected, "305 errors") and
consolidated ranking signals onto the deprecated domain. `SITE_URL` is now
hard-pinned to `https://app.gowatchly.com` (override only via the dedicated
`NEXT_PUBLIC_SITE_URL`). Requires a **redeploy** to take effect on production,
then re-read/resubmit the sitemap in GSC.

**Email links repointed too:** `sendVerificationEmail` / `sendPasswordResetEmail` /
`sendRestoreAccountEmail` / `sendWelcomeEmail` (`services/auth/emailFlows.ts`) built
their links off `PUBLIC_APP_URL`, so production emails sent users to the old host.
`appUrl()` now returns `SITE_URL` in production (localhost preserved in dev for the
mail-trap flow), so all transactional links land on `app.gowatchly.com`. Both hosts
serve the app, so tokens work either way; this just moves users onto the new domain.
*Still on the old domain (separate, out of scope): the email **sender** address
`EMAIL_FROM = watchly-noreply@dayonelabs.co` — changing it to a `gowatchly` sender
needs SPF/DKIM/DMARC set up for that domain in Resend first. And the dev-only
`debug/emails` `PREVIEW_BASE` constant.*

**Final cutover (when the nudge window ends):**
add a permanent **301/308** at the DNS/hosting layer (or middleware keyed on
`watchly.dayonelabs.co`) that preserves the path (`/movie/550` → `/movie/550`,
never → `/`), then retire the nudge. Until then, canonical is the correct,
non-destructive SEO mechanism.

## 12. JSON-LD (§Phase 12)

- **Site-wide** (`WebsiteJsonLd`, root layout): a `@graph` of `WebSite`
  (+ `SearchAction` → `/search?q=`), `WebApplication`
  (`EntertainmentApplication`, free `Offer`), and `Organization`.
- **Movie** pages → `Movie`; **TV** pages → `TVSeries`. Fields: `name`, `url`,
  `image` (poster), `description` (overview), `genre`. Serialized with `<`
  escaped (XSS-safe).
- **`aggregateRating` intentionally omitted.** Google requires rating structured
  data to correspond to a rating **visibly** on the page; the title hero does not
  prominently display the TMDB score, so emitting it risks a structured-data
  manual action. TMDB `voteAverage`/`voteCount` are fetched and available to
  enable this later if a visible rating UI is added. No fabricated values.

## 13. Indexing readiness (§Phase 13)

Public pages are server-rendered (RSC) — the title `<h1>`, overview, and metadata
are in the initial HTML with **no login required** (anonymous crawlers see full
content; region/favorite bits are the only client/dynamic parts and carry no SEO
weight). No accidental `noindex` on public content (verified: home / movie / TV /
collection / artist all emit exactly `index, follow`). Middleware gates only the
authed surface and never blocks bots on public routes.

## 14. Programmatic SEO foundation (§Phase 14)

Title pages already carry genuine, structured content — title, year, overview,
poster/backdrop, region-aware provider badges (stream/rent/buy), runtime, genres,
cast, trailer — targeting real queries like *"where to watch Interstellar
Philippines"* / *"is X on Netflix"*. The metadata + `Movie`/`TVSeries` JSON-LD +
canonical + sitemap seed make these rankable **without** auto-generated filler.
Growth path: promote the detail pages to PPR static shells + `generateStaticParams`
for the hot set (already scoped in `docs/caching-strategy.md`), and add a local
`titles` table to unlock full-catalog `generateSitemaps()`.

## 15. Indexing policy & tradeoffs

| Surface | Policy | Rationale |
|---|---|---|
| Home, `/title/{movie,tv}/[id]`, `/collection`, `/artist`, `/privacy`, `/terms` | **index** + canonical + OG (+ JSON-LD for titles) | Primary discovery/SEO assets with unique content |
| `/user/[username]`, `/watchlists/[id]` | **noindex, follow** + shareable OG + canonical | Privacy + thin-content safety. **OG still unfurls** (noindex doesn't block social preview), so shared links look good without opening profiles/lists to open indexing. Flip to index by removing `robots` + adding a per-entity OG once "public + non-empty" is enforced |
| `/search` | **noindex, follow** + robots-disallow | Arbitrary `?q=` permutations = thin/duplicate; protects crawl budget |
| Auth flows, onboarding, settings, all `(authed)` | **noindex** + robots-disallow + login-gated | Private / no SEO value |

**Tradeoffs:** (a) profiles/watchlists get the branded (not per-entity) OG — a
deliberate call to avoid doubling their heavy loaders on a noindex page; upgrade
path documented inline in each file. (b) TV season/episode pages inherit default
metadata (no per-page canonical/OG) — low-priority deep pages; add
`generateMetadata` later if they become link targets. (c) sitemap is a curated
popular/top-rated seed, not the full catalog — correct given no local title table.

**Benign observation:** the `/user/*` route emits a second, redundant bare
`<meta name="robots" content="noindex">` (Next's not-found/streaming metadata on
that route). It appears **only** on profiles — which are `noindex` by design — so
it has zero SEO impact and never touches an indexable page.

## 16. Testing performed (dev server, real HTML)

| Check | Result |
|---|---|
| `/robots.txt` | ✅ correct allow/disallow, host + sitemap |
| `/sitemap.xml` | ✅ 305 URLs (3 static + 149 movie + 153 TV), all `app.gowatchly.com` |
| `/manifest.webmanifest` | ✅ name, icons, theme/background colors |
| Favicon assets | ✅ `favicon.ico` (3-size ICO), `icon.svg`, `apple-icon.png` (180), 192/512/maskable PNGs served 200 |
| Home `<head>` | ✅ title, description, canonical `app.gowatchly.com`, OG (1200×630), Twitter, icons, manifest, theme-color, JSON-LD graph |
| Movie `/title/movie/550` | ✅ `Fight Club (1999) — Where to Watch`, canonical, `og:type=video.movie`, composed OG, `Movie` JSON-LD (overview `"` safely escaped) |
| TV `/title/tv/1399` | ✅ `Game of Thrones (2011) …`, `og:type=video.tv_show`, `TVSeries` JSON-LD |
| Invalid `/title/movie/999999999` | ✅ `Title not found`, `robots: noindex, nofollow` |
| Composed title OG PNG | ✅ renders (backdrop + poster + title + meta + brand) |
| Collection `/collection/10` | ✅ title, canonical, TMDB-backdrop OG |
| Artist `/artist/287` | ✅ `Brad Pitt — Movies, TV Shows & Where to Watch`, canonical, `og:type=profile` |
| Profile `/user/watchly` | ✅ `noindex, follow` + shareable OG |
| `/search` | ✅ `noindex, follow` |
| `tsc --noEmit` / ESLint | ✅ 0 errors, 0 warnings on all changed files |

External validators to run post-deploy: Google Rich Results Test, Schema.org
Validator, Facebook Sharing Debugger, X Card Validator, LinkedIn Post Inspector.

## 17. Search Console & Bing setup (§Phase 15 — manual)

**Google Search Console**
- **Verification (done):** URL-prefix property `https://app.gowatchly.com`, verified
  via the HTML-file method. The token file lives at
  `public/googlec286897b5f17be52.html` → served at
  `https://app.gowatchly.com/googlec286897b5f17be52.html`. **Do not delete it** —
  GSC re-checks periodically and un-verifies the property if the file 404s.
  *(Optional broader coverage: also add a **Domain property** for `gowatchly.com`
  verified via a DNS TXT record — covers apex + every subdomain + both protocols.)*
1. Property already added + verified (above).
2. — (DNS domain-property is the optional alternative noted above.)
3. **Sitemaps →** submit `https://app.gowatchly.com/sitemap.xml`.
4. **URL Inspection →** `https://app.gowatchly.com/` → *Request indexing*.
5. Inspect + request indexing for several titles, e.g.
   `/title/movie/550`, `/title/movie/27205`, `/title/tv/1399`.
6. Confirm rendered HTML shows title/description/canonical and no `noindex` on
   those pages (Inspect → *View crawled page*).
7. Monitor **Pages** (indexed vs excluded), **Enhancements** (structured data),
   and **Core Web Vitals** weekly for the first month.

**Bing Webmaster Tools**
1. Add `https://app.gowatchly.com`; verify via DNS/meta **or** *Import from GSC*.
2. Submit the same sitemap; use **URL Inspection** + **IndexNow** for fast
   recrawl of new/updated titles.

**Old domain:** if `watchly.dayonelabs.co` remains live, add it as a separate GSC
property and (at cutover) use the **Change of Address** tool after the 301 is in
place.

## 18. Example final metadata

**Homepage**
```
<title>Watchly — Find Where to Stream Movies & TV Shows</title>
<meta name="description" content="Find where to watch movies and TV shows across Netflix, Disney+, Prime Video, Max, and 100+ streaming services with region-aware availability. Track everything in one universal watchlist.">
<link rel="canonical" href="https://app.gowatchly.com">
<meta property="og:title" content="Watchly — Find Where to Stream Movies & TV Shows">
<meta property="og:url" content="https://app.gowatchly.com">
<meta property="og:image" content="https://app.gowatchly.com/opengraph-image">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{ "@graph": [ WebSite(+SearchAction), WebApplication, Organization ] }</script>
```

**Movie — `/title/movie/550`**
```
<title>Fight Club (1999) — Where to Watch | Watchly</title>
<meta name="description" content="Find where to watch Fight Club (1999) in your region. Check streaming availability on Netflix, Disney+, Prime Video, Max, and 100+ services.">
<link rel="canonical" href="https://app.gowatchly.com/title/movie/550">
<meta property="og:type" content="video.movie">
<meta property="og:image" content="https://app.gowatchly.com/title/movie/550/opengraph-image">
<script type="application/ld+json">{"@type":"Movie","name":"Fight Club","url":".../title/movie/550","image":"https://image.tmdb.org/t/p/w500/…","description":"…","genre":["Drama","Thriller"]}</script>
```

**TV — `/title/tv/1399`**
```
<title>Game of Thrones (2011) — Where to Watch | Watchly</title>
<meta property="og:type" content="video.tv_show">
<script type="application/ld+json">{"@type":"TVSeries","name":"Game of Thrones","url":".../title/tv/1399","image":"…","description":"…"}</script>
```

**Public watchlist — `/watchlists/[id]`** (shareable, noindex)
```
<title>Watchlist | Watchly</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="https://app.gowatchly.com/watchlists/[id]">
<meta property="og:title" content="A watchlist on Watchly">
<meta property="og:image" content="https://app.gowatchly.com/opengraph-image">
```

## 19. Remaining recommendations

1. **DNS-level 301** from `watchly.dayonelabs.co` (path-preserving) at cutover; then GSC Change of Address.
2. **PPR the detail pages** + `generateStaticParams` (per `docs/caching-strategy.md`) — improves TTFB/CWV, an indirect ranking factor.
3. **Local `titles` table** → full-catalog `generateSitemaps()` and richer programmatic pages.
4. **Per-entity OG + opt-in indexing** for non-empty public watchlists/profiles (Letterboxd-style list SEO).
5. **TV season/episode `generateMetadata`** if they become internal link targets.
6. **Add a visible rating UI** on title pages, then enable `aggregateRating` JSON-LD (data already fetched).
7. **`twitter:site`/`creator` handles** once an official @handle exists (omitted now to avoid fabrication).
8. **BreadcrumbList JSON-LD** on detail pages for richer SERP breadcrumbs.
9. **Privacy/Terms exist on both domains** — `app.gowatchly.com/privacy|terms`
   duplicate `gowatchly.com/privacy|terms`. Pick one canonical home: either
   canonical/301 the app copies to `gowatchly.com` and drop them from the app
   sitemap, or keep them app-owned. Left app-owned for now (out of scope for the
   root decoupling).
10. **Optional brand structured data** — the app still emits site-wide `WebSite`
    + `Organization` JSON-LD. If `gowatchly.com` should be the sole brand entity,
    slim the app's graph to `WebApplication` (keep the `SearchAction` — search
    lives on the app) and let the marketing site own `WebSite`/`Organization`.

## 20. SEO risks & tradeoffs

- **Dual-domain serving** dilutes signals until the 301 lands; canonical
  consolidation mitigates but a permanent redirect is the real fix.
- **OG images are dynamic** (`ImageResponse`); crawlers fetch them independently.
  Mitigated by Data-Cache reuse, but confirm `x-vercel-cache` HIT on OG routes
  post-deploy and consider longer cache headers if crawler volume is high.
- **`aggregateRating` omitted** — slightly less rich SERP appearance, deliberately
  traded for zero manual-action risk.
- **Bounded sitemap** — long-tail titles aren't in the sitemap yet; they remain
  crawlable via internal links, and the DB-backed scaling path is documented.
```
