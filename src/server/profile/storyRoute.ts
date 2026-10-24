import { NextResponse } from 'next/server';
import { getSessionWithUser } from '@/server/auth/session';
import { getProfileShowcaseAction } from '@/actions/profile';
import { renderProfileStory } from './storyImage';
import { renderTicketStory } from './ticketStory';

/** A browser-reported IANA timezone, or undefined if it isn't one. */
function validTimeZone(tz: string | null): string | undefined {
  if (!tz || tz.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/**
 * GET /api/me/profile/story — the signed-in user's profile as an Instagram
 * story PNG. Owner-only by construction (it always renders the session's own
 * profile), so owner-only stats like Watchly Swipe are theirs to share.
 * `?download=1` adds a Content-Disposition so the browser saves the file.
 * `?kind=ticket&tz=<IANA zone>` renders the last-watched ticket instead, with
 * its times in the owner's timezone and a QR code to their profile.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const showcase = await getProfileShowcaseAction(auth.user.username);
    const url = new URL(request.url);
    const ticket = url.searchParams.get('kind') === 'ticket';
    if (ticket && !showcase.lastWatched) {
      return NextResponse.json({ success: false, error: 'NO_TICKET' }, { status: 404 });
    }
    const image = ticket
      ? await renderTicketStory(showcase.lastWatched!, auth.user.username, validTimeZone(url.searchParams.get('tz')))
      : await renderProfileStory(showcase, url.origin);
    if (url.searchParams.get('download') === '1') {
      image.headers.set('Content-Disposition', `attachment; filename="watchly-${auth.user.username}-${ticket ? 'ticket' : 'story'}.png"`);
    }
    return image;
  } catch {
    return NextResponse.json({ success: false, error: 'STORY_RENDER_FAILED' }, { status: 500 });
  }
}
