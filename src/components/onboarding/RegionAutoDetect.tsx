'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function RegionAutoDetect() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAutoDetect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch Location from IP
      const geoRes = await fetch('/api/geo/ipapi');
      
      if (!geoRes.ok) {
        throw new Error('Could not detect your location. Please try selecting manually.');
      }

      // /api/geo/ipapi goes through handleRoute, which wraps the response
      // as { success, data }. Read the nested countryCode; fall back to
      // the flat shape just in case a future refactor flattens it.
      const geoData = await geoRes.json();
      const countryCode: string | undefined =
        geoData?.data?.countryCode ?? geoData?.countryCode;

      if (!countryCode) {
        throw new Error('Invalid location data received.');
      }

      // 2. Save Preference
      const prefRes = await fetch('/api/me/preferences/region', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          regionCode: countryCode,
          regionSource: 'ip',
        }),
      });

      if (!prefRes.ok) {
        throw new Error('Failed to save your region.');
      }

      // 3. Redirect to Manual (preselected)
      router.push('/onboarding/region/manual');

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
        <MapPin size={32} />
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground">
          We use your IP address to automatically detect your region for accurate streaming availability.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md w-full justify-center">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="w-full space-y-3 pt-2">
        <Button 
          onClick={handleAutoDetect} 
          disabled={isLoading}
          className="w-full h-11"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Detecting...
            </>
          ) : (
            'Auto-detect region'
          )}
        </Button>

        <Button
          variant="ghost"
          asChild
          className="w-full text-muted-foreground hover:text-foreground"
        >
          <Link href="/onboarding/region/manual">
            Select manually
          </Link>
        </Button>
      </div>
    </div>
  );
}
