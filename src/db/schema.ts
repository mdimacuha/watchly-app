import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  pgEnum,
  primaryKey,
} from 'drizzle-orm/pg-core';

/**
 * User-related tables
 * - users: main user table
 * - userSessions: session tokens
 * - userVerificationCodes: verification codes
 */

export const regionSourceEnum = pgEnum('region_source', [
  'manual',
  'ip',
  'unknown',
]);

export const privacyEnum = pgEnum('privacy_level', [
  'public',
  'followers_only',
  'private',
]);

export const followRequestStatusEnum = pgEnum('follow_request_status', [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
]);

export const favoriteTypeEnum = pgEnum('favorite_type', [
  'movie',
  'tv',
  'collection',
  'artist',
]);

export const watchlistMediaTypeEnum = pgEnum('watchlist_media_type', [
  'movie',
  'tv',
]);

export const watchlistItemStatusEnum = pgEnum('watchlist_item_status', [
  'just_added',
  'up_next',
  'watching',
  'waiting_for_episode',
  'waiting_for_season',
  'paused',
  'finished',
  'rewatch',
  'dropped',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'follow_request',
  'follow_accepted',
  'follow_back',
  'follow_activity',
]);

// Distinguishes one-shot token purposes stored in user_verification_codes.
// Same table covers all three flows so we have one source of truth for
// token lifecycle + expiry semantics.
export const tokenPurposeEnum = pgEnum('token_purpose', [
  'email_verification',
  'password_reset',
  'account_restore',
]);

// Personal access tokens — used by external clients hitting /api/v1/*
// with Authorization: Bearer <token>. We store SHA-256 hashes only;
// raw tokens are surfaced once at creation time.
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** User-facing label like "iOS app" or "Personal script". */
    name: text('name').notNull(),

    /** SHA-256 of the raw token. Lookup happens by hash. */
    tokenHash: text('token_hash').notNull().unique(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Bumped on each successful auth — for activity tracking + cleanup. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('api_tokens_user_id_idx').on(t.userId),
  })
);

// "I've watched this" — set out of band from watchlists. Hybrid model:
// when the item is in any of the user's watchlists, updateItemStatus
// sets status='finished' and skips this table. When the user marks
// something watched that isn't in a list, we record it here.
export const watchedTitles = pgTable(
  'watched_titles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaType: watchlistMediaTypeEnum('media_type').notNull(),
    mediaId: text('media_id').notNull(),
    watchedAt: timestamp('watched_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (w) => ({
    pk: primaryKey({ columns: [w.userId, w.mediaType, w.mediaId] }),
    userIdx: index('watched_titles_user_idx').on(w.userId),
  })
);

export const activityTypeEnum = pgEnum('activity_type', [
  'favorite',
  'watchlist_create',
  'watchlist_add',
  'watchlist_bulk_add',
  'region_update',
  'follow',
  'review',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    email: text('email').notNull(),
    username: text('username').notNull(),

    passwordDigest: text('password_digest').notNull(),
    salt: text('salt').notNull(),

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    avatarUrl: text('avatar_url').notNull().default(''),

    isVerified: boolean('is_verified').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    isSuspended: boolean('is_suspended').notNull().default(false),
    isLocked: boolean('is_locked').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    // Set when the user requests account deletion. A scheduled job hard-
    // deletes after the grace window (see NEXT-STEPS).
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (u) => ({
    emailUq: uniqueIndex('users_email_uq').on(u.email),
    usernameUq: uniqueIndex('users_username_uq').on(u.username),
    // Live-user lookups (public profile by username, follow suggestions)
    // always filter `is_deleted = false`; a partial index keeps the
    // active set hot and avoids scanning soft-deleted rows.
    usernameLiveIdx: index('users_username_live_idx')
      .on(u.username)
      .where(sql`${u.isDeleted} = false`),
  })
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    sessionToken: text('session_token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (s) => ({
    tokenUq: uniqueIndex('user_sessions_session_token_uq').on(s.sessionToken),
    userIdx: index('user_sessions_user_id_idx').on(s.userId),
  })
);

export const userVerificationCodes = pgTable(
  'user_verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // SHA-256 hash of the raw token. Never store raw tokens at rest — a
    // stolen row should not be usable to forge a magic link.
    code: text('code').notNull(),

    // Distinguishes which flow this token belongs to (email verification
    // vs password reset vs account restore). Same lookup table, separate
    // semantics. Backfilled to 'email_verification' for existing rows.
    purpose: tokenPurposeEnum('purpose')
      .notNull()
      .default('email_verification'),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (c) => ({
    userIdx: index('user_verification_codes_user_id_idx').on(c.userId),
    userExpiresIdx: index('user_verification_codes_user_expires_idx').on(
      c.userId,
      c.expiresAt
    ),
    purposeIdx: index('user_verification_codes_purpose_idx').on(c.purpose),
  })
);

