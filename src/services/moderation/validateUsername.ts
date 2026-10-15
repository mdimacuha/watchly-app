import { RESERVED_USERNAMES } from './reservedUsernames';
import { moderateText } from './contentModeration';

/**
 * Format rules (post-normalise):
 *   - 3-24 characters
 *   - lowercase letters, digits, dot, underscore
 *   - first + last character must be alphanumeric (no leading/trailing
 *     dot or underscore)
 *   - no consecutive dots or underscores
 *
 * Examples that pass: `marc`, `marc24`, `marc.dimacuha`, `marc_24`.
 * Examples that fail: `.marc`, `marc.`, `_marc`, `marc_`, `marc..dim`,
 * `marc__dim`, `Marc` (mixed case before normalise), `marc-dim`.
 *
 * Regex pieces:
 *   ^[a-z0-9]                       — first char alphanumeric
 *   (?!.*[._]{2})                   — no consecutive dots / underscores
 *   [a-z0-9._]{1,22}                — middle (1-22 chars from allowed set)
 *   [a-z0-9]$                       — last char alphanumeric
 */
const USERNAME_REGEX = /^[a-z0-9](?!.*[._]{2})[a-z0-9._]{1,22}[a-z0-9]$/;

const USERNAME_MIN = 3;
const USERNAME_MAX = 24;

export type UsernameValidationReason =
  | 'too_short'
  | 'too_long'
  | 'invalid_format'
  | 'reserved'
  | 'profanity'
  | 'racial_offensive';

export interface UsernameValidationResult {
  valid: boolean;
  /** Lowercased + trimmed username, present when valid is true. */
  normalizedUsername?: string;
  /** Specific internal reason for logging. */
  reason?: UsernameValidationReason;
  /** Safe user-facing message. */
  message?: string;
}

/**
 * Validates a username end-to-end. Does NOT check DB uniqueness — that
 * lives in the signup / check-username service layer where the DB
 * handle is in scope.
 */
export function validateUsername(username: string): UsernameValidationResult {
  const normalizedUsername = username.trim().toLowerCase();

  if (normalizedUsername.length < USERNAME_MIN) {
    return {
      valid: false,
      reason: 'too_short',
      message: `Username must be at least ${USERNAME_MIN} characters.`,
    };
  }

  if (normalizedUsername.length > USERNAME_MAX) {
    return {
      valid: false,
      reason: 'too_long',
      message: `Username must be at most ${USERNAME_MAX} characters.`,
    };
  }

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return {
      valid: false,
      reason: 'invalid_format',
      message:
        'Username can only use lowercase letters, numbers, dots, and underscores, and cannot start or end with a dot or underscore.',
    };
  }

  if (RESERVED_USERNAMES.has(normalizedUsername)) {
    // Spec: don't tell the user it's reserved. Same copy as taken /
    // moderation failure so the response leaks no extra signal.
    return {
      valid: false,
      reason: 'reserved',
      message: 'This username is not available.',
    };
  }

  // Length checks above already cover the bounds — pass them through
  // anyway so moderateText's own check doesn't bypass the username
  // bounds when called via this path.
  const moderation = moderateText(normalizedUsername, {
    minLength: USERNAME_MIN,
    maxLength: USERNAME_MAX,
  });

  if (!moderation.allowed) {
    const isOffense =
      moderation.reason === 'racial_offensive' ||
      moderation.reason === 'profanity';
    return {
      valid: false,
      // Preserve the specific internal reason for logging — but the
      // outward message stays generic for offensive content.
      reason: moderation.reason as UsernameValidationReason,
      message: isOffense ? 'This username is not allowed.' : moderation.message,
    };
  }

  return { valid: true, normalizedUsername };
}
