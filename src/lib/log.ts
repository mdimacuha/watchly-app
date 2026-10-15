// Keys whose VALUES we always redact, regardless of where they appear in
// the object tree. Substring match — `passwordDigest`, `apiKey`, `authToken`
// all hit. Keep this list intentionally narrow; over-redaction here makes
// logs useless for debugging.
const REDACT_KEY_SUBSTRINGS = [
  'password',
  'passwd',
  'token',
  'secret',
  'apikey',
  'api_key',
  'auth',
  'salt',
  'digest',
  'cookie',
  'session',
];

// Value-shape patterns that *probably* shouldn't appear in logs even when
// the key name is innocent. We pattern-match on the value when it's a
// string. These complement the key-name check above.
const VALUE_REDACT_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // App API tokens — `wkly_` prefix followed by base64url.
  { re: /^wkly_[A-Za-z0-9_-]{20,}$/, label: '[REDACTED:wkly]' },
  // Bearer auth header values.
  { re: /^Bearer\s+\S{8,}$/i, label: '[REDACTED:bearer]' },
  // 64-char hex (SHA-256 digests — verification-code / password hashes).
  { re: /^[0-9a-f]{64}$/i, label: '[REDACTED:hex64]' },
  // JWT shape (three base64url segments).
  { re: /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/, label: '[REDACTED:jwt]' },
];

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

function keyShouldRedact(key: string): boolean {
  const lc = key.toLowerCase();
  return REDACT_KEY_SUBSTRINGS.some((s) => lc.includes(s));
}

function valueShouldRedact(value: string): string | null {
  for (const { re, label } of VALUE_REDACT_PATTERNS) {
    if (re.test(value)) return label;
  }
  return null;
}

/**
 * Walk a value, redacting any string whose key (or own shape) marks it as
 * sensitive. Used by every level (info / warn / error) so logs can never
 * leak a token / digest / password regardless of where it ends up in the
 * payload.
 */
function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > MAX_DEPTH) return '[depth-cap]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return valueShouldRedact(value) ?? value;
  }

  if (typeof value !== 'object') return value;

  // Cycle guard — logger should never throw on a self-referencing payload.
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1, seen));
  }

  // Errors: surface .message + .name, redact the rest. .stack is
  // explicitly *kept* — we want it for triage.
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redact(value.message, depth + 1, seen),
      stack: value.stack,
    };
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (keyShouldRedact(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v, depth + 1, seen);
    }
  }
  return out;
}

class Logger {
  private format(level: string, message: string, data?: unknown) {
    return JSON.stringify({
      level,
      message,
      data: data === undefined ? undefined : redact(data),
      timestamp: new Date().toISOString(),
    });
  }

  info(message: string, data?: unknown) {
    console.log(this.format('info', message, data));
  }

  warn(message: string, data?: unknown) {
    console.warn(this.format('warn', message, data));
  }

  error(message: string, error?: unknown, data?: unknown) {
    console.error(
      this.format('error', message, {
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : error,
        ...(typeof data === 'object' && data !== null ? (data as object) : {}),
      })
    );
  }
}

export const logger = new Logger();

/** Exported for unit tests + the rare manual redact-then-pass scenario. */
export { redact };

export function logApiRequest(
  route: string,
  duration: number,
  statusCode: number,
  params: Record<string, unknown>
) {
  const message = `[API Request] ${route} +${duration}ms - ${statusCode}`;
  const payload = { route, duration, statusCode, params };

  if (statusCode >= 500) {
    logger.error(message, undefined, payload);
  } else if (statusCode >= 400) {
    logger.warn(message, payload);
  } else {
    logger.info(message, payload);
  }
}
