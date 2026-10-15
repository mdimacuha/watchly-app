'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AvatarUploadProps {
  onUploaded: (url: string) => void;
  onError: (message: string) => void;
}

/**
 * Minimal upload trigger that POSTs the selected file to
 * `/api/me/avatar`. The server optimizes the image (WebP 512×512 q80) before
 * pushing it to UploadThing storage, so what comes back is the final URL.
 */
export function AvatarUpload({ onUploaded, onError }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = '';
    if (!file) return;

    setPending(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/me/avatar', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? 'Upload failed');
      }
      onUploaded(json.url);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePick}
      />
      <Button
        type="button"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="gap-1.5"
      >
        {pending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Optimizing…
          </>
        ) : (
          <>
            <Upload className="w-3.5 h-3.5" />
            Upload photo
          </>
        )}
      </Button>
    </>
  );
}
