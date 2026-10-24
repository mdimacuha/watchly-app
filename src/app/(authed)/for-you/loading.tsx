/**
 * For You while the first trailers are picked: the reel's own card, the
 * same size and place (a tall card on desktop, the whole screen on phones),
 * with the trailer, its caption, the title and the action rail as quiet
 * shapes, so the page answers at once and nothing moves when the reel lands.
 */
export default function ForYouLoading() {
  const bar = 'animate-pulse rounded bg-secondary motion-reduce:animate-none';
  return (
    <div
      role="status"
      aria-label="Loading For You"
      className="relative isolate flex h-[calc(100dvh-3.5rem)] items-center justify-center overflow-hidden md:h-dvh md:-ml-(--float-bleed) md:pl-(--float-bleed)"
    >
      <div className="relative h-full w-full md:aspect-[9/16] md:h-[calc(100dvh-2rem)] md:w-auto">
        <div className="theme-dark flex h-full w-full flex-col bg-background md:rounded-2xl md:border md:border-border/60">
          {/* The trailer band and its caption, centred like the reel's. */}
          <div className="flex grow flex-col justify-center gap-3 pt-4">
            <div className="aspect-video w-full animate-pulse bg-secondary motion-reduce:animate-none" />
            <div className="flex items-center justify-between px-4">
              <div className={`${bar} h-3 w-24`} />
              <div className="flex gap-2">
                <div className={`${bar} h-8 w-8 rounded-full`} />
                <div className={`${bar} h-8 w-8 rounded-full`} />
              </div>
            </div>
          </div>
          {/* Reason, title, meta; the action rail on the right. */}
          <div className="flex items-end gap-4 px-4 pb-5">
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`${bar} h-3 w-40`} />
              <div className={`${bar} h-6 w-3/4`} />
              <div className={`${bar} h-3 w-1/2`} />
              <div className={`${bar} h-3 w-5/6`} />
            </div>
            {/* Watchlist and Like, as the reel stacks them. */}
            <div className="flex flex-col gap-2">
              <div className={`${bar} h-10 w-32 rounded-md`} />
              <div className={`${bar} h-10 w-32 rounded-md`} />
            </div>
          </div>
          <p className="pb-3 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Picking trailers for you…</p>
        </div>
      </div>
    </div>
  );
}
