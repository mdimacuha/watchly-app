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
 * pipeline. Substring-matches the racial-offensive set within each word
 * (normalised, so "n!gg3r" and "x_slur_x" still hit), never across words:
 * stripping every space joined the end of one ordinary word to the start of
 * the next and blocked innocent prose. Runs of 1–2 character fragments are
 * re-joined first, so spaced-out spellings ("s l u r", "s.l u.r") are still
 * caught.
 */
export function containsRacialOffensiveTerm(input: string): boolean {
  const words = input
    .split(/\s+/)
    .map(normalizeModerationText)
    .filter((w) => w.length > 0);
  if (words.length === 0) return false;

  const candidates: string[] = [];
  let run = '';
  for (const w of words) {
    if (w.length <= 2) {
      run += w;
      continue;
    }
    if (run) candidates.push(run);
    run = '';
    candidates.push(w);
  }
  if (run) candidates.push(run);

  for (const c of candidates) {
    for (const term of RACIAL_OFFENSIVE_TERMS) {
      if (c.includes(term)) return true;
    }
  }
  return false;
}
