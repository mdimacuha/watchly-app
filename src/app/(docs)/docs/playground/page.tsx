'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PosterCard } from '@/components/watchly/PosterCard';
import { FilterBar } from '@/components/watchly/FilterBar';
import { EmptyState } from '@/components/watchly/EmptyState';
import { Button } from '@/components/ui/button';
import { Search, Heart, Globe, Plus } from 'lucide-react';

export default function PlaygroundPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    '1': true,
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'movies', label: 'Movies' },
    { id: 'tv', label: 'TV Shows' },
    { id: 'action', label: 'Action' },
    { id: 'comedy', label: 'Comedy' },
    { id: 'drama', label: 'Drama' },
    { id: 'scifi', label: 'Sci-Fi' },
    { id: 'horror', label: 'Horror' },
    { id: 'documentary', label: 'Documentary' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="container mx-auto max-w-6xl px-6 py-16 space-y-20">
        <div className="space-y-4">
          <Link href="/docs">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 -ml-4 gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Docs
            </Button>
          </Link>
          <h1 className="text-h1">Watchly V2 UI Playground</h1>
          <p className="text-body-lg text-muted-foreground">
            Interactive demo of core components and states.
          </p>
        </div>

        {/* Section 1: Poster Cards */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">Poster Cards</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-8">
            <PosterCard
              title="Dune: Part Two"
              year="2024"
              genre="Sci-Fi"
              availability={[{ provider_name: 'Max' }, { provider_name: 'Netflix' }, { provider_name: 'Prime' }]}
              isFavorite={favorites['1']}
              onFavoriteToggle={() => toggleFavorite('1')}
              className="w-full max-w-none"
            />
            <PosterCard
              title="The Bear"
              year="2023"
              genre="Drama"
              availability={[{ provider_name: 'Disney+' }]}
              isFavorite={favorites['2']}
              onFavoriteToggle={() => toggleFavorite('2')}
              className="w-full max-w-none"
            />
            <PosterCard
              title="Stranger Things"
              year="2022"
              genre="Horror"
              availability={[{ provider_name: 'Netflix' }]}
              isFavorite={favorites['3']}
              onFavoriteToggle={() => toggleFavorite('3')}
              className="w-full max-w-none"
            />
            <PosterCard
              title="Fallout"
              year="2024"
              genre="Action"
              availability={[{ provider_name: 'Prime' }]}
              isFavorite={favorites['4']}
              onFavoriteToggle={() => toggleFavorite('4')}
              className="w-full max-w-none"
            />
            <PosterCard
              title="Default Placeholder"
              year="2025"
              genre="Mystery"
              className="w-full max-w-none"
            />
          </div>
        </section>

        {/* Section 2: Filter Bar */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">Filter Bar</h2>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Resize window to see responsive behavior (Scroll on Tablet vs Wrap
              on Desktop).
            </p>
            <div className="p-6 border border-border rounded-xl bg-card/20">
              <FilterBar
                filters={filters}
                activeFilterId={activeFilter}
                onSelect={setActiveFilter}
              />
            </div>
          </div>
        </section>

        {/* Section 3: Empty States */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">Empty States</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="border border-border rounded-xl bg-card p-4">
              <EmptyState
                icon={Search}
                title="No results found"
                description="We couldn't find any matches for 'Hyperion'. Try checking your spelling."
                action={<Button variant="secondary">Clear Search</Button>}
              />
            </div>

            <div className="border border-border rounded-xl bg-card p-4">
              <EmptyState
                icon={Heart}
                title="No favorites yet"
                description="Save titles you love to this list for quick access."
                action={
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" /> Browse Popular
                  </Button>
                }
              />
            </div>

            <div className="border border-border rounded-xl bg-card p-4">
              <EmptyState
                icon={Globe}
                title="Not available in your region"
                description="This title isn't currently streaming in the United States."
                action={
                  <Button variant="link" className="text-primary">
                    Check other regions
                  </Button>
                }
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
