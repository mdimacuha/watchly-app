import type { Metadata } from 'next';
import { BackLink } from '@/components/nav/BackLink';

export const metadata: Metadata = {
  title: 'Terms of Service · Watchly',
  description: 'The terms that govern your use of Watchly.',
};

// NOTE: Placeholder legal copy — not reviewed by counsel. Replace with the
// finalised terms of service before launch.
const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Acceptance of terms',
    body: 'By creating an account or using Watchly, you agree to these terms. If you do not agree, please do not use the service.',
  },
  {
    heading: 'Your account',
    body: 'You are responsible for keeping your login credentials secure and for all activity under your account. Let us know right away if you believe your account has been compromised.',
  },
  {
    heading: 'Acceptable use',
    body: 'Use Watchly only for lawful, personal, non-commercial purposes. Do not attempt to disrupt the service, misuse its data, or access it in ways not permitted by these terms.',
  },
  {
    heading: 'Content and recommendations',
    body: 'Streaming availability, artwork, and metadata are provided by third parties and may change or be inaccurate. Watchly makes no guarantee that any title is available in your region.',
  },
  {
    heading: 'Changes to these terms',
    body: 'We may update these terms from time to time. Continued use of Watchly after changes take effect means you accept the updated terms.',
  },
  {
    heading: 'Contact us',
    body: 'Questions about these terms? Reach out to us at hello@watchly.app.',
  },
];

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink fallbackHref="/" label="Back" />

      <header className="mt-6">
        <h1 className="text-h1">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Placeholder terms — final copy pending legal review.
        </p>
      </header>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-h3">{section.heading}</h2>
            <p className="text-body-regular text-muted-foreground">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
