import { PublicShell } from '@/components/nav/PublicShell';
import { getLatestPromo } from '@/services/changelog';
import { ChangelogPromoProvider } from '@/components/changelog/ChangelogPromoProvider';

/**
 * Static layout for the public route group. Chrome selection (app
 * shell vs. marketing nav) + the user's accent are resolved CLIENT-SIDE in
 * <PublicShell> from the hydrated auth store, so this layout reads no
 * per-request state and the public pages beneath it stay ISR-cacheable.
 * (The changelog promo is a file read, not request state — it doesn't
 * opt the subtree into dynamic rendering.)
 *
 * (Previously this did `await getSession()` + `getAccentColorFor()`, a
 * cookies() read in a layout that forced the whole public subtree dynamic.)
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const promo = await getLatestPromo();
  return (
    <ChangelogPromoProvider promo={promo}>
      <PublicShell>{children}</PublicShell>
    </ChangelogPromoProvider>
  );
}
