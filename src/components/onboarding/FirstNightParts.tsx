'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check, Eye, EyeOff, Loader2, MapPin, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatRuntime } from '@/lib/format';
import { trackOnboarding } from '@/client/onboardingEvents';
import type { ServiceChoice, TasteTitle } from '@/services/onboarding';
import { seatFor, type FirstNight, type UsernameStatus } from './useFirstNight';

// Building blocks of the first run (/signup, /onboarding) and the sign-in
// ticket: mono kickers, plain inputs, punched posters, tear lines, and the
// ticket itself — the same anatomy as the sidebar's Tonight card.

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('type-kicker text-muted-foreground', className)}>{children}</p>;
}

export function Logo() {
  return (
    <Link href="/" aria-label="Watchly home" className="inline-flex w-fit rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Image src="/brand-light.svg" alt="Watchly" width={104} height={26} className="h-6 w-auto" unoptimized priority />
    </Link>
  );
}

export function Field({
  label,
  error,
  hint,
  trailing,
  leading,
  inputClassName,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  inputClassName?: string;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-kicker text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base text-muted-foreground">{leading}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cn(
            'h-12 w-full rounded-lg border bg-background px-3.5 text-base text-foreground placeholder:text-muted-foreground/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
            error ? 'border-destructive' : 'border-border',
            trailing && 'pr-11',
            inputClassName,
          )}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      <div id={msgId} aria-live="polite" className="min-h-4 text-xs">
        {error ? <span className="text-destructive">{error}</span> : hint}
      </div>
    </div>
  );
}

export function PasswordField(props: Omit<React.ComponentProps<typeof Field>, 'type' | 'trailing'>) {
  const [show, setShow] = useState(false);
  return (
    <Field
      {...props}
      type={show ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}

function UsernameHint({ status, username }: { status: UsernameStatus; username: string }) {
  if (status === 'checking')
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Checking @{username}
      </span>
    );
  if (status === 'available')
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <Check size={12} strokeWidth={3} /> @{username} is yours
      </span>
    );
  if (status === 'taken')
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <X size={12} strokeWidth={3} /> @{username} is taken
      </span>
    );
  return <span className="text-muted-foreground">Suggested from your email. Change it any time.</span>;
}

/** Three fields: email, a suggested username, a password. */
export function AccountFields({ f }: { f: FirstNight }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" value={f.email} onChange={(e) => f.setEmail(e.target.value)} error={f.accountErrors.email} disabled={f.busy} />
      <Field
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="yourname"
        value={f.username}
        onChange={(e) => f.setUsername(e.target.value.toLowerCase())}
        error={f.accountErrors.username}
        hint={<UsernameHint status={f.usernameStatus} username={f.username} />}
        disabled={f.busy}
        leading="@"
        inputClassName="pl-8"
      />
      <PasswordField label="Password" autoComplete="new-password" placeholder="8 characters or more" value={f.password} onChange={(e) => f.setPassword(e.target.value)} error={f.accountErrors.password} disabled={f.busy} />
    </div>
  );
}

export function SearchBox({ f }: { f: FirstNight }) {
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        aria-label="Search films and shows"
        value={f.query}
        onChange={(e) => f.setQuery(e.target.value)}
        placeholder="A film you love, a show, a director…"
        className="h-12 w-full rounded-lg border border-border bg-background pl-11 pr-10 text-base text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {f.searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
    </div>
  );
}

/**
 * A poster you punch: picked ones get a hole punched in the corner and a
 * check stamp with the title, so the state never rests on colour alone.
 */
export function PunchPoster({ t, picked, onToggle, disabled }: { t: TasteTitle; picked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !picked}
      aria-pressed={picked}
      aria-label={`${t.title}${t.year ? ` (${t.year})` : ''}`}
      className={cn(
        'group relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-md bg-card text-left transition-transform duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        picked ? 'ring-2 ring-primary' : 'hover:-translate-y-0.5',
        disabled && !picked && 'cursor-not-allowed opacity-40',
      )}
    >
      {t.poster ? (
        <Image src={t.poster} alt="" fill sizes="128px" className={cn('object-cover', picked && 'brightness-[0.55]')} />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">{t.title}</span>
      )}
      {picked && (
        <>
          <span aria-hidden className="absolute -right-3 -top-3 h-7 w-7 rounded-full bg-background" />
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-white">
              <Check size={18} strokeWidth={3} />
            </span>
            <span className="line-clamp-2 text-xs font-semibold leading-tight text-white">{t.title}</span>
          </span>
        </>
      )}
    </button>
  );
}

/** Results while searching, else the curated row, with picks kept in view. */
export function useTasteList(f: FirstNight, base: TasteTitle[]): TasteTitle[] {
  return useMemo(() => {
    if (f.results) return f.results;
    const keys = new Set(base.map((t) => t.key));
    return [...f.picks.filter((p) => !keys.has(p.key)), ...base];
  }, [f.results, f.picks, base]);
}

