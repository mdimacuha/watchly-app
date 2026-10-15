'use client';

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/client/stores/ui';

interface QuickViewButtonProps {
  mediaType: 'movie' | 'tv';
  id: string;
  className?: string;
}

/**
 * Opens the global Quick View popup for a title. Stops the click from
 * triggering a surrounding card link so it works as a card overlay action.
 */
export function QuickViewButton({ mediaType, id, className }: QuickViewButtonProps) {
  const openQuickView = useUIStore((s) => s.openQuickView);

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openQuickView(mediaType, id);
      }}
      aria-label="Quick view"
      title="Quick view"
      className={className}
    >
      <Eye className="w-5 h-5" />
    </Button>
  );
}
