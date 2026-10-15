'use client';

import { useState, useTransition } from 'react';
import { Copy, Plus, Trash2, KeyRound, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import {
  createApiTokenAction,
  revokeApiTokenAction,
} from '@/actions/apiTokens';
import type { ApiTokenSummary } from '@/services/auth/apiTokens';
import { formatRelativeAgo } from '@/lib/format';

interface ApiTokensClientProps {
  initial: ApiTokenSummary[];
}

/**
 * Token management UI:
 *   - List with "Last used" stamps
 *   - "Create token" form (name input → returns raw token in a one-shot reveal)
 *   - Revoke (destructive confirm)
 *
 * The raw token is shown ONCE inside an inline reveal block right after
 * creation, since the server doesn't keep the plaintext.
 */
export function ApiTokensClient({ initial }: ApiTokensClientProps) {
  const [tokens, setTokens] = useState<ApiTokenSummary[]>(initial);
  const [name, setName] = useState('');
  const [justCreated, setJustCreated] = useState<{
    raw: string;
    summary: ApiTokenSummary;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const [pendingRevoke, setPendingRevoke] = useState<ApiTokenSummary | null>(
    null,
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;
    startTransition(async () => {
      try {
        const result = await createApiTokenAction(name);
        setTokens((prev) => [result.summary, ...prev]);
        setJustCreated({ raw: result.token, summary: result.summary });
        setName('');
      } catch {
        toast.error('Could not create token', 'Please try again.');
      }
    });
  };

  const handleRevoke = async () => {
    if (!pendingRevoke) return;
    try {
      await revokeApiTokenAction(pendingRevoke.id);
      setTokens((prev) => prev.filter((t) => t.id !== pendingRevoke.id));
      toast.success('Token revoked');
    } catch {
      toast.error('Could not revoke', 'Please try again.');
      throw new Error('rollback');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <label htmlFor="token-name" className="text-sm font-medium">
          Create a new token
        </label>
        <div className="flex gap-2">
          <Input
            id="token-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. iOS app"
            maxLength={50}
            required
          />
          <Button type="submit" disabled={!name.trim() || pending} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Create
          </Button>
        </div>
      </form>

      {justCreated && (
        <JustCreatedReveal
          token={justCreated.raw}
          onDismiss={() => setJustCreated(null)}
        />
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Your tokens
        </h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-4">
            No tokens yet. Use the form above to create one.
          </p>
        ) : (
          tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border"
            >
              <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {t.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created {formatRelativeAgo(t.createdAt)}
                  {' · '}
                  Last used{' '}
                  {t.lastUsedAt ? formatRelativeAgo(t.lastUsedAt) : 'never'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setPendingRevoke(t)}
                className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive"
                aria-label={`Revoke ${t.name}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Revoke
              </Button>
            </div>
          ))
        )}
      </div>

      <ConfirmDestructiveModal
        isOpen={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        title={`Revoke "${pendingRevoke?.name ?? ''}"?`}
        description="Any application using this token will lose access immediately. You can create a new one anytime."
        confirmLabel="Revoke"
        onConfirm={handleRevoke}
      />
    </div>
  );
}

function JustCreatedReveal({
  token,
  onDismiss,
}: {
  token: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy', 'Select the token and copy manually.');
    }
  };

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Save this token now
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            You won&apos;t be able to see it again. Store it somewhere safe.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Dismiss
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-xs font-mono bg-background border border-border rounded-md px-3 py-2">
          {token}
        </code>
        <Button
          variant="outline"
          onClick={handleCopy}
          className="h-9 px-3 gap-1.5 shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
