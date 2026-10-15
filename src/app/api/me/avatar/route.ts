import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { UTApi, UTFile } from 'uploadthing/server';
import { getSession } from '@/server/auth/session';
import { logger } from '@/lib/log';

// Server-side avatar optimization.
//
// The browser sends the raw image to this route; we transform it in-memory
// with sharp (EXIF-rotate → square cover-crop → 512x512 → WebP q80) and push
// only the optimized buffer to UploadThing storage. The original file is
// never persisted.
//
// Output target: WebP, max 512x512, quality 80 — typically well under 300KB.

const MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8MB upper bound for the raw upload
const TARGET_DIMENSION = 512;
const TARGET_QUALITY = 80;

// file-type MIME values we accept. Magic-byte sniffing means a renamed
// `evil.svg` claiming to be `image/png` won't get past this list — the
// detected `.svg` (or `.html`, or anything else) trips the check.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
]);

const utapi = new UTApi();

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let file: File;
  try {
    const form = await request.formData();
    const value = form.get('file');
    if (!(value instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    file = value;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (file.size > MAX_INPUT_BYTES) {
    return NextResponse.json(
      { error: 'Image is too large (max 8MB before optimization)' },
      { status: 400 },
    );
  }

  const input = Buffer.from(await file.arrayBuffer());

  // Magic-byte check: file.type is client-controlled, so a forged
  // Content-Type can claim "image/png" while the payload is anything
  // (SVG with embedded scripts, an HTML page, an ELF binary). Inspect
  // the actual leading bytes.
  const detected = await fileTypeFromBuffer(input);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    return NextResponse.json(
      { error: 'File must be a JPEG, PNG, WebP, GIF, AVIF, or HEIC image' },
      { status: 400 },
    );
  }

  let optimized: Buffer;
  try {
    optimized = await sharp(input)
      .rotate() // honor EXIF orientation so portraits don't end up sideways
      .resize(TARGET_DIMENSION, TARGET_DIMENSION, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: false,
      })
      .webp({ quality: TARGET_QUALITY })
      .toBuffer();
  } catch (err) {
    logger.error('Avatar optimization failed', err);
    return NextResponse.json(
      { error: 'Could not process image' },
      { status: 400 },
    );
  }

  const filename = `avatar-${session.userId}-${Date.now()}.webp`;
  // Wrap as Uint8Array to satisfy BlobPart typing without copying memory.
  const utFile = new UTFile(
    [new Uint8Array(optimized)],
    filename,
    { type: 'image/webp' },
  );

  const result = await utapi.uploadFiles(utFile);
  if (result.error || !result.data) {
    logger.error('UploadThing upload failed', result.error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    url: result.data.ufsUrl,
    bytes: optimized.length,
  });
}
