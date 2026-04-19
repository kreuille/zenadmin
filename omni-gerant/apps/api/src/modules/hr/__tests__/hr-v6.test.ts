import { describe, it, expect } from 'vitest';
import { computePayroll, PMSS_2026_CENTS } from '../payroll/payroll-calculator.js';

const base = {
  grossBaseCents: 250000,
  hoursWorked: 151.67,
  weeklyHours: 35,
  headcountUnder50: true,
};

describe('V6 — AT-MP specifique entreprise', () => {
  it('taux AT-MP 1.5% par defaut', () => {
    const r = computePayroll({ ...base });
    expect(r.atmpEmployerCents).toBe(3750);
  });

  it('taux AT-MP 3% (secteur a risque)', () => {
    const r = computePayroll({ ...base, atmpRateBp: 300 });
    expect(r.atmpEmployerCents).toBe(7500);
  });

  it('taux AT-MP 0.3% (secteur bas risque)', () => {
    const r = computePayroll({ ...base, atmpRateBp: 30 });
    expect(r.atmpEmployerCents).toBe(750);
  });
});

describe('V6 — PAS (Prelevement a la source)', () => {
  it('taux 0 -> pas de PAS', () => {
    const r = computePayroll({ ...base });
    expect(r.pasCents).toBe(0);
  });

  it('taux 9.2% sur net imposable', () => {
    const r = computePayroll({ ...base, pasRateBp: 920 });
    const expected = Math.round(r.netTaxableCents * 0.092);
    expect(r.pasCents).toBe(expected);
  });

  it('PAS deduit du net a payer', () => {
    const without = computePayroll({ ...base });
    const withPas = computePayroll({ ...base, pasRateBp: 500 });
    expect(withPas.netToPayCents).toBe(without.netToPayCents - withPas.pasCents);
  });

  it('taux 0% = neutre', () => {
    const r = computePayroll({ ...base, pasRateBp: 0 });
    expect(r.pasCents).toBe(0);
  });

  it('taux 40% maximum (salaire tres eleve sans taux personnalise)', () => {
    const r = computePayroll({ ...base, grossBaseCents: 1000000, pasRateBp: 4000 });
    expect(r.pasCents).toBeGreaterThan(0);
    expect(r.pasCents).toBeLessThanOrEqual(r.netTaxableCents);
  });
});

describe('V6 — PMSS 2026', () => {
  it('PMSS exporte et coherent', () => {
    expect(PMSS_2026_CENTS).toBe(386400); // 3 864 EUR
  });
});

describe('V6 — Cumul PAS + AT-MP + mutuelle', () => {
  it('PAS + AT-MP s\'ajoutent aux autres charges', () => {
    const r = computePayroll({
      ...base,
      atmpRateBp: 200,
      pasRateBp: 500,
      mutuelleEmployeeRateBp: 100,
    });
    expect(r.atmpEmployerCents).toBeGreaterThan(0);
    expect(r.pasCents).toBeGreaterThan(0);
    expect(r.mutualEmployeeCents).toBe(2500);
    // Net a payer = brut - (SS + retraite + CSG/CRDS + mutuelle + prevoyance) - PAS
    expect(r.netToPayCents).toBeLessThan(r.netTaxableCents - r.pasCents + 1);
  });
});
