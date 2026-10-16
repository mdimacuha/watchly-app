---
name: changelog
description: Write Watchly's public release notes (changelogs/*.md, shown on /changelogs and in the sidebar announcement card). Use whenever the user says "create a changelog", "write the changelog", "release notes", "what's new", or is about to commit — every commit gets a changelog first.
---

# Changelog

Watchly ships a changelog with every commit. Each release is one Markdown
file in `changelogs/`, rendered publicly at `/changelogs`. Its optional
`## Promotional` section becomes the sidebar announcement card for every
signed-in user. Readers are Watchly's users, not developers.

## When to run

- The user asks for a changelog, release notes, or "what's new".
- The user is about to commit (or asks for commit commands). Write the
  changelog first, then hand over the commit commands. The changelog file
  goes in the same commit.

## Step 1 — Gather what changed

1. `git status` and `git diff --stat` (plus `git diff` on unclear files) to
   see everything that will be in the commit.
2. Read the conversation for intent: what the user asked for and why.
3. If `changelogs/` already has an **uncommitted** file
   (`git status changelogs/`), update that file instead of adding a second
   release.
4. Sort each change into: user-facing (include), dev-only (skip), or
   internal (skip). Skip:
   - prototypes, `?variant=` switchers, anything behind
     `NODE_ENV !== 'production'` or in `devOnlyRoutes`;
   - refactors, logging/event tables, migrations, lint, and tooling, unless
     users notice the result (e.g. "pages load faster").

## Step 2 — Write the file

Path: `changelogs/YYYY-MM-DD.md` (today's date). For a second release on
the same day, use `YYYY-MM-DD-2.md`. Files starting with `_` are ignored.

```markdown
---
title: <headline, 3–7 words, the release's story — not "Updates">
date: YYYY-MM-DD
summary: <one or two sentences naming the biggest wins>
---

## <Area of the app: Search, Quick View, Title pages, Watchlists, ...>

### <Feature or theme inside that area>
- <One change per bullet, as the user experiences it.>

## Promotional

Title: <≤60 chars>
Description: <≤140 chars>
CTA: <≤24 chars>
Link: </internal-path>
```

Structure rules:
- `##` is a page or area of the app, named as users know it (the sidebar
  labels, page titles). Order areas by impact, biggest first.
- `###` groups related changes inside an area. Skip it when an area has
  only one or two bullets.
- Bullets may use **bold** (UI labels like **Go to Page**), `code`
  sparingly, and `[links](/path)`. Nothing else renders.
- `## Promotional`, when present, is always last.

## Step 3 — Voice

Write as Watchly talking to its users:
- Lead with the benefit, then the how. Say "Search finds actors now", not
  "Added person results to the search service".
- Use plain words only. Never mention components, routes, APIs, tables,
  TMDB, caching, or file names.
- Use second person ("you", "your lists") and present tense.
- Name UI exactly as it appears ("Quick View", "Ranked", "Up Next").
- Fixes say what used to go wrong, without blame: "Cards no longer get
  stuck after a fast swipe."
- Make no claims you can't verify in the diff: no invented numbers, no
  "blazing fast".
- Keep each bullet to one sentence where possible, two at most.

## Step 4 — Promotional section

Add it when the release has one headline feature worth a nudge. It
replaces the current sidebar card (the newest release's promo always wins;
a release without one hides the card).
- Title: name the feature, e.g. "Introducing Watchly Swipe" or "Rank your
  watchlists".
- Description: one sentence on what the user gets.
- CTA: a verb phrase, e.g. "Try it now" or "Open your watchlists".
- Link: an internal path to where the feature lives (`/search`, `/swipe`).
  External URLs are rejected.
- The card's dismissal is keyed to the release, so users who closed the
  last promo still see the new one.

Also give the user the promo copy in chat, so they can reuse it
elsewhere (socials, email).

## Step 5 — Verify

1. `npx tsc --noEmit -p .` must pass. The parser
   (`src/services/changelog/parse.ts`) throws on bad frontmatter or a bad
   promo, which fails the build.
2. If the dev server is running, load `/changelogs` and check that the new
   release renders as the "Latest" entry.
3. Re-read the file as a user would: is anything confusing, internal, or
   untrue?

## Step 6 — Hand off the commit

Follow the git guardrails: never commit yourself. Give the user:

```bash
git add -A   # or the specific paths, including changelogs/<file>.md
git commit -m "<type>: <summary>" -m "<body>"
```

Draft the commit message from the changelog's title and areas.

## Output to the user

- Path of the changelog file and the release title.
- A short outline: areas, with the bullet count for each.
- The promo copy (Title / Description / CTA / Link), if any.
- Anything you deliberately left out (dev-only prototypes, internals), so
  the user can overrule you.
- The commit commands.
