import React from "react";
// NOTE: <AuthProviders /> (Continue with Google) is intentionally not
// mounted while OAuth flow is unimplemented — the component only
// fakes a loading state and never authenticates. The file stays in
// the repo for when we wire real OAuth; re-add the import + mount
// under the form here to bring it back.
import { AuthForm } from "./AuthForm";
import Link from "next/link";
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';

export function SignInCard({ redirect }: { redirect?: string }) {
  return (
    <div className="w-full max-w-[400px] flex flex-col items-center gap-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Sign in</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Pick up where you left off. Sync watchlists, favorites, and alerts.
        </p>
      </div>

      <div className="w-full bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/20">
        <AuthForm redirect={redirect} />
      </div>

      <p className="text-xs text-center text-muted-foreground max-w-xs">
        By continuing, you agree to our{" "}
        <Link href={EXTERNAL_PATHS.BUSINESS.TERMS_OF_SERVICE} className="underline hover:text-foreground transition-colors">
          Terms
        </Link>{" "}
        and{" "}
        <Link href={PATHS.BUSINESS.PRIVACY_POLICY} className="underline hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
