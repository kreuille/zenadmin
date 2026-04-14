import { describe, it, expect, vi } from 'vitest';
import { createPaymentService, type PaymentRepository, type Payment } from '../payment.service.js';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
const INVOICE_ID = '660e8400-e29b-41d4-a716-446655440001';

function createMockRepo(): PaymentRepository {
  return {
    create: vi.fn().mockImplementation(async (data) => ({
      id: crypto.randomUUID(),
      ...data,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      created_at: new Date(),
    })),
    findByInvoice: vi.fn().mockResolvedValue([]),
  };
}

describe('PaymentService', () => {
  describe('create', () => {
    it('creates a payment', async () => {
      const repo = createMockRepo();
      const service = createPaymentService(repo);

      const result = await service.create(TENANT_ID, INVOICE_ID, {
        amount_cents: 5000,
        payment_date: new Date(),
        payment_method: 'bank_transfer',
        reference: 'VIR-001',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amount_cents).toBe(5000);
        expect(result.value.payment_method).toBe('bank_transfer');
        expect(result.value.reference).toBe('VIR-001');
        expect(result.value.invoice_id).toBe(INVOICE_ID);
        expect(result.value.tenant_id).toBe(TENANT_ID);
      }
    });

    it('creates payment without optional fields', async () => {
      const repo = createMockRepo();
      const service = createPaymentService(repo);

      const result = await service.create(TENANT_ID, INVOICE_ID, {
        amount_cents: 10000,
        payment_date: new Date(),
        payment_method: 'cash',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.reference).toBeNull();
        expect(result.value.notes).toBeNull();
      }
    });
  });

  describe('listByInvoice', () => {
    it('returns payments for an invoice', async () => {
      const repo = createMockRepo();
      const service = createPaymentService(repo);

      const result = await service.listByInvoice(INVOICE_ID, TENANT_ID);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });
  });
});
