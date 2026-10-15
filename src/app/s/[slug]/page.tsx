import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ShareRedirectPage({ params }: PageProps) {
  const { slug } = await params;
  
  // Slug format: "mediaType-id" e.g. "movie-123", "tv-456", "co-789"
  // Find the LAST dash to split, in case mediaType has dashes (unlikely for "movie"/"tv" but good practice)
  const lastDashIndex = slug.lastIndexOf('-');
  
  if (lastDashIndex === -1) {
    // Invalid slug format, redirect to home
    redirect('/');
  }

  const mediaType = slug.substring(0, lastDashIndex);
  const id = slug.substring(lastDashIndex + 1);

  if (!id) {
    redirect('/');
  }

  if (mediaType === 'co') {
    redirect(`/collection/${id}`);
  }

  if (mediaType === 'movie' || mediaType === 'tv') {
    redirect(`/title/${mediaType}/${id}`);
  }

  // Fallback
  redirect('/');
}
