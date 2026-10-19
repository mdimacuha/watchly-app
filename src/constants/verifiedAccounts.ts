/**
 * Usernames that should render a "verified" check next to their
 * display name. Manual allowlist — there's no end-user verification
 * flow yet; this is for team / official accounts only.
 *
 * Lowercased keys — match against `username.toLowerCase()`.
 */
export const VERIFIED_ACCOUNTS = new Set<string>([
  'mdimacuha',
  'eros',
  'noumu',
  'aikmh',
  'luckyloi'
]);

export function isVerifiedAccount(username: string | null | undefined): boolean {
  if (!username) return false;
  return VERIFIED_ACCOUNTS.has(username.toLowerCase());
}
