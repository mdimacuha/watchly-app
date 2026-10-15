import { create } from 'zustand';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface UIState {
  /** Desktop: expanded (true) vs icon-rail collapsed (false). */
  isSidebarExpanded: boolean;
  /** Mobile: whether the overlay sidebar is visible. */
  isMobileOverlayOpen: boolean;
  /**
   * Currently-open Quick View title, or null when closed. Any card can open
   * a lightweight title popup via `openQuickView`; a single global
   * `QuickViewModal` (mounted in AuthenticatedShell) reads this slice.
   */
  quickView: { mediaType: 'movie' | 'tv'; id: string } | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface UIActions {
  toggleSidebar: () => void;
  expandSidebar: () => void;
  collapseSidebar: () => void;
  openMobileOverlay: () => void;
  closeMobileOverlay: () => void;
  openQuickView: (mediaType: 'movie' | 'tv', id: string) => void;
  closeQuickView: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIState & UIActions>((set) => ({
  isSidebarExpanded: true,
  isMobileOverlayOpen: false,
  quickView: null,

  toggleSidebar: () =>
    set((s) => ({ isSidebarExpanded: !s.isSidebarExpanded })),
  expandSidebar: () => set({ isSidebarExpanded: true }),
  collapseSidebar: () => set({ isSidebarExpanded: false }),
  openMobileOverlay: () => set({ isMobileOverlayOpen: true }),
  closeMobileOverlay: () => set({ isMobileOverlayOpen: false }),
  openQuickView: (mediaType, id) => set({ quickView: { mediaType, id } }),
  closeQuickView: () => set({ quickView: null }),
}));
