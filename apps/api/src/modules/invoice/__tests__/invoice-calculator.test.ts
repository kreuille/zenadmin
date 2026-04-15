import { describe, it, expect } from 'vitest';
import {
  calculateInvoiceLineTotal,
  calculateInvoiceTotals,
  calculateDepositTotals,
  type InvoiceLineInput,
} from '../invoice-calculator.js';

describe('Invoice Calculator', () => {
  describe('calculateInvoiceLineTotal', () => {
    it('calculates simple line total', () => {
      const result = calculateInvoiceLineTotal({ quantity: 3, unit_price_cents: 2000, tva_rate: 2000 });
      expect(result.total_ht_cents).toBe(6000);
    });

    it('handles decimal quantities', () => {
      const result = calculateInvoiceLineTotal({ quantity: 1.5, unit_price_cents: 4000, tva_rate: 2000 });
      expect(result.total_ht_cents).toBe(6000);
    });

    it('rounds correctly', () => {
      const result = calculateInvoiceLineTotal({ quantity: 3, unit_price_cents: 333, tva_rate: 2000 });
      expect(result.total_ht_cents).toBe(999);
    });
  });

  describe('calculateInvoiceTotals', () => {
    it('calculates single-rate invoice', () => {
      const lines: InvoiceLineInput[] = [
        { quantity: 1, unit_price_cents: 10000, tva_rate: 2000 },
        { quantity: 2, unit_price_cents: 5000, tva_rate: 2000 },
      ];
      const totals = calculateInvoiceTotals(lines);

      expect(totals.total_ht_cents).toBe(20000);
      expect(totals.total_tva_cents).toBe(4000);
      expect(totals.total_ttc_cents).toBe(24000);
      expect(totals.tva_breakdown).toHaveLength(1);
    });

    it('calculates multi-rate invoice', () => {
      const lines: InvoiceLineInput[] = [
        { quantity: 1, unit_price_cents: 10000, tva_rate: 2000 },
        { quantity: 1, unit_price_cents: 5000, tva_rate: 1000 },
        { quantity: 1, unit_price_cents: 2000, tva_rate: 550 },
      ];
      const totals = calculateInvoiceTotals(lines);

      expect(totals.total_ht_cents).toBe(17000);
      expect(totals.tva_breakdown).toHaveLength(3);

      const tva20 = totals.tva_breakdown.find((g) => g.tva_rate === 2000);
      expect(tva20!.tva_cents).toBe(2000);

      const tva10 = totals.tva_breakdown.find((g) => g.tva_rate === 1000);
      expect(tva10!.tva_cents).toBe(500);

      const tva55 = totals.tva_breakdown.find((g) => g.tva_rate === 550);
      expect(tva55!.tva_cents).toBe(110);
    });

    it('handles empty lines', () => {
      const totals = calculateInvoiceTotals([]);
      expect(totals.total_ht_cents).toBe(0);
      expect(totals.total_ttc_cents).toBe(0);
    });
  });

  // BUSINESS RULE [CDC-2.1]: Facture d'acompte 30%
  describe('calculateDepositTotals', () => {
    it('calculates 30% deposit', () => {
      const fullTotals = calculateInvoiceTotals([
        { quantity: 1, unit_price_cents: 10000, tva_rate: 2000 },
      ]);
      // Full: HT=10000, TVA=2000, TTC=12000

      const deposit = calculateDepositTotals(fullTotals, 3000); // 30%
      expect(deposit.total_ht_cents).toBe(3000); // 10000 * 0.3
      expect(deposit.total_tva_cents).toBe(600); // 3000 * 20%
      expect(deposit.total_ttc_cents).toBe(3600);
    });

    it('calculates deposit on multi-rate invoice', () => {
      const fullTotals = calculateInvoiceTotals([
        { quantity: 1, unit_price_cents: 10000, tva_rate: 2000 },
        { quantity: 1, unit_price_cents: 5000, tva_rate: 1000 },
      ]);

      const deposit = calculateDepositTotals(fullTotals, 5000); // 50%
      expect(deposit.tva_breakdown).toHaveLength(2);

      const tva20 = deposit.tva_breakdown.find((g) => g.tva_rate === 2000);
      expect(tva20!.base_ht_cents).toBe(5000); // 10000 * 0.5

      const tva10 = deposit.tva_breakdown.find((g) => g.tva_rate === 1000);
      expect(tva10!.base_ht_cents).toBe(2500); // 5000 * 0.5
    });
  });
});
