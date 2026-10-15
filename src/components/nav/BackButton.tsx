'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const FALLBACK = '/for-you';

export function BackButton() {
  const router = useRouter();

  const handleBack = () => {
    // If we have a same-origin referrer, use browser back navigation.
    // Otherwise fall back to a known safe route.
    if (
      typeof document !== 'undefined' &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin
    ) {
      router.back();
    } else {
      router.push(FALLBACK);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    >
      <ArrowLeft size={18} />
      <span>Back</span>
    </button>
  );
}
