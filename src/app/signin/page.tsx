import type { Metadata } from 'next';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { LateShowSignin } from '@/components/auth/LateShowSignin';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

type SignInPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { redirect } = await searchParams;
  return (
    <div className={cn(anton.variable, 'min-h-dvh bg-background text-foreground')}>
      <LateShowSignin redirect={redirect} />
    </div>
  );
}
