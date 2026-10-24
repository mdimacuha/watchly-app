'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

const VIEWS = [
  { key: 'desktop', label: 'Desktop', width: '100%' },
  { key: 'phone', label: 'Phone', width: '375px' },
  { key: 'text', label: 'Plain text', width: '100%' },
] as const;

/** The rendered email at desktop or phone width, or its plain-text part. */
export function EmailPreviewFrame({ html, text, title }: { html: string; text: string; title: string }) {
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('desktop');
  const width = VIEWS.find((v) => v.key === view)!.width;

  return (
    <section className="flex flex-col gap-3">
      <div role="tablist" aria-label="Preview" className="flex w-fit gap-1 rounded-lg border border-border bg-card p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={cn(
              'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              view === v.key ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'text' ? (
        <pre className="max-h-[760px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-card p-5 font-mono text-xs leading-relaxed text-foreground">{text}</pre>
      ) : (
        <div className="flex justify-center rounded-xl border border-border bg-card p-2">
          <iframe srcDoc={html} title={title} className="block rounded-lg" style={{ width, height: '820px', border: 0 }} />
        </div>
      )}
    </section>
  );
}
