import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOcrClient } from '../ocr-client.js';

const OCR_BASE_URL = 'http://localhost:8001';

describe('OcrClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('extractDocument', () => {
    it('returns extraction result on success', async () => {
      const mockResult = {
        document_type: 'facture',
        document_type_confidence: 0.9,
        fields: {
          supplier_name: 'Test Supplier',
          supplier_name_confidence: 0.8,
          invoice_number: 'FAC-001',
          invoice_number_confidence: 0.9,
          invoice_date: '2026-04-14',
          invoice_date_confidence: 0.8,
          due_date: null,
          due_date_confidence: 0.0,
          total_ht_cents: 100000,
          total_ht_confidence: 0.85,
          total_tva_cents: 20000,
          total_tva_confidence: 0.85,
          total_ttc_cents: 120000,
          total_ttc_confidence: 0.9,
          tva_breakdown: [],
        },
        lines: [],
        overall_confidence: 0.82,
        raw_text: 'Test',
        warnings: [],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const client = createOcrClient({ baseUrl: OCR_BASE_URL });
      const result = await client.extractDocument(Buffer.from('test'), 'test.png');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.document_type).toBe('facture');
        expect(result.value.fields.supplier_name).toBe('Test Supplier');
        expect(result.value.overall_confidence).toBe(0.82);
      }
    });

    it('returns error on OCR service failure', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ detail: 'OCR engine failed' }),
      });

      const client = createOcrClient({ baseUrl: OCR_BASE_URL });
      const result = await client.extractDocument(Buffer.from('test'), 'test.png');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
      }
    });

    it('returns error on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const client = createOcrClient({ baseUrl: OCR_BASE_URL });
      const result = await client.extractDocument(Buffer.from('test'), 'test.png');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.message).toContain('Connection refused');
      }
    });
  });

  describe('healthCheck', () => {
    it('returns ok on healthy service', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', engine: 'tesseract' }),
      });

      const client = createOcrClient({ baseUrl: OCR_BASE_URL });
      const result = await client.healthCheck();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('ok');
      }
    });

    it('returns error on unhealthy service', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

      const client = createOcrClient({ baseUrl: OCR_BASE_URL });
      const result = await client.healthCheck();

      expect(result.ok).toBe(false);
    });
  });
});
