export default function Loading() {
  return (
    <div className="relative w-full min-h-screen overflow-hidden bg-background">
      {/* Background Placeholder */}
      <div className="absolute inset-0 z-0 bg-muted/10 animate-pulse" />
      
      <div className="relative z-10 container mx-auto px-4 py-8 md:py-12 flex flex-col md:flex-row gap-8 items-start">
        {/* Poster Skeleton */}
        <div className="w-full max-w-[300px] shrink-0 mx-auto md:mx-0 shadow-lg rounded-lg overflow-hidden border border-border/10 bg-muted/20 animate-pulse">
          <div className="aspect-[2/3] w-full" />
        </div>

        {/* Info Column Skeleton */}
        <div className="flex-1 w-full space-y-8">
          {/* Title & Meta */}
          <div className="space-y-4">
            <div className="h-10 md:h-12 w-3/4 bg-muted/20 rounded animate-pulse" />
            <div className="flex gap-4">
              <div className="h-5 w-16 bg-muted/20 rounded animate-pulse" />
              <div className="h-5 w-12 bg-muted/20 rounded animate-pulse" />
              <div className="h-5 w-20 bg-muted/20 rounded animate-pulse" />
            </div>
            <div className="flex gap-2 pt-1">
              <div className="h-6 w-20 bg-muted/20 rounded-full animate-pulse" />
              <div className="h-6 w-24 bg-muted/20 rounded-full animate-pulse" />
              <div className="h-6 w-16 bg-muted/20 rounded-full animate-pulse" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <div className="h-10 w-40 bg-muted/20 rounded animate-pulse" />
            <div className="h-10 w-10 bg-muted/20 rounded animate-pulse" />
            <div className="h-10 w-10 bg-muted/20 rounded animate-pulse" />
          </div>

          {/* Providers */}
          <div className="h-32 w-full bg-muted/10 rounded-lg animate-pulse border border-white/5" />

          {/* Overview */}
          <div className="space-y-2 max-w-3xl">
            <div className="h-4 w-full bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-full bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-muted/20 rounded animate-pulse" />
          </div>

          {/* Cast Row */}
          <div className="space-y-4 pt-4">
            <div className="h-6 w-32 bg-muted/20 rounded animate-pulse" />
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-[120px] shrink-0 space-y-2">
                  <div className="aspect-[2/3] w-full rounded-md bg-muted/20 animate-pulse" />
                  <div className="h-4 w-3/4 bg-muted/20 rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-muted/20 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
