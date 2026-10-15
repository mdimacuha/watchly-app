import React from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { buildImageUrl } from "@/lib/tmdb";
import {
  PROVIDER_STYLE_OVERRIDES,
  PROVIDER_KEY_OVERRIDES,
  PROVIDER_STYLE_PALETTE,
  ProviderStyle,
} from "@/constants/providerStyles";

interface ProviderBadgeProps {
  providerId?: number;
  providerKey?: string;
  label: string;
  /**
   * Optional TMDB logo path (e.g. "/xyz.jpg"). When present, the badge renders
   * the branded provider logo in a consistent-sized tile. When absent, it falls
   * back to the colored text pill. Kept optional so callers without logo data
   * (e.g. person credits) keep working.
   */
  logoPath?: string | null;
  size?: "sm" | "md";
  className?: string;
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[+]/g, "-plus")
    .replace(/[^\w\s-]/g, "") // remove punctuation
    .replace(/\s+/g, "-");
}

function resolveStyle(id?: number, key?: string): ProviderStyle {
  // 1. Try ID override
  if (id && PROVIDER_STYLE_OVERRIDES[id]) {
    return PROVIDER_STYLE_OVERRIDES[id];
  }

  // 2. Try Key override
  // If key is not provided, try to generate one from label (passed as key usually)
  // But here we assume key is passed or we can't do much.
  if (key && PROVIDER_KEY_OVERRIDES[key]) {
    return PROVIDER_KEY_OVERRIDES[key];
  }

  // 3. Fallback: Deterministic palette
  // Use ID if available, otherwise hash the key
  let seed = 0;
  if (id) {
    seed = id;
  } else if (key) {
    // Simple hash for string
    for (let i = 0; i < key.length; i++) {
      seed = key.charCodeAt(i) + ((seed << 5) - seed);
    }
    seed = Math.abs(seed);
  }

  const index = seed % PROVIDER_STYLE_PALETTE.length;
  return PROVIDER_STYLE_PALETTE[index];
}

export function ProviderBadge({
  providerId,
  providerKey,
  label,
  logoPath,
  size = "sm",
  className,
}: ProviderBadgeProps) {
  // Branded logo tile — preferred when a TMDB logo path is available.
  const logoUrl = logoPath ? buildImageUrl(logoPath, "w92") : null;

  if (logoUrl) {
    return (
      <div
        title={label}
        className={cn(
          // Subtle light-neutral tile + border so colored/dark provider logos
          // stay legible against the dark UI. Fixed square keeps badges uniform.
          "relative shrink-0 overflow-hidden bg-card border border-border shadow-sm",
          size === "sm" ? "h-6 w-6 rounded-md" : "h-8 w-8 rounded-lg",
          className
        )}
      >
        <Image
          src={logoUrl}
          alt={label}
          fill
          sizes={size === "sm" ? "24px" : "32px"}
          className="object-cover"
        />
      </div>
    );
  }

  // Fallback: colored text pill (used when no logo path is available).
  // If no key is provided, normalize the label to use as a fallback key
  const effectiveKey = providerKey || normalizeKey(label);
  const style = resolveStyle(providerId, effectiveKey);

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold tracking-wider uppercase",
        style.bg,
        style.text,
        style.border ? `border ${style.border}` : "border border-transparent",
        size === "sm" ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]",
        className
      )}
    >
      {label}
    </div>
  );
}
