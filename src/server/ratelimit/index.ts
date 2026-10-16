import 'server-only';

import { logger } from '@/lib/log';

/**
 * In-memory fixed-window rate limiter.
 *
 * Picked over sliding-window for two reasons:
 *   1. Single-instance Map storage. Sliding-window-counter would need
 *      per-key timestamp arrays; the bookkeeping costs more memory and
 *      the start-of-window burstiness is acceptable for our scale.
 *   2. Easy migration to Redis later — every public method maps 1:1 to
 *      `@upstash/ratelimit`'s API.
 *
 * **Caveat:** this state lives in the Node process. Across multiple
 * serverless instances each container has its own counter, so the
 * effective limit is `count × instanceCount`. Fine for our current
 * traffic; trip-wire for migration is "multiple warm prod instances
 * routinely active".
 *
 * Memory bound: `MAX_ENTRIES` evicts the oldest entry once the Map
 * grows past the cap. Combined with the lazy expired-entry sweep on
 * every `limit()` call this keeps growth O(active distinct keys).
 */

interface BucketConfig {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed per window. */
  count: number;
  /** Human label for log lines. */
  label: string;
}

interface Entry {
  count: number;
  /** Epoch ms when the window expires and the count resets. */
  resetAt: number;
}

export interface RateLimitResult {
  /** True when the request is allowed (counter has room in the window). */
  success: boolean;
  /**
   * Seconds the caller should wait before retrying. Always > 0 when
   * `success === false`. Zero when `success === true` (no wait needed).
   */
  retryAfter: number;
  /** Requests remaining in the current window after this hit. */
  remaining: number;
}

const MAX_ENTRIES = 50_000;
/** How many entries we visit per call when sweeping for expirations. */
const PRUNE_SAMPLE_SIZE = 16;

class FixedWindowLimiter {
  private readonly buckets = new Map<string, Entry>();

  constructor(private readonly config: BucketConfig) {}

  limit(key: string): RateLimitResult {
    const now = Date.now();
    this.pruneSample(now);

    const entry = this.buckets.get(key);

    // First request OR window has expired — start a fresh window.
    if (!entry || entry.resetAt <= now) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + this.config.windowMs,
      });
      if (this.buckets.size > MAX_ENTRIES) this.evictOldest();
      return {
        success: true,
        retryAfter: 0,
        remaining: this.config.count - 1,
      };
    }

    // In-window: increment if there's room.
    if (entry.count < this.config.count) {
      entry.count++;
      return {
        success: true,
        retryAfter: 0,
        remaining: this.config.count - entry.count,
      };
    }

    // Over the cap. Tell the caller how long to wait.
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { success: false, retryAfter, remaining: 0 };
  }

  /**
   * Visit a sample of entries and delete expired ones. Cheap O(1)
   * amortised cleanup — no background timer needed.
   */
  private pruneSample(now: number): void {
    let walked = 0;
    for (const [k, v] of this.buckets) {
      if (v.resetAt <= now) this.buckets.delete(k);
      if (++walked >= PRUNE_SAMPLE_SIZE) break;
    }
  }

  /** Map iterates in insertion order — first entry is the oldest. */
  private evictOldest(): void {
    const first = this.buckets.keys().next().value;
    if (first !== undefined) this.buckets.delete(first);
  }

  get label(): string {
    return this.config.label;
  }
}

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

const sec = (n: number) => n * 1000;
const min = (n: number) => n * 60 * 1000;
const hour = (n: number) => n * 60 * 60 * 1000;

function createLimiter(config: BucketConfig): FixedWindowLimiter {
  return new FixedWindowLimiter(config);
}

// ---------------------------------------------------------------------------
// Bucket registry
// ---------------------------------------------------------------------------

/**
 * Named limiter instances used across the app. Importing this module
 * costs nothing — each FixedWindowLimiter is a 2-field object with an
 * empty Map until first hit. Keep this list in sync with the route
 * usage table in NEXT-STEPS.md.
 */
