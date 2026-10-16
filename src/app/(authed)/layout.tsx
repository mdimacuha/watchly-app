import { getSession } from '@/server/auth/session';
import { AuthenticatedShell } from '@/components/nav/AuthenticatedShell';
import { AccentScope } from '@/components/profile/AccentScope';
import { getAccentColorFor } from '@/services/profile/accentCache';
import { getLatestPromo } from '@/services/changelog';
import { ChangelogPromoProvider } from '@/components/changelog/ChangelogPromoProvider';

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Look up the viewer's accent so it applies app-wide for the logged-in
  // user. Cached per userId (1h revalidate, tag-invalidated on profile
  // edit) so every page nav doesn't pay for a fresh DB round-trip.
  const session = await getSession();
  const [accentColor, promo] = await Promise.all([
    session ? getAccentColorFor(session.userId) : null,
    getLatestPromo(),
  ]);

  return (
    <AccentScope accentColor={accentColor}>
      <ChangelogPromoProvider promo={promo}>
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </ChangelogPromoProvider>
    </AccentScope>
  );
}
