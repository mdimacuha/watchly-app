import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthHydrator } from "@/client/components/auth-hydrator";
import {
  ThemeProvider,
  THEME_INIT_SCRIPT,
} from "@/components/theme/ThemeProvider";
import { MaintenanceGate } from "@/components/maintenance/MaintenanceGate";
import { WebsiteJsonLd } from "@/components/seo/JsonLd";
import {
  SITE_URL,
  SITE_NAME,
  SITE_TITLE,
  SITE_DESCRIPTION,
  TITLE_TEMPLATE,
} from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute base for every relative canonical / OG / Twitter URL in the app.
  // Pinned to the new domain so canonicals consolidate here even while the old
  // watchly.dayonelabs.co host still serves the same app.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "entertainment",
  keywords: [
    "where to watch",
    "streaming availability",
    "watch movies online",
    "TV show streaming",
    "Netflix",
    "Disney+",
    "Prime Video",
    "universal watchlist",
  ],
  // NOTE: no root-level `alternates.canonical` — it would cascade to every
  // child route and mark them all as duplicates of "/". Each page sets its own
  // canonical (the homepage's lives in app/page.tsx).
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    // No `url` here — it would cascade as og:url to every route. Pages set
    // their own; the homepage's lives in app/page.tsx.
    // og:image is supplied by app/opengraph-image.tsx (file convention).
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // twitter:image falls back to og:image (crawler behavior).
  },
  // Icons (icon.svg / favicon.ico / apple-icon.png) and the web manifest are
  // auto-detected from their app/ file-convention files — no manual wiring.
};

export const viewport: Viewport = {
  // Dark app chrome; browsers that honor theme-color tint the UI to match.
  themeColor: "#09090b",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // NOTE: this layout is intentionally NON-async and reads no dynamic APIs
  // (no headers()/cookies()/session). Any per-request read here taints the
  // ENTIRE app dynamic and blocks ISR on the public pages. The maintenance
  // gate now lives in a client component (<MaintenanceGate>) that reads a
  // cached /api/maintenance flag — see that file for the why.
  return (
    // Default class is `dark` so the document still renders dark on
    // JS-disabled clients. The inline script below toggles `light` before
    // first paint if the user prefers it (avoids the dark→light FOUC flash).
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <MaintenanceGate>
            <WebsiteJsonLd />
            <AuthHydrator />
            {children}
          </MaintenanceGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
