# Watchly — Feature & Bug Roadmap (v2)

**Status:** Scoping / planning only. No code has changed. This document is the
authoritative plan for the current batch of bug fixes and new features. It is
also the source for the **marketing site** (`gowatchly.com` /
`watchly-business`) — see [§9 Marketing‑site update map](#9-marketing-site-update-map).

Last updated: 2026‑07‑11. Author: architecture audit (5 parallel subsystem
audits: watchlists, swipe, search, social graph, events).

---

## 1. How to read this

Each item lists: **current state** (what exists, cited to `file:line`),
**the plan**, **what we reuse vs. build**, **migration** (if any), **breakage
risk**, and a **T‑shirt size** (S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks,
XL ≈ 3+ weeks). Sizes are engineering-only rough estimates, not commitments.

The headline finding across all five audits: **the codebase already contains
~70–90% of the primitives these features need** (a taste/recommendation engine,
a hybrid-approval social graph, a composite-PK voting table, a token generator,
a self-guarding public-page pattern, a poll-based live-update pattern). Most of
this work is *wiring and gating*, not green-field. The two genuinely-absent
primitives are **token-based invite links** and **any scheduled/background
execution** — both have clean, no-new-infra workarounds (see Events, §7.6).

---

## 2. Guardrails — "does not break the current build"

Non-negotiable constraints every phase must respect:

1. **Layering.** Keep `route → service → db/integration`. No DB or business
   logic in route handlers; services never import HTTP primitives.
2. **Migrations are forward-only and immutable.** Edit `src/db/schema.ts` →
   `npm run db:migrate:generate` → `npm run db:migrate`. Never edit/delete an
   applied migration. Every schema change below calls out its migration shape.
3. **No new paid infra.** No Redis, no queue, no always-on worker. Live updates
   use the existing 60s visibility-aware **poll** pattern
   (`AppSidebar.tsx:142-190`); time-based state resolves **lazily on read**
   against stored timestamps (the SSE stream was removed for cost — do not
   reintroduce it).
4. **Feature-flag everything risky.** Roll out behind `FEATURES` in
   `src/constants/features.ts` (the `watchlistUpvoting` / `reviews` flags are the
   precedent). Ship dark, enable per-cohort.
5. **Reuse the existing enum/table shapes.** `privacyEnum`,
   `followRequestStatusEnum`, `watchlistMediaTypeEnum`, and the
   `watchlistVotes` composite-PK pattern already exist — extend, don't
   reinvent.
6. **Validate at boundaries with Zod; explicit `select` columns.** Standard repo
   rules apply to every new service.
7. **No test runner exists** — validate each phase with `npm run build` +
   `tsc --noEmit` + `npm run lint` + manual QA.

---

## 3. Executive sequencing

Ordered by **risk-adjusted value** and **dependency**. Rationale in §8.

| Phase | Theme | Items | Schema migration? | Size |
|------:|-------|-------|:-----------------:|:----:|
| **0** | Stabilize (bugs) | Swipe dead-zone, Swipe stuck-surfacing | No | S + M |
| **1** | Quick wins (zero-migration) | "Swiped" collection, Add-another-list-to-yours, Artist search + local fuzzy | No | S–M each |
| **2** | Privacy foundation | Watchlist privacy modes (enum), `areMutualFollows`, fix stale profile gate | **Yes** (1) | M–L |
| **3** | Discovery | List recommendations C1 (in-list) + C2 (whole-list rail) | Maybe (C2 opt.) | M / L |
| **4** | Collaboration + invite infra | `watchlist_collaborators`, write-access refactor, invite inbox | **Yes** (2) | L |
| **5** | Events (MVP) | Host / invite-link / candidate / lock / vote / countdown | **Yes** (3–4) | XL |
| — | Backlog | Global char/episode search, guest voting, cron decisioning, ranked voting | — | L+ |

Phases 0–1 are independently shippable today with **no schema changes**. Phase 2
is the keystone: it unlocks privacy-correct behavior for Phases 3 (C2), 4, and 5.
Phase 4 builds the invite pattern that Phase 5 reuses.

---

## 4. Bug fixes (Phase 0)

### 4.1 Swipe — dead zones on the card (can't drag from the poster) · **S**

**Current state.** The drag gesture lives on the outer `motion.div`
(`SwipeCard.tsx:97-108`, `drag={active && !committing ? 'x' : false}`). The
poster is a `next/image` with `fill` + `object-cover` that physically covers the
whole card (`SwipeCard.tsx:111-124`) and is rendered **without
`draggable={false}`**. Native `<img>` defaults to `draggable=true`, so on a
**desktop mouse** a press-drag starting on the poster triggers the browser's
HTML5 image drag ("no-drop" cursor) and cancels framer-motion's pointer stream.
`select-none` (`SwipeCard.tsx:99`) only stops *text* selection, not image
dragging. Every other surface (bottom gradient/metadata panel, badge/chips) is a
plain `<div>` and drags fine — which is exactly why it feels like "some parts
can't be swiped." **Effectively desktop-only** (touch never triggers native
image drag).

