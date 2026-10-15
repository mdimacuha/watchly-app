import type { Metadata } from 'next';
import { BackLink } from '@/components/nav/BackLink';

export const metadata: Metadata = {
  title: 'Privacy Policy · Watchly',
  description: 'How Watchly collects, uses, and protects your information.',
};

// NOTE: Placeholder legal copy — not reviewed by counsel. Replace with the
// finalised privacy policy before launch.
const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Information we collect',
    body: 'We collect the details you provide when you create an account (such as your name and email), the region you choose, and the titles you save, favourite, or interact with so we can power your recommendations and watchlists.',
  },
  {
    heading: 'How we use your information',
    body: 'Your information is used to operate Watchly, personalise recommendations, keep your account secure, and communicate important updates. We do not sell your personal information.',
  },
  {
    heading: 'Data retention',
    body: 'We keep your information for as long as your account is active. You can request deletion of your account at any time, after which we remove your personal data except where retention is required by law.',
  },
  {
    heading: 'Third-party services',
    body: 'Watchly uses trusted third parties (for example, streaming metadata providers) to deliver its features. These providers only receive the data needed to provide their service.',
  },
  {
    heading: 'Contact us',
    body: 'If you have questions about this policy or your data, reach out to us at hello@watchly.app.',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <BackLink fallbackHref="/" label="Back" />

      <header className="mt-6">
        <h1 className="text-h1">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Placeholder policy — final copy pending legal review.
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
