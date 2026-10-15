import {
  generateUploadButton,
  generateUploadDropzone,
  generateReactHelpers,
} from '@uploadthing/react';
import type { WatchlyFileRouter } from '@/server/uploadthing/core';

export const UploadButton = generateUploadButton<WatchlyFileRouter>();
export const UploadDropzone = generateUploadDropzone<WatchlyFileRouter>();
export const { useUploadThing } = generateReactHelpers<WatchlyFileRouter>();