export function ServiceToggle({ p, on, onToggle }: { p: ServiceChoice; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-primary bg-primary-soft text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-card">{p.logo && <Image src={p.logo} alt="" fill sizes="32px" className="object-cover" />}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
      <span aria-hidden className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
        {on && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}

const POPULAR_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'PH', 'IN', 'DE', 'JP'];

/** The region stated as a fact, with a searchable list behind Change. */
export function RegionFact({ f, countries }: { f: FirstNight; countries: { code: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return countries.filter((c) => POPULAR_COUNTRIES.includes(c.code) && c.code !== f.region);
    return countries.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle).slice(0, 40);
  }, [q, countries, f.region]);
  const origin = f.detectedRegion && f.region === f.detectedRegion ? 'From your connection. Only used for availability.' : f.detectedRegion ? 'Chosen by you.' : 'Suggested. Change it if you’re watching from somewhere else.';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-card font-mono text-sm font-semibold text-foreground">{f.region}</span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold leading-snug text-foreground">{f.regionName}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin size={12} aria-hidden className="shrink-0" />
            {origin}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          <input
            type="search"
            autoFocus
            aria-label="Search countries"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a country"
            className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {list.length === 0 && <p className="text-sm text-muted-foreground">No country matches “{q.trim()}”.</p>}
            {list.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  f.setRegion(c.code);
                  setOpen(false);
                  setQ('');
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs text-foreground">{c.code}</span>
                <span className="max-w-48 truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A tear line: a notch punched at each edge, dashes between. `notch` = the surface behind. */
export function Tear({ notch = 'bg-background' }: { notch?: string }) {
  return (
    <span aria-hidden className="relative block h-0">
      <span className={cn('absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border border-border', notch)} />
      <span className={cn('absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full border border-border', notch)} />
      <span className="absolute inset-x-4 top-0 border-t border-dashed border-border" />
    </span>
  );
}

/** While the pool builds (the first one can take a few seconds). */
function TicketPrinting({ region }: { region: string }) {
  return (
    <div role="status" className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[16/9] animate-pulse bg-background" />
      <div className="flex flex-col gap-3 p-4">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Printing your ticket
        </p>
        <p className="text-sm text-muted-foreground">Finding something from your picks that’s streaming in {region} tonight.</p>
      </div>
    </div>
  );
}

/**
 * Tonight's ticket: picture, kicker, Anton title, meta, the reason in an
 * accent-ruled line, a tear, the stub with name, venue, screen and seat.
 * Prints in once (slide + unclip), or simply appears with reduced motion.
 */
export function TicketReveal({ f, notch = 'bg-background' }: { f: FirstNight; notch?: string }) {
  if (!f.tickets) return <TicketPrinting region={f.regionName} />;
  const t = f.ticket;
  if (!t) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Kicker>Tonight · {f.region}</Kicker>
        <p className="mt-3 text-lg font-semibold text-foreground">Nothing we’d bet on is streaming in {f.regionName} yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Your picks are saved. For You keeps looking, and tells you when one lands on a service you have.</p>
        <Link href="/for-you" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:underline">
          Go to For You <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    );
  }
  const seat = seatFor(f.username || f.name || 'guest');
  const meta = [t.mediaType === 'tv' ? 'Series' : 'Film', t.year, formatRuntime(t.runtime)].filter(Boolean).join(' · ');
  return (
    <article key={t.key} aria-label={`Tonight's feature: ${t.title}`} className="relative rounded-xl border border-border bg-card motion-safe:animate-[ticket-print_420ms_cubic-bezier(0.2,0.8,0.2,1)]">
      <div className="overflow-hidden rounded-t-xl">
        <div className="relative aspect-[16/9] bg-background">
          {(t.backdrop ?? t.poster) && <Image src={(t.backdrop ?? t.poster)!} alt="" fill sizes="(max-width: 640px) 100vw, 440px" className={cn('object-cover', !t.backdrop && 'object-top')} priority />}
          <span className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
          <span className="absolute left-4 top-4 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Tonight&apos;s feature · Admit one</span>
          <h2 className="type-display absolute inset-x-0 bottom-0 px-4 pb-3 text-4xl text-white sm:text-5xl">{t.title}</h2>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
        <p className="text-sm text-muted-foreground">{meta}</p>
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          {t.serviceLogo && (
            <span className="relative h-6 w-6 overflow-hidden rounded">
              <Image src={t.serviceLogo} alt="" fill sizes="24px" />
            </span>
          )}
          On {t.service} in {f.regionName}
        </p>
        {t.why && <p className="border-l-2 border-primary pl-2.5 text-sm italic text-foreground/85">{t.why}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link
            href={t.href}
            onClick={() => trackOnboarding('ticket_opened', { key: t.key, source: f.tickets?.source ?? null })}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            Watch tonight <ArrowRight size={16} aria-hidden />
          </Link>
          {f.canReroll && (
            <button
              type="button"
              onClick={f.reroll}
              className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RefreshCw size={14} aria-hidden /> Seen it, next
            </button>
          )}
        </div>
      </div>
      <Tear notch={notch} />
      <div className="flex flex-col gap-1 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        <span className="truncate">Admit one · {f.name}</span>
        <span>
          {f.region} · {t.service} · Row {seat.row} · Seat {seat.seat}
        </span>
      </div>
      <style>{'@keyframes ticket-print{from{transform:translateY(24px);clip-path:inset(0 0 100% 0)}to{transform:none;clip-path:inset(0 0 0 0)}}'}</style>
    </article>
  );
}
