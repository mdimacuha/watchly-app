# Onboarding revamp: panel transcript

Date: 2026-10-23. Scope: `/signin`, `/signup`, `/onboarding`.
Panel: Product Engineer, Product Analyst, User Analyst, Cinephile User,
Senior Software Engineer, UX Designer, UI Designer. The orchestrator
(Claude) framed the brief, ran two rounds and wrote the decision.

Prototypes: `http://localhost:3000/debug/onboarding?variant=A|B|C&screen=signup|signin`
(dev only; see "Prototypes" at the end).

---

## 0. Audit of the current flow (localhost, local DB)

Walked live with a fresh test user (`onboardaudit1`) on the local
database, desktop 1280px and phone 390px.

| # | Screen | What it does |
|---|---|---|
| 1 | `/signin` | Centred card on a blurred blue glow. Email *or* username toggle link, password, Forgot, Remember me, "Create an account". Google button is in the code but unmounted. Success → `/me`. |
| 2 | `/signup` step 1 | Email, Username (live check + a long rules hint), First name, Last name, all required. |
| 3 | `/signup` step 2 | Password + Confirm password. Success → `/onboarding/welcome`. |
| 4 | `/onboarding/welcome` | "Let's personalize Watchly", "~30 seconds setup" pill, Start Setup / Skip. No value. |
| 5 | `/onboarding/profile` | Avatar upload, display name, bio 0/160. |
| 6 | `/onboarding/region/auto` | Map-pin icon, "Auto-detect region" / "Select manually". |
| 7 | `/onboarding/region/manual` | Search + popular regions. Auto-detect sends you here anyway. |
| 8 | `/onboarding/titles` | Popular poster grid + search. Picks are saved as **Favorites**. Finish → `/me`. |
| 9 | `/me` | Empty profile, "Just getting started", 0 followers, "People you might know". |

Findings:

- **Nobody ever finishes onboarding.** `user_preferences.onboarding_completed`
  is never set to `true` anywhere in the code. Nothing resumes a half-done
  onboarding, sign-in never routes back to it, and completion can't be
  measured.
- **6 required fields and 7 screens before any value.** The order is
  social-first (profile/bio) before utility (region, taste), which is the
  reverse of the north star.
- **Taste picks pollute Favorites,** the user's curated, public shelf.
- **Region is two screens for one answer.** A user who skips it gets
  "unknown" on their profile while the sidebar says US.
- **It looks like a template.** A stock card on a glow blob with a numbered
  pill stepper. None of the app's design language (tickets, notches,
  mono kickers, Anton, the Programme) shows up.
- **The first impression of the recs is weak.** The picker opens on
  Spider-Man, Grey's Anatomy and Death in Paradise.
- **Mobile:** on the titles step, Finish is below the fold, and the stepper
  loses its labels.
- **Dead end on finish.** Users land on an empty `/me` that answers neither
  core question.

## 0b. Decisions the user made before the debate

- Signup fields: the panel decides the minimum.
- Streaming services: an **optional** step.
- Onboarding **ends with a "first ticket" reveal**: one pick for tonight
  and where to watch it.
- Taste before account is allowed (picks carry over into the account).
- Keep the 7-day verify-email grace period.
- **Profile/bio stays** as an onboarding step.

---

## Round 1: opening positions

