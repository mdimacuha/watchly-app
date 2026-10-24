'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EXTERNAL_PATHS, PATHS } from '@/lib/app';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { useToast } from '@/hooks/useToast';
import type { FirstNightStep, ServiceChoice, TasteTitle } from '@/services/onboarding';
import {
  AccountFields,
  Field,
  Kicker,
  Logo,
  PunchPoster,
  RegionFact,
  SearchBox,
  ServiceToggle,
  Tear,
  TicketReveal,
  useTasteList,
} from './FirstNightParts';
import { MAX_PICKS, MIN_PICKS, STEPS, useFirstNight, type FirstNight as Flow, type FirstNightInit } from './useFirstNight';

// The first run, "Admit One": a programme sheet of numbered entries on the
// left (one open at a time, answered ones folded to a printed line), and the
// ticket on the right printing each answer as it lands. The last entry tears
// it off as tonight's ticket. On a phone the ticket is a strip pinned to the
// top. /signup runs entries 01–02 as a guest; /onboarding runs the rest.

type Entry = Exclude<FirstNightStep, 'ticket'>;
const ENTRIES = STEPS.filter((s): s is Entry => s !== 'ticket');

const TITLE: Record<Entry, string> = {
  taste: 'Three you love',
  account: 'Your seat',
  region: 'The venue',
  services: 'Your screens',
  profile: 'Name on the stub',
};

/** Plain words beside the cinema words. */
const PLAIN: Record<Entry, string> = {
  taste: 'your taste',
  account: 'create your account',
  region: 'your country',
  services: 'streaming services',
  profile: 'your profile',
};

const LEAD: Record<Entry, string> = {
  taste: 'Films or shows, any era. Tonight’s ticket is built from them.',
  account: 'Three fields and your picks are saved to your account.',
  region: 'Streaming catalogues change by country. This is how we say where something is on.',
  services: 'We’ll put what’s on them first. Skip it and you see everything in your country.',
  profile: 'Ten seconds. Everything except the name is optional.',
};

function summary(f: Flow, s: Entry, services: ServiceChoice[]): string {
  switch (s) {
    case 'taste':
      return f.picks.map((p) => p.title).join(' · ');
    case 'account':
      return f.email ? `@${f.username} · ${f.email}` : `@${f.username}`;
    case 'region':
      return f.regionName;
    case 'services': {
      const chosen = services.filter((p) => f.services.has(p.id)).map((p) => p.name);
      return chosen.length ? chosen.join(' · ') : `Everything in ${f.region}`;
    }
    case 'profile':
      return f.name;
  }
}

export interface FirstNightProps {
  init: FirstNightInit;
  /** The curated row under the taste search. */
  tasteRow: TasteTitle[];
  /** Screens for the saved or suggested region (member mode). */
  services: ServiceChoice[];
  countries: { code: string; name: string }[];
}

