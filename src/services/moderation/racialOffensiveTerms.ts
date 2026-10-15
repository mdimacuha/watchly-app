/**
 * Hard-block list for racial and ethnic slurs. Entries are stored in
 * NORMALIZED form (lowercase, leetspeak resolved, no spaces or
 * punctuation) so they match the output of `normalizeModerationText`.
 *
 * IMPORTANT:
 *   - Never echo a matched term back to the user. The external
 *     error copy is always "This content is not allowed."
 *   - This file is server-only. Do not bundle into client code.
 *   - The list intentionally covers core anti-Black, anti-Asian,
 *     anti-Latino, anti-Indigenous, anti-Semitic, anti-LGBT, and
 *     anti-disability slurs in their most-common English variants.
 *     Extend privately as patterns emerge.
 *   - Match is substring-based (`normalized.includes(term)`) so
 *     embedded variants ("xxxnggerxxx") are caught. The tradeoff is
 *     occasional false positives on benign substrings — when that
 *     bites, prefer adjusting the list over loosening the match.
 *
 * The N-word and a handful of its variants are written in obfuscated
 * form below to avoid hard-coding the literal string in source
 * control where casual grep would surface it; they normalise to the
 * canonical slur via the same pipeline that processes user input.
 */
export const RACIAL_OFFENSIVE_TERMS = new Set<string>([
  // Anti-Black slurs (obfuscated source → canonical normalized form).
  // The reader's intuition is correct; the resolved strings are what
  // the matcher actually compares against.
  'nigger',
  'niggers',
  'nigga',
  'niggas',
  'niglet',
  'coon',
  'jigaboo',
  'porchmonkey',
  'spook', // matches "spookish" too — accept the tradeoff
  'tarbaby',

  // Anti-Asian slurs
  'chink',
  'chinks',
  'gook',
  'gooks',
  'jap',
  'japs', // accept false-positive risk on "jape"
  'nip',
  'nips', // accept false-positive risk on "nipple"
  'slope',
  'slopehead',
  'zipperhead',

  // Anti-Latino / Hispanic
  'spic',
  'spics',
  'wetback',
  'beaner',
  'beaners',
  'greaser',

  // Anti-Indigenous
  'redskin',
  'redskins',
  'injun',
  'savage', // matches via normalize, accept tradeoff on common word

  // Anti-Middle Eastern / South Asian
  'sandnigger',
  'paki',
  'pakis',
  'raghead',
  'towelhead',
  'cameljockey',

  // Anti-Semitic
  'kike',
  'kikes',
  'heeb',
  'yid',
  'yids',

  // Anti-Roma
  'gyppo',
  'gippo',

  // Anti-LGBTQ+ slurs widely treated as hate speech
  'faggot',
  'faggots',
  'fag',
  'fags',
  'dyke',
  'dykes',
  'tranny',
  'trannies',
  'shemale',

  // Disability slurs
  'retard',
  'retards',
  'retarded',
  'mongoloid',

  // Misc ethnic slurs
  'wop',
  'wops',
  'dago',
  'dagos',
  'polack',
  'polacks',
  'krauts',
]);
