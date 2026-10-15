import crypto from 'crypto';

export function makeSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashPassword(password: string, salt: string) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function verifyPassword(password: string, salt: string, digest: string) {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(digest));
}
