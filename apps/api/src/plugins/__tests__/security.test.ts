import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeObject,
  containsXss,
  detectXssInObject,
} from '../sanitize.js';
import { generateCsrfToken, validateCsrfToken } from '../security.js';
import { RATE_LIMIT_PRESETS } from '../rate-limiter.js';
import { encrypt, decrypt, createEncryptionHelper } from '../../lib/encryption.js';

describe('Security Headers', () => {
  it('defines correct rate limit presets', () => {
    expect(RATE_LIMIT_PRESETS.auth.max).toBe(5);
    expect(RATE_LIMIT_PRESETS.auth.timeWindow).toBe(15 * 60 * 1000);
    expect(RATE_LIMIT_PRESETS.api.max).toBe(100);
    expect(RATE_LIMIT_PRESETS.api.timeWindow).toBe(60 * 1000);
    expect(RATE_LIMIT_PRESETS.upload.max).toBe(10);
  });
});

describe('CSRF Token', () => {
  it('generates unique tokens', () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
    expect(token1).toHaveLength(36); // UUID format
  });

  it('validates matching tokens', () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token, token)).toBe(true);
  });

  it('rejects mismatched tokens', () => {
    expect(validateCsrfToken('abc', 'xyz')).toBe(false);
  });

  it('rejects empty tokens', () => {
    expect(validateCsrfToken('', 'token')).toBe(false);
    expect(validateCsrfToken('token', '')).toBe(false);
  });
});

describe('Sanitization', () => {
  describe('sanitizeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
      );
    });

    it('escapes ampersands', () => {
      expect(sanitizeHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes single quotes', () => {
      expect(sanitizeHtml("it's")).toBe('it&#x27;s');
    });

    it('leaves safe strings unchanged', () => {
      expect(sanitizeHtml('Hello World 123')).toBe('Hello World 123');
    });
  });

  describe('sanitizeObject', () => {
    it('sanitizes nested string values', () => {
      const input = {
        name: '<b>Bold</b>',
        address: { city: '<script>alert(1)</script>' },
        tags: ['<img src=x>', 'safe'],
      };
      const result = sanitizeObject(input);
      expect(result.name).toBe('&lt;b&gt;Bold&lt;/b&gt;');
      expect(result.address.city).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(result.tags[0]).toBe('&lt;img src=x&gt;');
      expect(result.tags[1]).toBe('safe');
    });

    it('preserves non-string values', () => {
      const input = { count: 42, active: true, data: null };
      const result = sanitizeObject(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('containsXss', () => {
    it('detects script tags', () => {
      expect(containsXss('<script>alert(1)</script>')).toBe(true);
    });

    it('detects javascript: URLs', () => {
      expect(containsXss('javascript:alert(1)')).toBe(true);
    });

    it('detects event handlers', () => {
      expect(containsXss('onerror=alert(1)')).toBe(true);
      expect(containsXss('onclick=doSomething()')).toBe(true);
    });

    it('detects iframe injection', () => {
      expect(containsXss('<iframe src="evil.com">')).toBe(true);
    });

    it('allows safe strings', () => {
      expect(containsXss('Hello World')).toBe(false);
      expect(containsXss('user@example.com')).toBe(false);
      expect(containsXss('Price: 15.00 EUR')).toBe(false);
    });
  });

  describe('detectXssInObject', () => {
    it('returns empty for clean input', () => {
      expect(detectXssInObject({ name: 'Safe', email: 'a@b.com' })).toEqual([]);
    });

    it('detects XSS in nested fields', () => {
      const input = {
        name: 'Safe',
        bio: '<script>steal()</script>',
        address: { line1: 'normal', line2: 'onclick=hack()' },
      };
      const violations = detectXssInObject(input);
      expect(violations).toContain('bio');
      expect(violations).toContain('address.line2');
      expect(violations).not.toContain('name');
    });
  });
});

describe('AES-256 Encryption', () => {
  const MASTER_KEY = 'my-super-secret-master-key-for-testing';

  it('encrypts and decrypts a string', () => {
    const plaintext = 'FR7630006000011234567890189';
    const encrypted = encrypt(plaintext, MASTER_KEY);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(plaintext.length);

    const decrypted = decrypt(encrypted, MASTER_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random salt+IV)', () => {
    const plaintext = 'same data';
    const enc1 = encrypt(plaintext, MASTER_KEY);
    const enc2 = encrypt(plaintext, MASTER_KEY);
    expect(enc1).not.toBe(enc2); // Random salt + IV
  });

  it('fails to decrypt with wrong key', () => {
    const plaintext = 'sensitive IBAN';
    const encrypted = encrypt(plaintext, MASTER_KEY);

    expect(() => decrypt(encrypted, 'wrong-key-that-is-long-enough')).toThrow();
  });

  it('fails on tampered ciphertext', () => {
    const plaintext = 'secret token';
    const encrypted = encrypt(plaintext, MASTER_KEY);
    const tampered = encrypted.slice(0, -4) + 'XXXX';

    expect(() => decrypt(tampered, MASTER_KEY)).toThrow();
  });

  describe('EncryptionHelper', () => {
    it('encrypts and decrypts object fields', () => {
      const helper = createEncryptionHelper(MASTER_KEY);

      const data = {
        name: 'Company',
        iban: 'FR7630006000011234567890189',
        bic: 'BNPAFRPP',
        public_id: '123',
      };

      const encrypted = helper.encryptFields(data, ['iban', 'bic']);
      expect(encrypted.iban).not.toBe(data.iban);
      expect(encrypted.bic).not.toBe(data.bic);
      expect(encrypted.name).toBe('Company'); // Not encrypted
      expect(encrypted.public_id).toBe('123'); // Not encrypted

      const decrypted = helper.decryptFields(encrypted, ['iban', 'bic']);
      expect(decrypted.iban).toBe('FR7630006000011234567890189');
      expect(decrypted.bic).toBe('BNPAFRPP');
    });

    it('rejects short master key', () => {
      expect(() => createEncryptionHelper('short')).toThrow('at least 16 characters');
    });
  });
});
