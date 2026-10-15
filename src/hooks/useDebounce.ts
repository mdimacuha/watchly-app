import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * have elapsed without `value` changing. Useful for throttling
 * search-as-you-type requests without spamming the network / history.
 *
 * @param value  The fast-changing value to debounce.
 * @param delay  Debounce window in milliseconds (default 350ms).
 */
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
