# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules & skills (progressive disclosure)

Before starting a task, read `rules/index.md` — it routes you to the smallest set of rule/skill files needed for the task type. Always-loaded: `rules/global.md`, `skills/global.md`. Other modules (`backend`, `database`, `frontend`, `project`) load on demand.

Conflict resolution (from `rules/index.md`): follow simplicity, follow the existing codebase, do not over-engineer.

## Commands

- `npm run dev` — start Next.js dev server (port 3000)
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (also warns on hardcoded hex colors in `className`)
- `npm run db:migrate:generate` — generate a new migration from `src/db/schema.ts` via drizzle-kit
- `npm run db:migrate` — apply pending migrations (runs `src/db/migrate.ts` via tsx, loads `.env` via `dotenv/config`)
- `npm run db:studio` — open Drizzle Studio (requires `.env`, not `.env.local`)

No test runner is configured.

## Stack

Next.js 16.1.1 (App Router, React 19, React Compiler enabled) · TypeScript (strict) · Postgres via `pg` + Drizzle ORM · Zod · Tailwind v4 · Zustand · framer-motion. Path alias: `@/* → src/*`.

Don't add libraries casually — `.cursorrules.md` requires justification.

## Architecture

### Layered request flow

The codebase enforces a strict layering: **route → service → db/integration**.

- `src/app/api/**/route.ts` — Route Handlers must be thin and contain only handler exports. Either `export { GET, POST } from "@/services/..."` or a body that delegates to a service inside `handleRoute()` from `@/lib/api`. No validation, no DB queries, no business logic here.
- `src/services/**` — Business logic. Each domain is a folder (`auth/`, `favorites/`, `profile/`, `tmdb/`, `geo/`, `preferences/`, `users/`, `activity/`) exposing its public API via `index.ts`. Services may touch the DB and integrations, but **must not** import HTTP primitives (`Request`, `Response`, `cookies`). Parse inputs with the service's own Zod validator (e.g. `src/services/auth/validators.ts`).
- `src/server/**` — Server-only helpers that *do* touch HTTP/Next concerns. `server/auth/session.ts` (`getSession`, `getSessionWithUser`), `server/auth/requireUser.ts` (redirects to `/signin` if no session), `server/tmdb/` (TMDB HTTP client + endpoint wrappers + mappers), `server/env/tmdb.ts` (TMDB-only env, server-only import).
- `src/lib/api.ts` — `handleRoute()`, `successResponse`, `errorResponse`, `toNextResponse`, `parsePaginationParams`, `statusFromError`, `apiErrorFromError`. The canonical entry point for converting service results/errors into HTTP responses.
- `src/utils/errors.ts` — `AppError` + subclasses (`ValidationAppError` → 400, `UnauthorizedAppError` → 401, `NotFoundAppError` → 404). Services throw these; `handleRoute` maps them to status codes and stable error codes.

### API response shape

Every API returns one of:
- Success: `{ success: true, data, message? }`
- Error: `{ success: false, error: string, message? }`
- Paginated: `{ success: true, data: T[], pagination: { page, limit, total, totalPages } }`

Note: this shape (`success` boolean, top-level `error` string) is what's actually implemented in `src/lib/api.ts` and `src/types/api.ts`. The `.cursorrules.md` document describes a slightly different `{ ok, data }` / `{ ok, error: { code, message } }` shape as the *target* — when in doubt, match the existing implementation in `src/lib/api.ts`, not the cursorrules doc.

### Authentication

Custom session-cookie auth (no NextAuth):
- Cookie name: `watchly_session` (httpOnly, sameSite=lax, secure in prod). Helpers in `src/utils/server/cookies.ts`.
- Session row in `user_sessions` table (token unique, 30-day TTL).
- Passwords: salted hash stored as `passwordDigest` + `salt` (`src/utils/server/crypto/password.ts`). Never store plaintext.
- `src/middleware.ts` gates routes by checking the cookie's *presence only* (not DB validity) against the route lists in `src/lib/routes.ts` — `authRoutes`, `authenticatedRoutes`, `authenticatedApiRoutes`, `devOnlyRoutes`. Pages redirect to `/signin`; API routes return 401 JSON. Full session validity is checked server-side via `getSession()` / `getSessionWithUser()`.
- When adding a new authed page or API path, add it to the appropriate list in `src/lib/routes.ts`.

### Database & migrations (critical, from .cursorrules.md)

- `src/db/schema.ts` is the **source of truth**. Generated migrations under `src/db/migrations/` are immutable — never edit or delete an applied migration. Fix mistakes with new forward migrations only. No down migrations.
- Workflow: edit schema → `npm run db:migrate:generate` → `npm run db:migrate`. Never use `drizzle-kit push`.
- Conventions: timezone-aware timestamps (`timestamp(..., { withTimezone: true })`), FKs `notNull()` by default, explicit `onDelete` on every relation (`cascade` for dependents, otherwise `restrict`), snake_case columns, camelCase Drizzle exports, plural table names.
- `src/db/index.ts` exports a singleton `db` from a `pg.Pool` using `env.DATABASE_URL`. Import via `@/db`.
- `src/env.ts` Zod-validates `DATABASE_URL` / `NODE_ENV` / `APP_ENV` and throws at module load (Edge-Runtime compatible — no `process.exit`).

### TMDB integration

- `src/server/tmdb/` is a server-only HTTP client. `tmdbFetch()` handles auth (`TMDB_API_READ_TOKEN` Bearer), default 1h revalidate, and throws `TmdbError`. Endpoint wrappers live in `server/tmdb/endpoints/` and re-export from `index.ts`.
- `src/services/tmdb/` wraps those endpoints with app-level mapping/aggregation (`title.ts`, `collection.ts`, `person.ts`, `search.ts`, `tvSeason.ts`, `tvEpisode.ts`). Use these from routes and components rather than calling `server/tmdb` directly.
- TMDB env is loaded separately in `src/server/env/tmdb.ts` to keep it out of edge/client bundles.

### App routes

- `src/app/(authed)/` — route group for signed-in pages (`activity`, `artist`, `collection`, `favorites`, `for-you`, `me`, `search`, `settings`, `title`, `tv`, `watchlists`).
- `src/app/(debug)/` and `src/app/(docs)/` — gated to development by middleware via `devOnlyRoutes`.
- `src/app/api/v1/**` — public-facing API (auth, collections, titles, tmdb, tv).
- `src/app/api/me/**` — session-protected API (returns 401 via middleware if no cookie).

## Styling conventions (docs/style-guide.md)

- Dark-mode-first, cinematic. Use semantic Tailwind tokens (`bg-background`, `bg-card`, `bg-secondary`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `border-border`) — **never hardcoded hex** in `className`. ESLint warns on this.
- Use semantic text classes (`.text-h1`/`h2`/`h3`, `.text-body-lg`, `.text-body-regular`, `.text-meta`) and the standard spacing scale — avoid arbitrary `p-[15px]`-style values.
- Component files: `kebab-case`. Component identifiers: `PascalCase`.

## Code style

- TypeScript strict; no `any` unless unavoidable; explicit types at boundaries.
- Validate every external input with Zod. Never trust client input.
- Use explicit `select` columns in Drizzle queries; avoid unbounded `select().from(table)`.
- Don't log secrets/tokens/passwords/verification codes. Don't leak stack traces to clients.
