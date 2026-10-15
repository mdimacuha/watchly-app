import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorSwatch } from "@/components/design-system/ColorSwatch";
import { TypeRampRow } from "@/components/design-system/TypeRampRow";
import { RadiusCard } from "@/components/design-system/RadiusCard";
import { SpacingBar } from "@/components/design-system/SpacingBar";
import { ElevationCard } from "@/components/design-system/ElevationCard";
import { Separator } from "@/components/ui/separator";

export default function DesignSystemPage() {
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
          <h1 className="text-h1">Watchly V2 Design System</h1>
          <p className="text-body-lg text-muted-foreground max-w-2xl">
            Core design tokens for a cinematic, dark-mode first UI.
          </p>
        </div>

        {/* Color Palette */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">Color Palette</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-12">
            <ColorSwatch
              label="Background"
              variableName="--background"
              hexValue="#09090b"
              colorClass="bg-background"
            />
            <ColorSwatch
              label="Card / Surface"
              variableName="--card"
              hexValue="#18181b"
              colorClass="bg-card"
            />
            <ColorSwatch
              label="Secondary Surface"
              variableName="--secondary"
              hexValue="#27272a"
              colorClass="bg-secondary"
            />
            <ColorSwatch
              label="Primary / Brand"
              variableName="--primary"
              hexValue="#3B4FFF"
              colorClass="bg-primary"
            />
            <ColorSwatch
              label="Border"
              variableName="--border"
              hexValue="#27272a"
              colorClass="bg-border"
            />
            <ColorSwatch
              label="Text Main"
              variableName="--foreground"
              hexValue="#fafafa"
              colorClass="bg-foreground"
            />
            <ColorSwatch
              label="Text Muted"
              variableName="--muted-foreground"
              hexValue="#a1a1aa"
              colorClass="bg-muted-foreground"
            />
            <ColorSwatch
              label="Destructive"
              variableName="--destructive"
              hexValue="#7f1d1d"
              colorClass="bg-destructive"
            />
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">Typography</h2>
          <div className="space-y-2">
            <TypeRampRow
              label="Heading 1"
              specs="32px / 700 / -0.02em"
              className="text-h1"
            />
            <TypeRampRow
              label="Heading 2"
              specs="24px / 600 / -0.02em"
              className="text-h2"
            />
            <TypeRampRow
              label="Heading 3"
              specs="20px / 600 / -0.01em"
              className="text-h3"
            />
            <TypeRampRow
              label="Body Large"
              specs="16px / 400"
              className="text-body-lg"
            />
            <TypeRampRow
              label="Body Regular"
              specs="14px / 400"
              className="text-body-regular"
            />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-baseline py-4 border-b border-border/40 last:border-0">
              <div className="md:col-span-3 flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  Meta / Caption
                </span>
                <span className="text-xs font-mono text-muted-foreground opacity-60">
                  13px / 500
                </span>
              </div>
              <div className="md:col-span-9">
                <span className="text-meta text-muted-foreground uppercase tracking-wide">
                  METADATA LABEL
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Border Radius */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">Border Radius</h2>
          <div className="flex flex-wrap gap-8 items-end">
            <RadiusCard label="sm" value="4px" radiusClass="rounded-sm" />
            <RadiusCard label="md" value="8px" radiusClass="rounded-md" />
            <RadiusCard label="lg" value="12px" radiusClass="rounded-lg" />
            <RadiusCard label="xl" value="16px" radiusClass="rounded-xl" />
            <RadiusCard
              label="pill"
              value="full"
              radiusClass="rounded-pill !w-32"
            />
          </div>
        </section>

        {/* Spacing Scale */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">
            Spacing Scale (4px Grid)
          </h2>
          <div className="space-y-6 max-w-md">
            <SpacingBar label="space-1" value="4px" heightClass="h-1" />
            <SpacingBar label="space-2" value="8px" heightClass="h-2" />
            <SpacingBar label="space-3" value="12px" heightClass="h-3" />
            <SpacingBar label="space-4" value="16px" heightClass="h-4" />
            <SpacingBar label="space-6" value="24px" heightClass="h-6" />
            <SpacingBar label="space-8" value="32px" heightClass="h-8" />
            <SpacingBar label="space-12" value="48px" heightClass="h-12" />
            <SpacingBar label="space-16" value="64px" heightClass="h-16" />
          </div>
        </section>

        {/* Elevation & Surfaces */}
        <section className="space-y-8">
          <h2 className="text-h2 border-b border-border pb-4">
            Elevation & Surfaces
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col gap-4 items-center">
              <ElevationCard
                label="Base Layer"
                className="bg-background shadow-none"
              />
              <span className="text-sm text-muted-foreground">Base Layer</span>
            </div>
            <div className="flex flex-col gap-4 items-center">
              <ElevationCard
                label="Card Surface"
                className="bg-card shadow-elevation-card border-none"
              />
              <span className="text-sm text-muted-foreground">Card Surface</span>
            </div>
            <div className="flex flex-col gap-4 items-center">
              <ElevationCard
                label="Interactive / Input"
                className="bg-secondary/50 shadow-elevation-input border-transparent"
              />
              <span className="text-sm text-muted-foreground">
                Interactive / Input
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
