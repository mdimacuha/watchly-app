# Watchly

**What it is, what it does, and why it's built this way.**
Status as of 2026-10-24. Companion to `docs/product-design.md` (the compass)
and `NEXT-STEPS.md` (the live status board).

---

## 1. Why Watchly exists

Streaming split the catalogue across a dozen services, and every one of them
is built to keep you inside it. Two everyday questions got harder, not easier:

1. **Where can I watch this movie or show?** The answer depends on your
   country, changes month to month, and no service will tell you a rival has it.
2. **What should I watch tonight?** Endless rows of "Because you watched…"
   optimise for time on the service, not for you finding something good and
   pressing play.

Watchly answers those two questions for you, across every service, for the
country you're actually in. Everything else in the app exists to serve them.

### The north star

> Watchly should be useful enough that people don't need its social
> features, but personal enough that they'll eventually want to share it.

**Utility first. Social is something people grow into, never a requirement.**
A person who never follows anyone gets the whole product. Every social surface
is opt-in, private by default where it matters, and built on top of the
utility rather than in front of it.

### Free, forever

Watchly is free. Always free. Forever. It's made by one person: a cinephile
and binge-watcher who spent more time finding something to watch than
actually watching it. It was built to fix that for everyone who feels the
same.

You already pay for your streaming services, and they cost enough. Finding
something in what you already pay for shouldn't cost more. So there is no
price on admission, now or later.

### User first

Watchly is not built for engagement minutes. It is built so you find the
answer and leave to go watch the thing. Concretely:

- No feature is allowed to make a task slower in exchange for charm.
- No feature asks for something (an account, a verdict, a follow) before it
  has given something.
- Raw engagement is never a success metric on its own (see §8).

---

## 2. The three checks

Every feature, redesign and priority call goes through these:

1. Does it make it easier to **find or decide** what to watch?
2. Does it improve **organizing and enjoying** entertainment?
3. Does it reinforce Watchly's **identity** without adding complexity?

All three no → don't build it. Only the third → keep it small.

### Personality, with a rule

Watchly has a voice: an old cinema. Your country is the **venue**, your
services are your **screens**, a recommendation set is a **programme**, a
watched title is a **ticket stub**, your profile is a **member card**. The
rule is that the metaphor may never cost clarity. If a label would make
someone hesitate, the plain word wins.

---

## 3. Find — "Where can I watch this?"

| Capability | What it does | Why it's built this way |
| --- | --- | --- |
| **Search** (public) | Movies, shows, collections and people. Fuzzy matching (partial names, missing accents), people-first results, theme search ("time travel", "found footage"), type-ahead, year and service filters. Results end with suggestions, never a dead end. | The first question has to be answerable in seconds with no account. Search is open to everyone. |
| **Title pages** | Movie, TV, season and episode pages. Where to watch sits right under the title; inline trailer; cast and crew; TV shows its scale ("14 seasons · 308 episodes · ~154h"). | Availability is the reason people land here, so it's placed next to the title, above everything else. |
| **Where to watch** | Stream, rent and buy options for your country, with clean service names ("Prime Video", not store SKUs). | The answer must be true for *you*. |
| **Honest fallback** | Cards show your region only, with a "Not in your region" pill when nothing streams. Title pages and Quick View fall back to JustWatch, then the nearest country (PH → SG, MY, ID…), then the US, and always name the country shown. | We once silently showed US services to people in the Philippines. A wrong answer is worse than no answer, so Watchly never guesses without saying so. |
| **Quick View** | Tap a title almost anywhere for a peek: where to watch first, collection or seasons, cast with their top roles, whether it's already in your lists. | Deciding shouldn't cost a page load and a lost scroll position. |
| **Collections and artists** | Franchise pages; artist pages list each title once with every role. | Common "what else is in this?" questions, answered in one place. |
| **Notify me when** | Alerts when a title starts streaming in your country, leaves a service, or gets a new season. Checked daily. | "Not available yet" shouldn't be a dead end either. |
| **Share links** | Short `/s/<type>-<id>` links. | Sending a friend a title is the most common share there is. |

---

## 4. Decide — "What should I watch tonight?"

Watchly has three discovery surfaces on purpose. Each fits a different mood,
and none of them pretends to be the others.

