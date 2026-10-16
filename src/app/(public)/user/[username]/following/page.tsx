import { FollowListView } from '@/components/social/FollowListView';

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function FollowingPage({ params }: PageProps) {
  const { username } = await params;
  return <FollowListView username={username} kind="following" />;
}
