/**
 * Normalises a string for moderation comparison ONLY. The output is
 * thrown away after the check — never store or display it.
 *
 * Defeats common bypass tricks:
 *   - mixed case (lowercase)
 *   - accented characters (NFKD + combining-mark strip)
 *   - leetspeak (@ → a, 1 → i, 0 → o, etc.)
 *   - punctuation / spacing (f.u.c.k, f u c k, n!gger → fuck, nigger)
 *
 * The final filter (`[^a-z0-9]`) leaves only alphanumerics, so all
 * blocklist entries must be plain `[a-z0-9]+` strings.
 */
export function normalizeModerationText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks (accents)
    .replace(/[@]/g, 'a')
    .replace(/[4]/g, 'a')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/\+/g, 't')
    .replace(/[^a-z0-9]/g, '');
}
