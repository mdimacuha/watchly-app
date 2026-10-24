'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { analyticsSessionId } from '@/client/eventTracker';
import { arrivalSource, trackOnboarding } from '@/client/onboardingEvents';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';
import { completeOnboardingAction, markOnboardingStepAction } from '@/actions/onboarding';
import type { FirstNightStep, FirstTickets, OnboardingState, TasteTitle } from '@/services/onboarding';

// The first run's state. /signup runs the taste and account entries as a
// guest; /onboarding picks up at the first entry not answered yet. Progress
// is what has been answered, not where the cursor is: reopening an earlier
// entry keeps every later answer, and Continue returns to the furthest one.

export const STEPS: FirstNightStep[] = ['taste', 'account', 'region', 'services', 'profile', 'ticket'];
export const MIN_PICKS = 3;
export const MAX_PICKS = 5;

const PICKS_KEY = 'watchly.firstNight.picks';
const USERNAME_RE = /^(?![._])[a-z0-9._]{3,24}(?<![._])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken';

/** "Marc.Dimacuha+tv@x.com" → "marc.dimacuha". */
export function suggestUsername(email: string): string {
  return (email.split('@')[0]?.split('+')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 24);
}

/** A stable seat from the username: "film.lover" → Row G · Seat 18. */
export function seatFor(username: string): { row: string; seat: number } {
  let h = 0;
  for (const c of username) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { row: String.fromCharCode(65 + (h % 12)), seat: 1 + ((h >>> 4) % 24) };
}

/** A route, not a server action: the first call builds the pool (seconds),
 *  and server actions queue, so it would hold up every step's save. */
