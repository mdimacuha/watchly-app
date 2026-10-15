'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RegionSelector } from '@/components/region/RegionSelector';

interface RegionManualSelectProps {
  initialRegionCode?: string;
}

export function RegionManualSelect({ initialRegionCode }: RegionManualSelectProps) {
  const router = useRouter();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(initialRegionCode || 'US');
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = async () => {
    if (!selectedRegion) return;
    setIsSaving(true);

    try {
      const response = await fetch('/api/me/preferences/region', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regionCode: selectedRegion,
          regionSource: 'manual',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update region');
      }

      router.push('/onboarding/titles');
    } catch (error) {
      console.error(error);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      <RegionSelector
        selectedRegion={selectedRegion}
        onSelect={(code) => setSelectedRegion(code)}
        className="flex-1 min-h-0"
      />

      <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/50">
        <Button
          variant="ghost"
          asChild
          className="text-muted-foreground hover:text-foreground pl-0 hover:bg-transparent"
        >
          <Link href="/onboarding/region/auto" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Back to Auto-detect
          </Link>
        </Button>

        <Button
          onClick={handleContinue}
          disabled={!selectedRegion || isSaving}
          className="bg-primary hover:bg-primary-hover text-white"
        >
          {isSaving ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : null}
          Continue
          {!isSaving && <ArrowRight size={16} className="ml-2" />}
        </Button>
      </div>
    </div>
  );
}
