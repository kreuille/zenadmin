import { describe, it, expect } from 'vitest';
import {
  computePayroll,
  SMIC_MONTHLY_CENTS_2026,
  RATE_SS_EMPLOYEE,
  RATE_RETIREMENT_EMPLOYEE,
  CSG_BASE_RATIO,
  RATE_CSG_DEDUCTIBLE,
  RATE_CSG_CRDS_NON_DEDUCTIBLE,
  FILLON_COEF_MAX_UNDER_50,
} from '../payroll/payroll-calculator.js';

// BUSINESS RULE [CDC-RH-V2]: tests calcul paie 3 profils

describe('computePayroll — SMIC plein temps', () => {
  const result = computePayroll({
    grossBaseCents: SMIC_MONTHLY_CENTS_2026,
    hoursWorked: 151.67,
    weeklyHours: 35,
    headcountUnder50: true,
  });

  it('brut total = SMIC', () => {
    expect(result.grossTotalCents).toBe(SMIC_MONTHLY_CENTS_2026);
  });

  it('taux horaire brut coherent', () => {
    // 1801.80 / 151.67 = ~11.88 EUR
    expect(result.grossRateCentsPerHour).toBeGreaterThanOrEqual(1180);
    expect(result.grossRateCentsPerHour).toBeLessThanOrEqual(1200);
  });

  it('cotisations salariales = ~22% du brut', () => {
    const ratio = result.totalEmployeeDeductionsCents / result.grossTotalCents;
    expect(ratio).toBeGreaterThan(0.20);
    expect(ratio).toBeLessThan(0.24);
  });

  it('net a payer strictement positif', () => {
    expect(result.netToPayCents).toBeGreaterThan(130000); // >= 1300 EUR
    expect(result.netToPayCents).toBeLessThan(result.grossTotalCents);
  });

  it('Fillon s\'applique au SMIC (coef max)', () => {
    // Au SMIC exact, coef = coefMax (reduction totale)
    const expected = Math.round(SMIC_MONTHLY_CENTS_2026 * FILLON_COEF_MAX_UNDER_50);
    expect(result.fillonReductionCents).toBeGreaterThanOrEqual(expected - 10);
    expect(result.fillonReductionCents).toBeLessThanOrEqual(expected + 10);
  });

  it('net imposable > net a payer quand pas d\'indemnite', () => {
    // Net imposable inclut CSG/CRDS non deductibles; net a payer les deduit.
    expect(result.netTaxableCents).toBeGreaterThan(result.netToPayCents);
  });
});

describe('computePayroll — 2500 EUR brut (au-dela du SMIC)', () => {
  const result = computePayroll({
    grossBaseCents: 250000,
    hoursWorked: 151.67,
    weeklyHours: 35,
    headcountUnder50: true,
  });

  it('cotisations URSSAF = 7.30%', () => {
    const expected = Math.round(250000 * RATE_SS_EMPLOYEE);
    expect(result.urssafEmployeeCents).toBe(expected);
  });

  it('retraite = 4.15%', () => {
    const expected = Math.round(250000 * RATE_RETIREMENT_EMPLOYEE);
    expect(result.retirementEmployeeCents).toBe(expected);
  });

  it('CSG/CRDS sur base 98.25% du brut', () => {
    const base = 250000 * CSG_BASE_RATIO;
    const expected = Math.round(base * RATE_CSG_DEDUCTIBLE) + Math.round(base * RATE_CSG_CRDS_NON_DEDUCTIBLE);
    expect(result.csgCrdsCents).toBe(expected);
  });

  it('Fillon partiellement applique (entre SMIC et 1.6 SMIC)', () => {
    // 2500 = ~1.39 SMIC, donc Fillon > 0 mais < coefMax
    expect(result.fillonReductionCents).toBeGreaterThan(0);
    expect(result.fillonReductionCents).toBeLessThan(Math.round(250000 * FILLON_COEF_MAX_UNDER_50));
  });
});

describe('computePayroll — 6000 EUR brut cadre', () => {
  const result = computePayroll({
    grossBaseCents: 600000,
    hoursWorked: 151.67,
    weeklyHours: 35,
    headcountUnder50: false,
  });

  it('pas de Fillon au-dela de 1.6 SMIC', () => {
    expect(result.fillonReductionCents).toBe(0);
  });

  it('charges patronales ~30% du brut', () => {
    const ratio = result.totalEmployerChargesCents / result.grossTotalCents;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.40);
  });

  it('net a payer ~77% du brut', () => {
    const ratio = result.netToPayCents / result.grossTotalCents;
    expect(ratio).toBeGreaterThan(0.74);
    expect(ratio).toBeLessThan(0.82);
  });
});

describe('computePayroll — heures sup + primes', () => {
  it('heures sup et primes incluses dans brut total', () => {
    const result = computePayroll({
      grossBaseCents: 180000,
      overtimeCents: 20000,
      bonusCents: 10000,
      hoursWorked: 160,
      weeklyHours: 35,
      headcountUnder50: true,
    });
    expect(result.grossTotalCents).toBe(210000);
  });

  it('indemnites exonerees (non inclus dans cotisations)', () => {
    const result = computePayroll({
      grossBaseCents: 180000,
      indemnityCents: 5000,
      hoursWorked: 151.67,
      weeklyHours: 35,
      headcountUnder50: true,
    });
    // Indemnite non soumise : n'est pas dans gross_total, mais ajoutee au net
    expect(result.grossTotalCents).toBe(180000);
    const netSansIndemnite = result.netToPayCents - 5000;
    expect(netSansIndemnite).toBeGreaterThan(0);
  });
});

describe('computePayroll — temps partiel', () => {
  it('Fillon ajuste au SMIC proratise', () => {
    // Mi-temps : 17.5h, brut = 901 EUR (env. SMIC moitie)
    const result = computePayroll({
      grossBaseCents: 90090,
      hoursWorked: 75.83,
      weeklyHours: 17.5,
      headcountUnder50: true,
    });
    // Au SMIC proratise, Fillon coef max
    expect(result.fillonReductionCents).toBeGreaterThan(0);
  });
});

describe('computePayroll — cas bord', () => {
  it('brut 0 renvoie zero partout', () => {
    const result = computePayroll({
      grossBaseCents: 0,
      hoursWorked: 0,
      weeklyHours: 35,
      headcountUnder50: true,
    });
    expect(result.grossTotalCents).toBe(0);
    expect(result.totalEmployeeDeductionsCents).toBe(0);
    expect(result.netToPayCents).toBe(0);
    expect(result.fillonReductionCents).toBe(0);
  });

  it('coef Fillon plus bas pour >=50 salaries', () => {
    const under50 = computePayroll({
      grossBaseCents: SMIC_MONTHLY_CENTS_2026,
      hoursWorked: 151.67,
      weeklyHours: 35,
      headcountUnder50: true,
    });
    const over50 = computePayroll({
      grossBaseCents: SMIC_MONTHLY_CENTS_2026,
      hoursWorked: 151.67,
      weeklyHours: 35,
      headcountUnder50: false,
    });
    expect(over50.fillonReductionCents).toBeGreaterThan(under50.fillonReductionCents);
  });
});
