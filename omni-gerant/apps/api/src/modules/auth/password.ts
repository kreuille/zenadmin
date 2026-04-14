import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Using scrypt instead of argon2 to avoid native compilation issues.
// Scrypt is a memory-hard KDF recommended by OWASP for password hashing.

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  }).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts[0] !== 'scrypt' || !parts[1] || !parts[2]) {
    return false;
  }
  const salt = parts[1];
  const hash = parts[2];

  const derived = scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  }).toString('hex');

  return timingSafeEqual(Buffer.from(hash), Buffer.from(derived));
}
