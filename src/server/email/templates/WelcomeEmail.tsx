import { EmailLayout, Paragraph, PrimaryButton, StubNote, greet } from './EmailLayout';

interface WelcomeEmailProps {
  recipientName: string | null;
  /** Absolute, tagged URL to Tonight's Programme. */
  programmeUrl: string;
  siteUrl: string;
  assetUrl?: string;
}

/**
 * Sent once, the moment the email is confirmed (never at signup, where it
 * would compete with the verify email). Points at one place: Tonight's
 * Programme, the "what should I watch tonight?" answer.
 */
export function WelcomeEmail({ recipientName, programmeUrl, siteUrl, assetUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout
      preview="Your email is confirmed. Tonight’s Programme has picks from what you love, and where they’re streaming."
      kicker="Admit one · You’re in"
      heading="Your seat is confirmed"
      siteUrl={siteUrl}
      assetUrl={assetUrl}
      reason="You’re getting this once, because you just confirmed your Watchly email."
      stub={
        <StubNote label="Where to watch, any time">
          Search any film or show and its page shows where it’s streaming in your country. Keep the ones for later in your Watchlists.
        </StubNote>
      }
    >
      <Paragraph>{greet(recipientName)}, your email is confirmed, so Watchly is yours to keep.</Paragraph>
      <Paragraph>
        Start with Tonight’s Programme: picks built from what you love, each with where it’s streaming in your country. Every like on Swipe or the For You
        reel sharpens it.
      </Paragraph>
      <PrimaryButton href={programmeUrl}>Open Tonight’s Programme</PrimaryButton>
    </EmailLayout>
  );
}
