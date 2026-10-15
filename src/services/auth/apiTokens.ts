import 'server-only';

import crypto from 'node:crypto';
import { db } from '@/db';
import { apiTokens } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ValidationAppError, NotFoundAppError } from '@/utils/errors';

const TOKEN_BYTES = 32;

function generateRawToken(): string {
  // `wkly_` prefix makes leaked tokens easy to recognize in logs.
  return `wkly_${crypto.randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface ApiTokenSummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/**
 * Issues a new API token for the user. Returns the raw token ONCE — it's
 * never retrievable again. Caller surfaces it to the user via a "copy and
 * keep this safe" UI.
 */
export async function createApiToken(
  userId: string,
  name: string,
): Promise<{ token: string; summary: ApiTokenSummary }> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationAppError('Token name is required');
  }
  if (trimmed.length > 50) {
    throw new ValidationAppError('Token name is too long');
  }

  const token = generateRawToken();
  const tokenHash = hashToken(token);

  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name: trimmed, tokenHash })
    .returning();

  return {
    token,
    summary: {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    },
  };
}

export async function listApiTokens(
  userId: string,
): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
  return rows;
}

export async function revokeApiToken(
  userId: string,
  id: string,
): Promise<void> {
  const result = await db
    .delete(apiTokens)
    .where(eq(apiTokens.id, id))
    .returning({ userId: apiTokens.userId });
  if (result.length === 0 || result[0].userId !== userId) {
    throw new NotFoundAppError('Token not found');
  }
}

/**
 * Look up a bearer token, returning the owning userId on success.
 * Bumps last_used_at as a side effect. Returns null when the token is
 * unknown or has been revoked.
 */
export async function verifyApiToken(
  raw: string,
): Promise<{ userId: string } | null> {
  if (!raw) return null;
  const hash = hashToken(raw);
  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hash),
    columns: { id: true, userId: true },
  });
  if (!row) return null;
  // Best-effort lastUsedAt update — failure here shouldn't deny auth.
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {
      /* ignore */
    });
  return { userId: row.userId };
}
