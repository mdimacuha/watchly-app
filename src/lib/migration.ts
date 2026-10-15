/**
 * Domain-migration modal config.
 *
 * Watchly is served on two hostnames during the move to gowatchly:
 *  • watchly.dayonelabs.co  (OLD) → "nudge" variant that pushes users over
 *  • app.gowatchly.com      (NEW) → "welcome" variant that confirms the move
 *
 * The hostname picks the variant; persistence is intentionally per-domain
 * (cookies don't cross registrable domains). The nudge is session-scoped so
 * it re-appears on the old domain until the user actually moves; the welcome
 * sets a long-lived cookie so it only ever shows once.
 *
 * This module is client-safe — no server-only imports — so the modal can read
 * hostname/cookies directly in the browser.
 */

export const NEW_HOST = 'app.gowatchly.com';
export const OLD_HOST = 'watchly.dayonelabs.co';
export const NEW_ORIGIN = `https://${NEW_HOST}`;

export type MigrationVariant = 'welcome' | 'nudge';

// ---------------------------------------------------------------------------
// Variant resolution
// ---------------------------------------------------------------------------

/**
 * Decide which variant (if any) to show for a given hostname.
 *
 * `override` (e.g. `?migration=welcome`) is honored ONLY off the real
 * production hosts, so it works for local/preview testing but can never force
 * the wrong variant on watchly.dayonelabs.co / app.gowatchly.com.
 */
export function resolveVariant(
  hostname: string,
  override?: string | null,
): MigrationVariant | null {
  const isRealHost = hostname === NEW_HOST || hostname === OLD_HOST;

  if (!isRealHost && (override === 'welcome' || override === 'nudge')) {
    return override;
  }

  if (hostname === NEW_HOST) return 'welcome';
  if (hostname === OLD_HOST) return 'nudge';
  return null;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface MigrationCopy {
  heading: string;
  body: string;
  primaryCta: string;
  /** Only the nudge offers a "not now" — the welcome's only action is dismiss. */
  secondaryCta?: string;
}

export const MIGRATION_COPY: Record<MigrationVariant, MigrationCopy> = {
  nudge: {
    heading: "We've moved! 🎉",
    body: "We've migrated Watchly to app.gowatchly.com for a better experience.",
    primaryCta: 'Start using app.gowatchly.com',
    secondaryCta: 'Maybe later',
  },
  welcome: {
    heading: "You're all set! 🎉",
    body: 'Welcome to app.gowatchly.com — your new home for Watchly. Bookmark it so you always land right here.',
    primaryCta: "Let's go",
  },
};

// ---------------------------------------------------------------------------
// Persistence — welcome cookie (permanent) + nudge session flag (per-session)
// ---------------------------------------------------------------------------

// Non-httpOnly so the client can both read and write it. Set only on the NEW
// domain once the welcome has been acknowledged.
export const MIGRATED_COOKIE = 'watchly_isMigrated';
const MIGRATED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Session-scoped dismissal for the OLD-domain nudge — clears on a new browser
// session so the nudge returns on the next login until the user moves.
export const NUDGE_SESSION_KEY = 'watchly_migration_dismissed';

export function hasMigratedCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return new RegExp('(?:^|; )' + MIGRATED_COOKIE + '=1').test(document.cookie);
}

export function setMigratedCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${MIGRATED_COOKIE}=1;` +
    ` path=/; max-age=${MIGRATED_COOKIE_MAX_AGE}; samesite=lax`;
}

export function isNudgeDismissedThisSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(NUDGE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissNudgeForSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(NUDGE_SESSION_KEY, '1');
  } catch {
    // storage blocked (private mode / cookie policy) — nudge simply re-shows.
  }
}
