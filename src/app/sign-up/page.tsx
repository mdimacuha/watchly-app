import { permanentRedirect } from 'next/navigation';

// Legacy alias — the canonical signup route is `/signup`. Kept as a 308
// redirect so any old links/bookmarks don't 404.
export default function SignUpAlias() {
  permanentRedirect('/signup');
}
