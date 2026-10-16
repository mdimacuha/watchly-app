import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import { parseChangelog, type Changelog, type ChangelogPromo } from './parse';

export type { Changelog, ChangelogArea, ChangelogBlock, ChangelogFeature, ChangelogPromo, InlineToken } from './parse';
export { tokenizeInline } from './parse';

/** Release notes live at the repo root (/changelogs/*.md), one file per release. */
const CHANGELOG_DIR = path.join(process.cwd(), 'changelogs');

/** All releases, newest first (by date, then file name for same-day releases). */
export const listChangelogs = cache(async (): Promise<Changelog[]> => {
  let files: string[];
  try {
    files = (await readdir(CHANGELOG_DIR)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  } catch {
    return [];
  }
  const entries = await Promise.all(
    files.map(async (file) => parseChangelog(file.replace(/\.md$/, ''), await readFile(path.join(CHANGELOG_DIR, file), 'utf8'))),
  );
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
});

export interface LatestPromo extends ChangelogPromo {
  /** Release slug — keys the sidebar card's dismissal, so each release's promo shows once. */
  slug: string;
}

/** The newest release's "Promotional" section, if it has one. */
export const getLatestPromo = cache(async (): Promise<LatestPromo | null> => {
  const [latest] = await listChangelogs();
  return latest?.promo ? { ...latest.promo, slug: latest.slug } : null;
});