| Surface | The mood it serves | How it works | Key decisions |
| --- | --- | --- | --- |
| **For You** (trailer reel) | "Show me something." Low effort, short sessions. | A vertical feed, one trailer at a time. Save to a watchlist or Like without leaving. Each visit is freshly shuffled from your taste, today's trending and wildcards; titles you've seen rest for 7 days. | **A skip is never a dislike.** The reel asks for no decision, which is what separates it from Swipe. Trailers use YouTube's full player with no overlays, per YouTube's policies; all our controls sit outside it. |
| **Tonight's Programme** | "Just pick for me." | A short programme: one Feature, two Supports and a Wildcard, from your favorites, lists and likes. A time and mood dial re-deals it; Go deeper opens a longer list by "Because you liked…". | Four picks, not forty rows. Fewer choices beat infinite scroll when the goal is to press play. |
| **Watchly Swipe** | "Help me sort what I like." | A card deck: Pass, Like or Favorite. Editable history, undo, a film strip of recent swipes. | The one place that asks for a verdict, because that's the point of it. Your verdicts quietly make For You and the Programme better. |
| **Your services** | — | Tick the services you have; recommendations lean toward what you can actually watch tonight. | A great pick you can't watch is a bad pick. |
| **New & Coming Soon** | "What's arriving?" | In design (three prototypes). | — |

**The taste profile** behind all of it is deliberately simple and explainable:
genres, decades and services counted across what you've saved, watched and
liked, with light extra weight for what you've browsed (searches you opened,
trailers you watched for 15+ seconds) at a quarter of the weight, genres and
eras only. Browsing never builds a profile by itself, and it's never shown to
visitors.

---

## 5. Organize and enjoy

| Capability | What it does | Why |
| --- | --- | --- |
| **Watchlists** | Unlimited lists, public or private. Nine statuses that follow a real viewing journey (Just Added → Up Next → Watching → Waiting for Episode/Season → Paused → Finished → Rewatch → Dropped), with start and finish dates. Grid, List and Board views; Auto or Ranked order; notes per title; add a whole movie collection at once. | People don't just "want to watch" — they're midway, waiting, or gave up. The list should know. |
| **Favorites and shelves** | Favorite movies, shows, collections and people. Group them on shelves ("Comfort watches"); one favorite can sit on many shelves. A Sort session shelves them one at a time. | Favorites are curated and personal; shelves are how people actually think about their favorites. Shelves are private until you choose Show on profile. |
| **Watched — the ticket log** | Everything you've seen as numbered ticket stubs. **Seen it** on title pages, Quick View and search; log past watches; dates can be exact, year-only, or "I don't remember". | Logging must be one tap, and honest about fuzzy memory. Reviews count as watched. |
| **Reviews and ratings** | Half-star ratings and written reviews with a spoiler gate and moderation. | Your opinion is part of your record first, and something to share second. |

---

## 6. Share (opt-in)

