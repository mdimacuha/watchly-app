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
  real,
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
  // Title alerts (system notifications, no actor).
  'title_available',
  'title_leaving',
  'title_new_season',
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
    // Browser user-agent at sign-in, for the sessions list in Settings
    // ("Chrome on Windows"). Null for sessions created before it was recorded.
    userAgent: text('user_agent'),

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
    // Settings → Appearance.
    bannerEnabled: boolean('banner_enabled').notNull().default(true),

    // Profile card highlight slot (see src/constants/cardFeature.ts). Null
    // mode = 'now_showing' (the default). Plain text like accentColor so new
    // modes / label presets need no migration; validated on read + write.
    cardFeatureMode: text('card_feature_mode'),
    // 'custom' mode only: the chosen favorite and its label preset.
    cardFeatureMediaType: text('card_feature_media_type'),
    cardFeatureMediaId: text('card_feature_media_id'),
    cardFeatureLabel: text('card_feature_label'),

    // Feature presentation picks: up to 6 titles from the owner's favorites
    // and watchlists, in display order (first gets the crown). Empty = the
    // automatic ranking (favorites by the owner's own ratings).
    featuredTitles: jsonb('featured_titles')
      .$type<{ mediaType: 'movie' | 'tv'; mediaId: string }[]>()
      .notNull()
      .default([]),

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

