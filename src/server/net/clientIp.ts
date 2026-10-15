import 'server-only';

/**
 * Best-effort client-IP extraction from request headers. Reads in
 * priority order:
 *   1. `cf-connecting-ip` — Cloudflare-injected; trustworthy when CF
 *      sits in front of us.
 *   2. `x-real-ip` — set by most ingress proxies (nginx, ELB) to the
 *      direct upstream client.
 *   3. `x-forwarded-for` — first entry in the comma-separated chain.
 *      Spoofable, but in practice the platform layer rewrites it.
 *
 * Falls back to the sentinel `'unknown'` so rate-limit keys still
 * function: every unknown-IP request lands in one bucket, which is the
 * right behaviour (sloppy ingress shouldn't let attackers bypass the
 * limit by stripping headers).
 */
export function getClientIp(request: Request): string {
  const h = request.headers;

  const cf = h.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const real = h.get('x-real-ip');
  if (real) return real.trim();

  const fwd = h.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }

  return 'unknown';
}