**The plan.** Set `draggable={false}` on the poster `<Image>` (`SwipeCard.tsx:112`)
and add `pointer-events-none` / `-webkit-user-drag:none` so pointer events fall
through to the `motion.div` across the entire poster.

- **Reuse:** n/a. **Build:** one prop + one class.
- **Migration:** none. **Risk:** negligible (image is decorative, no handlers).

### 4.2 Swipe — surfacing gets stuck; must press arrow keys to draw out the next card · **M**

**Current state (root cause).** The drag fly-off is **decoupled** from the state
advance, and the cooldown gate can **reject a commit after the card has already
flown off-screen**, leaving an empty slot with the flown card still at
`items[0]`.

- `current = items[0]`; advancing = `setItems(prev => prev.slice(1))`
  (`SwipeDeckClient.tsx:123`, inside `commit`).
- `commit` guards on a synchronous ref `if (!current || inFlightRef.current) return`
  (`:118`), sets `inFlightRef=true` (`:119`), awaits the server action, then holds
  the gate an extra `COMMIT_COOLDOWN_MS = 280ms` (`:158-161`) — a guard designed
  for **keyboard auto-repeat**.
- Buttons and keyboard call `commit` directly and **bail before anything moves**
  if the gate is closed (fail-safe). **Drag** only commits at the *end* of its
  300ms fly-off (`SwipeCard.flyOff`, `:68-82`), and the top card is rendered with
  **no `submitting`/`disabled` prop** (`SwipeDeckClient.tsx:288-294`) — so it stays
  draggable during the cooldown.
- Race: swipe N (drag) → at fly-off end `commit` advances + holds gate 280ms →
  N+1 is now active & draggable but `inFlightRef` still true → user swipes N+1 →
  its `flyOff` runs unconditionally, card animates off-screen, and at completion
  `commit` hits `if (inFlightRef.current) return` and **bails**; `setItems` never
  runs → N+1 is off-screen *and* still `items[0]` = **empty slot / "stuck."**
- Arrow key later calls `commit` directly once the gate reopens → `setItems` runs
  → the stuck row drops. That is precisely "press arrow keys to draw it out."

**Why it reproduces "after 20 / when fetching more."** `recordSwipeAction` and
the prefetch `getSwipeDeckAction` are both **Server Actions**, which the App
Router processes **serially**. The prefetch (fires at `remaining ≤ 5`,
`SwipeDeckClient.tsx:88-111`) is slow — `getSwipeDeck` enriches up to 30
candidates with per-title TMDB fan-out + trending (`recommendation.ts:144-148,216`).
While it's in flight, the next `recordSwipeAction` queues behind it, so
`inFlightRef` stays closed ~1–2s and every drag in that window flies off and gets
swallowed → the deck sticks hard exactly as the queue refills near the end of the
first 20-card page.

**Secondary bug (same effect).** If the prefetch returns only titles already in
the local queue, dedup yields `fresh=[]`, `items.length` is unchanged, and
because the effect depends on `[items.length, prefetching]` (`:111`), flipping
`prefetching` false re-triggers it → a **refetch loop**.

**The plan (pick one; recommend the first).**
1. Thread the busy signal into `SwipeCard` — render the top card with
   `interactive={!submitting}` and fold it into
   `drag={active && interactive && !committing}` so a drag **can't start** during
   the cooldown (mirrors the buttons). The fly-off can then never outrun a
   rejectable commit.
2. Or make the drag path fail-safe: if `commit` bails while airborne, **spring
   the card back to center** (reuse `animate(x,0,…)` at `SwipeCard.tsx:92`).
