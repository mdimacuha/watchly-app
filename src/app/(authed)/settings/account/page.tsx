import { redirect } from 'next/navigation';

/** Old sub-page: settings now live on one page. Kept so existing links still land. */
export default function Page() {
  redirect('/settings#settings-account');
}
