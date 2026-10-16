import { z } from 'zod';

/**
 * Parser for the changelog files in /changelogs. It understands only the
 * subset of Markdown those files use (see .claude/skills/changelog/SKILL.md):
 *
 *   ---
 *   title: A profile that's actually yours
 *   date: 2026-10-17
 *   summary: One or two sentences for the top of the release.
 *   ---
 *
 *   ## Search            ← an area of the app (page / section)
 *   Optional intro paragraph.
 *   ### Smarter results  ← a feature inside that area (optional)
 *   - What changed, written for people who use Watchly.
 *
 *   ## Promotional       ← optional, last; feeds the sidebar announcement
 *   Title: Introducing Watchly Swipe
 *   Description: Swipe through picks tuned to your taste.
 *   CTA: Try it now
 *   Link: /swipe
 *
 * Inline: **bold**, `code`, [text](/link). Anything else is plain text.
 * Malformed frontmatter or promo throws, so a bad file fails the build
 * instead of shipping a broken page.
 */

export type ChangelogBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] };

export interface ChangelogFeature {
  /** null when bullets sit directly under the area heading. */
  title: string | null;
  blocks: ChangelogBlock[];
}

export interface ChangelogArea {
  title: string;
  features: ChangelogFeature[];
}

export interface ChangelogPromo {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface Changelog {
  slug: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string | null;
  areas: ChangelogArea[];
  promo: ChangelogPromo | null;
}

const frontmatterSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  summary: z.string().min(1).optional(),
});

const promoSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(140),
  cta: z.string().min(1).max(24),
  // Internal paths only — the card renders a same-site Link.
  link: z.string().regex(/^\/(?!\/)/, 'must be an internal path like /swipe'),
});

const PROMO_HEADING = 'promotional';

export function parseChangelog(slug: string, source: string): Changelog {
  const text = source.replace(/\r\n?/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!fm) throw new Error(`changelog ${slug}: missing --- frontmatter ---`);

  const meta = frontmatterSchema.safeParse(readKeyValues(fm[1].split('\n')));
  if (!meta.success) throw new Error(`changelog ${slug}: ${meta.error.issues.map((i) => i.message).join(', ')}`);

  const areas: ChangelogArea[] = [];
  const promoLines: string[] = [];
  let inPromo = false;
  let area: ChangelogArea | null = null;
  let feature: ChangelogFeature | null = null;
  let paragraph: string[] = [];

  const currentFeature = (): ChangelogFeature | null => {
    if (!area) return null;
    if (!feature) {
      feature = { title: null, blocks: [] };
      area.features.push(feature);
    }
    return feature;
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    currentFeature()?.blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (const raw of text.slice(fm[0].length).split('\n')) {
    const line = raw.trim();
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);

    if (h2) {
      flushParagraph();
      inPromo = h2[1].trim().toLowerCase() === PROMO_HEADING;
      feature = null;
      area = null;
      if (!inPromo) {
        area = { title: h2[1].trim(), features: [] };
        areas.push(area);
      }
    } else if (inPromo) {
      if (line) promoLines.push(line);
    } else if (h3) {
      flushParagraph();
      if (!area) throw new Error(`changelog ${slug}: "### ${h3[1]}" must sit under a "## Area" heading`);
      feature = { title: h3[1].trim(), blocks: [] };
      area.features.push(feature);
    } else if (bullet) {
      flushParagraph();
      const f = currentFeature();
      if (!f) continue;
      const last = f.blocks.at(-1);
      if (last?.type === 'ul') last.items.push(bullet[1]);
      else f.blocks.push({ type: 'ul', items: [bullet[1]] });
    } else if (line === '') {
      flushParagraph();
    } else if (!line.startsWith('#')) {
      paragraph.push(line);
    }
  }
  flushParagraph();

  let promo: ChangelogPromo | null = null;
  if (promoLines.length > 0) {
    const parsed = promoSchema.safeParse(readKeyValues(promoLines.map((l) => l.replace(/^[-*]\s+/, ''))));
    if (!parsed.success) throw new Error(`changelog ${slug} promo: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`);
    const p = parsed.data;
    promo = { title: p.title, description: p.description, ctaLabel: p.cta, ctaHref: p.link };
  }

  return {
    slug,
    title: meta.data.title,
    date: meta.data.date,
    summary: meta.data.summary ?? null,
    areas: areas.filter((a) => a.features.some((f) => f.blocks.length > 0)),
    promo,
  };
}

/** `Key: value` lines → { key: value } (keys lower-cased, **bold** keys allowed). */
function readKeyValues(lines: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) {
    const m = /^\**([A-Za-z]+)\**\s*:\s*\**\s*(.*)$/.exec(line.trim());
    if (m) out[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; value: string; href: string };

/** Splits a line into **bold**, `code`, and [text](href) tokens. */
export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: 'bold', value: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: 'code', value: m[2] });
    else tokens.push({ type: 'link', value: m[3], href: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}
