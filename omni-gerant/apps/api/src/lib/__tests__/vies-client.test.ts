import { describe, it, expect, vi } from 'vitest';
import { createViesClient, computeFrenchTvaNumber } from '../vies-client.js';

describe('vies-client', () => {
  describe('computeFrenchTvaNumber', () => {
    it('computes correct TVA number from SIREN', () => {
      // Formula: FR + ((12 + 3 × (SIREN mod 97)) mod 97) + SIREN
      const result = computeFrenchTvaNumber('890246390');
      expect(result).toMatch(/^FR\d{2}890246390$/);
      expect(result.length).toBe(13);
    });

    it('pads key to 2 digits', () => {
      const result = computeFrenchTvaNumber('000000097');
      expect(result).toMatch(/^FR\d{2}000000097$/);
    });

    it('returns empty for invalid SIREN', () => {
      expect(computeFrenchTvaNumber('123')).toBe('');
      expect(computeFrenchTvaNumber('abcdefghi')).toBe('');
    });
  });

  describe('checkVatNumber', () => {
    it('returns valid result for valid VAT number', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          isValid: true,
          countryCode: 'FR',
          vatNumber: '12890246390',
          name: 'YOKTO',
          address: '10 Rue Test, 75001 Paris',
          requestDate: '2026-04-15',
        }),
      });

      const client = createViesClient(mockFetch as unknown as typeof fetch);
      const result = await client.checkVatNumber('FR', '12890246390');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.name).toBe('YOKTO');
    });

    it('returns invalid for non-existent VAT', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          isValid: false,
          countryCode: 'FR',
          vatNumber: '00000000000',
          name: '---',
          address: '---',
          requestDate: '2026-04-15',
        }),
      });

      const client = createViesClient(mockFetch as unknown as typeof fetch);
      const result = await client.checkVatNumber('FR', '00000000000');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.valid).toBe(false);
      expect(result.value.name).toBeNull();
    });

    it('returns error for invalid country code', async () => {
      const client = createViesClient();
      const result = await client.checkVatNumber('XYZ', '123');

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles API errors gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const client = createViesClient(mockFetch as unknown as typeof fetch);
      const result = await client.checkVatNumber('FR', '12890246390');

      expect(result.ok).toBe(false);
    });

    it('normalizes VAT number (removes spaces and dashes)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          isValid: true,
          countryCode: 'FR',
          vatNumber: '12890246390',
          requestDate: '2026-04-15',
        }),
      });

      const client = createViesClient(mockFetch as unknown as typeof fetch);
      await client.checkVatNumber('FR', '12 890-246.390');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ countryCode: 'FR', vatNumber: '12890246390' }),
        }),
      );
    });
  });
});
