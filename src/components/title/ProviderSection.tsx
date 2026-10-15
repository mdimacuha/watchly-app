import React from "react";
import { Provider } from "@/services/tmdb/title";
import { ProviderBadge } from "@/components/ui/ProviderBadge";
import { getCountryName } from "@/lib/regions/countries";

interface ProviderSectionProps {
  region: string;
  providers: {
    streaming: Provider[];
    rent: Provider[];
    buy: Provider[];
  };
  providerSourceNote:
    | "region_missing"
    | "no_providers"
    | "ok"
    | "fallback_justwatch"
    | "fallback_region";
  justWatchUrl?: string | null;
  fallbackRegion?: string | null;
}

export function ProviderSection({
  region,
  providers,
  providerSourceNote,
  justWatchUrl,
  fallbackRegion,
}: ProviderSectionProps) {
  const countryName = getCountryName(region) || region;
  const fallbackCountryName = fallbackRegion
    ? getCountryName(fallbackRegion) || fallbackRegion
    : null;

  if (providerSourceNote === "region_missing") {
    return (
      <div className="text-muted-foreground text-sm italic py-4">
        No provider data available for {countryName}
      </div>
    );
  }

  if (providerSourceNote === "no_providers") {
    return (
      <div className="text-muted-foreground text-sm italic py-4">
        Currently not available to stream, rent, or buy in {countryName}.
      </div>
    );
  }

  const hasStreaming = providers.streaming.length > 0;
  const hasRent = providers.rent.length > 0;
  const hasBuy = providers.buy.length > 0;

  if (!hasStreaming && !hasRent && !hasBuy) {
    return null;
  }

  const isJustWatchFallback = providerSourceNote === "fallback_justwatch";
  const isRegionFallback =
    providerSourceNote === "fallback_region" && fallbackCountryName;

  // Header reads the user's region for the JustWatch fallback (since JustWatch
  // is region-accurate), but reads the *fallback* region for the TMDB-US case
  // (since the data is no longer about the user's region).
  const headerRegion = isRegionFallback ? fallbackCountryName : countryName;

  return (
    <div className="flex flex-col gap-6 py-4 w-full relative">
      <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/60 border-b border-border/10 pb-2 mb-2 flex items-center justify-between gap-3">
        <span>
          Viewing availability in <span className="text-foreground">{headerRegion}</span>
        </span>
        {isJustWatchFallback &&
          (justWatchUrl ? (
            <a
              href={justWatchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/80 hover:text-foreground normal-case tracking-normal font-normal text-[11px] underline-offset-2 hover:underline"
            >
              via JustWatch ↗
            </a>
          ) : (
            <span className="text-muted-foreground/80 normal-case tracking-normal font-normal text-[11px]">
              via JustWatch
            </span>
          ))}
        {isRegionFallback && (
          <span className="text-muted-foreground/80 normal-case tracking-normal font-normal text-[11px]">
            Not listed for {countryName}
          </span>
        )}
      </div>

      {hasStreaming && (
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Streaming Now On
          </h4>
          <div className="flex flex-wrap gap-2">
            {providers.streaming.map((p) => (
              <ProviderBadge
                key={p.provider_id}
                label={p.provider_name}
                providerId={p.provider_id}
                logoPath={p.logo_path}
                size="md"
              />
            ))}
          </div>
        </div>
      )}

      {(hasRent || hasBuy) && (
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Available Now for Rent/Buy on
          </h4>
          <div className="flex flex-wrap gap-2">
            {/* Combine Rent and Buy, deduplicate by ID */}
            {Array.from(
              new Map(
                [...providers.rent, ...providers.buy].map((p) => [p.provider_id, p])
              ).values()
            ).map((p) => (
              <ProviderBadge
                key={`rentbuy-${p.provider_id}`}
                label={p.provider_name}
                providerId={p.provider_id}
                logoPath={p.logo_path}
                size="md"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
