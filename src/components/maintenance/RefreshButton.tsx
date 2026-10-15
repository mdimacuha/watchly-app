'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Reloads the current URL via window.location so the root layout
 * re-executes its maintenance check from scratch (not just the React
 * tree). A plain router.refresh() would re-run server components but
 * the maintenance state is cached for 30s — a hard reload skips the
 * stale window.
 */
export function RefreshButton() {
  return (
    <Button
      onClick={() => window.location.reload()}
      className="gap-2 mt-2"
    >
      <RefreshCw className="w-4 h-4" />
      Refresh
    </Button>
  );
}
