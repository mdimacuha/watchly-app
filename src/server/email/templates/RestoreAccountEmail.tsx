import { EmailLayout, Paragraph, PasteLink, PrimaryButton, StubNote, greet } from './EmailLayout';

interface RestoreAccountEmailProps {
  recipientName: string | null;
  /** Absolute URL to the restore page, token embedded. */
  restoreUrl: string;
  /** The day the account is deleted for good, e.g. "November 23, 2026". */
  deleteOn: string;
  siteUrl: string;
  assetUrl?: string;
}

/** Sent when deletion is requested. Calm and factual: a real date, what's kept, what's lost. */
export function RestoreAccountEmail({ recipientName, restoreUrl, deleteOn, siteUrl, assetUrl }: RestoreAccountEmailProps) {
  return (
    <EmailLayout
      preview={`Your Watchly account will be deleted on ${deleteOn}. Restore it any time before then.`}
      kicker={`Your seat is held · until ${deleteOn}`}
      heading="Your account is scheduled for deletion"
      siteUrl={siteUrl}
      assetUrl={assetUrl}
      reason="You’re getting this because deletion was requested for this Watchly account."
      stub={
        <>
          <StubNote label={`After ${deleteOn}`}>
            Your account and everything in it are deleted for good and can’t be recovered. If you meant to delete it, you don’t need to do anything.
          </StubNote>
          <PasteLink href={restoreUrl} />
        </>
      }
    >
      <Paragraph>
        {greet(recipientName)}, as you asked, your Watchly account will be deleted on {deleteOn}. Until then everything is kept: your watchlists, favorites,
        likes, reviews and activity.
      </Paragraph>
      <Paragraph>Changed your mind? Restore it and it comes back exactly as you left it.</Paragraph>
      <PrimaryButton href={restoreUrl}>Restore my account</PrimaryButton>
    </EmailLayout>
  );
}
