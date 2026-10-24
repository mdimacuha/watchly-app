'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PATHS } from '@/lib/app';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';
import { Field, Kicker, Logo, PasswordField, Tear } from '@/components/onboarding/FirstNightParts';
import { Letterboard } from '@/components/watchly/Letterboard';

// Sign-in, "Late Show": the heading is a cinema letterboard — "Still up?"
// after 22:00, "Welcome back." otherwise — beside a ticket-shaped form. The
// clock is read after mount only, so server and client render alike. A
// signed-in account that never finished the first run goes back to it.

const MIN = 60_000;

function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const hhmm = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--');

export function LateShowSignin({ redirect }: { redirect?: string }) {
  const now = useNow();
  const late = now ? now.getHours() >= 22 || now.getHours() < 5 : false;
  const searchParams = useSearchParams();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setRegion = useRegionStore((s) => s.setRegion);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // Default on: matches the app's long-standing always-persistent sessions.
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email or username and your password.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/v1/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), password, rememberMe }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setBusy(false);
        setError(res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : json?.message || json?.error || 'That email, username or password is wrong.');
        return;
      }
      setAuthenticated(json.data.user);
      // The account's saved region wins over what the visitor picked signed out.
      const accountRegion: string | null = json.data.regionCode ?? null;
      if (accountRegion && accountRegion !== 'unknown') setRegion(accountRegion, getCountryName(accountRegion) ?? accountRegion);

      // Only same-origin relative paths, to prevent open redirects.
      const wanted = redirect ?? searchParams.get('redirect') ?? undefined;
      let target = wanted && wanted.startsWith('/') && !wanted.startsWith('//') ? wanted : PATHS.ME;
      // An unfinished first run comes first.
      if (json.data.onboardingCompleted === false) target = PATHS.ONBOARDING.ROOT;
      // Carry the migration-modal override across the hard navigation.
      const migration = searchParams.get('migration');
      if (migration && !target.includes('migration=')) target += `${target.includes('?') ? '&' : '?'}migration=${encodeURIComponent(migration)}`;
      // A full load so the signed-in layouts start with the new cookie.
      window.location.assign(target);
    } catch {
      setBusy(false);
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-24 pt-8 sm:px-10 lg:pt-16">
      <Logo />
      <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-4">
          <Kicker>Late show · {hhmm(now)}</Kicker>
          <h1 className="sr-only">{late ? 'Still up?' : 'Welcome back.'}</h1>
          <Letterboard lines={late ? ['Still up?'] : ['Welcome', 'back.']} />
          <p className="max-w-md text-muted-foreground">
            {late ? 'There’s still time for one. Your ticket is where you left it.' : 'Tonight’s ticket, your watchlists and everything you follow are where you left them.'}
          </p>
        </div>

        <div className="relative w-full max-w-sm justify-self-center rounded-xl border border-border bg-card lg:max-w-none">
          <div className="px-6 pb-5 pt-6">
            <Kicker>Box office · last admission {hhmm(now ? new Date(now.getTime() + 90 * MIN) : null)}</Kicker>
            <p className="type-display mt-2 text-4xl text-foreground">Present your ticket</p>
          </div>
          <Tear notch="bg-background" />
          <form
            className="flex flex-col gap-2 px-6 pb-6 pt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Email or username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} disabled={busy} />
            <PasswordField
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              error={error ?? undefined}
              hint={
                <Link href={PATHS.AUTH.FORGOT_PASSWORD} className="text-muted-foreground hover:text-foreground">
                  Forgot your password?
                </Link>
              }
            />
            <label className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} disabled={busy} className="h-4 w-4 cursor-pointer accent-primary" />
              Keep me signed in
            </label>
            <button
              type="submit"
              disabled={busy}
              className={cn('mt-4 inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60')}
            >
              {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </form>
          <Tear notch="bg-background" />
          <Link href={PATHS.AUTH.SIGN_UP} className="flex items-center justify-between rounded-b-xl px-6 py-4 text-sm text-muted-foreground hover:text-foreground">
            New here?
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              Get your first ticket <ArrowRight size={14} aria-hidden />
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
