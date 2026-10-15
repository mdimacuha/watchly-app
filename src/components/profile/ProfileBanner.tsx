import Image from 'next/image';
import { cn } from '@/lib/cn';

interface ProfileBannerProps {
  /** Up to 5 absolute poster URLs to layer in the collage. */
  posters: string[];
  className?: string;
}

/**
 * Cinematic banner derived from the user's top favorite posters. Stacks
 * each poster as an `object-cover` fill across a horizontal band, applies
 * a heavy CSS blur + saturation bump, then overlays a fade-to-background
 * gradient so the rest of the page reads cleanly underneath.
 *
 * Renders nothing when there are no posters — the page falls back to the
 * plain `--primary` accent strip.
 */
export function ProfileBanner({ posters, className }: ProfileBannerProps) {
  if (posters.length === 0) return null;

  return (
    <div
      className={cn(
        // Only the top corners are rounded — the bottom is flush against
        // the profile Card that sits immediately below, so they read as
        // one connected surface.
        'relative w-full h-[180px] md:h-[240px] overflow-hidden rounded-t-xl',
        className,
      )}
    >
      {/* Poster strip — equal-width columns. CSS grid keeps spacing
          deterministic regardless of how many posters were resolved. */}
      <div
        className="absolute inset-0 grid h-full"
        style={{
          gridTemplateColumns: `repeat(${posters.length}, minmax(0, 1fr))`,
        }}
      >
        {posters.map((src, i) => (
          <div key={i} className="relative h-full w-full">
            <Image
              src={src}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 1024px"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {/* Blur + saturation overlay. Backdrop-filter so the underlying
          posters stay crisp on browsers that don't support it. */}
      <div className="absolute inset-0 backdrop-blur-sm backdrop-saturate-150 bg-background/30" />

      {/* Primary-tint wash. The card directly below takes care of the
          visual transition, so no fade-to-background gradient here. */}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-50"
        style={{ backgroundColor: 'var(--primary)' }}
      />
    </div>
  );
}