// Shelves: user-named groups of favorites. A favorite can sit on many shelves
// (favorite_shelf_items is the join). Deleting a shelf removes its links, never
// the favorites; unfavoriting cascades the favorite off every shelf.
export const favoriteShelves = pgTable(
  'favorite_shelves',
  {
    // Client-generated (crypto.randomUUID) so the UI can open a new shelf
    // before the server round-trip; validated as a uuid at the service.
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Accent slug for the spine colour (validated against ACCENT_SLUGS); null = neutral.
    color: text('color'),
    // Shown on the owner's public profile. Private by default: shelf names
    // are often written for oneself. Applies even when favorites are hidden.
    isPublic: boolean('is_public').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (s) => ({
    userIdx: index('favorite_shelves_user_idx').on(s.userId, s.sortOrder),
    // One shelf per name per user, case-insensitively.
    uniqueName: uniqueIndex('favorite_shelves_user_name_unique_idx').on(s.userId, sql`lower(${s.name})`),
  }),
);

export const favoriteShelfItems = pgTable(
  'favorite_shelf_items',
  {
    shelfId: uuid('shelf_id')
      .notNull()
      .references(() => favoriteShelves.id, { onDelete: 'cascade' }),
    favoriteId: uuid('favorite_id')
      .notNull()
      .references(() => userFavorites.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (i) => ({
    pk: primaryKey({ columns: [i.shelfId, i.favoriteId] }),
    // "Which shelves is this favorite on" + the unfavorite cascade.
    favoriteIdx: index('favorite_shelf_items_favorite_idx').on(i.favoriteId),
  }),
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
    // Set when the curator first places the item in their ranking (drag).
    // Null = not ranked yet: shown pinned on top as "Recently Added" with no
    // rank number.
    rankedAt: timestamp('ranked_at', { withTimezone: true }),

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

// "Notify me when" alerts on a title, for one region. A daily cron compares
// the title's current streaming providers / latest season against the
// snapshot and notifies on changes. The snapshot is taken when the alert is
// created, so nothing fires for what's already true. No row = no alerts.
export const titleAlerts = pgTable(
  'title_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaType: watchlistMediaTypeEnum('media_type').notNull(),
    mediaId: text('media_id').notNull(),
    // ISO 3166-1 alpha-2 the alert watches (the user's region when set).
    region: text('region').notNull(),
    notifyStreaming: boolean('notify_streaming').notNull().default(false),
    notifyLeaving: boolean('notify_leaving').notNull().default(false),
    notifyNewSeason: boolean('notify_new_season').notNull().default(false),
    // Streaming (flatrate) provider names in `region` at the last check.
    lastProviders: jsonb('last_providers').$type<string[]>().notNull().default([]),
    // Highest aired season number at the last check (tv only).
    lastSeasonNumber: integer('last_season_number'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (a) => ({
    uniqueTitle: uniqueIndex('title_alerts_user_title_unique_idx').on(a.userId, a.mediaType, a.mediaId),
    // The cron walks alerts, oldest check first.
    checkIdx: index('title_alerts_checked_idx').on(a.lastCheckedAt),
  }),
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

/**
 * Append-only log of profile behaviour: who views profiles (self /
 * follower / stranger / guest, and from where — incl. share links via
 * ?ref), what they open, and whether they follow or share. The baseline for
 * judging the profile redesign (north star: visitor view → follow).
 * Guests can view profiles, so the viewer (user_id) is nullable. Never
 * updated; rows go with either account (cascade).
 */
export const profileEvents = pgTable(
  'profile_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The viewer (null for guests).
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    // Whose profile.
    profileUserId: uuid('profile_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    // 'profile_viewed' | 'section_opened' | 'title_opened' | 'follow' |
    // 'share'. Text so new kinds need no migration.
    event: text('event').notNull(),
    titleKey: text('title_key'),
    // viewer kind, source/ref, layout variant, section, position, …
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (e) => ({
    profileCreatedIdx: index('profile_events_profile_created_idx').on(e.profileUserId, e.createdAt),
    userCreatedIdx: index('profile_events_user_created_idx').on(e.userId, e.createdAt),
  }),
);

/**
 * Append-only log of For You behaviour — the baseline that tells whether a
 * redesign helps people decide: feed views, title opens (by layout slot),
 * spins, filter changes, dismissals, and commitments (marked watched / added
 * to a watchlist). Signed-in only, so user_id is required. Never updated.
 */
export const forYouEvents = pgTable(
  'for_you_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    // 'feed_viewed' | 'title_opened' | 'spin' | 'filter_changed' |
    // 'dismissed' | 'committed'. Text so new kinds need no migration.
    event: text('event').notNull(),
    // "movie:123" / "tv:456" when the event concerns a title.
    titleKey: text('title_key'),
    // Layout variant, slot, position, filters, reason, commit kind, …
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (e) => ({
    userCreatedIdx: index('for_you_events_user_created_idx').on(e.userId, e.createdAt),
    sessionIdx: index('for_you_events_session_idx').on(e.sessionId),
  }),
);

/**
 * Append-only log of search behaviour, for measuring whether search works:
 * zero-result and reformulation rates, which sections get opened (top
 * result / people / related theme / titles / end-cap / suggestions), and —
 * joined to favorites/watchlists by user + time — search→save conversion.
 * Guests can search, so user_id is nullable and `session_id` (an anonymous
 * per-tab id) ties a visit's events together. Never updated.
 */
export const searchEvents = pgTable(
  'search_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nullable for guests; a deleted account takes its events with it.
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    // 'search_performed' | 'result_opened' | 'keyword_chip_clicked' |
    // 'endcap_shown'. Text so new kinds need no migration.
    event: text('event').notNull(),
    query: text('query'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (e) => ({
    createdIdx: index('search_events_created_idx').on(e.createdAt),
    userCreatedIdx: index('search_events_user_created_idx').on(e.userId, e.createdAt),
    sessionIdx: index('search_events_session_idx').on(e.sessionId),
  }),
);

/**
 * Append-only log of every swipe interaction. `title_swipes` holds the
 * CURRENT decision per title (upserted, deleted on undo), which erases
 * history — "opened then liked" stores only "liked", and undos leave no
 * trace. This table keeps the sequence for measurement (open→decision
 * conversion, undo/regret rate, decisions by deck position). Never updated;
 * rows go away only with the user (cascade).
 */
export const titleSwipeEvents = pgTable(
  'title_swipe_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    titleId: text('title_id').notNull(),
    titleType: text('title_type').notNull(),
    // A swipe action ('liked' | 'passed' | 'saved' | 'opened') or 'undo'.
    // Text, like title_swipes.action, so new event kinds need no migration.
    event: text('event').notNull(),
    // Same values as title_swipes.source; 'manual' = changed from History.
    source: text('source').notNull().default('swipe_discovery'),
    scoreSnapshot: numeric('score_snapshot'),
    // Deck context from the client: sessionId, position, input, isWildcard,
    // reason.
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (e) => ({
    userCreatedIdx: index('title_swipe_events_user_created_idx').on(
      e.userId,
      e.createdAt,
    ),
    titleIdx: index('title_swipe_events_title_idx').on(e.titleId, e.titleType),
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

    // 0.5–5 star rating in half-star steps (validated at the service boundary).
    rating: real('rating').notNull(),
    // Optional written review; null when the user left a rating only.
    body: text('body'),
    // Author marked the written review as containing spoilers: readers see
    // it hidden until they choose to reveal it.
    isSpoiler: boolean('is_spoiler').notNull().default(false),

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