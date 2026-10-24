/**
 * The cinema letterboard: ruled channels of Anton letters that drop into
 * place (all at once with reduced motion). Hidden from screen readers: the
 * letters are split for the motion, so the page's h1 carries the words.
 * Needs the Anton face loaded (`anton.variable` from @/lib/fonts) on a parent.
 */
export function Letterboard({ lines }: { lines: string[] }) {
  return (
    <div aria-hidden className="rounded-lg bg-black p-2 ring-1 ring-border">
      {/* First, so the last line row stays :last-child (no rule under it). */}
      <style>{'@keyframes board-drop{from{opacity:0;transform:translateY(-60%)}to{opacity:1;transform:none}}'}</style>
      {lines.map((line, li) => (
        <div key={li} className="flex h-24 items-center overflow-hidden border-b border-white/10 px-3 last:border-0 sm:h-28">
          <span key={line} className="type-display whitespace-pre text-7xl text-white sm:text-8xl">
            {line.split('').map((ch, i) => (
              <span key={i} className="inline-block motion-safe:animate-[board-drop_260ms_cubic-bezier(0.2,0.8,0.2,1)_both]" style={{ animationDelay: `${(li * 8 + i) * 30}ms` }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
