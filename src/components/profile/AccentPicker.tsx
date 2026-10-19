'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  ACCENTS,
  ACCENT_SLUGS,
  getAccent,
  hexToRgb,
  isAccentSlug,
  normalizeAccentHex,
  rgbToHex,
  type AccentColor,
} from '@/constants/accentColors';

// Accent picker: the presets, plus a custom colour from a colour wheel
// (angle = hue, distance from centre = saturation), a brightness slider and
// a hex field. Custom colours are normalized (#RRGGBB, lightness kept
// readable on the dark UI); the field says when that adjusted the pick.
// `onPreview` fires while dragging; `onCommit` once a choice settles.

const DEFAULT_HEX = ACCENTS.blue.primary;
const WHEEL = 168;

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const [r, g, b] = (hexToRgb(hex) ?? [59, 79, 255]).map((n) => n / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): `#${string}` {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return rgbToHex(f(5), f(3), f(1));
}

export function AccentPicker({
  value,
  onPreview,
  onCommit,
  className,
  defaultCustomOpen = false,
  wheelSize = WHEEL,
  stacked = false,
}: {
  value: AccentColor | null;
  /** Live while dragging (recolour the preview). */
  onPreview: (next: AccentColor | null) => void;
  /** A settled choice (save). */
  onCommit: (next: AccentColor | null) => void;
  className?: string;
  /** Start with the custom panel open (e.g. in a dedicated dialog). */
  defaultCustomOpen?: boolean;
  /** Wheel diameter in px. */
  wheelSize?: number;
  /** Narrow spaces: put the controls beside a smaller wheel without wrapping. */
  stacked?: boolean;
}) {
  const isCustom = !!value && !isAccentSlug(value);
  const currentHex = getAccent(value)?.primary ?? DEFAULT_HEX;
  const [customOpen, setCustomOpen] = useState(defaultCustomOpen);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(currentHex));
  const [hexDraft, setHexDraft] = useState(currentHex);
  const [hexError, setHexError] = useState<string | null>(null);
  // The raw pick before normalizing, to tell the user when it was adjusted.
  const [rawPick, setRawPick] = useState<string | null>(null);
  const dragging = useRef(false);

  const fromHsv = (next: Hsv, commit: boolean) => {
    setHsv(next);
    const raw = hsvToHex(next);
    const normalized = normalizeAccentHex(raw)!;
    setRawPick(raw);
    setHexDraft(normalized);
    setHexError(null);
    (commit ? onCommit : onPreview)(normalized);
  };

  const wheelPoint = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const h = (Math.atan2(y, x) * 180) / Math.PI + 90;
    const s = Math.min(1, Math.hypot(x, y) / (rect.width / 2));
    fromHsv({ h: (h + 360) % 360, s, v: hsv.v }, commit);
  };

  const onWheelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 15 : 5;
    const next =
      e.key === 'ArrowLeft'
        ? { ...hsv, h: (hsv.h - step + 360) % 360 }
        : e.key === 'ArrowRight'
          ? { ...hsv, h: (hsv.h + step) % 360 }
          : e.key === 'ArrowUp'
            ? { ...hsv, s: Math.min(1, hsv.s + step / 100) }
            : e.key === 'ArrowDown'
              ? { ...hsv, s: Math.max(0, hsv.s - step / 100) }
              : null;
    if (!next) return;
    e.preventDefault();
    fromHsv(next, true);
  };

  const commitHex = () => {
    const normalized = normalizeAccentHex(hexDraft);
    if (!normalized) {
      setHexError('Use 6 hex digits, like #E4572E');
      return;
    }
    setHexError(null);
    setRawPick(hexDraft.startsWith('#') ? hexDraft.toUpperCase() : `#${hexDraft.toUpperCase()}`);
    setHexDraft(normalized);
    setHsv(hexToHsv(normalized));
    onCommit(normalized);
  };

  const pickPreset = (next: AccentColor | null) => {
    const hex = getAccent(next)?.primary ?? DEFAULT_HEX;
    setHsv(hexToHsv(hex));
    setHexDraft(hex);
    setRawPick(null);
    setHexError(null);
    onCommit(next);
  };

  // Handle position on the wheel.
  const rad = ((hsv.h - 90) * Math.PI) / 180;
  const hx = wheelSize / 2 + Math.cos(rad) * hsv.s * (wheelSize / 2);
  const hy = wheelSize / 2 + Math.sin(rad) * hsv.s * (wheelSize / 2);
  const pureHue = hsvToHex({ h: hsv.h, s: hsv.s, v: 1 });
  const adjusted = rawPick && normalizeAccentHex(rawPick) !== rawPick.toUpperCase();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
        <Swatch label="Watchly default" color={DEFAULT_HEX} active={value === null} onClick={() => pickPreset(null)} />
        {ACCENT_SLUGS.map((slug) => (
          <Swatch key={slug} label={ACCENTS[slug].name} color={ACCENTS[slug].primary} active={value === slug} onClick={() => pickPreset(slug)} />
        ))}
        <button
          type="button"
          aria-expanded={customOpen}
          aria-pressed={isCustom}
          onClick={() => setCustomOpen((v) => !v)}
          title="Custom colour"
          className={cn(
            'relative h-7 w-7 rounded-full cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isCustom && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
          )}
          style={{ background: 'conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        >
          <span
            className="absolute inset-[5px] rounded-full border border-black/20"
            style={{ background: isCustom ? currentHex : 'var(--card)' }}
          />
          <span className="sr-only">Custom colour</span>
        </button>
      </div>

      {customOpen && (
        <div className={cn('flex items-start gap-5 rounded-lg border border-border bg-card p-4', stacked ? 'gap-4' : 'flex-wrap')}>
          {/* Wheel: hue around, saturation outwards (at full brightness). */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Colour wheel. Left and right change hue, up and down change saturation."
            aria-valuetext={hexDraft}
            aria-valuenow={Math.round(hsv.h)}
            aria-valuemin={0}
            aria-valuemax={360}
            onKeyDown={onWheelKey}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              wheelPoint(e, false);
            }}
            onPointerMove={(e) => dragging.current && wheelPoint(e, false)}
            onPointerUp={(e) => {
              if (!dragging.current) return;
              dragging.current = false;
              wheelPoint(e, true);
            }}
            className="relative shrink-0 touch-none rounded-full cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            style={{
              width: wheelSize,
              height: wheelSize,
              background:
                'radial-gradient(circle closest-side, #fff, transparent), conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
          >
            {/* Brightness dims the whole wheel, like the colour it makes. */}
            <span className="pointer-events-none absolute inset-0 rounded-full bg-black" style={{ opacity: 1 - hsv.v }} />
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ left: hx, top: hy, background: hexDraft }}
            />
          </div>

          <div className={cn('flex flex-1 flex-col gap-4', stacked ? 'min-w-0' : 'min-w-[180px]')}>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Brightness
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(hsv.v * 100)}
                onChange={(e) => fromHsv({ ...hsv, v: Number(e.target.value) / 100 }, false)}
                onPointerUp={() => onCommit(normalizeAccentHex(hsvToHex(hsv)))}
                onKeyUp={() => onCommit(normalizeAccentHex(hsvToHex(hsv)))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-black/40 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/40 [&::-webkit-slider-thumb]:bg-white"
                style={{ background: `linear-gradient(to right, #000, ${pureHue})` }}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              Hex
              <span className="flex items-center gap-2">
                <span className="h-8 w-8 shrink-0 rounded-md border border-border" style={{ background: currentHex }} />
                <input
                  type="text"
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value.trim())}
                  onBlur={commitHex}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commitHex())}
                  maxLength={7}
                  spellCheck={false}
                  aria-invalid={!!hexError}
                  className="h-8 w-28 rounded-md border border-input bg-transparent px-2 font-mono text-sm uppercase text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </span>
            </label>
            {hexError ? (
              <p className="text-xs text-destructive">{hexError}</p>
            ) : adjusted ? (
              <p className="text-xs text-muted-foreground">Adjusted to {hexDraft} so it stays readable on dark backgrounds.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Very dark or very light colours are nudged so text stays readable.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Swatch({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
      )}
      style={{ background: color }}
    >
      {active && <Check className="h-3.5 w-3.5 text-white" />}
    </button>
  );
}
