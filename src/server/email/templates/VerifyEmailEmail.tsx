import { EmailLayout, Paragraph, PasteLink, PrimaryButton, StubNote, greet } from './EmailLayout';

interface VerifyEmailEmailProps {
  recipientName: string | null;
  /** Absolute URL to the verify page, token embedded. */
  verifyUrl: string;
  siteUrl: string;
  assetUrl?: string;
}

/** Sent at signup and on resend. The only email at signup: it carries the deadline. */
export function VerifyEmailEmail({ recipientName, verifyUrl, siteUrl, assetUrl }: VerifyEmailEmailProps) {
  return (
    <EmailLayout
      preview="One tap confirms your inbox. Confirm within your first week to keep using Watchly."
      kicker="Admit one · Box office"
      heading="Confirm your email"
      siteUrl={siteUrl}
      assetUrl={assetUrl}
      reason="You’re getting this because this address was used to create a Watchly account."
      stub={
        <>
          <StubNote label="Link valid for 24 hours">Didn’t sign up for Watchly? Ignore this email and nothing happens.</StubNote>
          <PasteLink href={verifyUrl} />
        </>
      }
    >
      <Paragraph>{greet(recipientName)}, one tap confirms this is your inbox and Watchly is yours to keep.</Paragraph>
      <Paragraph muted>Confirm within your first week to keep using Watchly after it. Everything works in the meantime.</Paragraph>
      <PrimaryButton href={verifyUrl}>Confirm email</PrimaryButton>
    </EmailLayout>
  );
}
