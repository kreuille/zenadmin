import { describe, it, expect } from 'vitest';
import { calculateLineTotal, calculateQuoteTotals, type LineInput } from '../quote-calculator.js';

// BUSINESS RULE [CDC-2.1]: Tests calcul TVA multi-taux

describe('calculateLineTotal', () => {
  it('calculates simple line total', () => {
    const line: LineInput = {
      type: 'line',
      quantity: 2,
      unit_price_cents: 1500, // 15.00 EUR
      tva_rate: 2000,
    };
    const result = calculateLineTotal(line);
    expect(result.total_ht_cents).toBe(3000); // 30.00 EUR
  });

  it('handles decimal quantities', () => {
    const line: LineInput = {
      type: 'line',
      quantity: 2.5,
      unit_price_cents: 1000,
      tva_rate: 2000,
    };
    expect(calculateLineTotal(line).total_ht_cents).toBe(2500);
  });

  it('returns 0 for non-line types', () => {
    expect(calculateLineTotal({ type: 'section', quantity: 1, unit_price_cents: 1000, tva_rate: 2000 }).total_ht_cents).toBe(0);
    expect(calculateLineTotal({ type: 'comment', quantity: 1, unit_price_cents: 1000, tva_rate: 2000 }).total_ht_cents).toBe(0);
    expect(calculateLineTotal({ type: 'subtotal', quantity: 1, unit_price_cents: 1000, tva_rate: 2000 }).total_ht_cents).toBe(0);
  });

  it('applies percentage discount', () => {
    const line: LineInput = {
      type: 'line',
      quantity: 1,
      unit_price_cents: 10000, // 100.00 EUR
      tva_rate: 2000,
      discount_type: 'percentage',
      discount_value: 1000, // 10%
    };
    expect(calculateLineTotal(line).total_ht_cents).toBe(9000); // 90.00 EUR
  });

  it('applies fixed discount', () => {
    const line: LineInput = {
      type: 'line',
      quantity: 1,
      unit_price_cents: 10000,
      tva_rate: 2000,
      discount_type: 'fixed',
      discount_value: 2500, // 25.00 EUR
    };
    expect(calculateLineTotal(line).total_ht_cents).toBe(7500); // 75.00 EUR
  });

  it('never returns negative total', () => {
    const line: LineInput = {
      type: 'line',
      quantity: 1,
      unit_price_cents: 1000,
      tva_rate: 2000,
      discount_type: 'fixed',
      discount_value: 5000, // discount > price
    };
    expect(calculateLineTotal(line).total_ht_cents).toBe(0);
  });

  it('handles zero quantity', () => {
    const line: LineInput = {
      type: 'line',
      quantity: 0,
      unit_price_cents: 1000,
      tva_rate: 2000,
    };
    expect(calculateLineTotal(line).total_ht_cents).toBe(0);
  });
});

