# Migration Modal — "We've moved to app.gowatchly.com"

Post-login popup that appears while Watchly is served on two hostnames during
the move to gowatchly. The hostname decides the variant; persistence is
per-domain by design.

## Behavior

The same app is deployed on **both** hostnames. The modal mounts once in the
authenticated shell and self-gates on the client — it renders nothing on most
loads.

| | `watchly.dayonelabs.co` (OLD) | `app.gowatchly.com` (NEW) | anything else (localhost / preview) |
|---|---|---|---|
| **Variant** | `nudge` | `welcome` | none (hidden) unless dev override |
| **Heading** | We've moved! 🎉 | You're all set! 🎉 | — |
| **Body** | We've migrated Watchly to app.gowatchly.com for a better experience. | Welcome to app.gowatchly.com — your new home for Watchly. Bookmark it so you always land right here. | — |
| **Primary CTA** | **Start using app.gowatchly.com** → hard-nav to `https://app.gowatchly.com` + current path | **Let's go** → close + set `isMigrated` cookie | — |
| **Dismiss** (X / backdrop / Esc / "Maybe later") | Session-only — hides for this browser session, **returns next login** | Close + set `isMigrated` cookie (permanent) | — |
| **Persistence** | `sessionStorage["watchly_migration_dismissed"]` | `watchly_isMigrated` cookie (1-year) | — |
| **Shows again?** | Every new login until they move | Once, ever | — |

**Why per-domain persistence.** Cookies don't cross registrable domains
(`dayonelabs.co` vs `gowatchly.com`), so dismissing the nudge on the old domain
and then seeing the welcome once on the new domain is the intended flow — no
shared state needed. The `isMigrated` cookie is only ever set on the NEW domain;
the OLD-domain nudge is intentionally session-scoped so it keeps nudging until
the user actually moves.

**Trigger point.** Login does a hard `window.location.assign('/me')`, so
`AuthenticatedShell` remounts with the fresh session → the modal's mount effect
runs → "after logging in" is satisfied. It does not re-pop on client-side nav
(the shell lives in the `(authed)` layout, mounting once per full page load).

## Visuals

- **Animated address bar** — a faux browser bar (lock icon + faux traffic
  lights) that types out `app.gowatchly.com` character-by-character with a
  blinking caret. Teaches/reinforces the new URL.
- **Background** — a handful of TMDB trending backdrop stills, cross-fading
  behind the content using the `TitleHero` recipe (dimmed `object-cover` image +
  gradient overlays fading into the card surface). Fetched lazily, only when the
  modal decides to show. Falls back to gradient-only if the fetch fails.
- **Reduced motion** — `prefers-reduced-motion` shows the full URL instantly (no
  typing, no caret) and a single static still (no cross-fade).

## Architecture

Follows the repo's `route → service → server/tmdb` layering. No new
dependencies, no DB/migration, no middleware or `routes.ts` change.

```
src/lib/migration.ts                       # constants, resolveVariant(), copy, cookie/session helpers (client-safe)
src/services/tmdb/backdrops.ts             # getMigrationBackdrops(count) → string[] of w1280 URLs
src/services/tmdb/index.ts                 # + export * from "./backdrops"
src/app/api/v1/tmdb/backdrops/route.ts     # GET → handleRoute(getMigrationBackdrops) — public
src/components/migration/
  AnimatedAddressBar.tsx                   # typewriter address bar
  MigrationBackdrop.tsx                    # cross-fading TMDB stills + gradient overlays
  MigrationModal.tsx                       # controller: gate → fetch → render (bespoke framer-motion overlay)
src/components/nav/AuthenticatedShell.tsx  # mounts <MigrationModal /> next to <QuickViewModal />
```

### Gating logic (`resolveVariant`)

```
hostname === app.gowatchly.com     → 'welcome'
hostname === watchly.dayonelabs.co → 'nudge'
otherwise                          → null (hidden)
```

A `?migration=welcome|nudge` query param overrides the variant, but **only off
the two real production hosts**, so it can never force the wrong variant in prod
while still enabling local/preview testing.

### Stills endpoint

`GET /api/v1/tmdb/backdrops` → `{ success: true, data: string[] }`. Region-agnostic
so the response is globally cacheable (`tmdbFetch` already revalidates hourly
upstream). Public (not under `/api/me`), so no middleware change. Called lazily
by the modal — only when it has decided to render — so suppressed loads cost
nothing. `image.tmdb.org` is already whitelisted in `next.config.ts`.

## Testing / verification

- **Local, already signed in:** `http://localhost:3000/me?migration=nudge` or
  `?migration=welcome` — the modal reads the override straight from the URL.
- **Local, through login (the real "hooked on login" path):** visit
  `http://localhost:3000/me?migration=welcome` while signed out. Middleware
  preserves the query on the redirect to `/signin?redirect=/me?migration=welcome`,
  and `AuthForm` forwards it on the post-login hard-nav, so you land on
  `/me?migration=welcome` and the modal fires. Starting directly at
  `/signin?migration=welcome` works too. On the real gowatchly hosts no param is
  needed — the modal keys off hostname on any authed load after login.
- **Nudge persistence:** dismiss (X / "Maybe later") → gone this session;
  reload same session → still gone; new browser session → returns. CTA →
  navigates to the new origin preserving the path.
- **Welcome persistence:** dismiss or "Let's go" → sets `watchly_isMigrated`
  cookie → never shows again. Clear the cookie to re-test.
- **Reduced motion:** enable OS "reduce motion" → URL shown instantly, single
  static still.

## Extension points

- Extend to public/landing pages (currently authed-shell only, per the
  "after logging in" scope).
- Deep-link preservation on the nudge CTA can be dropped to a bare `/` if a
  clean landing is preferred.
- Swap the stills source (curated static set / a specific title) by changing
  only `getMigrationBackdrops`.
