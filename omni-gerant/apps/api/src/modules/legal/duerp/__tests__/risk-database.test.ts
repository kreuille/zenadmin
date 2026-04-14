import { describe, it, expect } from 'vitest';
import {
  getRisksByNafCode,
  calculateRiskLevel,
  detectPurchaseRisks,
} from '../risk-database.js';

describe('getRisksByNafCode', () => {
  it('returns BTP risks for NAF 43.xx', () => {
    const profile = getRisksByNafCode('43.21A');
    expect(profile.sector_name).toContain('BTP');
    expect(profile.risks.length).toBeGreaterThan(3);
    expect(profile.risks.some((r) => r.name.includes('hauteur'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('amiante'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('bruit'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('charges'))).toBe(true);
  });

  it('returns BTP risks for NAF 41.xx', () => {
    const profile = getRisksByNafCode('41.20A');
    expect(profile.sector_name).toContain('BTP');
    expect(profile.risks.some((r) => r.name.includes('hauteur'))).toBe(true);
  });

  it('returns restauration risks for NAF 56.xx', () => {
    const profile = getRisksByNafCode('56.10A');
    expect(profile.sector_name).toContain('Restauration');
    expect(profile.risks.some((r) => r.name.includes('ulure'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('oupure'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('lissade'))).toBe(true);
  });

  it('returns commerce risks for NAF 47.xx', () => {
    const profile = getRisksByNafCode('47.11F');
    expect(profile.sector_name).toContain('Commerce');
    expect(profile.risks.some((r) => r.name.includes('TMS'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('gression'))).toBe(true);
  });

  it('returns common risks for unknown NAF code', () => {
    const profile = getRisksByNafCode('99.99Z');
    expect(profile.risks.length).toBeGreaterThan(0);
    expect(profile.risks.some((r) => r.name.includes('routier'))).toBe(true);
    expect(profile.risks.some((r) => r.name.includes('psychosociaux'))).toBe(true);
  });

  it('returns common risks when NAF is null', () => {
    const profile = getRisksByNafCode(null);
    expect(profile.sector_name).toBe('Secteur non identifie');
    expect(profile.risks.length).toBeGreaterThan(0);
  });

  it('always includes common risks', () => {
    const btpProfile = getRisksByNafCode('43.21A');
    expect(btpProfile.risks.some((r) => r.id.startsWith('common-'))).toBe(true);
  });

  it('each risk has required fields', () => {
    const profile = getRisksByNafCode('43.21A');
    for (const risk of profile.risks) {
      expect(risk.id).toBeTruthy();
      expect(risk.category).toBeTruthy();
      expect(risk.name).toBeTruthy();
      expect(risk.default_gravity).toBeGreaterThanOrEqual(1);
      expect(risk.default_gravity).toBeLessThanOrEqual(4);
      expect(risk.default_probability).toBeGreaterThanOrEqual(1);
      expect(risk.default_probability).toBeLessThanOrEqual(4);
      expect(risk.preventive_actions.length).toBeGreaterThan(0);
    }
  });
});

describe('calculateRiskLevel', () => {
  it('returns faible for low scores (1-3)', () => {
    expect(calculateRiskLevel(1, 1)).toEqual({ score: 1, level: 'faible', color: 'green' });
    expect(calculateRiskLevel(1, 3)).toEqual({ score: 3, level: 'faible', color: 'green' });
    expect(calculateRiskLevel(3, 1)).toEqual({ score: 3, level: 'faible', color: 'green' });
  });

  it('returns modere for medium scores (4-6)', () => {
    expect(calculateRiskLevel(2, 2)).toEqual({ score: 4, level: 'modere', color: 'yellow' });
    expect(calculateRiskLevel(2, 3)).toEqual({ score: 6, level: 'modere', color: 'yellow' });
  });

  it('returns eleve for high scores (7-9)', () => {
    expect(calculateRiskLevel(3, 3)).toEqual({ score: 9, level: 'eleve', color: 'orange' });
  });

  it('returns critique for very high scores (10-16)', () => {
    expect(calculateRiskLevel(4, 3)).toEqual({ score: 12, level: 'critique', color: 'red' });
    expect(calculateRiskLevel(4, 4)).toEqual({ score: 16, level: 'critique', color: 'red' });
    expect(calculateRiskLevel(3, 4)).toEqual({ score: 12, level: 'critique', color: 'red' });
  });
});

describe('detectPurchaseRisks', () => {
  it('detects chemical products in purchase description', () => {
    const result = detectPurchaseRisks('Achat de peinture et solvant pour renovation');
    expect(result.length).toBeGreaterThan(0);
    const chemical = result.find((r) => r.type === 'chemical');
    expect(chemical).toBeDefined();
    expect(chemical!.keywords).toContain('peinture');
    expect(chemical!.keywords).toContain('solvant');
  });

  it('detects equipment in purchase description', () => {
    const result = detectPurchaseRisks('Location echafaudage et nacelle');
    const equipment = result.find((r) => r.type === 'equipment');
    expect(equipment).toBeDefined();
    expect(equipment!.keywords).toContain('echafaudage');
    expect(equipment!.keywords).toContain('nacelle');
  });

  it('detects both chemical and equipment', () => {
    const result = detectPurchaseRisks('Achat meuleuse + diluant');
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.type === 'chemical')).toBe(true);
    expect(result.some((r) => r.type === 'equipment')).toBe(true);
  });

  it('returns empty for benign descriptions', () => {
    const result = detectPurchaseRisks('Achat de papier et stylos');
    expect(result).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const result = detectPurchaseRisks('ACHAT AMIANTE DIAGNOSTIC');
    expect(result.length).toBeGreaterThan(0);
  });
});