describe('calculateQuoteTotals', () => {
  it('calculates single rate quote', () => {
    const lines: LineInput[] = [
      { type: 'line', quantity: 2, unit_price_cents: 5000, tva_rate: 2000 },
      { type: 'line', quantity: 1, unit_price_cents: 3000, tva_rate: 2000 },
    ];
    const totals = calculateQuoteTotals(lines);

    expect(totals.total_ht_cents).toBe(13000); // 130.00
    expect(totals.total_tva_cents).toBe(2600); // 130 * 20%
    expect(totals.total_ttc_cents).toBe(15600);
    expect(totals.tva_breakdown).toHaveLength(1);
    expect(totals.tva_breakdown[0]!.tva_rate).toBe(2000);
  });

  // BUSINESS RULE [CDC-2.1]: TVA multi-taux sur un meme document
  it('calculates multi-rate quote (20%, 10%, 5.5%)', () => {
    const lines: LineInput[] = [
      { type: 'line', quantity: 1, unit_price_cents: 10000, tva_rate: 2000 }, // 100 EUR HT, 20 TVA
      { type: 'line', quantity: 1, unit_price_cents: 5000, tva_rate: 1000 },  // 50 EUR HT, 5 TVA
      { type: 'line', quantity: 1, unit_price_cents: 2000, tva_rate: 550 },   // 20 EUR HT, 1.10 TVA
    ];
    const totals = calculateQuoteTotals(lines);

    expect(totals.total_ht_cents).toBe(17000); // 170.00
    expect(totals.tva_breakdown).toHaveLength(3);

    // Check 20% group
    const tva20 = totals.tva_breakdown.find((g) => g.tva_rate === 2000);
    expect(tva20).toBeDefined();
    expect(tva20!.base_ht_cents).toBe(10000);
    expect(tva20!.tva_cents).toBe(2000);

    // Check 10% group
    const tva10 = totals.tva_breakdown.find((g) => g.tva_rate === 1000);
    expect(tva10).toBeDefined();
    expect(tva10!.base_ht_cents).toBe(5000);
    expect(tva10!.tva_cents).toBe(500);

    // Check 5.5% group
    const tva55 = totals.tva_breakdown.find((g) => g.tva_rate === 550);
    expect(tva55).toBeDefined();
    expect(tva55!.base_ht_cents).toBe(2000);
    expect(tva55!.tva_cents).toBe(110);

    // Total TVA = 2000 + 500 + 110 = 2610
    expect(totals.total_tva_cents).toBe(2610);
    expect(totals.total_ttc_cents).toBe(19610);
  });

  it('ignores non-line types in calculations', () => {
    const lines: LineInput[] = [
      { type: 'section', quantity: 0, unit_price_cents: 0, tva_rate: 0 },
      { type: 'line', quantity: 1, unit_price_cents: 10000, tva_rate: 2000 },
      { type: 'comment', quantity: 0, unit_price_cents: 0, tva_rate: 0 },
    ];
    const totals = calculateQuoteTotals(lines);
    expect(totals.total_ht_cents).toBe(10000);
    expect(totals.total_tva_cents).toBe(2000);
  });

  it('applies global percentage discount proportionally', () => {
    const lines: LineInput[] = [
      { type: 'line', quantity: 1, unit_price_cents: 10000, tva_rate: 2000 },
      { type: 'line', quantity: 1, unit_price_cents: 5000, tva_rate: 1000 },
    ];
    // 10% global discount
    const totals = calculateQuoteTotals(lines, { type: 'percentage', value: 1000 });

    // HT before discount: 15000, after 10% discount: ~13500
    const tva20 = totals.tva_breakdown.find((g) => g.tva_rate === 2000);
    expect(tva20!.base_ht_cents).toBe(9000); // 10000 * 0.9

    const tva10 = totals.tva_breakdown.find((g) => g.tva_rate === 1000);
    expect(tva10!.base_ht_cents).toBe(4500); // 5000 * 0.9

    expect(totals.total_ht_cents).toBe(13500);
  });

  it('applies global fixed discount proportionally', () => {
    const lines: LineInput[] = [
      { type: 'line', quantity: 1, unit_price_cents: 10000, tva_rate: 2000 }, // 66.67% of total
      { type: 'line', quantity: 1, unit_price_cents: 5000, tva_rate: 1000 },  // 33.33% of total
    ];
    // 3000 centimes (30 EUR) fixed discount
    const totals = calculateQuoteTotals(lines, { type: 'fixed', value: 3000 });

    // Total HT = 15000 - 3000 = 12000
    expect(totals.total_ht_cents).toBe(12000);
  });

  it('handles empty lines', () => {
    const totals = calculateQuoteTotals([]);
    expect(totals.total_ht_cents).toBe(0);
    expect(totals.total_tva_cents).toBe(0);
    expect(totals.total_ttc_cents).toBe(0);
    expect(totals.tva_breakdown).toHaveLength(0);
  });

  // BUSINESS RULE [R02]: Test arrondi - pas de centimes perdus
  it('rounds correctly without losing centimes', () => {
    const lines: LineInput[] = [
      { type: 'line', quantity: 3, unit_price_cents: 333, tva_rate: 2000 }, // 9.99 EUR
    ];
    const totals = calculateQuoteTotals(lines);
    // 3 * 333 = 999
    expect(totals.total_ht_cents).toBe(999);
    // TVA = round(999 * 2000 / 10000) = round(199.8) = 200
    expect(totals.total_tva_cents).toBe(200);
    expect(totals.total_ttc_cents).toBe(1199);
  });

  it('sorts TVA breakdown by rate descending', () => {
    const lines: LineInput[] = [
      { type: 'line', quantity: 1, unit_price_cents: 1000, tva_rate: 550 },
      { type: 'line', quantity: 1, unit_price_cents: 1000, tva_rate: 2000 },
      { type: 'line', quantity: 1, unit_price_cents: 1000, tva_rate: 1000 },
    ];
    const totals = calculateQuoteTotals(lines);
    expect(totals.tva_breakdown[0]!.tva_rate).toBe(2000);
    expect(totals.tva_breakdown[1]!.tva_rate).toBe(1000);
    expect(totals.tva_breakdown[2]!.tva_rate).toBe(550);
  });
});