export const userPreferences = pgTable(
  'user_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // ISO 3166-1 alpha-2, ex: PH, US
    regionCode: text('region_code').notNull().default('PH'),
    regionSource: regionSourceEnum('region_source')
      .notNull()
      .default('unknown'),

    // onboarding
    onboardingCompleted: boolean('onboarding_completed')
      .notNull()
      .default(false),
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      withTimezone: true,
    }),

    // privacy
    profileVisibility: privacyEnum('profile_visibility')
      .notNull()
      .default('public'),
    watchlistsVisibility: privacyEnum('watchlists_visibility')
      .notNull()
      .default('public'),
    hideFavorites: boolean('hide_favorites').notNull().default(false),
    // Watched titles are more intimate than favorites/watchlists — default
    // to hidden on the public profile. Owner always sees their own list.
    hideWatched: boolean('hide_watched').notNull().default(true),

    // appearance — null = follow system / unchosen. Plain text so the value
    // space can grow (e.g. a future 'auto-dim-after-9pm') without a migration.
    theme: text('theme'),

    // Per-channel notification opt-in/out. jsonb so the value space can
    // grow without a migration each time we add an event kind. Missing
    // keys default to true (opted-in) at read time.
    notificationSettings: jsonb('notification_settings'),

    // Subset of TMDB provider IDs the user wants For You rows scoped to.
    // Null/empty = "any provider in my region". jsonb array of integers
    // so the membership check stays cheap at SQL level if we move it
    // server-side later.
    selectedProviders: jsonb('selected_providers'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (p) => ({
    userUq: uniqueIndex('user_preferences_user_id_uq').on(p.userId),
    regionIdx: index('user_preferences_region_code_idx').on(p.regionCode),
  })
);

export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    displayName: text('display_name').notNull().default(''),
    bio: text('bio').notNull().default(''),
    avatarUrl: text('avatar_url').notNull().default(''),

    // Accent palette slug (see src/constants/accentColors.ts). Null = the
    // default Watchly primary. Kept as plain text rather than an enum so the
    // value space can later grow to include computed values like
    // 'auto_from_favorites' without a migration.
    accentColor: text('accent_color'),

    // Profile banner toggle. When true (default), /me and /user/[username]
    // render a blurred-collage banner derived from the user's top favorite
    // posters. Users can switch back to the plain accent strip from
    // /settings/appearance.
    bannerEnabled: boolean('banner_enabled').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (p) => ({
    userUq: uniqueIndex('user_profiles_user_id_uq').on(p.userId),
  })
);

// NOTE: disallow followerId === followingId (enforced at the service layer)
export const userFollows = pgTable(
  'user_follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    followingId: uuid('following_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Hybrid approval: public profiles auto-accept (status='accepted'),
    // followers_only / private profiles start as 'pending' until the target
    // user accepts. 'rejected' / 'cancelled' rows are retained briefly for
    // audit and then cleaned up by a future janitor job.
    status: followRequestStatusEnum('status').notNull().default('accepted'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (f) => ({
    pk: primaryKey({ columns: [f.followerId, f.followingId] }),
    followerIdx: index('user_follows_follower_id_idx').on(f.followerId),
    followingIdx: index('user_follows_following_id_idx').on(f.followingId),
    statusIdx: index('user_follows_status_idx').on(f.status),
    // Follower/following counts and lists always pair the id with
    // status='accepted'; composite indexes serve the predicate without a
    // post-filter on every matched row.
    followingStatusIdx: index('user_follows_following_status_idx').on(
      f.followingId,
      f.status,
    ),
    followerStatusIdx: index('user_follows_follower_status_idx').on(
      f.followerId,
      f.status,
    ),
  })
);

// User blocks. Composite PK (blocker, blocked) means at most one block
// row exists per pair. We hide blocked users from search results, follow
// suggestions, and any social UI surface server-side.
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (b) => ({
    pk: primaryKey({ columns: [b.blockerId, b.blockedId] }),
    blockerIdx: index('user_blocks_blocker_id_idx').on(b.blockerId),
    blockedIdx: index('user_blocks_blocked_id_idx').on(b.blockedId),
  })
);

