'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Globe, Lock, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { buildImageUrl } from '@/lib/tmdb';
import { addToWatchlistAction, createWatchlistAction } from '@/actions/watchlists';
import type { SearchResponse, SearchResponseItem } from '@/types/tmdb';

// New watchlist: name (with starter ideas), description, who can see it,
// and up to three starter titles that are added right after the list is
// created, so a new list doesn't open empty.

const NAME_MAX = 80;
const STARTERS = ['Weekend picks', 'Comfort rewatches', 'Watch with friends', 'Date night', 'Before it leaves'];
const SEED_MAX = 3;

type Seed = Pick<SearchResponseItem, 'id' | 'mediaType' | 'title' | 'year' | 'posterPath'>;

export function CreateWatchlistModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      {/* Remount per open so every open starts clean. */}
      {isOpen && <CreateListForm onClose={onClose} />}
    </Modal>
  );
}

function CreateListForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const trimmed = name.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      const created = await createWatchlistAction({ name: trimmed, description: description.trim(), isPublic });
      for (const s of seeds) await addToWatchlistAction(created.id, s.mediaType, String(s.id));
      toast.success('Watchlist created', seeds.length ? `"${created.name}" starts with ${seeds.length} title${seeds.length > 1 ? 's' : ''}.` : `"${created.name}" is ready.`);
      router.push(`/watchlists/${created.id}`);
    } catch {
      toast.error('Could not create watchlist', 'Please try again.');
      setPending(false);
    }
  };

  const fields = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="new-list-name" className="text-sm font-medium text-foreground">Name</label>
          <span className={cn('font-mono text-[11px] tabular-nums', name.length > NAME_MAX - 10 ? 'text-foreground' : 'text-muted-foreground')}>
            {name.length}/{NAME_MAX}
          </span>
        </div>
        <input
          id="new-list-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          autoFocus
          required
          placeholder="Name your list"
          className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Name ideas">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setName(s)}
              className={cn(
                'rounded-sm border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                name === s ? 'border-primary text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-list-desc" className="text-sm font-medium text-foreground">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="new-list-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="What ties these titles together?"
          className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-foreground">Who can see it</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              [false, Lock, 'Private', 'Only you'],
              [true, Globe, 'Public', 'Anyone with the link'],
            ] as const
          ).map(([value, Icon, label, hint]) => (
            <label
              key={label}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-md border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                isPublic === value ? 'border-primary bg-primary-soft' : 'border-border hover:border-foreground/30',
              )}
            >
              <input type="radio" name="visibility" className="sr-only" checked={isPublic === value} onChange={() => setIsPublic(value)} />
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );

  const actions = (
    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button type="submit" disabled={!trimmed || pending} className="gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {seeds.length ? `Create with ${seeds.length} title${seeds.length > 1 ? 's' : ''}` : 'Create list'}
      </Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 p-6">
      <div className="pr-8">
        <h2 className="text-lg font-bold text-foreground">New watchlist</h2>
        <p className="text-sm text-muted-foreground">
          Name it, then add a few titles to start it off.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {fields}
        <SeedPicker seeds={seeds} onChange={setSeeds} />
      </div>

      {actions}
    </form>
  );
}

/** Search + pick up to three starter titles (added right after create). */
function SeedPicker({ seeds, onChange }: { seeds: Seed[]; onChange: (s: Seed[]) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<Seed[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/v1/tmdb/search?q=${encodeURIComponent(debounced)}&type=all`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SearchResponse>) : Promise.reject()))
      .then((data) => {
        setResults(
          data.results
            .filter((r) => r.posterPath)
            .slice(0, 6)
            .map(({ id, mediaType, title, year, posterPath }) => ({ id, mediaType, title, year, posterPath })),
        );
        setLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResults([]);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [debounced]);

  const has = (s: Seed) => seeds.some((x) => x.id === s.id && x.mediaType === s.mediaType);
  const toggle = (s: Seed) =>
    onChange(has(s) ? seeds.filter((x) => !(x.id === s.id && x.mediaType === s.mediaType)) : seeds.length < SEED_MAX ? [...seeds, s] : seeds);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-foreground">Start with titles <span className="font-normal text-muted-foreground">(optional)</span></p>
        <span className="font-mono text-[11px] text-muted-foreground">{seeds.length}/{SEED_MAX}</span>
      </div>

      {/* Picked: the list's future cover */}
      <div className="flex gap-2">
        {Array.from({ length: SEED_MAX }).map((_, i) => {
          const s = seeds[i];
          const src = s ? buildImageUrl(s.posterPath, 'w185') : null;
          return (
            <div key={i} className="relative aspect-2/3 w-16 overflow-hidden rounded-sm border border-dashed border-border bg-background">
              {src && <Image src={src} alt={s!.title} fill sizes="64px" className="object-cover" />}
              {s && (
                <button
                  type="button"
                  onClick={() => toggle(s)}
                  aria-label={`Remove ${s.title}`}
                  className="absolute right-0.5 top-0.5 rounded-sm bg-background/90 p-0.5 text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <label className="relative">
        <span className="sr-only">Search titles</span>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          placeholder="Search movies and shows"
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-busy={loading}>
        {loading && <li className="px-1 py-2 text-xs text-muted-foreground">Searching…</li>}
        {!loading && results?.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">No matches.</li>}
        {!loading &&
          results?.map((r) => {
            const picked = has(r);
            const full = !picked && seeds.length >= SEED_MAX;
            return (
              <li key={`${r.mediaType}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => toggle(r)}
                  disabled={full}
                  aria-pressed={picked}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm px-1.5 py-1.5 text-left hover:bg-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    picked && 'bg-secondary',
                  )}
                >
                  <span className="relative aspect-2/3 w-8 shrink-0 overflow-hidden rounded-sm bg-card">
                    <Image src={buildImageUrl(r.posterPath, 'w92')!} alt="" fill sizes="32px" className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{[r.mediaType === 'tv' ? 'Series' : 'Film', r.year].filter(Boolean).join(' · ')}</span>
                  </span>
                  <Plus className={cn('h-4 w-4 shrink-0', picked ? 'rotate-45 text-foreground' : 'text-muted-foreground')} />
                </button>
              </li>
            );
          })}
        {!debounced && <li className="px-1 py-2 text-xs text-muted-foreground">Seeding a list makes it easier to come back to.</li>}
      </ul>
    </div>
  );
}