export const limiters = {
  authSigninByIp: createLimiter({
    windowMs: min(5),
    count: 10,
    label: 'auth-signin',
  }),
  authSignupByIp: createLimiter({
    windowMs: hour(1),
    count: 5,
    label: 'auth-signup',
  }),
  forgotPasswordByIp: createLimiter({
    windowMs: min(15),
    count: 5,
    label: 'forgot-password-ip',
  }),
  forgotPasswordByEmail: createLimiter({
    windowMs: min(15),
    count: 2,
    label: 'forgot-password-email',
  }),
  verifyEmailResendByIp: createLimiter({
    windowMs: min(15),
    count: 5,
    label: 'verify-email-resend',
  }),
  verifyEmailByIp: createLimiter({
    windowMs: min(15),
    count: 20,
    label: 'verify-email',
  }),
  resetPasswordByIp: createLimiter({
    windowMs: min(15),
    count: 10,
    label: 'reset-password',
  }),
  restoreAccountByIp: createLimiter({
    windowMs: hour(1),
    count: 5,
    label: 'restore-account',
  }),
  tmdbSearch: createLimiter({
    windowMs: min(1),
    count: 30,
    label: 'tmdb-search',
  }),
  // Search analytics beacons — a few per search (performed, opened, …),
  // batched client-side. Generous, but bounded since guests can write.
  searchEvents: createLimiter({
    windowMs: min(1),
    count: 120,
    label: 'search-events',
  }),
  // Search end-cap ("Picked for you instead") — one For You seed pass +
  // up to 24 detail fetches, requested once per settled dead-end search.
  // Own bucket so it never eats into the per-keystroke search budget.
  searchEndCap: createLimiter({
    windowMs: min(1),
    count: 20,
    label: 'search-end-cap',
  }),
  // Swipe deck — fans out to TMDB recommendations + similar + enrich
  // per candidate, so cap it the same way as the search bucket.
  swipeDeck: createLimiter({
    windowMs: min(1),
    count: 30,
    label: 'swipe-deck',
  }),
  // Record-swipe — per-user, tight ceiling since each tap is one row.
  // 120/min/user lets enthusiasm-swipers go fast (~2/sec) while still
  // catching scripted abuse.
  swipeRecord: createLimiter({
    windowMs: min(1),
    count: 120,
    label: 'swipe-record',
  }),
  // Live username-availability check fired while the user types on
  // /signup. Tight bucket (30/min/IP) since each hit is cheap (one
  // indexed lookup) — enough headroom for debounced typing including
  // typos, while still catching enumeration-style probing.
  authCheckUsername: createLimiter({
    windowMs: min(1),
    count: 30,
    label: 'auth-check-username',
  }),
} as const;

export type LimiterName = keyof typeof limiters;

/**
 * Convenience: run one or more buckets in sequence; return the first
 * failure (so a composite IP-+-email check surfaces whichever bucket
 * tripped). All buckets get a hit on the success path so each window
 * is tracked correctly.
 */
export interface MultiHit {
  limiter: FixedWindowLimiter;
  key: string;
}

export function applyLimits(hits: MultiHit[]): RateLimitResult & {
  triggeredBy?: string;
} {
  let worstRetry = 0;
  let triggered: string | undefined;
  let success = true;
  let remaining = Infinity;

  for (const { limiter, key } of hits) {
    const r = limiter.limit(key);
    if (!r.success && success) {
      success = false;
      worstRetry = r.retryAfter;
      triggered = limiter.label;
    } else if (!r.success && r.retryAfter > worstRetry) {
      worstRetry = r.retryAfter;
      triggered = limiter.label;
    }
    if (r.remaining < remaining) remaining = r.remaining;
  }

  if (!success) {
    logger.warn('[ratelimit] hit', {
      limiter: triggered,
      retryAfter: worstRetry,
    });
  }

  return {
    success,
    retryAfter: success ? 0 : worstRetry,
    remaining: Number.isFinite(remaining) ? remaining : 0,
    triggeredBy: triggered,
  };
}

// Exported for tests + the rare hand-rolled call site.
export { FixedWindowLimiter, sec, min, hour };
