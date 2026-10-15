import { Button, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface PasswordResetEmailProps {
  recipientName: string;
  resetUrl: string;
}

export function PasswordResetEmail({
  recipientName,
  resetUrl,
}: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Reset your Watchly password"
      heading="Reset your password"
    >
      <Text style={paragraph}>
        Hi {recipientName || 'there'} — someone requested a password reset for
        your Watchly account. If that was you, use the button below to set a
        new one.
      </Text>
      <Section style={ctaSection}>
        <Button href={resetUrl} style={button}>
          Reset password
        </Button>
      </Section>
      <Text style={paragraphMuted}>
        Or paste this link into your browser:
        <br />
        <span style={linkText}>{resetUrl}</span>
      </Text>
      <Text style={paragraphMuted}>
        This link expires in 1 hour and can only be used once. If you
        didn&apos;t request a password reset, you can safely ignore this
        email — your password is unchanged.
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