3. Or decouple the auto-repeat cooldown from drag entirely: reset `inFlightRef`
   immediately in `finally`, keep the 280ms tail **keyboard-only** (`committingRef`
   already prevents a single card double-committing).

Also fix the refetch loop: guard the prefetch effect so a zero-`fresh` result
doesn't re-trigger (e.g. track an "exhausted" flag or depend on a fetch cursor,
not `prefetching`).

- **Reuse:** existing gate/refs. **Build:** gesture/timing coordination.
- **Migration:** none. **Risk:** M — must not regress the double-commit
  protection the ref was added for. Fix + manual QA past the 20-item boundary.

---

## 5. Watchlists — features

### 5.1 Add another user's watchlist into your own · **S–M** · (Phase 1)

**Current state.** Copying is essentially two existing, already-correct
primitives composed together:
- `getWatchlist(sourceId, viewerId)` (`services/watchlists/index.ts:274`) —
  reuses the read gate, so you can only copy from a list you're allowed to see;
  returns raw items (`mediaType`, `mediaId`).
- `bulkAddItems(targetId, userId, items)` (`:381`) — owner-gates the target,
  appends above `nextSortOrder`, **dedups via the unique index
  `watchlist_items_unique_idx` + `onConflictDoNothing`** (`:403-410`), records
  `watchlist_bulk_add`, returns inserted count.

`BulkAddCollectionPicker.tsx` + `AddCollectionToWatchlistButton.tsx` are
near-exact templates for the destination-picker UI. Media types already match
(`movie|tv` both sides — no mapping, unlike the collection path).

**The plan.** Add `copyWatchlistItems(sourceId, targetId, userId)` (~10 lines)
composing the two primitives; an action mirroring
`addCollectionToWatchlistSmartAction` (`actions/watchlists.ts:312`); a
`{ sourceId, targetId }` Zod schema; and a **"Save to my watchlist"** button on
the **non-owner** branch of `WatchlistDetailClient.tsx` (today non-owners only
get Share, `:366-375`) + a picker cloned from `BulkAddCollectionPicker`.

- **Reuse:** dedup (unique index), sort-order safety (`nextSortOrder`), bulk-add,
  picker UI. **Build:** thin service fn + action + non-owner button + picker.
- **Migration:** none.
- **Decision:** copied items reset to `status='just_added'` and drop
  `startedAt/finishedAt/notes` (you shouldn't inherit someone else's "finished").
  Make this explicit. **Risk:** low.

### 5.2 Watchlist privacy modes · **M–L** · (Phase 2 — keystone)

**Current state.** A single `watchlists.isPublic boolean` (`schema.ts:451`)
gates everything. But **`privacyEnum('public','followers_only','private')`
already exists** (`schema.ts:30-34`) and is already wired into
`userPreferences.profileVisibility` / `watchlistsVisibility` — **no new enum
needed.** Two important facts from the audit:
- `userPreferences.watchlistsVisibility` **exists but is enforced nowhere** —
  watchlist privacy today is purely the per-list boolean. We must reconcile the
  two (recommend: per-list `visibility` wins; demote the global to a
  default-for-new-lists).
