import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PosterGridExample } from "@/components/responsive-guidelines/PosterGridExample";
import { NavStateExample } from "@/components/responsive-guidelines/NavStateExample";
import { FilterAdaptationExample } from "@/components/responsive-guidelines/FilterAdaptationExample";

export default function ResponsiveGuidelinesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="container mx-auto max-w-5xl px-6 py-16 space-y-20">
        {/* Header */}
        <div className="space-y-4">
          <Link href="/docs">
            <Button variant="ghost" size="sm" className="mb-4 -ml-4 gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Back to Docs
            </Button>
          </Link>
          <h1 className="text-h1">Responsive Behavior</h1>
          <p className="text-body-lg text-muted-foreground max-w-2xl">
            Adaptation rules for Desktop (Primary) and Tablet environments.
          </p>
        </div>

        {/* Core Breakpoints */}
        <section className="space-y-8">
          <h2 className="text-h2 flex items-center gap-3">
            <span className="text-primary">❑</span> Core Breakpoints
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl bg-card border border-border p-6 flex flex-col justify-between min-h-[140px]">
              <div>
                <h3 className="text-lg font-semibold mb-2">Desktop (Large)</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Full 260px Sidebar visible</li>
                  <li>5-6 Column Poster Grid</li>
                  <li>Filters displayed in Sidebar or Horizontal Bar</li>
                  <li>Modals are centered with backdrop</li>
                </ul>
              </div>
              <div className="mt-4 self-end">
                 <span className="bg-secondary px-2 py-1 rounded text-xs font-mono text-foreground border border-border">
                   &ge; 1280px
                 </span>
              </div>
            </div>

            <div className="rounded-xl bg-card border border-border p-6 flex flex-col justify-between min-h-[140px]">
              <div>
                <h3 className="text-lg font-semibold mb-2">Tablet / Laptop</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Sidebar collapses to Icon Rail (72px)</li>
                  <li>3-4 Column Poster Grid</li>
                  <li>Filters move to drawer/modal or collapsible strip</li>
                  <li>Modals typically become full-width bottom sheets</li>
                </ul>
              </div>
              <div className="mt-4 self-end">
                 <span className="bg-secondary px-2 py-1 rounded text-xs font-mono text-foreground border border-border">
                   768px - 1279px
                 </span>
              </div>
            </div>
          </div>
        </section>

        {/* Grid Fluidity */}
        <section className="space-y-8">
          <h2 className="text-h2 flex items-center gap-3">
            <span className="text-primary">⊞</span> Grid Fluidity
          </h2>
          <p className="text-body-regular text-muted-foreground max-w-3xl">
            Watchly relies heavily on poster grids. We do not set fixed pixel widths for cards. 
            Instead, we use a fluid grid system with min-width constraints.
          </p>
          <PosterGridExample />
        </section>

        {/* Navigation States */}
        <section className="space-y-8">
          <h2 className="text-h2">Navigation States</h2>
          <NavStateExample />
        </section>

        {/* Filter Adaptation */}
        <section className="space-y-8">
          <h2 className="text-h2">Filter Adaptation</h2>
          <div className="rounded-xl bg-black/40 border border-border p-8">
             <FilterAdaptationExample />
          </div>
        </section>

      </div>
    </div>
  );
}
