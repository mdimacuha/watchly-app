'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Panel {
  icon: ReactNode;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}

interface TokenConfirmProps {
  /** POST endpoint that consumes the token: { token } → 200 | 4xx. */
  endpoint: string;
  token: string;
  /** Shown first: the page never uses the token on load. */
  ask: Panel & { action: string };
  done: Panel;
  failed: Panel;
}

/**
 * One button between an emailed link and the action it performs. Mail
 * scanners (Outlook Safe Links and friends) open every link in an email
 * before the person does; if the page acted on load, a scanner would use up
 * the token and the real person would land on "this link is no longer
 * valid". Scanners don't press buttons.
 */
export function TokenConfirm({ endpoint, token, ask, done, failed }: TokenConfirmProps) {
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'failed'>('ask');

  async function confirm() {
    setState('busy');
    const res = await fetch(endpoint, { method: 'POST', body: JSON.stringify({ token }) }).catch(() => null);
    setState(res?.ok ? 'done' : 'failed');
  }

  const panel = state === 'done' ? done : state === 'failed' ? failed : ask;
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center" aria-live="polite">
        {panel.icon}
        <h1 className="text-h2">{panel.title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{panel.body}</p>
        {state === 'ask' || state === 'busy' ? (
          <Button className="mt-2 gap-2" onClick={confirm} disabled={state === 'busy'}>
            {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {ask.action}
          </Button>
        ) : (
          panel.cta && (
            <Link href={panel.cta.href} className="mt-2">
              <Button variant={state === 'done' ? 'default' : 'outline'}>{panel.cta.label}</Button>
            </Link>
          )
        )}
      </div>
    </div>
  );
}
