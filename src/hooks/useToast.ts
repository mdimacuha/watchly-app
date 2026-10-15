import { useCallback } from 'react';
import { useToastStore, type ToastInput } from '@/client/stores/toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToastMessageOptions {
  title: string;
  description?: string;
}

interface ToastPromiseOptions<T> {
  loading: ToastMessageOptions;
  success: (data: T) => ToastMessageOptions;
  error: (err: unknown) => ToastMessageOptions;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useToast() {
  const { addToast, updateToast, removeToast } = useToastStore();

  const success = useCallback(
    (title: string, description?: string) =>
      addToast({ title, description, type: 'success' }),
    [addToast],
  );

  const error = useCallback(
    (title: string, description?: string) =>
      addToast({ title, description, type: 'error' }),
    [addToast],
  );

  const info = useCallback(
    (title: string, description?: string) =>
      addToast({ title, description, type: 'info' }),
    [addToast],
  );

  const warning = useCallback(
    (title: string, description?: string) =>
      addToast({ title, description, type: 'warning' }),
    [addToast],
  );

  const loading = useCallback(
    (title: string, description?: string) =>
      addToast({ title, description, type: 'loading', variant: 'persistent' }),
    [addToast],
  );

  const custom = useCallback(
    (input: ToastInput) => addToast(input),
    [addToast],
  );

  const dismiss = useCallback(
    (id: string) => removeToast(id),
    [removeToast],
  );

  /**
   * Minimal toast.promise() helper.
   *
   * Shows a loading toast immediately, then transitions it to success or
   * error once the promise settles. Returns the original promise result.
   */
  const promise = useCallback(
    async <T>(
      p: Promise<T>,
      opts: ToastPromiseOptions<T>,
    ): Promise<T> => {
      const id = addToast({
        ...opts.loading,
        type: 'loading',
        variant: 'persistent',
      });

      try {
        const data = await p;
        updateToast(id, {
          ...opts.success(data),
          type: 'success',
          variant: 'default',
        });
        return data;
      } catch (err) {
        updateToast(id, {
          ...opts.error(err),
          type: 'error',
          variant: 'default',
        });
        throw err;
      }
    },
    [addToast, updateToast],
  );

  return {
    success,
    error,
    info,
    warning,
    loading,
    custom,
    dismiss,
    promise,
  };
}
