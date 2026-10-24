import type { ReactNode } from 'react';
import { Body, Button, Container, Head, Html, Img, Link, Preview, Section, Text } from '@react-email/components';

/**
 * Every Watchly email is one ticket: the wordmark, then a card with a mono
 * kicker, an Anton headline that states the task plainly, the message and
 * one button, a dashed tear line, and the stub below it for the fine print
 * (how long the link lasts, the paste-in link, "didn't ask for this").
 *
 * Email-safe by construction: tables and inline styles only (react-email),
 * no SVG (Gmail blocks it), no text in images, real text for every message.
 * Anton loads where a client allows web fonts (Apple Mail, iOS) and falls
 * back to Arial Narrow / Arial uppercase elsewhere. The wordmark PNG has the
 * page colour baked in so a client that recolours the email can't wash it
 * out; its alt text carries the brand when images are off.
 */

// Watchly's tokens, as literal colours (email has no CSS variables).
export const C = {
  page: '#09090b',
  card: '#18181b',
  line: '#27272a',
  tear: '#3f3f46',
  text: '#fafafa',
  body: '#e4e4e7',
  muted: '#a1a1aa',
  primary: '#3B4FFF',
  // The accent as link text: #3B4FFF on the card is ~3:1, this tint is AA.
  link: '#9AA4FF',
} as const;

const ANTON_FACE =
  "@font-face{font-family:'Anton';font-style:normal;font-weight:400;font-display:swap;src:url(https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm3Kz-C8.woff2) format('woff2');}";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
const DISPLAY = "Anton, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";

interface EmailLayoutProps {
  /** Inbox preview line, shown before the email is opened. */
  preview: string;
  /** Mono label above the headline: "Box office · confirm your seat". */
  kicker: string;
  /** States the task plainly; set in Anton, uppercase. */
  heading: string;
  children: ReactNode;
  /** The stub under the tear: fine print for this email. */
  stub: ReactNode;
  /** Why this email arrived (one sentence). */
  reason: string;
  /** The app's origin: the footer link. */
  siteUrl: string;
  /** Where the wordmark image is served from; defaults to siteUrl (previews pass the local server). */
  assetUrl?: string;
}

export function EmailLayout({ preview, kicker, heading, children, stub, reason, siteUrl, assetUrl = siteUrl }: EmailLayoutProps) {
  const host = siteUrl.replace(/^https?:\/\//, '');
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="dark light" />
        <meta name="supported-color-schemes" content="dark light" />
        {/* Only declares Anton; just the headline asks for it. (react-email's
            <Font> would set it on every element, body text included.) */}
        <style>{ANTON_FACE}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: C.page, color: C.text, fontFamily: SANS, margin: 0, padding: '32px 0' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '0 16px' }}>
          <Section style={{ padding: '0 4px 20px' }}>
            <Link href={siteUrl}>
              <Img
                src={`${assetUrl}/email/watchly-wordmark.png`}
                width="108"
                height="28"
                alt="Watchly"
                style={{ display: 'block', border: 0, color: C.text, fontFamily: SANS, fontSize: '22px', fontWeight: 800 }}
              />
            </Link>
          </Section>

          <Section style={{ backgroundColor: C.card, border: `1px solid ${C.line}`, borderRadius: '12px' }}>
            <Section style={{ padding: '32px 32px 28px' }}>
              <Text style={kickerStyle}>{kicker}</Text>
              <Text style={{ fontFamily: DISPLAY, fontSize: '40px', lineHeight: '1', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.005em', color: C.text, margin: '12px 0 20px' }}>
                {heading}
              </Text>
              {children}
            </Section>
            {/* The tear line: a dashed rule where the stub tears off. */}
            <Section style={{ borderTop: `1px dashed ${C.tear}`, padding: '20px 32px 24px' }}>{stub}</Section>
          </Section>

          <Text style={{ color: C.muted, fontSize: '12px', lineHeight: '1.6', margin: '24px 4px 0' }}>
            {reason}
            <br />
            Watchly ·{' '}
            <Link href={siteUrl} style={{ color: C.link, textDecoration: 'underline' }}>
              {host}
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const kickerStyle = {
  fontFamily: MONO,
  fontSize: '11px',
  lineHeight: '1.4',
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: C.muted,
  margin: 0,
};

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={kickerStyle}>{children}</Text>;
}

export function Paragraph({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text style={{ color: muted ? C.muted : C.body, fontSize: muted ? '14px' : '16px', lineHeight: '1.6', margin: '0 0 16px' }}>
      {children}
    </Text>
  );
}

/** The one action. Bulletproof: padding on the link itself, a same-colour border so it survives a stripped background. */
export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0 4px' }}>
      <Button
        href={href}
        style={{
          backgroundColor: C.primary,
          border: `1px solid ${C.primary}`,
          borderRadius: '8px',
          color: '#ffffff',
          fontFamily: SANS,
          fontSize: '15px',
          fontWeight: 600,
          lineHeight: '1',
          padding: '16px 24px',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** A plain link in the accent tint (AA on the card). */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={{ color: C.link, textDecoration: 'underline' }}>
      {children}
    </Link>
  );
}

/** "Or paste this link": the full URL, wrapping, for when the button won't. */
export function PasteLink({ href }: { href: string }) {
  return (
    <Text style={{ color: C.muted, fontSize: '13px', lineHeight: '1.6', margin: '12px 0 0' }}>
      Button not working? Paste this into your browser:
      <br />
      <Link href={href} style={{ color: C.link, wordBreak: 'break-all' }}>
        {href}
      </Link>
    </Text>
  );
}

/** Stub fine print: a mono label line, then small text. */
export function StubNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Kicker>{label}</Kicker>
      <Text style={{ color: C.muted, fontSize: '13px', lineHeight: '1.6', margin: '8px 0 0' }}>{children}</Text>
    </>
  );
}

/** "Hi Marc —" or "Hi there —". */
export const greet = (name: string | null) => `Hi ${name || 'there'}`;
