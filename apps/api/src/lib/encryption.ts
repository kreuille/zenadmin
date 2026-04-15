import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// BUSINESS RULE [CDC-6]: Chiffrement AES-256-GCM pour donnees sensibles
// Utilisé pour: credentials connecteurs, tokens bancaires, IBAN/BIC

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Derive an AES-256 key from a password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns: base64(salt + iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string, masterKey: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: salt(32) + iv(16) + authTag(16) + ciphertext
  const packed = Buffer.concat([salt, iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt ciphertext encrypted with AES-256-GCM
 */
export function decrypt(encryptedBase64: string, masterKey: string): string {
  const packed = Buffer.from(encryptedBase64, 'base64');

  const salt = packed.subarray(0, SALT_LENGTH);
  const iv = packed.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = packed.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const key = deriveKey(masterKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Create an encryption helper bound to a master key
 */
export function createEncryptionHelper(masterKey: string) {
  if (!masterKey || masterKey.length < 16) {
    throw new Error('Master key must be at least 16 characters');
  }

  return {
    encrypt: (plaintext: string) => encrypt(plaintext, masterKey),
    decrypt: (ciphertext: string) => decrypt(ciphertext, masterKey),

    /**
     * Encrypt sensitive fields in an object
     */
    encryptFields<T extends Record<string, unknown>>(
      obj: T,
      fields: (keyof T)[],
    ): T {
      const result = { ...obj };
      for (const field of fields) {
        const value = result[field];
        if (typeof value === 'string' && value.length > 0) {
          (result as Record<string, unknown>)[field as string] = encrypt(value, masterKey);
        }
      }
      return result;
    },

    /**
     * Decrypt sensitive fields in an object
     */
    decryptFields<T extends Record<string, unknown>>(
      obj: T,
      fields: (keyof T)[],
    ): T {
      const result = { ...obj };
      for (const field of fields) {
        const value = result[field];
        if (typeof value === 'string' && value.length > 0) {
          try {
            (result as Record<string, unknown>)[field as string] = decrypt(value, masterKey);
          } catch {
            // Field may not be encrypted — leave as-is
          }
        }
      }
      return result;
    },
  };
}
