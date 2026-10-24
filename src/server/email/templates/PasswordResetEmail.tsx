import { EmailLayout, Paragraph, PasteLink, PrimaryButton, StubNote, greet } from './EmailLayout';

interface PasswordResetEmailProps {
  recipientName: string | null;
  /** Absolute URL to the reset page, token embedded. */
  resetUrl: string;
  siteUrl: string;
  assetUrl?: string;
}

/** Sent from "Forgot your password?". Plain on purpose: no personality inside a security email. */
export function PasswordResetEmail({ recipientName, resetUrl, siteUrl, assetUrl }: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Choose a new password for your Watchly account. The link works for 1 hour."
      kicker="Box office · Replacement ticket"
      heading="Reset your password"
      siteUrl={siteUrl}
      assetUrl={assetUrl}
      reason="You’re getting this because a password reset was requested for this address on Watchly."
      stub={
        <>
          <StubNote label="Link valid for 1 hour">It works once. Didn’t ask for this? Ignore this email and your password stays the same.</StubNote>
          <PasteLink href={resetUrl} />
        </>
      }
    >
      <Paragraph>{greet(recipientName)}, we got a request to reset the password for your Watchly account. If it was you, choose a new one.</Paragraph>
      <PrimaryButton href={resetUrl}>Choose a new password</PrimaryButton>
    </EmailLayout>
  );
}
