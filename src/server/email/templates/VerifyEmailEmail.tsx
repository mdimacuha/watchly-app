import { Button, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface VerifyEmailEmailProps {
  recipientName: string;
  /** Absolute URL to the verify endpoint with token embedded. */
  verifyUrl: string;
}

export function VerifyEmailEmail({
  recipientName,
  verifyUrl,
}: VerifyEmailEmailProps) {
  return (
    <EmailLayout
      preview="Verify your Watchly email to get the full experience"
      heading="Verify your email"
    >
      <Text style={paragraph}>
        Hi {recipientName || 'there'} — confirm this is the right inbox so we
        can keep your account secure.
      </Text>
      <Section style={ctaSection}>
        <Button href={verifyUrl} style={button}>
          Verify email
        </Button>
      </Section>
      <Text style={paragraphMuted}>
        Or paste this link into your browser:
        <br />
        <span style={linkText}>{verifyUrl}</span>
      </Text>
      <Text style={paragraphMuted}>
        This link expires in 24 hours. If you didn&apos;t create a Watchly
        account, ignore this email.
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