- The profile gate `getPublicProfileByUsername` (`services/profile/index.ts:453`)
  has a **stale `followers_only` branch** ("treated as private until the social
  feature lands") that predates the now-landed social graph. Fixing/generalizing
  it into a shared `resolveVisibility(viewer, owner, level)` helper is part of
  this work.

**Middle tier — DECIDED: `mutuals` / friends (2026‑07‑11).** The three offered
watchlist visibility levels are **public / mutuals / private**. `mutuals` =
*both users follow each other* → needs a **net-new** `areMutualFollows(a, b)`
helper (two accepted `user_follows` rows). ⚠️ Do **not** reuse `getMutualFollowers`
— it is *friends-in-common*, **not** pairwise-mutual. (For reference, the cheaper
one-directional `followers_only` value was **not** chosen; it stays in the shared
enum for possible profile use but is not offered for watchlists.)

Because `privacyEnum` currently = `[public, followers_only, private]`, we **add
`mutuals`** to it (additive `ALTER TYPE ... ADD VALUE` — safe: the migration never
*writes* the new value, so no same-transaction "unsafe use of new value" error).
The enum stays shared with profiles, so `mutuals` becomes available to profile
visibility for free later.

**The plan.**
1. **Migration (forward-only):** add `mutuals` to `privacyEnum`
   (`ALTER TYPE ... ADD VALUE 'mutuals'`), then replace `isPublic boolean` with
   `visibility privacyEnum notNull default 'private'`. drizzle-kit emits
   add-column + drop-column with no backfill, so **hand-insert a backfill between
   them** (editing an *un-applied* generated migration is allowed):
   `UPDATE watchlists SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END;`
   The backfill only writes existing values (`public`/`private`), so it is safe in
   the same migration as the `ADD VALUE`. Conservative alternative: two migrations
   (add+backfill now, drop `is_public` later).
2. **New helper** `areMutualFollows(viewerId, ownerId)` in `services/social`
   (single count-both-directions query; served by the existing
   `user_follows_*_status_idx` indexes) + a set-based variant for list queries.
3. **Rewrite the gates** to branch on `visibility` (`public` → allow;
   `followers_only` → `getFollowState` accepted; `mutuals` → `areMutualFollows`;
   `private` → owner only; **null viewer → public only**):
   `getWatchlist` (`index.ts:290`), `requireAccessibleWatchlist`
   (`votes.ts:50`), and `listPublicWatchlists` (`index.ts:210`, whose signature
   must gain `viewerId` — ripples to `profile/index.ts:535`).
4. **UI:** `WatchlistFormModal` checkbox → 3-way segmented control (clone the
   pattern in `PrivacySettingsClient.tsx`); update visibility labels + Share/Upvote
   gating in `WatchlistDetailClient.tsx` (`:247,348,363,366,520`),
   `WatchlistCard.tsx:32`, validators (`isPublic: z.boolean()` →
   `visibility: z.enum(...)`), and the create/edit action shapes.

- **Reuse:** `privacyEnum`, `getFollowState`, `isEitherBlocked`, the profile-gate
  pattern, the settings segmented control. **Build:** migration+backfill,
  `areMutualFollows`, gate rewrites (~8 touch points), UI control.
- **Migration:** **Yes** (1). **Risk:** M–L — touches read gates; anonymous
  viewers must never satisfy non-public modes. Feature-flag + build + manual QA
  per mode.

### 5.3 Spotify-like recommendations · **M (C1) / L (C2)** · (Phase 3)

Two distinct asks. **C1 largely exists; C2 is net-new.**

**Existing engines (all reusable).**
- `services/forYou/index.ts` — the full pipeline: `pickSeeds` (favorites →
  watchlist items → swipe saved/liked, TMDB-enriched with genres/keywords/cast),
  `gatherCandidates` (recommendations/similar per seed, seed-overlap scored),
  `enrichCandidate`, `loadExcludeSet`.
- `services/swipe/recommendation.ts` `getSwipeDeck` — the reference "compose
  For You + custom scoring" implementation.
- `services/tmdb/recommendations.ts` `getWatchlistRecommendations(seeds, exclude)`
  — **already recommends items to add to a specific list**, already wired into
  `AddTitlesModal`'s "Similar" tab (`AddTitlesModal.tsx:174`).

**C1 — recommend items to add to a list (M, mostly wiring).** Make it
taste-aware by blending `pickSeeds(userId)` with the list's own items, run
through `gatherCandidates` + `enrichCandidate`, exclude the list's keys +
`loadExcludeSet`. Add a "Recommended for this list" tab beside "Similar." Reuses
~90% of the existing machinery. **No migration.** *Could be pulled forward into
Phase 1 — it's low-risk.*

**C2 — recommend whole watchlists to discover/follow (L).** No engine and no
"follow a watchlist" relation exist today (only `watchlistVotes`). Needs: a
candidate-watchlist query (public + followers-visible lists across users —
**depends on Phase 2 privacy gating**), a taste-overlap + vote-count + mutual
boost scoring pass, a new `services/watchlists/discovery.ts` (or a new `ForYouRow`
id), an action, and a "Watchlists for you" rail (reuse `WatchlistCard` +
`attachPosters`). **Optionally** a `watchlist_follows` table (+ migration +
notification type) if "follow" (not just "view/upvote") is intended.

- **Migration:** none for C1; optional for C2 (`watchlist_follows`).
- **Risk:** C1 low; C2 medium (depends on Phase 2, new scoring surface).

---

## 6. Swipe — "Swiped" collection (Spotify "Liked"-style) · **S–M** · (Phase 1)

**Current state.** **Almost entirely a new read-surface, not new data.** The
positive signals (`action IN ('liked','saved')`) already live in `title_swipes`,
with a **unique index on (userId, titleId, titleType)** so liked∪saved is
inherently deduped (one row per title, latest action wins).
- `saved` → **already a Favorite** (confirmed: `recordSwipe` calls `addFavorite`
  when `action==='saved'`, `services/swipe/index.ts:93-97`). So "Swiped"
  overlaps Favorites by design (Spotify-like).
- `liked` → **deliberately not** a Favorite ("keeps Favorites clean") — this is
  the genuinely net-new value of a "Swiped/Liked" surface.

The history view already exposes per-action chips (All/Liked/Saved/Passed/Opened,
`SwipeHistoryClient.tsx`), and `getSwipeHistory` (`index.ts:257-314`) already
returns enriched, newest-first rows — but filters a **single** action. A "Swiped"
collection reframes **liked ∪ saved** as one curated, positive-only surface.

**The plan.** Add `getSwipedCollection(userId, {limit, before})` using the
existing `inArray(action, ['liked','saved'])` pattern (`inArray` already imported,
`index.ts:5`) — or widen `getSwipeHistory`'s `action` to accept an array (prefer a
dedicated method to avoid touching the `z.enum` validator). Reuse the
`SwipeHistoryItem` shape + `HistoryCard` grid for the UI, and a self-guarded
`(authed)` route (`/swipe/liked` or a "Swiped" library entry).

