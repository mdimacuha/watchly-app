import { KeyRound } from 'lucide-react';
import { listApiTokensAction } from '@/actions/apiTokens';
import { BackLink } from '@/components/nav/BackLink';
import { ApiTokensClient } from '@/components/settings/ApiTokensClient';

export default async function ApiTokensPage() {
  const initial = await listApiTokensAction();

  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <div className="flex items-center gap-3 mb-2">
        <KeyRound size={24} className="text-primary" />
        <h1 className="text-h2">API tokens</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Personal access tokens for using <code>/api/v1/*</code> endpoints
        from external clients (mobile apps, scripts). Treat them like
        passwords — anyone with a token can act as you.
      </p>

      <ApiTokensClient initial={initial} />
    </div>
  );
}
