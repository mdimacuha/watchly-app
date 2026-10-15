import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';
export type ToastVariant = 'default' | 'persistent' | 'action';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms. Default 4000. */
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export type ToastInput = Omit<Toast, 'id'>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ToastState {
  toasts: Toast[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface ToastActions {
  /** Add a toast and return its generated id. */
  addToast: (toast: ToastInput) => string;
  /** Merge partial fields into an existing toast by id. */
  updateToast: (id: string, partial: Partial<Omit<Toast, 'id'>>) => void;
  /** Remove a single toast by id. */
  removeToast: (id: string) => void;
  /** Remove all toasts. */
  clearToasts: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useToastStore = create<ToastState & ToastActions>((set) => ({
  toasts: [],

  addToast: (input) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...input, id }] }));
    return id;
  },

  updateToast: (id, partial) =>
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    })),

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clearToasts: () => set({ toasts: [] }),
}));
