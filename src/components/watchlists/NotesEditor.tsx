'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NOTES_MAX_LENGTH } from '@/services/watchlists/validators';

interface NotesEditorProps {
  value: string | null;
  isOwner: boolean;
  /**
   * Called on save with the new value (null = cleared). May throw to signal
   * failure — the editor catches and stays in edit mode so the user doesn't
   * lose their text.
   */
  onSubmit: (next: string | null) => Promise<void>;
}

/**
 * Per-item notes affordance for watchlist cards. Three states:
 *   - read-only (non-owner with notes): plain text
 *   - read with edit (owner with notes): text + pencil
 *   - empty owner: small "+ Add note" button
 * Edit mode shows a small textarea; save on Enter/blur, cancel on Escape.
 */
export function NotesEditor({ value, isOwner, onSubmit }: NotesEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value ?? '');
      // Focus + place cursor at end on next paint.
      const t = setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editing, value]);

  const save = async () => {
    const next = draft.trim();
    // No-op when unchanged — avoids a needless server roundtrip + revalidate.
    if ((next || null) === (value || null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(next.length > 0 ? next : null);
      setEditing(false);
    } catch {
      // Stay in edit mode so the user can retry; parent already toasted.
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  // Read-only view: non-owner just sees the text (or nothing).
  if (!isOwner) {
    if (!value) return null;
    return (
      <p className="text-[11px] text-muted-foreground/90 whitespace-pre-line break-words pt-0.5">
        {value}
      </p>
    );
  }

  // Owner, edit mode.
  if (editing) {
    const remaining = NOTES_MAX_LENGTH - draft.length;
    return (
      <div className="flex flex-col gap-1">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTES_MAX_LENGTH))}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
              return;
            }
            // Cmd/Ctrl+Enter saves; plain Enter inserts a newline so multi-line
            // notes are easy.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Add a note…"
          rows={2}
          disabled={saving}
          className={cn(
            'w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[12px] text-foreground',
            'placeholder:text-muted-foreground/60',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            saving && 'opacity-60',
          )}
        />
        <span
          className={cn(
            'text-[10px] tabular-nums self-end',
            remaining < 30 ? 'text-amber-400' : 'text-muted-foreground/60',
          )}
        >
          {remaining}
        </span>
      </div>
    );
  }

  // Owner, has notes. Click the row to edit.
  if (value) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group/notes flex items-start gap-1 text-left w-full cursor-pointer"
      >
        <p className="flex-1 text-[11px] text-muted-foreground/90 whitespace-pre-line break-words pt-0.5 group-hover/notes:text-foreground transition-colors">
          {value}
        </p>
        <Pencil className="w-3 h-3 text-muted-foreground/40 group-hover/notes:text-foreground transition-colors shrink-0 mt-1" />
      </button>
    );
  }

  // Owner, no notes — minimal "+ Add note" affordance.
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="self-start text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
    >
      + Add note
    </button>
  );
}
