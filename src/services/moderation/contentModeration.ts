import 'server-only';

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';
import { normalizeModerationText } from './normalizeModerationText';
import { RACIAL_OFFENSIVE_TERMS } from './racialOffensiveTerms';

// Single shared matcher — obscenity's RegExpMatcher is stateless after
// construction. Built once at module load.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export type ModerationReason =
  | 'empty'
  | 'too_short'
  | 'too_long'
  | 'racial_offensive'
  | 'profanity';

export interface ModerationResult {
  allowed: boolean;
  /** Internal classification — log this, never show it externally. */
  reason?: ModerationReason;
  /** User-facing copy. Intentionally generic for offensive matches. */
  message?: string;
}

export interface ModerateTextOptions {
  minLength?: number;
  maxLength?: number;
  /** When true, an empty string passes (e.g. an optional bio). */
  allowEmpty?: boolean;
}

/**
 * Runs a piece of user input through length + profanity + slur
 * filters. Returns a structured result the caller can branch on.
 *
 * Order matters:
 *   1. emptiness (so explicit "required" message reaches the user)
 *   2. length (same reason)
 *   3. racial_offensive (highest-priority block)
 *   4. profanity
 *
 * External messages are generic for offensive matches — never name
 * the matched term. Internal `reason` is specific for logging.
 */
export function moderateText(
  input: string,
  options: ModerateTextOptions = {},
): ModerationResult {
  const value = input.trim();

  if (value.length === 0) {
    if (options.allowEmpty) return { allowed: true };
    return {
      allowed: false,
      reason: 'empty',
      message: 'This field is required.',
    };
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    return {
      allowed: false,
      reason: 'too_short',
      message: `Must be at least ${options.minLength} characters.`,
    };
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    return {
      allowed: false,
      reason: 'too_long',
      message: `Must be at most ${options.maxLength} characters.`,
    };
  }

  if (containsRacialOffensiveTerm(value)) {
    return {
      allowed: false,
      reason: 'racial_offensive',
      message: 'This content is not allowed.',
    };
  }

  if (matcher.hasMatch(value)) {
    return {
      allowed: false,
      reason: 'profanity',
      message: 'This content is not allowed.',
    };
  }

  return { allowed: true };
}

/**
 * Pure-data helper exported for unit testability + the username
 * pipeline. Normalises the input and substring-matches against the
 * racial-offensive set. Returns true at the first match.
 */
export function containsRacialOffensiveTerm(input: string): boolean {
  const normalized = normalizeModerationText(input);
  if (normalized.length === 0) return false;
  for (const term of RACIAL_OFFENSIVE_TERMS) {
    if (normalized.includes(term)) return true;
  }
  return false;
}
