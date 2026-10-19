import { cn } from "@/lib/cn";

interface NotInRegionPillProps {
  size?: "sm" | "md";
  className?: string;
}

/**
 * Muted stand-in for the provider pills when a title was checked and has no
 * availability in the user's region. Same shape as ProviderBadge's text pill.
 */
export function NotInRegionPill({ size = "sm", className }: NotInRegionPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-border bg-transparent font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
        size === "sm" ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]",
        className
      )}
    >
      Not in your region
    </span>
  );
}
