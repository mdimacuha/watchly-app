import Link from 'next/link';
import React from 'react';
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';

export function LandingFooter() {
  return (
    <footer className="py-12 border-t border-white/5">
      <div className="container mx-auto px-6 flex flex-col items-center gap-4 text-center">
        {/* Shared legal / contact links — mirror the sidebar footer cluster. */}
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground"
        >
          <Link
            href={EXTERNAL_PATHS.BUSINESS.TERMS_OF_SERVICE}
            className="hover:text-foreground transition-colors"
          >
            Terms
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link
            href={PATHS.BUSINESS.PRIVACY_POLICY}
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <a
            href={PATHS.BUSINESS.CONTACT}
            className="hover:text-foreground transition-colors"
          >
            Feedback
          </a>
        </nav>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Watchly. All rights reserved. Powered by{' '}
          <Link
            href="https://dayonelabs.co"
            className="text-primary hover:underline"
          >
            Day One Labs
          </Link>
        </p>
      </div>
    </footer>
  );
}