| Capability | What it does | Privacy stance |
| --- | --- | --- |
| **Profile and member card** | Tabs for Profile, Library, Reviews and Likes. The card shows a one-line taste summary ("Mostly 2020s horror · Films 70% · Watches on Netflix"), an accent colour, Feature presentation (your top titles), By the numbers, and a Review voice featuring your latest review. | Visitors see only what you've made visible. **Preview as visitor** shows exactly that. |
| **Taste match** | Visitors see how much your tastes overlap. | Computed only from what that visitor is allowed to see. |
| **Follows** | Follow anyone; private and followers-only profiles approve requests. Mutual / Follows you, Followed by, verified-only suggestions. | Blocking available from settings. |
| **Notifications** | Two tabs: **For you** (followers, requests, title alerts) and **Following** (friends' activity, grouped into one line per run). | The bell counts only For you unless you opt in. Private lists and hidden favorites are never announced, and notices about things made private later disappear. |
| **Likes** | Everything you liked in Swipe, For You and onboarding. | Private by default. |
| **Instagram story export** | Your card and stats as a story-sized image, previewed first. | Swipe stats are included only if you choose. |
| **Public watchlists** | Open to anyone, even signed-out, and can be upvoted. | Only lists you've set public. |

What's deliberately **not** built yet: shared/collaborative lists and watch
parties. They're on the roadmap, behind the utility work.

---

## 7. Account, trust and the first night

| Capability | What it does | Why |
| --- | --- | --- |
| **Signup** | Starts with taste: pick 3–5 titles you love, *then* make an account with three fields (email, username, password). | Give before asking. The old flow had seven screens and six fields. Picks are saved as likes, not Favorites, because Favorites are curated and public. |
| **First night** | Venue (your country, auto-detected, one step), screens (your services, skippable), name on the stub (first and last name, profile name, optional photo and bio), then your first ticket. | Each step makes recommendations better immediately, and the person can resume where they left off. |
| **Email** | Verify, then a Welcome once verified. One-tap links that email scanners can't burn. 7-day grace before verification is required for social actions. | Don't block utility on verification; block spam vectors. |
| **Settings** | One page organized by the questions people arrive with ("Who can see my stuff?", "What will Watchly ping me about?", "Is my account safe?"). Signed-in devices, What visitors see, Download my data, API tokens, 30-day account restore. | Privacy controls in plain words, not toggles named after database columns. |
| **What's new** | Plain-language release notes at `/changelogs`; the newest one drives a dismissible sidebar card. | People should know what changed without reading a commit log. |

---

## 8. How we measure

| Question | What we measure |
| --- | --- |
| Can people find what they want? | Search success and time to find a title |
| Does Watchly help them decide? | Title-to-provider click-through |
| Are discovery features useful? | Swipe and For You engagement that leads to saves or watches |
| Do people care about collections? | Watchlist creation and repeat visits |
| Is the experience reliable? | Error rates, real-user load times, regressions |
| Do people come back? | 7-day and 30-day retention |

Any new feature's success metric must map to one of these rows. Time spent
and taps are never the goal on their own.

---

## 9. Platform decisions

| Decision | Why |
| --- | --- |
| One Next.js app on Vercel, Postgres, strict route → service → database layering | Small team, one deploy, predictable code. |
| No paid queue, cache or worker; live updates poll every 60s while the tab is visible | Cost discipline. The SSE stream was removed for cost. Time-based state resolves on read. |
| Public pages cached for 24h; crawlers that ignore robots.txt get a 403 | Cached pages are fast and cheap; an aggressive crawler once pushed us past Vercel's ISR quota. |
| TMDB as the catalogue, JustWatch as an availability fallback | Best open catalogue plus a second opinion where TMDB lags. |
| Rate limits on auth, search, swipes, exports | Abuse protection without new infrastructure. |
| Privacy enforced in services, not just in UI | A hidden thing must be hidden in stats, notifications and exports too. |
| Everything risky ships behind a flag; migrations are forward-only | Never break the current build. |

---

## 10. Design language

- **Dark-first, cinematic.** Near-black surfaces, poster art as the colour.
- **Typography does the hierarchy.** Anton display for headlines and numbers,
  a clean sans for reading, mono kickers for labels ("ADMIT ONE", "NO. 0042").
- **Cinema artefacts as structure, not decoration.** Ticket stubs with dashed
  tears, programme sheets, letterboards, film strips, spines on a shelf.
- **One accent colour, used for meaning** (primary action, active state), and
  members choose their own.
- **Motion only where it explains**: a stub tearing, a card flipping, a shelf
  sliding in. Reduced-motion respected.

---

## 11. Before vs now (15 Oct build → 24 Oct 2026)

Captured side by side from the 15 October build (commit `760b8f3`) and the
current working tree, on the same seeded demo account.

| Area | 15 October | Now |
| --- | --- | --- |
| Navigation | Flat menu (Search, For You, Swipe, Watchlists, Favorites) | Search pinned on top; Discover and My Profile groups; the Tonight ticket; region switcher |
| Search | Query, filters and a poster grid | Discover: a top-result card with where to watch, Quick view and Seen it; a People row; labelled sections |
| Title page | Poster, logo-only availability box, cast, details table | Backdrop hero; named services with Change region; Seen date; a "You" panel with your lists and Notify me when; media, crew, ratings and reviews, "If you liked…" |
| TV pages | Season poster grid | Season list with air dates, episode counts and synopses; new-season alerts |
| For You | "Tonight's Briefing": a hero pick and recommendation rows | A vertical trailer reel; the briefing became Tonight's Programme |
| Tonight's Programme | — | Feature, two Supports, Wildcard; Continue strip; length and mood; per-slot Swap |
| Swipe | Five buttons, Undo | Pass / Like / Favorite; the Reel strip with Rewind; How it works guide; editable history |
| Watchlists | Three cards with thumbnails | Stats header; fanned covers with progress and hours watched; List view |
| Favorites | Filter chips and a grid | Shelves as spines, Sort session, stats, search, Select mode |
| Profile | Banner header, eight tabs, taste chips | Member card with taste stamps; four tabs; Feature presentation, Programmes, By the numbers; Preview as visitor; story image |
| Watched | Poster grid | Ticket log by month, numbered stubs, Log a past watch |
| Reviews | Two-column cards, whole stars | One column, half stars, count and average |
| Likes | — | A profile tab of Swipe, For You and onboarding likes, private by default |
| Notifications | One mixed list | For you / Following tabs; title alerts; reviews show stars; the bell counts only For you |
| Settings | Separate sub-pages | One page by question, with a live What visitors see preview |
| Sign up | Email, username, first and last name, password | Pick 3 titles first, then three fields; a live Admit One ticket; a resumable first night |
| Sign in | Centered card | Late Show box office |
| Quick View, New & Coming Soon, What's new | — | New |
| Phone | Squeezed profile header, scrolling tabs | Profile, title page and reel reflow cleanly |
