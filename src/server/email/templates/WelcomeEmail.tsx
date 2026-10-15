import { Button, Section, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

interface WelcomeEmailProps {
  recipientName: string;
  /** Absolute URL the "Start searching" CTA points to. */
  searchUrl: string;
}

/**
 * Marketing welcome email fired once on signup. Uses the same
 * `EmailLayout` chrome as the transactional templates (verify /
 * password-reset / restore-account) so brand presentation stays
 * consistent across every email a user receives from Watchly.
 */
export function WelcomeEmail({
  recipientName,
  searchUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout
      preview="Your personal streaming guide is ready — start searching now."
      heading="Welcome to Watchly"
    >
      <Text style={paragraph}>
        Hi {recipientName || 'there'} — your personal streaming guide is
        ready. Sync your watchlists, track availability across 140+
        regions, and never ask &quot;where can I watch this?&quot; again.
      </Text>
      <Section style={ctaSection}>
        <Button href={searchUrl} style={button}>
          Start searching
        </Button>
      </Section>
      <Text style={paragraphMuted}>
        New to Watchly? Try adding a favorite from search — your For You
        feed starts personalizing the moment you do.
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
const ctaSection: React.CSSProperties = {
  textAlign: 'center',
  margin: '28px 0 8px',
};
const button: React.CSSProperties = {
  backgroundColor: '#3B4FFF',
  color: '#ffffff',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  padding: '12px 22px',
  textDecoration: 'none',
};
