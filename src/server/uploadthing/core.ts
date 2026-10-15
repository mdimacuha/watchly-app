import { createUploadthing, type FileRouter } from 'uploadthing/next';
import { UploadThingError } from 'uploadthing/server';
import { getSession } from '@/server/auth/session';

const f = createUploadthing();

// File router definitions. Each route validates auth in `middleware()`. The
// returned URL is consumed client-side via `onClientUploadComplete`.
export const watchlyFileRouter = {
  // Avatar uploader: 4MB images, single file.
  avatarUploader: f({
    image: { maxFileSize: '4MB', maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getSession();
      if (!session) throw new UploadThingError('Unauthorized');
      return { userId: session.userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Persistence happens client-side via the profile edit flow so the
      // user can preview before saving. Just return the URL.
      return { uploadedBy: metadata.userId, url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type WatchlyFileRouter = typeof watchlyFileRouter;
