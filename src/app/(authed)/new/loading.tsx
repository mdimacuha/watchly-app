/**
 * New & Coming Soon while the feed builds: the lobby's shape at its final
 * size (title, marquee, board), so the page answers at once and nothing
 * jumps when the feed lands. Only a country's very first visit waits long.
 */
export default function NewLoading() {
  const bar = 'animate-pulse rounded bg-secondary motion-reduce:animate-none';
  return (
    <div role="status" aria-label="Loading New & Coming Soon" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8">
      <div className="flex flex-col gap-3">
        <div className={`${bar} h-3 w-40`} />
        <div className={`${bar} h-14 w-full max-w-xl sm:h-16`} />
        <div className={`${bar} h-4 w-72`} />
      </div>
      <div className={`${bar} h-56 rounded-2xl sm:h-64`} />
      <div className="flex gap-6 border-b border-border pb-2">
        <div className={`${bar} h-8 w-32`} />
        <div className={`${bar} h-8 w-32`} />
      </div>
      <div className="flex flex-col gap-1 rounded-xl bg-card p-2 ring-1 ring-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${bar} h-12`} />
        ))}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Setting up the lobby…</span>
    </div>
  );
}
