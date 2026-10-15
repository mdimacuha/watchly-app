import { createRouteHandler } from 'uploadthing/next';
import { watchlyFileRouter } from '@/server/uploadthing/core';

export const { GET, POST } = createRouteHandler({ router: watchlyFileRouter });
