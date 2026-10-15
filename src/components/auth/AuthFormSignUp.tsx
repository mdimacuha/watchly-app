'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormInput } from './FormInput';
import { PATHS } from '@/lib/app';
import { Stepper } from '@/components/ui/stepper';
import { signUpSchema } from '@/services/auth/validators';
import { z } from 'zod';

// Username helper copy mirrors the server-side rules in
// services/moderation/validateUsername.ts. Keep them in lockstep.
const USERNAME_HINT =
  'Use 3-24 characters: lowercase letters, numbers, dots, and underscores. Cannot start or end with a dot or underscore.';
const USERNAME_CHECK_DEBOUNCE_MS = 400;

type UsernameStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'unavailable'; message: string };

export function AuthFormSignUp() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({
    kind: 'idle',
  });

  // Live username availability check. Debounced so each keystroke
  // doesn't burn a rate-limit slot. Empty / too-short inputs skip the
  // round-trip entirely.
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUsernameStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    setUsernameStatus({ kind: 'checking' });

    const t = setTimeout(() => {
      fetch('/api/v1/auth/check-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      })
        .then(async (r) => {
          if (cancelled) return;
          const json = (await r.json().catch(() => null)) as {
            data?: { available: boolean; message?: string };
          } | null;
          const payload = json?.data;
          if (!payload) {
            setUsernameStatus({ kind: 'idle' });
            return;
          }
          if (payload.available) {
            setUsernameStatus({ kind: 'available' });
          } else {
            setUsernameStatus({
              kind: 'unavailable',
              message: payload.message ?? 'This username is not available.',
            });
          }
        })
        .catch(() => {
          if (!cancelled) setUsernameStatus({ kind: 'idle' });
        });
    }, USERNAME_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [username]);

  const validateStep1 = () => {
    const step1Schema = signUpSchema.pick({
      email: true,
      username: true,
      firstName: true,
      lastName: true,
    });
    const result = step1Schema.safeParse({
      email,
      username,
      firstName,
      lastName,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((e) => {
        if (e.path && e.path[0]) {
          fieldErrors[e.path[0] as string] = e.message;
        }
      });
      setErrors(fieldErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const validateStep2 = () => {
    const step2Schema = signUpSchema
      .pick({ password: true })
      .extend({
        confirmPassword: z.string(),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });

    const result = step2Schema.safeParse({ password, confirmPassword });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((e) => {
        if (e.path && e.path[0]) {
          fieldErrors[e.path[0] as string] = e.message;
        }
      });
      setErrors(fieldErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Step 1 Validation
    if (step === 1) {
      // Live check says the username is taken / not allowed — block
      // before we ever hit the API. The server-side signup endpoint
      // is the source of truth (re-validates everything) but failing
      // fast here saves a round-trip and a worse error path.
      if (usernameStatus.kind === 'unavailable') {
        setErrors({ username: usernameStatus.message });
        return;
      }
      if (validateStep1()) {
        setStep(2);
      }
      return;
    }

    // Step 2 Validation & Submit
    if (step === 2) {
      if (validateStep2()) {
        setLoading(true);
        // Simulate API call
        // /api/v1/auth/signup
        const response = await fetch('/api/v1/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, username, firstName, lastName, password }),
        });
        const data = await response.json();
        if (response.ok) {
          console.log('Registered with:', data);
          router.push(PATHS.ONBOARDING.WELCOME);
        } else {
          setLoading(false);
          // Handle specific error messages from API if available
          if (data.error) {
             // You might want to map API errors to field errors here
             // For now, let's just set a generic or specific error if possible.
             // If the API returns validation errors, we could parse them.
             // Assuming simple error structure for now.
             setErrors({ form: data.error });
          }
        }
      }
    }
  };

  const handleBack = () => {
    setStep(1);
    setErrors({});
  };

  return (
    <form onSubmit={handleNext} className="space-y-4 w-full">
      <Stepper currentStep={step} steps={['Personal Info', 'Security']} />

      {step === 1 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
          <FormInput
            id="email"
            label="Email"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <div className="flex flex-col gap-1">
            <FormInput
              id="username"
              label="Username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={errors.username}
            />
            {/* Live status line. Order of precedence: existing Zod /
                form error (errors.username) wins; then API status. The
                idle state shows just the helper text. */}
            {!errors.username && (
              <div className="text-xs mt-0.5">
                {usernameStatus.kind === 'checking' && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Checking availability…
                  </span>
                )}
                {usernameStatus.kind === 'available' && (
                  <span className="text-emerald-400 inline-flex items-center gap-1">
                    <Check className="w-3 h-3" strokeWidth={3} />
                    Available
                  </span>
                )}
                {usernameStatus.kind === 'unavailable' && (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <X className="w-3 h-3" strokeWidth={3} />
                    {usernameStatus.message}
                  </span>
                )}
                {usernameStatus.kind === 'idle' && (
                  <span className="text-muted-foreground">
                    {USERNAME_HINT}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <FormInput
              id="firstName"
              label="First Name"
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              error={errors.firstName}
            />
            <FormInput
              id="lastName"
              label="Last Name"
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              error={errors.lastName}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
          <FormInput
            id="password"
            label="Password"
            isPassword
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            error={errors.password}
          />
          <FormInput
            id="confirmPassword"
            label="Confirm Password"
            isPassword
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            error={errors.confirmPassword}
          />
        </div>
      )}

      {/* General or network error display could go here if needed later */}
      {errors.form && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
          {errors.form}
        </div>
      )}

      <div className="flex gap-3 mt-6">
        {step === 2 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={loading}
            className="w-1/3"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        )}

        <Button
          type="submit"
          className={step === 2 ? 'w-2/3' : 'w-full'}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {step === 2 ? 'Creating...' : 'Loading...'}
            </>
          ) : step === 1 ? (
            'Continue'
          ) : (
            'Create account'
          )}
        </Button>
      </div>

      <div className="text-center pt-2">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href={PATHS.AUTH.SIGN_IN}
            className="text-primary hover:text-primary-hover font-medium transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
