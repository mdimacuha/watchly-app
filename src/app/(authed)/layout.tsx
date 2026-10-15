import { getSession } from '@/server/auth/session';
import { AuthenticatedShell } from '@/components/nav/AuthenticatedShell';
import { AccentScope } from '@/components/profile/AccentScope';
import { getAccentColorFor } from '@/services/profile/accentCache';
import type { AccentSlug } from '@/constants/accentColors';

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Look up the viewer's accent so it applies app-wide for the logged-in
  // user. Cached per userId (1h revalidate, tag-invalidated on profile
  // edit) so every page nav doesn't pay for a fresh DB round-trip.
  const session = await getSession();
  const accentColor: AccentSlug | null = session
    ? await getAccentColorFor(session.userId)
    : null;

  return (
    <AccentScope accentColor={accentColor}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </AccentScope>
  );
}
