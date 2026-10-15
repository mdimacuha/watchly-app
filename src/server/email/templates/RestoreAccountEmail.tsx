import { Button, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface RestoreAccountEmailProps {
  recipientName: string;
  restoreUrl: string;
}

export function RestoreAccountEmail({
  recipientName,
  restoreUrl,
}: RestoreAccountEmailProps) {
  return (
    <EmailLayout
      preview="Restore your Watchly account within 30 days"
      heading="Your account has been scheduled for deletion"
    >
      <Text style={paragraph}>
        Hi {recipientName || 'there'} — we&apos;ve scheduled your Watchly
        account for deletion. Your data is preserved for 30 days. If this
        was a mistake or you change your mind, you can restore everything
        with one click.
      </Text>
      <Section style={ctaSection}>
        <Button href={restoreUrl} style={button}>
          Restore my account
        </Button>
      </Section>
      <Text style={paragraphMuted}>
        Or paste this link into your browser:
        <br />
        <span style={linkText}>{restoreUrl}</span>
      </Text>
      <Text style={paragraphMuted}>
        This link expires in 30 days. After that we&apos;ll permanently
        remove your account, watchlists, favorites, and activity — no recovery
        possible.
      </Text>
    </EmailLayout>
  );
}

const paragraph: React.CSSProperties = {
  color: '#e4e4e7',
  fontSize: '15px',
  lineHeight: '1.55',
  margin: '0 0 16px',
};
const paragraphMuted: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '13px',
  lineHeight: '1.55',
  margin: '24px 0 0',
};
const ctaSection: React.CSSProperties = { textAlign: 'center', margin: '28px 0 8px' };
const button: React.CSSProperties = {
  backgroundColor: '#3B4FFF',
  color: '#ffffff',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  padding: '12px 22px',
  textDecoration: 'none',
};
const linkText: React.CSSProperties = {
  color: '#3B4FFF',
  wordBreak: 'break-all',
};
