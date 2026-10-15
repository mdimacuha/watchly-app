'use client';

import { Globe } from 'lucide-react';
import { useRegionStore } from '@/client/stores/region';
import { BackLink } from '@/components/nav/BackLink';
import { RegionSelector } from '@/components/region/RegionSelector';

export default function SettingsRegionPage() {
  const { regionCode, setRegion } = useRegionStore();

  return (
    <div className="px-8 py-10 max-w-md">
      <div className="flex items-center gap-3 mb-2">
        <Globe size={24} className="text-primary" />
        <h1 className="text-h2">Change Region</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Select the region that determines which streaming services and
        availability data you see.
      </p>

      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <RegionSelector
        selectedRegion={regionCode}
        onSelect={(code, name) => setRegion(code, name)}
        className="h-[500px]"
      />
    </div>
  );
}
