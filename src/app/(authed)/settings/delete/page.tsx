import { Trash2 } from 'lucide-react';
import { BackLink } from '@/components/nav/BackLink';
import { DeleteAccountClient } from '@/components/settings/DeleteAccountClient';

export default function DeleteAccountPage() {
  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <div className="flex items-center gap-3 mb-6">
        <Trash2 size={24} className="text-destructive" />
        <h1 className="text-h2">Delete account</h1>
      </div>

      <DeleteAccountClient />
    </div>
  );
}
