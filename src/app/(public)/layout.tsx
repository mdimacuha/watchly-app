import { PublicShell } from '@/components/nav/PublicShell';

/**
 * Static, non-async layout for the public route group. Chrome selection (app
 * shell vs. marketing nav) + the user's accent are resolved CLIENT-SIDE in
 * <PublicShell> from the hydrated auth store, so this layout reads no
 * per-request state and the public pages beneath it stay ISR-cacheable.
 *
 * (Previously this did `await getSession()` + `getAccentColorFor()`, a
 * cookies() read in a layout that forced the whole public subtree dynamic.)
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
