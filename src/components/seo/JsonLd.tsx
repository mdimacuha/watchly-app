import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo';

/**
 * Renders a JSON-LD `<script>` for structured data. Server component only —
 * the payload is serialized on the server and never hydrated.
 *
 * `<` is escaped to `<` so a value containing `</script>` (e.g. a movie
 * overview) can't break out of the script element (XSS-safe injection).
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/**
 * Site-wide WebSite + WebApplication + Organization graph. Includes a
 * SearchAction so Google can surface a sitelinks search box pointing at
 * `/discover?q=`.
 */
export function WebsiteJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            publisher: { '@id': `${SITE_URL}/#organization` },
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${SITE_URL}/discover?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'WebApplication',
            '@id': `${SITE_URL}/#webapp`,
            name: SITE_NAME,
            url: SITE_URL,
            applicationCategory: 'EntertainmentApplication',
            operatingSystem: 'Web',
            description: SITE_DESCRIPTION,
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          },
          {
            '@type': 'Organization',
            '@id': `${SITE_URL}/#organization`,
            name: SITE_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/icon.svg`,
          },
        ],
      }}
    />
  );
}
