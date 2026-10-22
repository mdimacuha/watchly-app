'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getSidebarSettingsAction, updateSidebarSettingsAction } from '@/actions/settings';

/**
 * How the sidebar looks and what its Tonight ticket shows (Settings ›
 * Sidebar). Saved to the account, with a copy on the device so the sidebar
 * draws right away; storage can be blocked, which just means the defaults
 * until the account copy arrives.
 */

export type TonightShow = 'both' | 'feature' | 'ticket' | 'off';
export type SidebarStyle = 'docked' | 'floating';
export type FloatGap = 'snug' | 'roomy';

export interface SidebarPrefs {
  tonight: TonightShow;
  style: SidebarStyle;
  /** Floating only: the page shows through the panel. */
  translucent: boolean;
  /** Floating only: highlights glide between rows, the panel springs. */
  fluid: boolean;
  /** Floating only: distance from the screen's edges. */
  gap: FloatGap;
  /** Floating only: kept open instead of folding to a rail. */
  pinned: boolean;
}

export const SIDEBAR_PREFS_DEFAULTS: SidebarPrefs = {
  tonight: 'both',
  style: 'docked',
  translucent: true,
  fluid: true,
  gap: 'snug',
  pinned: false,
};

export const FLOAT_GAP_PX: Record<FloatGap, number> = { snug: 10, roomy: 18 };

const KEY = 'watchly.sidebarPrefs.v1';
// Who the device copy belongs to, so one person's choices never get saved
// to the next person who signs in on the same browser.
const OWNER = '_owner';
const SAVE_DELAY_MS = 600;
const listeners = new Set<() => void>();
let cache: SidebarPrefs | null = null;

const FIELDS = Object.keys(SIDEBAR_PREFS_DEFAULTS) as (keyof SidebarPrefs)[];

function pick(raw: unknown): Partial<SidebarPrefs> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in raw) out[k] = (raw as Record<string, unknown>)[k];
  return out as Partial<SidebarPrefs>;
}

function readStored(): { prefs: Partial<SidebarPrefs>; owner: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return { prefs: pick(raw), owner: typeof raw?.[OWNER] === 'string' ? (raw[OWNER] as string) : null };
  } catch {
    return { prefs: {}, owner: null };
  }
}

function read(): SidebarPrefs {
  if (!cache) cache = { ...SIDEBAR_PREFS_DEFAULTS, ...readStored().prefs };
  return cache;
}

function store(prefs: SidebarPrefs, owner: string | null) {
  cache = prefs;
  try {
    localStorage.setItem(KEY, JSON.stringify(owner ? { ...prefs, [OWNER]: owner } : prefs));
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((l) => l());
}

// ---- Account sync: the device copy shows instantly; the account is the truth.

let syncedFor: string | null = null;
let pending: Partial<SidebarPrefs> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (!syncedFor || Object.keys(pending).length === 0) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const patch = pending;
    pending = {};
    updateSidebarSettingsAction(patch).catch(() => {
      // Still saved on this device; the next change retries the lot.
      pending = { ...patch, ...pending };
    });
  }, SAVE_DELAY_MS);
}

export function setSidebarPrefs(patch: Partial<SidebarPrefs>) {
  store({ ...read(), ...patch }, syncedFor ?? readStored().owner);
  pending = { ...pending, ...patch };
  scheduleSave();
}

/**
 * Once per signed-in person per page load: take their saved settings, or,
 * if they've never saved any, upload what this device has (their earlier
 * per-device choices). Changes made before it lands win.
 */
export async function syncSidebarPrefs(userId: string) {
  if (syncedFor === userId) return;
  syncedFor = userId;
  let saved: Partial<SidebarPrefs> | null = null;
  try {
    saved = await getSidebarSettingsAction();
  } catch {
    return; // Offline or signed out: the device copy stands.
  }
  const local = readStored();
  const mine = !local.owner || local.owner === userId;
  if (saved) {
    store({ ...SIDEBAR_PREFS_DEFAULTS, ...saved, ...pending }, userId);
  } else if (mine && Object.keys(local.prefs).length > 0) {
    store({ ...SIDEBAR_PREFS_DEFAULTS, ...local.prefs, ...pending }, userId);
    pending = { ...local.prefs, ...pending };
  } else {
    store({ ...SIDEBAR_PREFS_DEFAULTS, ...pending }, userId);
  }
  scheduleSave();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Another tab changed them.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSidebarPrefs(): SidebarPrefs {
  return useSyncExternalStore(subscribe, read, () => SIDEBAR_PREFS_DEFAULTS);
}

/** Mount once in the signed-in shell: pulls the account's settings. */
export function useSidebarPrefsSync(userId: string | null | undefined) {
  useEffect(() => {
    if (userId) void syncSidebarPrefs(userId);
  }, [userId]);
}
