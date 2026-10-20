'use client';

import { useEffect, useState } from 'react';

// Stale-while-revalidate cache for data a tab loads when it opens. Tabs
// unmount when you switch away; this keeps their last result for the page
// session, so coming back renders it at once and refreshes in the background.
// `prefetch` warms an entry ahead of the click (e.g. on tab hover).

interface Entry {
  at: number;
  value?: unknown;
  hasValue: boolean;
  inflight?: Promise<unknown>;
}

const store = new Map<string, Entry>();
// Re-fetch an entry at most this often, so flipping tabs doesn't spam requests.
const FRESH_MS = 15_000;

export function peekCached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

export function prefetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry?.inflight) return entry.inflight as Promise<T>;
  if (entry?.hasValue && Date.now() - entry.at < FRESH_MS) return Promise.resolve(entry.value as T);
  const inflight = fetcher().then(
    (value) => {
      store.set(key, { at: Date.now(), value, hasValue: true });
      return value;
    },
    (err: unknown) => {
      const prev = store.get(key);
      if (prev) delete prev.inflight;
      throw err;
    },
  );
  store.set(key, { at: entry?.at ?? 0, value: entry?.value, hasValue: entry?.hasValue ?? false, inflight });
  return inflight;
}

/**
 * Loads `key` through the cache. `data` is the cached value straight away when
 * there is one; `failed` only flips when there is nothing cached to show.
 * The fetcher is identified by `key`, so it isn't an effect dependency.
 */
export function useCachedLoad<T>(key: string, fetcher: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<{ key: string; data: T | undefined }>(() => ({
    key,
    data: peekCached<T>(key),
  }));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const data = state.key === key ? state.data : peekCached<T>(key);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    prefetch(key, fetcher).then(
      (value) => {
        if (!cancelled) setState({ key, data: value });
      },
      () => {
        if (!cancelled && peekCached(key) === undefined) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  return { data, failed, retry };
}