export function FirstNight({ init, tasteRow, services: initialServices, countries }: FirstNightProps) {
  const f = useFirstNight(init);
  const taste = useTasteList(f, tasteRow);
  const current = useRef<HTMLLIElement>(null);
  const [services, setServices] = useState({ region: f.region, list: initialServices });

  // The open entry scrolls into place and takes focus as the sheet advances.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (f.mode === 'guest') return;
    }
    current.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    current.current?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [f.step, f.mode]);

  // A new venue has its own screens.
  useEffect(() => {
    if (f.mode !== 'member' || f.region === services.region) return;
    let live = true;
    fetch(`/api/me/onboarding/services?region=${encodeURIComponent(f.region)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: ServiceChoice[] } | null) => live && j?.data && setServices({ region: f.region, list: j.data }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [f.mode, f.region, services.region]);

  const onTicket = f.step === 'ticket';

  return (
    <>
      {/* Outside the grid so it sticks to the page, not to a grid cell. */}
      <div className="sticky top-0 z-30 lg:hidden">
        <StubStrip f={f} services={services.list} />
      </div>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(400px,42%)]">
        <main className="min-w-0 px-4 pb-24 pt-8 sm:px-10 lg:pt-16">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center justify-between">
              <Logo />
              {f.mode === 'guest' && (
                <Link href="/signin" className="text-sm text-muted-foreground hover:text-foreground">
                  Already a member? <span className="font-semibold text-foreground">Sign in</span>
                </Link>
              )}
            </div>
            <header className="flex items-end justify-between gap-4 border-b-2 border-foreground pb-6 pt-8">
              <div className="min-w-0">
                <Kicker>Tonight&apos;s programme · No. 1</Kicker>
                <h1 className="type-display mt-3 text-6xl text-foreground sm:text-7xl">Your first night</h1>
              </div>
              <p className="hidden max-w-40 shrink-0 text-right text-sm text-muted-foreground sm:block">Five short entries. The last one is a film for tonight.</p>
            </header>

            <ol className="flex flex-col">
              {ENTRIES.map((s, i) => {
                const state = s === f.step ? 'open' : f.isDone(s) ? 'done' : 'later';
                const no = String(i + 1).padStart(2, '0');
                return (
                  <li
                    key={s}
                    ref={state === 'open' ? current : undefined}
                    className={cn('grid scroll-mt-20 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 border-b border-border py-6 sm:grid-cols-[4.5rem_minmax(0,1fr)]', state === 'later' && 'opacity-45')}
                  >
                    <span aria-hidden className={cn('type-display text-5xl sm:text-6xl', state === 'open' ? 'text-primary' : 'text-muted-foreground')}>
                      {no}
                    </span>
                    <div className="flex min-w-0 flex-col gap-3 pt-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 tabIndex={-1} className="text-xl font-bold text-foreground outline-none sm:text-2xl">
                          <span className="sr-only">{no}. </span>
                          {TITLE[s]}
                          <span className="ml-2 text-sm font-normal text-muted-foreground">{PLAIN[s]}</span>
                        </h2>
                        {state === 'done' && f.canReopen(s) && (
                          <button
                            type="button"
                            onClick={() => f.go(s)}
                            aria-label={`Change ${no} ${TITLE[s]}`}
                            className="shrink-0 cursor-pointer rounded px-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Change
                          </button>
                        )}
                      </div>
                      {state === 'done' && <p className="truncate font-mono text-xs uppercase tracking-wider text-muted-foreground">{summary(f, s, services.list)}</p>}
                      {state === 'later' && <p className="text-sm text-muted-foreground">{LEAD[s]}</p>}
                      {state === 'open' && <EntryBody f={f} s={s} taste={taste} services={services.list} countries={countries} />}
                    </div>
                  </li>
                );
              })}

              <li ref={onTicket ? current : undefined} className={cn('grid scroll-mt-20 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 py-6 sm:grid-cols-[4.5rem_minmax(0,1fr)]', !onTicket && 'opacity-45')}>
                <span aria-hidden className={cn('type-display text-5xl sm:text-6xl', onTicket ? 'text-primary' : 'text-muted-foreground')}>
                  Ft.
                </span>
                <div className="flex min-w-0 flex-col gap-4 pt-1">
                  <h2 tabIndex={-1} className="text-xl font-bold text-foreground outline-none sm:text-2xl">
                    The feature
                  </h2>
                  {onTicket ? (
                    <>
                      <p className="text-muted-foreground">
                        <span className="hidden lg:inline">Torn off and handed over, on the right. </span>It stays in your sidebar as tonight&apos;s ticket.
                      </p>
                      <div className="lg:hidden">
                        <TicketReveal f={f} />
                      </div>
                      <Link href="/for-you" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
                        Or keep browsing For You <ArrowRight size={14} aria-hidden />
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Printed when the entries above are done.</p>
                  )}
                </div>
              </li>
            </ol>
          </div>
        </main>

        <aside className="hidden items-center justify-center overflow-y-auto border-l border-border bg-background px-10 py-16 lg:sticky lg:top-0 lg:flex lg:h-dvh">
          <div className="w-full max-w-[440px]">{onTicket ? <TicketReveal f={f} /> : <Stub f={f} services={services.list} />}</div>
        </aside>
      </div>
      <style>{'@keyframes stub-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}'}</style>
    </>
  );
}

function PrimaryButton({ children, disabled, busy }: { children: ReactNode; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
    >
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function SkipButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="h-12 cursor-pointer rounded-lg border border-border px-6 text-sm font-semibold text-foreground hover:bg-card disabled:opacity-60">
      Skip this entry
    </button>
  );
}

function EntryBody({
  f,
  s,
  taste,
  services,
  countries,
}: {
  f: Flow;
  s: Entry;
  taste: TasteTitle[];
  services: ServiceChoice[];
  countries: { code: string; name: string }[];
}) {
  const toast = useToast();
  const submit = () => {
    if (s === 'taste') f.advance();
    else if (s === 'account') void f.createAccount();
    else if (s === 'region') void f.confirmRegion();
    else if (s === 'services') void f.saveServices(f.services.size === 0);
    else void f.saveProfile(false);
  };
  const enough = f.picks.length >= MIN_PICKS;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (s === 'taste' && !enough) return;
        submit();
      }}
    >
      <p className="text-muted-foreground">{s === 'services' ? LEAD.services.replace('your country', f.regionName) : LEAD[s]}</p>

      {s === 'taste' && (
        <>
          <SearchBox f={f} />
          {f.results && f.results.length === 0 && !f.searching ? (
            <p className="text-sm text-muted-foreground">Nothing matched “{f.query.trim()}”. Try the original title.</p>
          ) : (
            // A programme's still strip: one scrolling row, not a wall.
            <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:thin]">
              {taste.map((t) => (
                <div key={t.key} className="w-28 shrink-0 snap-start sm:w-32">
                  <PunchPoster t={t} picked={f.pickKeys.has(t.key)} onToggle={() => f.togglePick(t)} disabled={f.picks.length >= MAX_PICKS} />
                </div>
              ))}
            </div>
          )}
          <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
            {f.picks.length} picked · {enough ? `up to ${MAX_PICKS}` : `${MIN_PICKS - f.picks.length} more to go`}
          </p>
        </>
      )}

      {s === 'account' && (
        <div className="flex max-w-md flex-col gap-1">
          <AccountFields f={f} />
          <p className="text-xs text-muted-foreground">
            You have 7 days to confirm your email; Watchly works fully in the meantime. By continuing you agree to the{' '}
            <a href={EXTERNAL_PATHS.BUSINESS.TERMS_OF_SERVICE} className="underline hover:text-foreground">
              Terms
            </a>{' '}
            and{' '}
            <a href={PATHS.BUSINESS.PRIVACY_POLICY} className="underline hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      )}

      {s === 'region' && (
        <div className="max-w-md">
          <RegionFact f={f} countries={countries} />
        </div>
      )}

      {s === 'services' && (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {services.map((p) => (
            <ServiceToggle key={p.id} p={p} on={f.services.has(p.id)} onToggle={() => f.toggleService(p.id)} />
          ))}
        </div>
      )}

      {s === 'profile' && (
        <div className="flex max-w-md flex-col gap-4">
          <div className="flex items-center gap-4">
            <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-lg font-semibold text-foreground">
              {f.avatarUrl ? <Image src={f.avatarUrl} alt="" fill sizes="64px" className="object-cover" /> : (f.name || '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Camera size={14} aria-hidden /> A photo, optional · PNG or JPG up to 8MB
              </span>
              <AvatarUpload onUploaded={(url) => f.setAvatarUrl(url)} onError={(m) => toast.error('Upload failed', m)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <Field label="First name" value={f.firstName} autoComplete="given-name" maxLength={50} onChange={(e) => f.setFirstName(e.target.value)} />
            <Field label="Last name" value={f.lastName} autoComplete="family-name" maxLength={50} onChange={(e) => f.setLastName(e.target.value)} />
          </div>
          <Field label="Name on your ticket" value={f.displayName} placeholder={f.fullName || f.username} maxLength={50} onChange={(e) => f.setDisplayName(e.target.value)} hint={<span className="text-muted-foreground">Shown on your profile and on lists you share.</span>} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="first-night-bio" className="type-kicker text-muted-foreground">
              A line about your taste <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              id="first-night-bio"
              value={f.bio}
              maxLength={160}
              onChange={(e) => f.setBio(e.target.value)}
              placeholder="Slow cinema, Korean thrillers, anything with Tilda Swinton."
              className="min-h-20 w-full resize-none rounded-lg border border-border bg-background px-3.5 py-3 text-base text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-right text-xs text-muted-foreground">{f.bio.length} / 160</span>
          </div>
        </div>
      )}

      {f.error && (
        <p role="alert" className="text-sm text-destructive">
          {f.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {s === 'taste' && <PrimaryButton disabled={!enough}>{enough ? 'Next entry' : `${f.picks.length} of ${MIN_PICKS} picked`}</PrimaryButton>}
        {s === 'account' && <PrimaryButton busy={f.busy}>{f.busy ? 'Booking your seat…' : 'Take my seat'}</PrimaryButton>}
        {s === 'region' && <PrimaryButton busy={f.busy}>That&apos;s right</PrimaryButton>}
        {s === 'services' && (
          <>
            <PrimaryButton busy={f.busy} disabled={f.services.size === 0}>
              {f.services.size ? `Save ${f.services.size} ${f.services.size === 1 ? 'screen' : 'screens'}` : 'Pick your screens'}
            </PrimaryButton>
            <SkipButton onClick={() => void f.saveServices(true)} disabled={f.busy} />
          </>
        )}
        {s === 'profile' && (
          <>
            <PrimaryButton busy={f.busy}>Print the feature</PrimaryButton>
            <SkipButton onClick={() => void f.saveProfile(true)} disabled={f.busy} />
          </>
        )}
      </div>
    </form>
  );
}

function stubLines(f: Flow, services: ServiceChoice[]) {
  const chosen = services.filter((p) => f.services.has(p.id)).map((p) => p.name);
  const done = (s: FirstNightStep) => STEPS.indexOf(s) < f.furthest;
  return [
    { label: 'Taste', value: f.picks.length ? `${f.picks.length} ${f.picks.length === 1 ? 'pick' : 'picks'}` : '—', done: f.picks.length >= MIN_PICKS },
    { label: 'Holder', value: done('account') ? `@${f.username}` : '—', done: done('account') },
    { label: 'Venue', value: done('region') ? f.region : '—', done: done('region') },
    { label: 'Screens', value: done('services') ? (chosen.length ? `${chosen.slice(0, 2).join(', ')}${chosen.length > 2 ? ` +${chosen.length - 2}` : ''}` : 'Any') : '—', done: done('services') },
    { label: 'Name', value: done('profile') ? f.name : '—', done: done('profile') },
  ];
}

/** The Admit One stub: answers print in as mono lines. */
function Stub({ f, services }: { f: Flow; services: ServiceChoice[] }) {
  return (
    <div className="flex flex-col gap-3">
      <Kicker>Box office · window 1</Kicker>
      <div className="relative w-full rounded-xl border border-border bg-card" aria-label="Your ticket so far">
        <div className="flex items-end justify-between px-5 pb-4 pt-5">
          <div>
            <Kicker>Watchly · box office</Kicker>
            <p className="type-display mt-2 text-5xl text-foreground">Admit one</p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">No. 0001</span>
        </div>
        <div className="flex gap-1.5 px-5 pb-4">
          {f.picks.map((p) => (
            <span key={p.key} className="relative aspect-[2/3] w-11 overflow-hidden rounded-[3px] bg-background motion-safe:animate-[stub-in_240ms_ease-out]">
              {p.poster && <Image src={p.poster} alt={p.title} fill sizes="44px" className="object-cover" />}
            </span>
          ))}
          {Array.from({ length: Math.max(0, MIN_PICKS - f.picks.length) }).map((_, i) => (
            <span key={i} aria-hidden className="aspect-[2/3] w-11 rounded-[3px] border border-dashed border-border" />
          ))}
        </div>
        <Tear />
        <dl className="flex flex-col px-5 py-3">
          {stubLines(f, services).map((l) => (
            <div key={l.label} className="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0">
              {/* A punched hole once the answer is in; an outline until then. */}
              <span aria-hidden className={cn('h-3 w-3 shrink-0 rounded-full border', l.done ? 'border-primary bg-primary' : 'border-border')} />
              <dt className="type-kicker w-20 shrink-0 text-muted-foreground">{l.label}</dt>
              <dd className={cn('min-w-0 flex-1 truncate text-right font-mono text-xs uppercase tracking-wider', l.done ? 'text-foreground' : 'text-muted-foreground/60')}>{l.value}</dd>
            </div>
          ))}
        </dl>
        <Tear />
        <p className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Feature: printed at the end</p>
      </div>
    </div>
  );
}

/** The stub as a strip pinned to the top (phone): same lines, one row. */
function StubStrip({ f, services }: { f: Flow; services: ServiceChoice[] }) {
  return (
    <div className="border-b border-border bg-card px-4 py-2.5" aria-label="Your ticket so far">
      <div className="flex items-center gap-3 overflow-x-auto [scrollbar-width:none]">
        <span className="type-display shrink-0 text-lg text-foreground">Admit one</span>
        {stubLines(f, services).map((l) => (
          <span key={l.label} className={cn('flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider', l.done ? 'text-foreground' : 'text-muted-foreground/60')}>
            <span aria-hidden className={cn('h-2 w-2 rounded-full border', l.done ? 'border-primary bg-primary' : 'border-border')} />
            {l.label}
            {l.done ? ` · ${l.value}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
