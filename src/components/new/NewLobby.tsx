'use client';

import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import { getCountryName } from '@/lib/regions/countries';
import type { NewFeed, NewFilm } from '@/services/newReleases';
import { FilmBoard, FilmLinks, Guide, Kicker, dayLong, filmDay, filmGroups, useEpisodeNames, weekSummary } from './parts';

// New & Coming Soon · "The Lobby". Up top, a backlit lightbox marquee bills
// the week's lead opening, its still showing through like a transparency on
// a light table. Below, two boards (?tab=): Arrivals (films, split-flap
// letters, rows that open into the film) and the Timetable (TV, days
// across, channels down).

/** The week's lead: your saved film opening soonest, else the first opening with a still, else the newest out. */
function leadFilm(feed: NewFeed): NewFilm | null {
  const upcoming = feed.films.filter((f) => f.date >= feed.today).sort((a, b) => a.date.localeCompare(b.date));
  return upcoming.find((f) => f.pinned) ?? upcoming.find((f) => f.backdrop) ?? feed.films.find((f) => f.backdrop) ?? feed.films[0] ?? null;
}

/** Black letters slotted into a white lightbox. */
function Marquee({ film, today }: { film: NewFilm; today: string }) {
  const when = filmDay(film, today);
  return (
    <section aria-label={`Now booking: ${film.title}`} className="rounded-2xl bg-black p-2 ring-1 ring-border">
      <div className="relative overflow-hidden rounded-xl bg-white">
        {film.backdrop && (
          <span aria-hidden className="absolute inset-0">
            <Image src={film.backdrop} alt="" fill priority sizes="(min-width: 1024px) 1100px, 100vw" className="object-cover opacity-25 mix-blend-multiply grayscale" />
          </span>
        )}
        {/* The board's slotted rails. */}
        <span aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,rgb(0_0_0/0.07)_27px,rgb(0_0_0/0.07)_28px)]" />
        <div className="relative grid gap-6 p-5 text-black sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-black/60">
              Now booking · {film.pinned ? 'from your watchlist' : film.date < today ? 'now showing' : 'this week'} · {when}
            </p>
            <h2 className="type-display text-6xl leading-[0.9] sm:text-8xl">{film.title.toUpperCase()}</h2>
            {film.director && <p className="type-display text-2xl text-black/65 sm:text-3xl">{`A film by ${film.director}`.toUpperCase()}</p>}
            {film.overview && <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-black/75">{film.overview}</p>}
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <span className="rounded border border-black/40 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
              {film.where} · <time dateTime={film.date}>{dayLong(film.date)}</time>
            </span>
            <span className="flex flex-wrap gap-2">
              <FilmLinks film={film} onLight />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function NewLobby({ feed }: { feed: NewFeed }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get('tab') === 'tv' ? 'tv' : 'films';
  const names = useEpisodeNames();
  const summary = weekSummary(feed);
  const lead = leadFilm(feed);
  const groups = filmGroups(feed);
  const country = getCountryName(feed.region) ?? feed.region;

  const go = (t: 'films' | 'tv') => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', t);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-2">
        <Kicker>The lobby · {country}</Kicker>
        <h1 className="type-display text-6xl text-foreground sm:text-7xl">New &amp; coming soon</h1>
        {summary && <p className="max-w-xl border-l-2 border-primary pl-3 text-sm italic text-foreground/85">{summary}</p>}
      </header>

      {lead && <Marquee film={lead} today={feed.today} />}

      <div role="tablist" aria-label="Board" className="flex items-end gap-6 border-b border-border">
        {(['films', 'tv'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => go(t)}
            className={cn('-mb-px cursor-pointer border-b-2 pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            <span className="type-display text-3xl">{t === 'films' ? 'Arrivals' : 'Timetable'}</span>
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em]">{t === 'films' ? 'Films' : 'TV'}</span>
          </button>
        ))}
      </div>

      {tab === 'films' ? (
        groups.length ? (
          <FilmBoard
            id={`arrivals-${feed.region}`}
            groups={groups}
            today={feed.today}
            caption={
              <>
                <span>Arrivals · {country}</span>
                <span className="hidden sm:inline">Due · title · arriving from · platform</span>
              </>
            }
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No release dates in {country} for the next few weeks yet.</p>
        )
      ) : (
        <section className="flex flex-col gap-3" aria-label="Timetable">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Air days in {country}, with streaming drops on the services there. Days only; times vary.</p>
            {names.toggle}
          </div>
          <Guide feed={feed} showNames={names.show} />
        </section>
      )}
    </div>
  );
}
