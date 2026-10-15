import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface EmailLayoutProps {
  /** Subject-line preview shown in inboxes before the user opens. */
  preview: string;
  heading: string;
  children: React.ReactNode;
}

/**
 * Shared dark-mode-friendly chrome for all Watchly transactional emails.
 * Inline styles only — most email clients ignore <style> + classes.
 * Keep contrast high so the layout works in both light + dark client UIs.
 */
export function EmailLayout({ preview, heading, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={brand}>Watchly</Heading>
          <Section style={card}>
            <Heading style={h1}>{heading}</Heading>
            {children}
          </Section>
          <Text style={footer}>
            You received this email because of activity on your Watchly account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: '#09090b',
  color: '#fafafa',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '32px 0',
};

const container: React.CSSProperties = {
  maxWidth: '520px',
  margin: '0 auto',
  padding: '0 20px',
};

const brand: React.CSSProperties = {
  color: '#3B4FFF',
  fontSize: '20px',
  fontWeight: 700,
  letterSpacing: '-0.02em',
  margin: '0 0 24px',
};

const card: React.CSSProperties = {
  backgroundColor: '#18181b',
  borderRadius: '12px',
  padding: '32px',
};

const h1: React.CSSProperties = {
  color: '#fafafa',
  fontSize: '22px',
  fontWeight: 600,
  lineHeight: '1.3',
  margin: '0 0 16px',
};

const footer: React.CSSProperties = {
  color: '#71717a',
  fontSize: '12px',
  margin: '24px 0 0',
  textAlign: 'center',
};
