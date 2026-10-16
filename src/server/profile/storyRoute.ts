import { NextResponse } from 'next/server';
import { getSessionWithUser } from '@/server/auth/session';
import { getProfileShowcaseAction } from '@/actions/profile';
import { renderProfileStory } from './storyImage';

/**
 * GET /api/me/profile/story — the signed-in user's profile as an Instagram
 * story PNG. Owner-only by construction (it always renders the session's own
 * profile), so owner-only stats like Watchly Swipe are theirs to share.
 * `?download=1` adds a Content-Disposition so the browser saves the file.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await getSessionWithUser();
  if (!auth) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const showcase = await getProfileShowcaseAction(auth.user.username);
    const url = new URL(request.url);
    const image = await renderProfileStory(showcase, url.origin);
    if (url.searchParams.get('download') === '1') {
      image.headers.set('Content-Disposition', `attachment; filename="watchly-${auth.user.username}-story.png"`);
    }
    return image;
  } catch {
    return NextResponse.json({ success: false, error: 'STORY_RENDER_FAILED' }, { status: 500 });
  }
}
