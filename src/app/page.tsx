import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { PATHS, EXTERNAL_PATHS } from "@/lib/app";

// The marketing landing now lives on gowatchly.com (the watchly-business app),
// so this app's root is no longer a landing page:
//   • signed-in  → their profile (/me)
//   • signed-out → the marketing site (gowatchly.com), or /signin in development
//
// `middleware.ts` already redirects `/` on the cookie's presence (fast, edge,
// no DB). This is the session-aware fallback if middleware is ever bypassed and
// keeps the rule correct in one obvious place. `/` renders no HTML, so it's
// removed from the sitemap; app content is discovered via /title/* etc.
export default async function Home() {
  const session = await getSession();
  if (session) redirect(PATHS.ME);
  redirect(
    process.env.NODE_ENV === "development"
      ? PATHS.AUTH.SIGN_IN
      : EXTERNAL_PATHS.LANDING_URL
  );
}
