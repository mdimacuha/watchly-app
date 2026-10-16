'use client';

import { createContext, useContext } from 'react';
import type { LatestPromo } from '@/services/changelog';

const ChangelogPromoContext = createContext<LatestPromo | null>(null);

/**
 * Hands the newest changelog's "Promotional" section (read from disk by the
 * route-group layouts) down to the sidebar announcement card, without
 * threading a prop through the client shells.
 */
export function ChangelogPromoProvider({ promo, children }: { promo: LatestPromo | null; children: React.ReactNode }) {
  return <ChangelogPromoContext.Provider value={promo}>{children}</ChangelogPromoContext.Provider>;
}

export function useChangelogPromo(): LatestPromo | null {
  return useContext(ChangelogPromoContext);
}