async function fetchTickets(): Promise<FirstTickets> {
  const res = await fetch('/api/me/onboarding/tickets', { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { data?: FirstTickets } | null;
  if (!res.ok || !json?.data) throw new Error('tickets unavailable');
  return json.data;
}

function readStoredPicks(): TasteTitle[] {
  try {
    const raw = sessionStorage.getItem(PICKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as TasteTitle[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PICKS) : [];
  } catch {
    return [];
  }
}

export interface FirstNightInit {
  mode: 'guest' | 'member';
  state: OnboardingState | null;
  /** Country from the visitor's connection, when the host tells us. */
  detectedRegion: string | null;
  /** The region to suggest when nothing was detected (cookie, else US). */
  fallbackRegion: string;
}

export function useFirstNight({ mode, state, detectedRegion, fallbackRegion }: FirstNightInit) {
  const startAt: FirstNightStep = mode === 'guest' ? 'taste' : (state?.resumeAt ?? 'region');
  const [step, setStep] = useState<FirstNightStep>(startAt);
  const [furthest, setFurthest] = useState(STEPS.indexOf(startAt));
  const sessionId = useRef<string | null>(null);

  // Taste (guest: kept in this tab until signup carries it over).
  const [picks, setPicks] = useState<TasteTitle[]>(state?.picks ?? []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TasteTitle[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Account.
  const [email, setEmail] = useState(state?.email ?? '');
  const [usernameDraft, setUsernameDraft] = useState<string | null>(state?.username ?? null);
  const [password, setPassword] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [accountErrors, setAccountErrors] = useState<Record<string, string>>({});

  // Venue, screens, name.
  const [region, setRegionCode] = useState(state?.regionCode ?? detectedRegion ?? fallbackRegion);
  const [services, setServices] = useState<Set<number>>(new Set(state?.selectedProviders ?? []));
  // The username is only the stored fallback, not a chosen name: start blank.
  const [displayName, setDisplayName] = useState(state && state.displayName !== state.username ? state.displayName : '');
  const [firstName, setFirstName] = useState(state?.firstName ?? '');
  const [lastName, setLastName] = useState(state?.lastName ?? '');
  const [bio, setBio] = useState(state?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(state?.avatarUrl ?? '');

  // Ticket.
  const [tickets, setTickets] = useState<FirstTickets | null>(null);
  const [ticketAt, setTicketAt] = useState(0);
  const warm = useRef<Promise<FirstTickets> | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStoreRegion = useRegionStore((s) => s.setRegion);

  const username = usernameDraft ?? suggestUsername(email);
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const name = displayName.trim() || fullName || username;

  useEffect(() => {
    sessionId.current = analyticsSessionId();
    if (mode === 'guest') {
      const stored = readStoredPicks();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored.length) setPicks(stored);
      const source = arrivalSource();
      trackOnboarding('taste_viewed', source && { source });
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'guest') return;
    try {
      sessionStorage.setItem(PICKS_KEY, JSON.stringify(picks));
    } catch {
      // Storage off: picks still ride along in the signup request.
    }
  }, [mode, picks]);

  // Debounced taste search (public, rate-limited route).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/v1/onboarding/search?q=${encodeURIComponent(q)}&region=${encodeURIComponent(region)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { data?: TasteTitle[] } | null) => {
          if (!live) return;
          setResults(j?.data ?? []);
          trackOnboarding('taste_searched', { results: j?.data?.length ?? 0 });
        })
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, region]);

  // Live username availability (read-only, rate-limited endpoint).
  useEffect(() => {
    if (mode !== 'guest' || !USERNAME_RE.test(username)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsernameStatus('idle');
      return;
    }
    let live = true;
    setUsernameStatus('checking');
    const t = setTimeout(() => {
      fetch('/api/v1/auth/check-username', { method: 'POST', body: JSON.stringify({ username }) })
        .then((r) => r.json())
        .then((j: { data?: { available?: boolean } }) => live && setUsernameStatus(j?.data?.available ? 'available' : 'taken'))
        .catch(() => live && setUsernameStatus('idle'));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [mode, username]);

  const pickKeys = useMemo(() => new Set(picks.map((p) => p.key)), [picks]);
  const index = STEPS.indexOf(step);
  const accountCreated = mode === 'member';

  function reach(i: number) {
    const to = Math.min(i, STEPS.length - 1);
    setFurthest((m) => Math.max(m, to));
    setStep(STEPS[to]);
    setError(null);
  }
  /** Taste and the account are settled once signed up; the rest can reopen. */
  const canReopen = (s: FirstNightStep) => (mode === 'guest' ? s === 'taste' : s === 'region' || s === 'services' || s === 'profile');
  const go = (s: FirstNightStep) => canReopen(s) && setStep(s);
  const advance = () => (index < furthest ? setStep(STEPS[furthest]) : reach(index + 1));
  const isDone = (s: FirstNightStep) => STEPS.indexOf(s) < furthest && s !== step;

  function togglePick(t: TasteTitle) {
    const picked = pickKeys.has(t.key);
    if (!picked && picks.length >= MAX_PICKS) return;
    if (!picked) trackOnboarding('taste_picked', { key: t.key, from: results ? 'search' : 'row' });
    setPicks((cur) => (cur.some((p) => p.key === t.key) ? cur.filter((p) => p.key !== t.key) : cur.length >= MAX_PICKS ? cur : [...cur, t]));
  }

  function validateAccount(): boolean {
    const errors: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter an email like name@example.com.';
    if (!USERNAME_RE.test(username)) errors.username = '3–24 lowercase letters, numbers, dots or underscores, with no dot or underscore at either end.';
    else if (usernameStatus === 'taken') errors.username = `@${username} is taken. Try another.`;
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    setAccountErrors(errors);
    return Object.keys(errors).length === 0;
  }

  /** Creates the account with the picks, then hands over to /onboarding. */
  async function createAccount() {
    if (!validateAccount()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          username,
          password,
          sessionId: sessionId.current,
          picks: picks.map((p) => ({ mediaType: p.mediaType, id: p.id, title: p.title, year: p.year, poster: p.poster })),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        const msg = json?.message || json?.error || 'Something went wrong. Please try again.';
        if (/email/i.test(msg)) setAccountErrors({ email: msg });
        else if (/username/i.test(msg)) setAccountErrors({ username: msg });
        else setError(res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : msg);
        setBusy(false);
        return;
      }
      try {
        sessionStorage.removeItem(PICKS_KEY);
      } catch {
        // Nothing to clear.
      }
      // A full load so the signed-in layouts and cookies apply from the start.
      window.location.assign('/onboarding');
    } catch {
      setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const mark = (event: Parameters<typeof markOnboardingStepAction>[0]['event'], metadata?: Record<string, string | number | boolean>) =>
    markOnboardingStepAction({ event, sessionId: sessionId.current, metadata }).catch(() => undefined);

  /** Builds the pool in the background so the reveal reads a warm cache. */
  const warmTickets = () => {
    warm.current = fetchTickets();
    warm.current.catch(() => undefined);
  };

  async function confirmRegion() {
    setBusy(true);
    setError(null);
    const source = detectedRegion && region === detectedRegion ? 'ip' : 'manual';
    const res = await fetch('/api/me/preferences/region', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionCode: region, regionSource: source }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError('Could not save your country. Try again.');
    setStoreRegion(region, getCountryName(region) ?? region);
    await mark('region_confirmed', { region, source });
    warmTickets();
    advance();
  }

  async function saveServices(skip: boolean) {
    setBusy(true);
    setError(null);
    // A route, not the settings server action: that one revalidates pages,
    // which re-renders this one before it returns.
    const res = await fetch('/api/me/preferences/providers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers: skip ? [] : [...services] }),
    }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      return setError('Could not save your services. Try again.');
    }
    await mark(skip ? 'services_skipped' : 'services_saved', { count: skip ? 0 : services.size });
    setBusy(false);
    warmTickets();
    advance();
  }

  async function saveProfile(skip: boolean) {
    setBusy(true);
    setError(null);
    if (!skip) {
      const res = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name.trim(), firstName: firstName.trim(), lastName: lastName.trim(), bio: bio.trim(), avatarUrl }),
      }).catch(() => null);
      if (!res?.ok) {
        setBusy(false);
        return setError('Could not save your name. Try again, or skip for now.');
      }
    }
    await mark(skip ? 'profile_skipped' : 'profile_saved');
    setBusy(false);
    advance();
  }

  // The reveal: tickets come from the warmed request when there is one.
  useEffect(() => {
    if (step !== 'ticket' || tickets) return;
    let live = true;
    const pending = warm.current ?? fetchTickets();
    pending
      .catch(() => fetchTickets())
      .then((t) => {
        if (!live) return;
        setTickets(t);
        void completeOnboardingAction({ sessionId: sessionId.current, ticketKey: t.tickets[0]?.key ?? null, source: t.source });
      })
      .catch(() => live && setTickets({ tickets: [], source: 'fallback' }));
    return () => {
      live = false;
    };
  }, [step, tickets]);

  const ticket = tickets?.tickets.length ? tickets.tickets[ticketAt % tickets.tickets.length] : null;
  const reroll = () => {
    setTicketAt((i) => i + 1);
    trackOnboarding('ticket_rerolled', { from: ticket?.key ?? null });
  };

  return {
    mode, step, index, furthest, isDone, canReopen, accountCreated, go, advance,
    picks, pickKeys, togglePick, query, setQuery, results, searching,
    email, setEmail, username, setUsername: setUsernameDraft, password, setPassword, usernameStatus, accountErrors, createAccount,
    region, setRegion: setRegionCode, regionName: getCountryName(region) ?? region, detectedRegion, confirmRegion,
    services, toggleService: (id: number) =>
      setServices((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    saveServices,
    name, fullName, displayName, setDisplayName, firstName, setFirstName, lastName, setLastName, bio, setBio, avatarUrl, setAvatarUrl, saveProfile,
    tickets, ticket, reroll, canReroll: (tickets?.tickets.length ?? 0) > 1,
    busy, error,
  };
}

export type FirstNight = ReturnType<typeof useFirstNight>;