export const userFavorites = pgTable(
  'user_favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    favoriteId: text('favorite_id').notNull(),
    favoriteType: favoriteTypeEnum('favorite_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (f) => ({
    userIdx: index('user_favorites_user_id_idx').on(f.userId),
    // Favorites are almost always read as "this user's, newest first"
    // (favorites page, For You seeds/exclude, profile banner). The plain
    // user_id index can't cover the createdAt sort.
    userCreatedIdx: index('user_favorites_user_created_idx').on(
      f.userId,
      f.createdAt,
    ),
    uniqueFavorite: uniqueIndex('user_favorites_unique_idx').on(f.userId, f.favoriteId, f.favoriteType),
  })
);

export const watchlists = pgTable(
  'watchlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isPublic: boolean('is_public').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (w) => ({
    userIdx: index('watchlists_user_id_idx').on(w.userId),
  })
);

export const watchlistItems = pgTable(
  'watchlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    watchlistId: uuid('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),

    mediaType: watchlistMediaTypeEnum('media_type').notNull(),
    mediaId: text('media_id').notNull(),

    status: watchlistItemStatusEnum('status').notNull().default('just_added'),
    // Set when status first transitions into watching/rewatch; not cleared on
    // pause/finish so "started X ago" stays stable across status changes.
    startedAt: timestamp('started_at', { withTimezone: true }),
    // Set on transition into finished; cleared on transition out of finished.
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    notes: text('notes'),

    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (i) => ({
    watchlistIdx: index('watchlist_items_watchlist_id_idx').on(i.watchlistId),
    // `status` is filtered post-join across Up Next / watched sets /
    // mark-watched; `created_at` orders items within a list. The plain
    // watchlist_id index covers neither.
    watchlistStatusIdx: index('watchlist_items_watchlist_status_idx').on(
      i.watchlistId,
      i.status,
    ),
    watchlistCreatedIdx: index('watchlist_items_watchlist_created_idx').on(
      i.watchlistId,
      i.createdAt,
    ),
    uniqueItem: uniqueIndex('watchlist_items_unique_idx').on(
      i.watchlistId,
      i.mediaType,
      i.mediaId,
    ),
  })
);

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Feed owner — who sees this activity in their feed.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Who did the action. Null = system event (e.g. region_update).
    // For v1 (no social) actor always equals userId for action events.
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    type: activityTypeEnum('type').notNull(),

    // Denormalized event-specific data (watchlistId/name, mediaId/type,
    // count, regionName, etc.). Schema validated at write time.
    payload: jsonb('payload').notNull().default({}),

    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (a) => ({
    feedIdx: index('activities_user_created_idx').on(a.userId, a.createdAt),
    // Unread-count badge polls `user_id AND read_at IS NULL` frequently;
    // a partial index keeps only the unread rows.
    unreadIdx: index('activities_user_unread_idx')
      .on(a.userId)
      .where(sql`${a.readAt} IS NULL`),
  })
);

// Incoming notifications addressed TO a user. Distinct from `activities`
// (which is the user's own outgoing event log). One row per notification;
// fan-out happens at write time.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Recipient — whose bell this lights up.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Who triggered the notification. Null for system notifications.
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    type: notificationTypeEnum('type').notNull(),

    // Type-specific data: e.g. follow_activity payload includes the
    // actor's activity { kind, mediaId, mediaType, watchlistId, ... }.
    payload: jsonb('payload').notNull().default({}),

    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (n) => ({
    inboxIdx: index('notifications_user_created_idx').on(n.userId, n.createdAt),
    // Unread bell badge polls `user_id AND read_at IS NULL` frequently;
    // a partial index keeps only the unread rows.
    unreadIdx: index('notifications_user_unread_idx')
      .on(n.userId)
      .where(sql`${n.readAt} IS NULL`),
  })
);

// ---------------------------------------------------------------------------
// Swipe Discovery ("WatchlySwipe")
// ---------------------------------------------------------------------------

