import React from 'react';
// NOTE: <AuthProviders /> intentionally unmounted — see SignInCard.tsx
// for context. Re-add the import + mount under the form to bring back
// the Continue-with-Google button once OAuth is wired.
import { AuthFormSignUp } from './AuthFormSignUp';
import Link from 'next/link';
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';

export function SignUpCard() {
  return (
    <div className="w-full max-w-[400px] flex flex-col items-center gap-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Create an account
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Join Watchly to track your movies, sync watchlists, and get personalized
          recommendations.
        </p>
      </div>

      <div className="w-full bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20">
        <AuthFormSignUp />
      </div>

      <p className="text-xs text-center text-muted-foreground max-w-xs">
        By continuing, you agree to our{' '}
        <Link
          href={EXTERNAL_PATHS.BUSINESS.TERMS_OF_SERVICE}
          className="underline hover:text-foreground transition-colors"
        >
          Terms
        </Link>{' '}
        and{' '}
        <Link
          href={PATHS.BUSINESS.PRIVACY_POLICY}
          className="underline hover:text-foreground transition-colors"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