- **Reuse:** the entire query + enrichment + card grid; dedup is automatic.
  **Build:** multi-action query + route + (for a full page) wire the
  already-existing-but-unused `before` keyset cursor on the client.
- **Migration:** none.
- **Size:** **S** as a combined "Swiped" chip on the existing history bar;
  **M** as a dedicated paginated collection page with its own nav entry.
- **Risk:** low. Product notes to decide: `saved` items show in both Favorites
  and Swiped (expected); un-favoriting elsewhere doesn't delete the swipe row, so
  a `saved` title can linger in Swiped after its Favorite is gone.

---

## 7. Big net-new features

### 7.1 Watchlist collaboration · **L** · (Phase 4)

**Current state.** No collaborator concept exists — `watchlists` has a single
`userId` owner FK and nothing else. The invite lifecycle maps cleanly onto the
existing **follow-request** machinery.

**Net-new schema — `watchlist_collaborators`** (mirror `userFollows`'
hybrid-approval + `watchlistVotes`' composite PK):
```
watchlistId uuid → watchlists.id (cascade)
userId      uuid → users.id (cascade)
role        text/enum ('editor' | 'viewer')          -- start with 'editor'
status      followRequestStatusEnum                   -- REUSE: pending/accepted/rejected/cancelled
invitedBy   uuid → users.id (set null)
createdAt / updatedAt
PK (watchlistId, userId)   +   index(userId)          -- "lists shared with me"
```

**The critical work is the authorization surface, not the table.** Every write
path that currently gates on `watchlist.userId === session.userId` must also
allow accepted collaborators. It is **not** funneled through one helper today:
- Central chokepoint `requireOwnedWatchlist` (`services/watchlists/index.ts:685`)
  is called by: `updateWatchlist` (`:139`), `addItem` (`:345`), `bulkAddItems`
  (`:386`), `bulkAddCollectionParts` (`:435`), `reorderItems` (`:459`),
  `removeItem` (`:494`), `deleteWatchlist` (`:163`).
- **Inline owner joins that bypass it** (each needs the collaborator branch
  added separately): `updateItemStatus` (`:544`), `updateItemNotes` (`:602`), and
  — easiest to miss — **`services/watched/index.ts`** `markAsWatched` (`:34`) and
  un-watch (`:280`), which mutate `watchlist_items` from a *different service*.

**The plan.** Introduce `requireWatchlistWriteAccess(watchlistId, userId)`
returning `{ watchlist, role }` (owner OR accepted collaborator); route all
item-mutations through it; keep `deleteWatchlist` and (likely) `updateWatchlist`
**owner-only**. Add `notificationTypeEnum` values (`watchlist_invite`,
`watchlist_invite_accepted`) — an additive `ALTER TYPE` migration — plus matching
`NotificationType` union + `buildItem` switch cases with `href`s. Implement
`inviteCollaborator` / `acceptCollaboratorInvite` / `reject` mirroring
`requestFollow` / `acceptFollow` / `rejectFollow` (`services/social/index.ts`),
reusing `createNotification` (`services/notifications/index.ts:46`),
`requireVerifiedOrInGrace`, and `isEitherBlocked`. Clone the follow-requests inbox
(`me/follow-requests/page.tsx` + `FollowRequestRow.tsx`) into a watchlist-invites
inbox.

- **Reuse:** follow-request state machine, `followRequestStatusEnum`,
  notifications fan-out, accept/reject actions, inbox UI, `watchlistVotes`
  composite-PK shape. **Build:** the table, the write-access refactor across
  ~10 sites, enum additions, 3 invite functions, actions, inbox.
- **Migration:** **Yes** (2: new table + enum values).
- **Risk:** L — the write-access surface is the bug-prone part; the two
  `services/watched` paths are the sleepers. Feature-flag; audit every mutation.

### 7.2 Events — host / invite / collect / lock / vote / countdown · **XL** · (Phase 5)

The largest feature; scope it as an **MVP slice** first. ~70% of primitives
exist; the two absent ones (token links, scheduled execution) have clean
workarounds.

**Lifecycle (states; host-only marked).**
```
(create, host) → COLLECTING → [host locks + sets votingEndsAt] → VOTING
                    │  add/remove candidate                        │ cast/change vote
                    │  (addPolicy: host_only | participants)       │
                    └────────────── CANCELLED (host) ──────────────┘
VOTING → DECIDED   when  votingEndsAt <= now()   (system, LAZY ON READ)
```

**Countdown = server-authoritative.** Store an absolute `votingEndsAt` timestamp;
clients render a local ticking timer but never own the deadline. Effective status
is a pure function of stored columns: `decided iff votingEndsAt <= now()`,
computed server-side on every read (mirrors `userSessions.expiresAt` /
`maintenanceWindows.endedAt`). A client with a skewed clock can never "win" the
wrong title.

**Net-new schema (4 tables).**
```
events            id, hostId→users(cascade), title, description, 
                  addPolicy enum('host_only'|'participants') default 'host_only',
                  status enum('collecting'|'voting'|'cancelled'),   -- 'decided' derived
                  votingEndsAt timestamptz null, winnerCandidateId uuid null,
                  shareToken text unique,  createdAt/updatedAt   [index(hostId), unique(shareToken)]
event_participants eventId→events(cascade), userId→users(cascade),
                  role enum('host'|'participant'), joinedAt   PK(eventId,userId)  [index(eventId)]
event_candidates  id, eventId→events(cascade), mediaType watchlistMediaTypeEnum, mediaId text,
                  addedBy→users(cascade), sourceWatchlistId→watchlists(set null) null, createdAt
                  unique(eventId,mediaType,mediaId)  [index(eventId)]
event_votes       eventId→events(cascade), candidateId→event_candidates(cascade),
                  userId→users(cascade), createdAt   PK(eventId,userId)  [index(eventId,candidateId)]
```
New enums: `event_status`, `event_add_policy`, `event_role`; **extend**
`notificationTypeEnum` (`event_invite`, `event_voting_started`, `event_decided`);
optionally `activityTypeEnum` (`event_create`).

**Vote model — DECIDED: single-choice (2026‑07‑11).** `event_votes` PK
`(eventId, userId)` = one vote per user per event; changing your vote is an
`UPDATE` of `candidateId`. (Approval/ranked — PK `(eventId, candidateId, userId)`
— is explicitly out of scope; backlog.)

**Invite-link + access model.** No token infra exists in `share.ts` today (it
builds plain guessable URLs). **Reuse the auth token generator**
(`crypto.randomBytes(32).toString('base64url')`, `services/auth/tokens.ts:21`) —
but store `shareToken` in **plaintext** (it's a re-shareable capability URL, not a
one-shot secret). Put the event page under `src/app/(public)/events/[token]/` and
**self-guard at the page** (clone `(public)/watchlists/[id]/page.tsx`): anon
viewers see a read-only "Sign in to join" state; joining redirects through
`/signin?redirect=…` (middleware already preserves `redirect`). Mutations stay
safe via `requireUserId()` in server actions even on a public page. Lock the host
management index (`/events`) via `authenticatedRoutes`; keep `/events/[token]`
public.

**Guest voting — DECIDED: logged-in Watchly users only (2026‑07‑11).** All
participant/vote FKs stay `notNull()` on `users.id`; an invitee must sign in to
join, add, or vote (anon viewers get the read-only "Sign in to join" state).
Guest voting (nullable userIds, signed guest-token cookie, anti-abuse story) is a
**separate epic** — backlog, explicitly out of MVP.

**Realtime = the poll pattern (no new infra).** Countdown = client `setInterval`
diffing `votingEndsAt` (no network per tick). Live tally = poll
`getEventStateAction` every 10–15s, **only on the event page and only during
`voting`**, visibility-gated (clone `AppSidebar.tsx:142-190`); stop once decided.
**Winner resolves lazily on read** — there is **no cron/worker** in this codebase
(`purgeExpiredTokens` is explicitly not scheduled), so `getEventState` computes
`decided` when `votingEndsAt <= now()`, runs the `GROUP BY candidate COUNT(*)`
tally, applies a deterministic tiebreak (earliest `createdAt`, then id), and
caches `winnerCandidateId` on first observation. Vercel Cron could later fire the
"decided" notification promptly but is **not required for correctness** —
backlog.

**Reuse vs. build.**
- **Reuse:** `watchlistVotes` service structure for voting
  (`services/watchlists/votes.ts:88-130`); `watchlistItems` shape + TMDB poster
  enrichment for candidates; **`AddTitlesModal`** search + `AddToWatchlistPicker`
  for candidate-adding (re-target `onAdd` → `addEventCandidateAction`);
  `createNotification` for invites; the self-guarding public page; the auth token
  generator; the poll pattern; server-action auth.
- **Build:** 4 tables + enums, `services/events/` + `actions/events.ts`, the
  `(public)/events/**` route tree, token resolver, host management UI,
  participant/voting UI, countdown component, lazy winner resolution, the
  `addPolicy` gate, and transactional guards around lock→vote→decide boundaries.

**MVP slice (buildable on existing patterns).** 4 tables (all logged-in) →
create event (`addPolicy` toggle) → `/events/[token]` self-guarding page +
join-on-auth → add candidates (reuse `AddTitlesModal` + "from my watchlists") →
host **Lock** → single-choice voting + 10–15s poll + client countdown → winner
resolved lazily on read with deterministic tiebreak.

- **Migration:** **Yes** (3–4). **Risk:** XL — breadth (touches every layer),
  state-machine concurrency at the lock/decide boundaries, and the public-page +
  authed-mutation access model (most bug-prone). Feature-flag hard; ship MVP;
  defer the multipliers below.

---

## 8. Sequencing rationale (dependency graph)

```
Phase 0 (bugs) ─────────────────────────────► independent, ship first
Phase 1 (Swiped, Add-list, Artist search) ──► independent, zero migration
Phase 2 (privacy modes) ────────────────────► KEYSTONE
     ├──► enables C2 (recommend visible lists only)
     ├──► enables correct visibility for collaboration reads
     └──► enables correct visibility for event candidate sourcing
Phase 4 (collaboration) ────────────────────► builds invite infra (notif enums,
     └──► accept/reject inbox) ──────────────► REUSED BY Phase 5 (Events invites)
Phase 3 (recommendations) ──────────────────► C1 anytime after Phase 1; C2 after Phase 2
Phase 5 (Events) ───────────────────────────► reuses invite infra (P4) + candidate
                                               add (watchlists) + voting (votes)
```

Why this order:
- **Bugs first** — highest user-visible ROI, no schema, no dependencies.
- **Zero-migration quick wins next** — ship value while the privacy migration is
  designed/reviewed.
- **Privacy is the keystone** — it is a prerequisite for privacy-correct list
  discovery (C2), collaboration reads, and event candidate sourcing. Doing it
  early prevents re-touching those gates later.
- **Collaboration before Events** — collaboration establishes the invite +
  notification-enum + accept/reject-inbox pattern that Events reuses wholesale.
- **Events last** — largest, and it stands on the shoulders of every prior phase.

---

## 9. Marketing-site update map

The marketing site (`watchly-business`) homepage is a stack of feature sections
(`src/app/page.tsx`): `Hero → TitleStrip → AvailabilitySection →
WatchlistSection → SwipeSection → ShareSection → FeaturesIndex → Philosophy →
FinalCta`. New features map to either an **existing section extension**, a
**new section**, or a **FeaturesIndex entry**.

> **Rule:** only publish a marketing claim **after** the feature ships to
> production behind its flag and is enabled. Keep this table in sync as phases
> land.

| Feature | Ships in | Marketing surface | Angle / copy hook |
|---|---|:---:|---|
| Swipe fixes | P0 | `SwipeSection` (`SwipeDemo`) | Nothing new to say — just makes the existing demo honest on desktop. |
| "Swiped" collection | P1 | `SwipeSection` + `FeaturesIndex` | "Every title you liked, in one place — your **Swiped** list." (Spotify-Liked analogy) |
| Add another user's list | P1 | `ShareSection` / `WatchlistSection` | "Found a list you love? **Save it into your own** in one tap." |
| Artist / fuzzy search | P1 | `FeaturesIndex` (or a small SearchSection) | "Search by **actor or director** — jump straight to their films." |
| Privacy modes | P2 | `WatchlistSection` + `ShareSection` | "Share with **everyone, just your followers, or nobody** — your call per list." |
| Recommendations (C1/C2) | P3 | new **"For You" section** or `FeaturesIndex` | "Lists and titles picked for your taste." |
| Collaboration | P4 | new **CollaborationSection** or `WatchlistSection` | "**Build a watchlist together** — invite friends to co-curate." |
| **Events** | P5 | new **EventsSection** (hero-worthy) | "Movie night, decided fairly — **everyone adds, everyone votes, the timer picks the winner.**" |

Events is the strongest standalone marketing beat (invite link + vote +
countdown is inherently viral/social) and likely deserves its own dedicated
section rather than a FeaturesIndex line.

---

## 10. Backlog (deliberately deferred)

Each is its own epic; none is required for the phases above.

- **Global character search** — TMDB has no character index; requires ingesting
  `cast[].character` into our own Postgres table + `pg_trgm`/`tsvector` GIN index
  with an ongoing freshness pipeline. **L+, operational cost.** Ship the **scoped**
  version instead: filter characters *within a known title* over
  already-loaded `cast[].character` (client-side, **S**).
- **Global episode search** — same index-build problem (TMDB episodes exist only
  under `tv/{id}/season/{n}/episode/{m}`). Ship the **scoped** version: fuzzy-filter
  episode names *within a chosen series* via `getTvSeasonDetails` fan-out (**S–M**).
- **Local fuzzy over the user's own lists** — a small matcher (`fuse.js` /
  `match-sorter`) over `userFavorites` + `watchlistItems` gives instant,
  typo-tolerant, zero-TMDB search of "my stuff." Cheap win (**S**) — but adding a
  dep requires the `.cursorrules.md` justification. Natural home for the scoped
  character/episode filters.
