'use client';

import { motion } from 'framer-motion';
import { useRegionStore } from '@/client/stores/region';
import { useAuthStore } from '@/client/stores/auth';
import { RegionSelector } from './RegionSelector';
import { useToast } from '@/hooks/useToast';

interface RegionPickerProps {
  onClose: () => void;
}

export function RegionPicker({ onClose }: RegionPickerProps) {
  const { regionCode, setRegion } = useRegionStore();
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const toast = useToast();

  const handleSelect = (code: string, name: string) => {
    setRegion(code, name);
    onClose();

    // Unauthenticated visitors only need the cookie (written by setRegion).
    // Signed-in users also persist the pick to the server-side preference.
    if (!isAuthenticated) {
      toast.success('Region updated', `Now showing availability for ${name}.`);
      return;
    }

    const request = fetch('/api/me/preferences/region', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionCode: code, regionSource: 'manual' }),
    }).then((res) => {
      if (!res.ok) throw new Error('Failed to update region');
      return res;
    });

    toast
      .promise(request, {
        loading: { title: 'Updating region...', description: 'Saving your new region preference.' },
        success: () => ({ title: 'Region updated', description: 'Your new region preference has been saved.' }),
        error: () => ({ title: 'Failed to update region', description: 'Could not save your preference. Please try again.' }),
      })
      .catch(() => {
        // handled by toast
      });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="w-72 max-h-[420px] rounded-lg border border-border/50 bg-card shadow-lg overflow-hidden"
    >
      <RegionSelector
        selectedRegion={regionCode}
        onSelect={handleSelect}
        className="h-[420px] p-3"
      />
    </motion.div>
  );
}
