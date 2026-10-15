import { Filter } from 'lucide-react';
import { getForYouPreferencesAction } from '@/actions/forYouPrefs';
import { BackLink } from '@/components/nav/BackLink';
import { PreferencesPicker } from '@/components/forYou/PreferencesPicker';

export default async function ForYouPreferencesPage() {
  const { selectedProviders, catalog } = await getForYouPreferencesAction();

  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <div className="flex items-center gap-3 mb-2">
        <Filter size={24} className="text-primary" />
        <h1 className="text-h2">For You preferences</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Pick the streaming services you want For You to filter to. Leave
        empty to see anything available in your region.
      </p>

      <PreferencesPicker
        initialSelected={selectedProviders}
        catalog={catalog}
      />
    </div>
  );
}