### Cinephile User
"Start with taste and leave the form for later." Search-first picks:
"let me type 'Kiarostami'". The popular grid "tells me in 3 seconds the
recs will be algorithm sludge". Region on one screen. Signup asks only
for email, username and password. Services are optional and must include
Mubi, Criterion Channel and Kanopy ("if it's only Netflix/Max/Prime, I'm
gone"). The ticket says why ("because you loved X") and has a "not this,
another" button. Cuts: the welcome screen, names, confirm password, People
you might know on day one, the pill stepper. Biggest risk: "a first ticket
that's a Marvel movie or something not streamable in my region." Concept,
**Admit One**: "each answer punches a notch and prints a line on the
stub in mono type"; at the end the stub tears off as tonight's ticket.

### Product Analyst
Make the flow as short as possible and measure it. Today completion
"cannot be measured at all". Every screen before the ticket is a drop-off
point, so time-to-ticket is the number to cut. Picks go to `title_swipes`
with source `onboarding`. Must-have: an `onboarding_events` table in the
`search_events` shape (nullable `user_id`, a `session_id` that bridges
guest to account, the variant in `metadata`). Funnel events run from
`signup_started` through `ticket_revealed`, plus `ticket_provider_clicked`.
That last one maps to the title-to-provider click-through row, and "no
provider-click tracking exists anywhere today". Primary metric: share of
signups that reach the ticket. Retention is compared between users who
reached the ticket and users who skipped. Cuts: names, the welcome screen,
the second region screen, the 20-pick cap ("5 is enough"). Risk: guest
picks get orphaned. "If the ticket's provider click-through comes in
under 15%, the reveal is decoration." Concept: Admit One.

### User Analyst
Build around three first-session jobs, each under 60 seconds:
- **The tonight-chooser** (a casual streamer or a couple): "give me
  something we can actually press play on."
- **The link arrival**: "show me the thing I was sent."
- **The cinephile**: "will it understand my taste?"

Asking for an email and a full name first "reads as a lead-capture form".
Showing the IP-detected region as a fact the user can correct "builds more
trust than an 'Auto-detect' button followed by a manual screen anyway".
Ending on an empty `/me` "tells a new user the app is empty". Must-haves:
signup is email + password with a suggested username, a real provider on
the ticket, a completion flag that gets set, and onboarding that resumes.
Risk: the ticket is something already seen or unavailable. Mitigation: a
"Seen it, next" reroll, plus logging the reroll count and provider
click-through for the first 50 signups. Concept: Admit One ("region
stamps the venue, services print the screen").

### Product Engineer
Four screens, with value on screen 1:
- `/start` taste deck (signed out) → region as a chip ("Showing for United
  States · change"), not a screen.
- A one-screen `/signup` (email, suggested username, password with show).
- Optional services → the ticket ("Watch on X", "Add to Tonight").
- The ticket sets the completion flag and enters `/for-you`.
- `/signin` gets one "Email or username" field.

Ship order: sign-in, then the flag and resume, then the deck, then the
ticket. Cuts: the welcome screen, the avatar in the flow, the manual
region screen, names and confirm, the stepper chrome, any animation beyond
the reveal, real A/B infrastructure, Google. Risk: a bad cold-start pick.
Mitigation: only pick candidates that have a provider in the user's
region, and test in US, PH and JP.

### Senior Software Engineer
- Write picks through the existing `recordSwipe` (`liked`,
  source `onboarding`). It upserts, `pickSeeds` already reads liked
  swipes, and profile Likes are hidden by default. That means no migration
  for taste, and `submitOnboardingTitlesAction` (`addFavorite`) gets
  deleted.
- Resume is derived from data the app already has (onboarding likes,
  `regionSource`, `selectedProviders`), with one `completeOnboarding()`.
  The check runs in the authed layout or on sign-in, not in middleware,
  which only checks the cookie.
- Guest picks are kept in sessionStorage and sent in the signup payload,
  Zod-validated.
- The taste screen has to sit outside `/onboarding`, which requires
  authentication. It also needs a public, rate-limited search action.
- The ticket is `getSidebarTonight(userId, region).picks[0]`.
- Risk: the For You pool's first build is a cold one ("seconds of
  TMDB/JustWatch calls") and lands exactly on the reveal. Mitigation: warm
  the pool when region is saved, and fall back to a popular title in the
  region that has a provider.
- Cost: about 6–8 days, mostly the variants.

### UX Designer
Taste first, account last:
- Taste: 12 posters plus search, with a sticky "Next (n picked)".
- Region on one screen, prefilled ("Watching from Philippines · Change").
- Services optional, with Skip and Continue at equal weight.
- Account: email + password, show/hide, no confirm field.
- The ticket sets the completion flag.

Progress is a reel strip with a kicker ("REEL 2 OF 4 · REGION"). Every
step has its own URL and real back, and resumes. Must-haves:
- A sticky bottom bar in the thumb zone with safe-area padding.
- `aria-pressed` on posters, arrow keys in the grid, and focus moving to
  each step's `<h1>`.
- Errors announced with aria-live and skeleton posters while loading.
- A search-only fallback if TMDB fails, and a "Not streaming in PH yet"
  ticket state.
- Reduced motion respected.

### UI Designer
"Box Office → Admit One." Sign-in and sign-up are the box office: a wall
of regional posters, desaturated, beside a flat form. Headlines are set in
Anton ("ADMIT ONE." / "WELCOME BACK.") and labels are mono kickers. The
stepper becomes a reel counter. Picks get a "punched" notch and stamp
instead of a blue ring. The reveal is a full ticket with the SidebarTonight
anatomy (notches, tear line, Anton title, "On Netflix in PH"). Its only
motion is a 400ms upward slide-and-unclip, like a ticket feeding out of a
printer. Must-haves:
- 4.5:1 contrast over a solid scrim, not blur.
- Reduced motion: a static wall and a 150ms fade.
- Accent safety: the default primary before sign-in, and a second cue on
  every accent-coloured state.

Cuts: the glow blob, the stock card shadow, the pill stepper, the "~30s"
pill, the map pin, the button glow. Avoid glass over the posters, gradient
text, Ken Burns zoom and confetti. Three directions: Box Office, Marquee
(pure type), Reel (film strip).

---

## Round 2: cross-examination

The orchestrator passed the user's constraint ("profile/bio stays as a
step") to every panelist. It also listed the open questions:

- **(a)** where the account form goes;
- **(b)** the taste mechanic;
- **(c)** the username;
- **(d)** where the user lands after the ticket;
- **(e)** saving picks to Favorites;
- **(f)** whether the ticket shows before signup.

### Cinephile User
Agrees with the SWE (never a blank ticket), the UX Designer (one-screen
region) and the User Analyst ("a shared link becomes the first ticket.
That's exactly how I'd arrive, from a friend's list"). Box Office is their
pick: it reads as "a repertory lobby". Against a swipe-only deck: "a deck
would have shown me Venom 3 times before Close-Up." Against a username
generated from the email: "marc.dimacuha42 feels like a coupon account."
Against landing on `/for-you`: autoplaying trailers "undercut the ticket".
Accepts a profile step "after signup and before the ticket: name on the
stub ... ten seconds at most". Non-negotiable: search-first taste with
niche services listed. Concedes: no "save picks to Favorites" option.

### User Analyst
- **(a)** The account goes after taste and before the ticket: "the couple
  on the sofa has made picks, so the ticket is what's at stake for them."
  The form first brings back lead capture; after the ticket, people take
  the pick and leave.
- **(b)** Search-first with posters underneath; swipe as a variant.
- **(d)** Land on the ticket's title page, "never /me".
- **(e)** Drops the Favorites option.
- **Missing from every position:** the link arrival. "That shared title
  should be pre-picked and should be their ticket."
- **Sign-in:** a "welcome back" that shows their Tonight ticket "would cost
  nothing extra".

Profile goes "straight after signup". Non-negotiable: "the ticket always
names a provider that is real in the user's region."

### UI Designer
Moves to the Admit One stub as the spine ("a better spine than my
programme sheet"). On a 390px phone the stub becomes "a 56px ticket strip
pinned to the top" that prints `REGION · PH`, `2 PICKS`, `SCREEN · NETFLIX`.
Rejects form inputs on a perforated stub ("hurt legibility and autofill").
The tear line sits above the form. Concedes: "My poster wall was a
Netflix-login tell", so it's cut from sign-in. Non-negotiable: the reveal
uses the shipped ticket anatomy "so tonight's ticket in the app is the
same object. No glow, no confetti."

### UX Designer
Agrees: derived resume, search-first, the link arrival, the region chip.
Against the ticket before the account: "a reveal you can't use is a dead
end", and `getSidebarTonight(userId)` needs a user to exist. Against
`/for-you` as the landing: "a full YouTube player is a heavy first
landing". The profile step is "Put your name on the stub", and the name
gets printed on the ticket. Concedes a visible, prefilled username field.
Non-negotiable: "every step has its own URL, real back, resume on sign-in,
and no dead ends."

### Senior Software Engineer
- **(a)** The account goes before the ticket. The pool is keyed and cached
  per user, so an anonymous ticket would be "a second, uncached pipeline
  that duplicates pickSeeds. That's an L for a wow moment."
- **(b)** Against a swipe deck: "Writing `passed` from onboarding feeds
  `loadPassedGenreSet` and would suppress whole genres based on cold-start
  guesses."
- **(c)** Keep the names `notNull` and write `''` for v1.
- **(d)** Land on `/for-you`.
- **Concedes** the `onboarding_events` table (a copy of `search_events`)
  and the 5-pick cap.
- **Non-negotiable:** guest picks travel in the signup payload, are
  validated with Zod and written through `recordSwipe`, with "no anonymous
  rows in `title_swipes`".

### Product Engineer
Against the ticket before signup: "a couple gets 'Dune, on Max', closes the
tab, and we gained no account." Signing up "is what tears off the stub".
Drops the swipe deck for "a 12-poster tap grid plus search ... faster,
keyboard-accessible, and fits the cinephile". The variants change only the
presentation, with one shared set of actions. Names should be nullable
through a migration ("do not fake them"). Still lands on `/for-you`, with
the ticket kept in the sidebar. Non-negotiable: "the ticket never comes up
blank or unavailable."

### Product Analyst
The derived state "cannot show guests who pick titles and then leave
before signup", abandoned signups, or provider clicks. `for_you_events.user_id`
is `notNull`, so the events table rides along in the names migration.
Account after taste, before the ticket. "Compare time-to-3-picks and
reroll rate; don't settle it in debate." The primary metric becomes the
share of taste-starters who reach the ticket; the secondary is ticket
provider click-through. Concedes: resume comes from derived state, not
events.

---

## Decision (orchestrator)

**Build "Admit One": a first run that is the walk into a cinema.** The
visitor names what they love first (search-first, no account). They buy
the ticket with a 3-field signup, confirm the venue (region) and the
screen (services), and put their name on the stub. The flow ends by
tearing off tonight's ticket: one real pick, why it was picked, and where
to watch it in their region. Every answer visibly prints onto the stub,
so progress is the product's own object rather than a stepper. The ticket
in the reveal is the same ticket that lives in the sidebar afterwards.

How the open questions were settled:

| Question | Call | Why |
|---|---|---|
| Where the account goes | After taste, before the ticket | 5 of 7 panelists. A ticket needs a user (pool is per user), and the ticket is the reward for signing up. |
| Taste mechanic | Search on top, a curated, mixed-era poster row below; likes only | Cinephile's non-negotiable. SWE fact: onboarding `passed` rows would suppress genres, so skipping never writes. |
| Signup fields | Email, username (suggested, editable, live check), password with show | Names cut, confirm cut. 6 fields become 3. |
| Names | Forward migration: `first_name`/`last_name` nullable | Don't fake data. The same migration adds `onboarding_events`. |
| Region | One screen: the detected region shown as a fact, with "Change" | Two screens become one. No new user ends up with `unknown`. |
| Services | Optional, with Skip at equal weight, niche services included | The user's call. |
| Profile/bio | A step after services, before the ticket: "Put your name on the stub", ≤10s, Skip | The user's constraint. The name prints on the ticket, which gives the step a purpose. |
| Ticket | `getSidebarTonight` pick #1, "because you loved X", provider for the region, "Seen it, next" reroll; falls back to a popular title in the region with a provider | It is never blank. Sets `onboarding_completed`. |
| Landing | The ticket's title page, with the same pick in the sidebar Tonight slot | Answers "where can I watch this" with no autoplay. For You stays one tap away. |
| Link arrival | A shared title is pre-picked and becomes the ticket | User Analyst. Costs nothing. |
| Sign-in | One "Email or username" field, password, Remember on; resumes an unfinished onboarding | Same stage as signup, no toggle. |
| Favorites option | Cut | Favorites is curated, public data. |

### v1 scope
1. Public taste step (search-first, 3–5 picks, likes only) carried in the
   signup payload and written through `recordSwipe`. [SWE, Cinephile]
2. A 3-field signup and a one-field sign-in in the new visual language.
   [UX, UI]
3. One-screen region, optional services, and "name on the stub". [UX]
4. First-ticket reveal with a reroll and a guaranteed provider; the
   completion flag gets set; the user lands on the title page. [PE, UI]
5. Resume: sign-in or the authed layout routes to the first unfinished
   step, and old `/onboarding/*` URLs redirect. [SWE]
6. One migration: an `onboarding_events` table and nullable names. [PA, SWE]
7. Mobile: a sticky action bar and the stub as a strip pinned to the top.
   [UX, UI]

### Cut from v1
- Welcome interstitial and the manual region screen: they add a step and
  no value.
- Swipe deck as the taste mechanic: deck rows would write `passed`. Revisit
  if a like-only deck tests faster in the prototypes.
- "Save picks to Favorites": revisit as a later "pin these to your shelf".
- Google sign-in: still a stub.
- Real A/B infrastructure: traffic is too low. The variants are design
  prototypes.
- Poster wall on sign-in: read as a Netflix-login tell.

### Success metrics
- Share of taste-starters who reach `ticket_revealed`. Target: baseline
  first, then ≥70%. Maps to the 7-day retention row.
- Ticket provider click-through ≥15%. Maps to the title-to-provider row.
  Below 15%, "the reveal is decoration."
- Reroll count on the first 50 signups: a measure of pick quality.
- Day-7 retention, ticket reached vs skipped.
- Signup error rate and verification rate as guardrails (reliability row).

### Risks
- **Cold pool on the reveal:** warm it when region is saved, and fall back
  to a popular title in the region with a provider.
- **Guest picks lost:** they travel in the signup payload in one request,
  with sessionStorage as a backup.
- **Bad first pick** (Marvel, already seen, unavailable): weight the pick
  to the seeds, add the reroll, and filter on availability.
- **Public search abuse:** rate-limited and behind the bot filter.

### Dissent
- **Product Engineer, SWE, Product Analyst:** would land on `/for-you`
  rather than the title page.
- **SWE:** would write `''` for the names in v1 and skip the migration.
- **SWE, Product Engineer, Product Analyst:** would put the profile step
  *after* the ticket so it doesn't delay the value moment.
- **User Analyst:** would show the ticket blurred before signup (title
  visible, provider hidden).

---

## Prototypes

`/debug/onboarding?variant=A|B|C` (dev only). Use the floating bar to
switch variant and screen (Sign in / New account); the arrow keys also
switch variant. Real TMDB data (posters, search, providers, a real ticket
when you're signed in locally). **Nothing is written:** account creation,
region and services saves are stubbed.

The three variants share the steps and data. They differ in layout and
primary interaction:

- **A: Admit One.** A split stage. On desktop the ticket stub sits beside
  the question and prints a mono line as each answer lands; on a phone it
  is a strip pinned to the top. Sign-in is "present your ticket".
- **B: Reel.** One full-bleed question per screen, a reel-counter kicker
  and a sticky bottom bar. Taste is a like-only card deck with search on
  top (skip writes nothing). Sign-in asks one field at a time.
- **C: Programme.** One scrolling programme sheet. Steps are numbered
  entries 01–05 in Anton, each opening as the last one is answered, and
  the sheet ends on the ticket. Sign-in is a pure-type "WELCOME BACK."
  marquee.

---

## Round 3: after the user reviewed A/B/C

User brief (verbatim):

> on Sign in, i want A's ticket style sign in form and C's heading. on New Account I want C's type of sign up form, i think we can put it on A's left side, i want to keep the ticket admit one design on the right side. also the 2 column layout of A. … for b-c do it like a but different and with a twist and quirks

New A = C's programme sheet on the left, A's Admit One stub on the right; sign-in = C's "Welcome back." beside A's ticket form. B and C keep that shape and every earlier decision.

### Panel notes (openings and cross-examination)


#### Cinephile User
New A keep: the folded entries and the stub footer "US · AMAZON PRIME VIDEO · SEAT 01" ("reads like a real stub"). Bugs: curated row opens Spider-Man beside Shawshank/Breaking Bad and the ticket "Because you picked Shawshank" for The Godfather — "an IMDb Top 250 reflex"; mix eras/countries (a Varda, an Ozu, a Bong); the "because" should name something specific (director, decade, cinematographer).
B "Repertory Calendar": left = monthly rep-house calendar, dated screenings ("FRI 01 · THREE YOU LOVE"), two-colour letterpress (accent + foreground). Quirk: each pick prints as a double-bill pairing line ("SHAWSHANK + ESCAPE FROM ALCATRAZ"). Right = punch-card season pass, five holes, one punched per step; final punch reveals tonight's double-feature slot; reroll = "swap the second feature". Sign-in "YOUR PASS IS STILL VALID" + membership number.
C "Projection Booth": left = booth cue sheet ("REEL 1 · CHANGEOVER AT 01"), mono, rack-focus label per step. Quirk: the cue-mark dot (Fight Club "cigarette burn") top-right before each changeover, static under reduced motion. Right = film-can label / leader strip counting 5→1, one per step; at 1 it becomes the feature card (projectionist's slate). Sign-in "HOUSE LIGHTS DOWN." form = booth log ("Projectionist on duty: ___").
Gimmick line: no animated countdown that makes you wait, no film-burn over posters, no fake festival laurels ("lies about the film").

#### UX Designer
New A keep: folded entries = audit trail; whole flow fits one screen (A-06). Fix: done entries need a real labelled button "Change 01 Three you love" (missing in A-03/A-06 — it hides on the ticket step); focus to h2 with scroll-margin clearing strip; carousel clips first card's ring — pad scroller; on reveal "Watch on Prime" and "Enter Watchly" compete as two primaries — Enter Watchly secondary. Flagged the "1 Issue" overlay.
B "The Teller": stub echoes input live in mono — HOLDER fills letter by letter, VENUE stamps on confirm; instant text, one 120ms ink fade (off under reduced motion). Sign-in echoes only the identifier as typed — never looks the account up, so no account enumeration; a wrong password stamps "NOT VALID" + aria-live error. Phone strip shows the last printed line.
C "The Punch Card": every stub line (TASTE/HOLDER/VENUE/SCREENS/NAME) is a link to its entry; done lines punched; clicking reopens; unreached lines aria-disabled with reason. Sign-in "season pass": barcode is the submit control (wraps a labelled button); after sign-in "Resuming at 03 The venue". Phone strip = 5 punch-hole buttons, 44px each.
Would hurt: a "tear to continue" drag gesture — no keyboard, fires on scroll, hides the primary action.

#### User Analyst
New A works: tonight-chooser sees poster thumbs fill the stub before being asked for an account; cinephile gets search first + Psycho in the row. Friction: jargon replaces meaning — a casual user won't know "Your seat" = account or Holder/Venue/Screens = username/region/services → keep the motif, add a plain subtitle ("Your seat: create your account"). Reveal: two competing actions → Watch on Prime primary, Enter Watchly a text link.
B "Double Feature" (couples): optional "+ second seat" toggle in 01 — partner adds 2–3 likes on the same screen, off by default (no time cost solo). Ticket becomes ADMIT TWO, two holder lines, a bridging pick ("Because you liked X and they liked Y"). Sign-in "TONIGHT, AGAIN." with a torn half-stub of their last ticket (title only).
C "Will Call" (link arrival + cinephile home): arriving from a shared link, the ticket is pre-titled "HELD FOR YOU · from @sender"; the shared title shows as a support-feature line with its own provider (the feature is never a picked title); programme notes read like repertory notes (director · year · runtime). Sign-in "WILL CALL" — "the name the ticket is held under".
Avoid: drag/tear to reveal (hides provider, fails keyboard/reduced motion, costs seconds at the CTR moment); a seat map as region picker.

#### Product Analyst
Threats in new A: profile step before ticket = one more screen before ticket_revealed → one-tap prefilled or after reveal. White "Enter Watchly" out-contrasts blue "Watch on Prime" → pulls first clicks from the provider; make it secondary and log which is clicked. "Fallback" line → log ticket_source (personal|fallback) or CTR mixes both. Spider-Man first = a risk to taste-starters, not yet measured.
B "Will Call": ticket = will-call envelope with a live counter "214 films on your screens tonight" shrinking/sharpening as region and services are set; opens to the pick. Sign-in "WILL CALL", "Name on the reservation". Could move signup conversion (utility before account) and services-set rate.
C "Late Show": ticket prints a real showtime from runtime + local time ("Starts 9:40 · out by 11:52"); reroll = "Change the reel", favouring titles that fit tonight. Sign-in "LATE SHOW". Could move ticket provider CTR — "supports the decision rather than just decorating it". Identity-only, keep small: NO. 0001, SEAT 01.
5-user test: time to ticket, where they hesitate/back out, first click at reveal, can they say why they got the pick, rerolls, did they understand B's counter.
Theatre to avoid: drag-to-tear.

#### UI Designer
Keep: Anton numerals (accent active, dim later, muted done) with mono summaries "read as a printed programme". Fix right column: ~380px ticket floating in a ~540px lighter slab with ~230px dead space — drop the slab to bg-background, hairline split, widen ticket (≤440px), align its top with the open numeral, kicker "BOX OFFICE · WINDOW 1". Poster row clipped both edges → left gutter; "Next entry" height = search field.
B "The Letterboard": ticket = a black cinema letterboard, ruled channels, Anton letters, accent only on the active row; each answer slots a row (NOW SHOWING / SHAWSHANK · PSYCHO / VENUE PH / ON MUBI); at reveal the board resets to the feature + provider. One motion: letters drop in, ~30ms stagger; instant under reduced motion. Sign-in heading as letterboard rows "TONIGHT: / YOU." Phone: a single marquee line pinned top.
C "The Roll": ticket = a vertical roll of numbered ADMIT ONE stubs 0001–0005 with perforations; each finished entry fills a stub; the last is the full feature ticket. One motion: the roll advances one stub (translateY), a cut under reduced motion. Sign-in "ROW F, SEAT 01." kicker YOUR SEAT IS SAVED. Phone: roll goes horizontal in the top strip.
Slop to avoid: glowing marquee bulbs/neon, holographic tilt ticket, film grain/light leaks.

#### Senior Software Engineer
Concern: progress is a cursor, not answers — stubLines/ProgrammeFlow derive done from f.index, so "Change" on Taste blanks Holder/Venue/Screens/Name on the stub and fades later entries though answers are held; next() from Taste reopens Account and re-calls createAccount() (a second signup in the real build). Fix: answered:Set<Step>, done from answers; Change opens one entry and returns to the furthest step; Account not editable after signup — "real resume needs exactly this model". Minor: PickThumbs injects a <style> every render.
B "Double Bill": split "A / B" reel marks, aside = projectionist's cue line, two-part stub "Your picks" vs "Tonight's feature" (feature half blank until reveal). Sign-in "Back for the late show." Risk none (layout only).
C "Projection Booth": frame counter on the mark (FR 0001…), film-strip stub holding picks, reveal = one CSS transition, no timers, final state under reduced motion. Sign-in "Lights down." Risk: seed any seat/frame number from the username (seatFor), never Math.random → hydration mismatch.
Don't build: "N people got this ticket tonight" / live now-showing counts (cross-user aggregation, new query, privacy rules).

#### Product Engineer
New A is shippable as the v1 base; steps map 1:1. Gap: debug copy "Fallback: well-liked…" on the reveal → hide or "Streaming in the US tonight". Fix the "1 Issue" before promoting.
B "Late Show": marks are showtimes from the local clock (21:40, 21:45 … FT. 22:00), kicker "TONIGHT · 21:38"; ticket = narrow thermal-receipt stub, a line per answer, feature last. Sign-in "STILL UP?" after 22:00 else "WELCOME BACK.", form ticket "LAST ADMISSION". ~4–6h; time-aware kicker could fold into A (~1h).
C "Reserved Seating": seatFor(username) — a small SVG seat map in the ticket lights their row/seat live as they type; entries "Row A"–"Row E"; reveal "Your seat for The Godfather". Sign-in "FIND YOUR SEAT." — seat lights up once a username is typed (recognition cue). ~6–8h; folds into A's "SEAT 01" in ~30 min.
Refuse: drag-to-tear / physics tear — days of fragile work for a once-seen moment; a static tear + 400ms slide gets 90%.

### Cross-examination picks

#### Cinephile User
B = Letterboard + Late Show: rep-house letterboard, a row per answer, reveal "TONIGHT 21:40 · THE GODFATHER · OUT BY 00:35 · ON PRIME" — a real showtime "answers 'can I start this now?' — the only quirk that helps me decide." Sign-in "STILL UP?" after 22:00.
C = The Roll + Will Call: numbered stubs 0001–0005; from a friend's link the last stub says "HELD FOR YOU · from @sender" with the shared title as support feature; programme notes director · year · runtime ("how repertory houses actually write"). Sign-in "WILL CALL — name the ticket is held under".
Kill: the seat map ("a toy" that hints the account exists, "not a Watchly idea") and the "214 films" counter ("a vanity number").

#### User Analyst
B = Late Show + Double Feature (couples): showtime marks, "Starts 9:40 · out by 11:52" answers "do we have time?"; optional "+ second seat" → ADMIT TWO, bridging pick, off by default.
C = Will Call + PA's counter (link arrival + cinephile): shared link pre-holds the stub "from @sender"; "214 films on your screens tonight" shrinks as region/services are set — catalogue counts, not users, so SWE's aggregation objection doesn't apply.
Kill: Reserved Seating — nobody maps seat → country, and lighting a seat when a username is typed is account enumeration.

#### Product Engineer
B = Late Show with PA's runtime showtime ("Starts 21:40 · out by 23:52", reroll favours what fits tonight) + UX's Teller live echo on the receipt (~6h).
C = Will Call + Punch Card stub-as-navigation; defer PA's counter (needs a count query).
Drops own seat map (UA is right). Kill on cost: Double Feature / Admit Two — "new rec logic, not a skin".
Fold into A regardless: SWE's answered:Set<Step>, labelled Change buttons, Enter Watchly secondary, plain subtitles, ticket_source logging + remove debug Fallback line, UI right-column fix, mixed-era curated row, seatFor seat number.

### Round 3 decision

**B = Late Show (6 of 7), C = Will Call (5 of 7).**

| Variant | Left | Right ticket | Reveal | Sign-in |
|---|---|---|---|---|
| A · Admit One | Anton numerals 01–05 | Admit One stub, "Box office · window 1" | Full ticket | "Welcome back." + "Present your ticket" |
| B · Late Show | Each entry is a real showtime from the local clock; feature last | Black cinema letterboard, a row per answer, echoed as you type | Board: "Tonight 23:05 · The Godfather · out by 02:00 · on Prime"; ticket "Starts · out by"; reroll favours films ending before 00:30 | "Still up?" after 22:00 else "Welcome back." on the letterboard; stub echoes the typed identifier (no lookup) |
| C · Will Call | "Reel 1–5"; "Held for you" banner when arriving from a link | Roll of numbered stubs 0001–0006; punched stubs reopen their entry; locked ones say what unlocks them | Friend's title printed as a support feature with its own provider, never the feature | "Will call." — "Held under (email or username)", "Collect your ticket" |

Folded into all three: answered-step progress (Change keeps later answers, returns to the furthest step, account can't be re-created); labelled Change buttons; plain subtitles ("Your seat · create your account"); provider button primary, "Or open the title in Watchly" a text link; debug copy removed; right column on the page background with a hairline, ticket ≤440px; phone strip pinned to the page; seat from the username.

Cut: seat map (account enumeration), the 214-films counter (new catalogue queries, nobody acts on it), Admit Two (new rec logic), drag-to-tear, cue-mark dot / film burn, fake festival laurels.

Dissent: SWE — Late Show as a flavour line, not the structure. PA — name step still sits before the reveal. SWE/PA — Will Call's link carry-over belongs in the real build (prototype toggle simulates it). Cinephile — curated row and "because" still need era/country range and a director or decade in the reason.

---

## Your pick

As of 2026-10-23: **new account = A; sign-in = B's Late Show** (letterboard "Still up?" after 22:00, "Welcome back." otherwise, beside the "Present your ticket" form). "New here? Get your first ticket" stays on the ticket; the top-right "New to Watchly?" link is removed.
