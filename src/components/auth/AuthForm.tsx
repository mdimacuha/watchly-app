'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormInput } from './FormInput';
import { PATHS } from '@/lib/app';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';

export function AuthForm({ redirect }: { redirect?: string }) {
  const searchParams = useSearchParams();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setRegion = useRegionStore((s) => s.setRegion);
  // Prefer the prop (server-rendered), fall back to the URL on the client.
  const redirectTarget = redirect ?? searchParams.get('redirect') ?? undefined;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useEmail, setUseEmail] = useState(true);
  // Default checked: preserves the app's existing always-persistent behavior
  // (users aren't unexpectedly signed out on browser close) and is the
  // friendlier default. Unchecking opts into a shorter browser-session login.
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!identifier || !password) {
      setError(`Invalid ${useEmail ? 'email' : 'username'} or password.`);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/auth/signin', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, rememberMe }),
      });
      const data = await response.json();

      if (response.ok) {
        // Update Zustand store immediately so UI reflects auth state
        setAuthenticated(data.data.user);

        // The account's saved region preference takes precedence over whatever
        // the visitor picked while signed out (cookie/store from the public
        // search). Only override when the account actually has a saved value.
        const accountRegion: string | null = data.data.regionCode ?? null;
        if (accountRegion && accountRegion !== 'unknown') {
          const name = getCountryName(accountRegion) ?? accountRegion;
          setRegion(accountRegion, name);
        }

        // Only accept same-origin relative paths to prevent open-redirect.
        let target =
          redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')
            ? redirectTarget
            : '/me';
        // Carry the migration-modal override (?migration=nudge|welcome) across
        // the hard nav so the authed page can evaluate it after login. On the
        // real gowatchly hosts the modal keys off hostname and needs no param.
        const migration = searchParams.get('migration');
        if (migration && !target.includes('migration=')) {
          target += `${target.includes('?') ? '&' : '?'}migration=${encodeURIComponent(migration)}`;
        }
        // Hard navigation (not router.replace) so the (authed) + (public)
        // layouts re-run with the new session cookie and the sidebar /
        // accent-color caches pick up the right values from the start.
        window.location.assign(target);
      } else {
        setLoading(false);
        setError(data.error || 'Invalid credentials');
      }
    } catch {
      setLoading(false);
      setError('Something went wrong. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div className="flex justify-center mb-2">
        <button
          type="button"
          onClick={() => {
            setUseEmail(!useEmail);
            setIdentifier('');
            setError(null);
          }}
          className="text-xs text-muted-foreground hover:text-white transition-colors cursor-pointer"
        >
          Sign in with {useEmail ? 'username' : 'email'} instead
        </button>
      </div>

      <FormInput
        id="identifier"
        label={useEmail ? 'Email' : 'Username'}
        type={useEmail ? 'email' : 'text'}
        placeholder={useEmail ? 'name@example.com' : 'Enter your username'}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        disabled={loading}
        error={error && !identifier ? `${useEmail ? 'Email' : 'Username'} is required` : undefined}
      />

      <FormInput
        id="password"
        label="Password"
        isPassword
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
        forgotPasswordLink={PATHS.AUTH.FORGOT_PASSWORD}
        error={error || undefined}
      />

      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          disabled={loading}
          className="w-4 h-4 accent-primary cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 rounded"
        />
        <span>Remember me</span>
      </label>

      <Button
        type="submit"
        className="w-full h-11 bg-primary hover:bg-primary-hover text-white font-medium shadow-lg shadow-primary/20 mt-2"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign in'
        )}
      </Button>

      <div className="text-center pt-2">
        <p className="text-sm text-muted-foreground">
          New to Watchly?{' '}
          <Link
            href={PATHS.AUTH.SIGN_UP}
            className="text-primary hover:text-primary-hover font-medium transition-colors"
          >
            Create an account
          </Link>
        </p>
      </div>
    </form>
  );
}