- **Events: guest (unauthenticated) voting** — no anonymous-identity primitive
  exists; large independent scope.
- **Events: prompt cron-driven decision + result notification** (Vercel Cron) —
  correctness works lazily-on-read without it.
- **Events: approval / ranked-choice voting** — MVP is single-choice.
- **C2: `watchlist_follows` relation** — only if "follow a list" (vs. view/upvote)
  is a real product goal.

---

## 11. Product decisions

### Resolved (2026‑07‑11)

1. **Privacy middle tier (P2): `mutuals` / friends.** Watchlist visibility =
   **public / mutuals / private**. Requires the net-new `areMutualFollows`
   helper and adding `mutuals` to the shared `privacyEnum`. See §5.2.
2. **Event vote model (P5): single-choice.** `event_votes` PK
   `(eventId, userId)`; change vote = UPDATE `candidateId`. See §7.2.
3. **Event participation (P5): logged-in Watchly users only.** No guest voting
   in MVP. See §7.2.

### Still open (defaulting to the recommendation unless changed)

4. **Global vs. per-list watchlist privacy (P2):** reconcile the unused
   `userPreferences.watchlistsVisibility` with the new per-list `visibility`.
   *Default: per-list wins; global becomes the default-for-new-lists.*
5. **Copy semantics (P1, §5.1):** copied items reset status/notes vs. inherit.
   *Default: reset.*
6. **C2 "follow a list" (P3):** view/upvote-only vs. a real follow relation
   (`watchlist_follows`). *Default: view/upvote-only for first cut.*
```