// Per-(user, title) record of an explicit discovery action. Liked is a
// lightweight taste signal (NOT a favorite — keeps Favorites clean).
// Saved fires the existing addFavorite flow on write. Passed is a
// negative signal that feeds For You's passed-genre penalty. Opened
// is a curiosity signal.
//
// titleId/titleType mirror userFavorites.favoriteId/favoriteType so the
// same key shape can be reused across both tables when computing
// exclude-sets and seeds for the For You + swipe pipelines.
export const titleSwipes = pgTable(
  'title_swipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // String, not numeric — matches userFavorites.favoriteId for easy
    // cross-table joins on the same composite key.
    titleId: text('title_id').notNull(),
    // 'movie' | 'tv'. Text (not the watchlistMediaTypeEnum) so the value
    // set stays flexible for future TMDB types without a migration.
    titleType: text('title_type').notNull(),

    // 'liked' | 'passed' | 'saved' | 'opened'. Validated at the service
    // boundary; using text keeps the value space open without a migration
    // if/when we add e.g. 'snoozed'.
    action: text('action').notNull(),

    // 'swipe_discovery' | 'onboarding' | 'recommendation' | 'manual'.
    // Helps split analytics later — defaults to the swipe deck.
    source: text('source').notNull().default('swipe_discovery'),

    // Snapshot of the recommendation score the title was shown with.
    // Useful for offline scoring-formula tuning. Numeric since the For
    // You score is a real number with decimal precision.
    scoreSnapshot: numeric('score_snapshot'),

    // Debug context — what row the title came from, what TMDB endpoint
    // surfaced it, etc. Jsonb so we can shape this freely later.
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (s) => ({
    userIdx: index('title_swipes_user_id_idx').on(s.userId),
    userActionIdx: index('title_swipes_user_action_idx').on(s.userId, s.action),
    userTypeIdx: index('title_swipes_user_title_type_idx').on(
      s.userId,
      s.titleType,
    ),
    titleIdx: index('title_swipes_title_idx').on(s.titleId, s.titleType),
    uniqueUserTitleSwipe: uniqueIndex('title_swipes_user_title_unique_idx').on(
      s.userId,
      s.titleId,
      s.titleType,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Title reviews (rating + optional written review)
// ---------------------------------------------------------------------------

// One review per (user, title). Editing is an UPDATE of the same row (enforced
// by the unique index) so a user can't stack duplicate reviews on a title.
export const userReviews = pgTable(
  'user_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // String id + text type, matching titleSwipes/userFavorites so the same
    // composite key joins cleanly across taste-signal tables.
    titleId: text('title_id').notNull(),
    titleType: text('title_type').notNull(), // 'movie' | 'tv'

    // 1–5 star rating (validated at the service boundary).
    rating: integer('rating').notNull(),
    // Optional written review; null when the user left a rating only.
    body: text('body'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (r) => ({
    // Fetch all reviews for a title (aggregate rating / count).
    titleIdx: index('user_reviews_title_idx').on(r.titleId, r.titleType),
    userIdx: index('user_reviews_user_idx').on(r.userId),
    uniqueUserTitleReview: uniqueIndex('user_reviews_user_title_unique_idx').on(
      r.userId,
      r.titleId,
      r.titleType,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Watchlist upvotes
// ---------------------------------------------------------------------------

// One vote per (watchlist, user); composite PK enforces no duplicate votes.
// Un-upvoting deletes the row. Count is a COUNT(*) over watchlist_id.
export const watchlistVotes = pgTable(
  'watchlist_votes',
  {
    watchlistId: uuid('watchlist_id')
      .notNull()
      .references(() => watchlists.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (v) => ({
    pk: primaryKey({ columns: [v.watchlistId, v.userId] }),
    watchlistIdx: index('watchlist_votes_watchlist_idx').on(v.watchlistId),
  }),
);

// ---------------------------------------------------------------------------
// Maintenance windows
// ---------------------------------------------------------------------------

// Append-only log of every maintenance window. The CURRENT state is
// derived from whichever row has `endedAt IS NULL` — that row is the
// active maintenance. Toggling off sets endedAt; toggling on inserts
// a new row. Keeps a full audit trail of when the app was down and
// why, without separate "state" + "history" tables.
//
// One open window at a time is enforced by the service layer (closing
// any existing open window before inserting a new one). The partial
// unique index below also enforces it at the DB level — a defence in
// depth so a misbehaving caller can't leave two rows open.
export const maintenanceWindows = pgTable(
  'maintenance_windows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Operator-facing copy shown on the maintenance screen. */
    reason: text('reason').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Null = window still open = maintenance is active. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /**
     * Who toggled maintenance on, when known. Nullable so background
     * jobs or scripts (e.g. a deploy hook) can also write here.
     */
    triggeredBy: uuid('triggered_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (m) => ({
    // Order matters here for the "is maintenance currently on" query —
    // most recent open window wins. createdAt is duplicated on purpose
    // (id is uuid, not orderable).
    openIdx: index('maintenance_open_idx').on(m.endedAt, m.startedAt),
    // Hard guard against multiple concurrent open windows. Postgres
    // partial unique index = unique only over rows matching the WHERE
    // clause. Drizzle supports it via `.where()` on a unique index.
    onlyOneOpen: uniqueIndex('maintenance_only_one_open_idx')
      .on(m.endedAt)
      .where(sql`${m.endedAt} IS NULL`),
  }),
);