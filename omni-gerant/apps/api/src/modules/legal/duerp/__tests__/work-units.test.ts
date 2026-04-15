import { describe, it, expect } from 'vitest';
import { generateWorkUnits, getWorkUnitTypes } from '../work-units.generator.js';

// BUSINESS RULE [CDC-2.4]: Tests du generateur d'unites de travail

describe('generateWorkUnits', () => {
  it('generates BTP work units for NAF 43.xx', () => {
    const units = generateWorkUnits('43.21A');

    expect(units.length).toBeGreaterThanOrEqual(4);
    // BTP should have chantier, atelier, vehicule, stockage
    const types = units.map((u) => u.type);
    expect(types).toContain('chantier');
    expect(types).toContain('atelier');
    expect(types).toContain('vehicule');
    expect(types).toContain('stockage');
    // All should be auto
    expect(units.filter((u) => u.is_auto).length).toBe(units.length);
  });

  it('generates restauration work units for NAF 56.xx', () => {
    const units = generateWorkUnits('56.10A');

    expect(units.length).toBeGreaterThanOrEqual(3);
    // Restauration should have cuisine (atelier), salle (exterieur), reserve (stockage)
    expect(units.some((u) => u.name.includes('Cuisine'))).toBe(true);
    expect(units.some((u) => u.name.includes('Salle'))).toBe(true);
    expect(units.some((u) => u.name.includes('Reserve'))).toBe(true);
  });

  it('generates commerce work units for NAF 47.xx', () => {
    const units = generateWorkUnits('47.11A');

    expect(units.some((u) => u.name.includes('vente'))).toBe(true);
    expect(units.some((u) => u.type === 'bureau')).toBe(true);
  });

  it('generates bureau work units for NAF 62.xx (IT)', () => {
    const units = generateWorkUnits('62.01Z');

    expect(units.some((u) => u.type === 'bureau')).toBe(true);
    expect(units.some((u) => u.name.includes('Bureau') || u.name.includes('Open'))).toBe(true);
  });

  it('generates sante work units for NAF 86.xx', () => {
    const units = generateWorkUnits('86.21Z');

    expect(units.some((u) => u.name.includes('Salle de soins') || u.name.includes('Consultation'))).toBe(true);
    expect(units.some((u) => u.type === 'stockage')).toBe(true);
  });

  it('generates agriculture work units for NAF 01.xx', () => {
    const units = generateWorkUnits('01.11Z');

    expect(units.some((u) => u.type === 'exterieur')).toBe(true);
    expect(units.some((u) => u.type === 'vehicule')).toBe(true);
  });

  it('generates beaute work units for NAF 96.xx', () => {
    const units = generateWorkUnits('96.02A');

    expect(units.some((u) => u.name.includes('Salon'))).toBe(true);
    expect(units.some((u) => u.type === 'stockage')).toBe(true);
  });

  it('generates transport work units for NAF 49.xx', () => {
    const units = generateWorkUnits('49.41A');

    expect(units.some((u) => u.type === 'vehicule')).toBe(true);
    expect(units.some((u) => u.name.includes('Entrepot') || u.name.includes('Quai'))).toBe(true);
  });

  it('defaults to bureau for unknown NAF codes', () => {
    const units = generateWorkUnits('99.99Z');

    expect(units.some((u) => u.type === 'bureau')).toBe(true);
  });

  it('adds etablissement-based work units', () => {
    const etabs = [
      { siret: '12345678901234', nom: 'Siege Paris', adresse: '12 Rue de la Paix', is_active: true },
      { siret: '12345678905678', nom: 'Depot Lyon', adresse: '5 Rue du Depot', is_active: true },
      { siret: '12345678909999', nom: 'Ancien site', adresse: '10 Rue Fermee', is_active: false },
    ];

    const units = generateWorkUnits('43.21A', etabs);

    // Should have 2 etablissement units (only active ones)
    const etabUnits = units.filter((u) => u.source === 'etablissement');
    expect(etabUnits).toHaveLength(2);
    expect(etabUnits.some((u) => u.name === 'Siege Paris')).toBe(true);
    expect(etabUnits.some((u) => u.name === 'Depot Lyon')).toBe(true);
  });

  it('always includes a bureau unit even if NAF profile has none', () => {
    // Agriculture profile doesn't naturally include bureau
    // But we strip the bureau from the profile artificially to test the fallback
    const units = generateWorkUnits('01.11Z');

    // Even if agriculture doesn't have bureau in its profile, the generator ensures one exists
    // Actually agriculture doesn't have bureau, so the default should be added
    expect(units.some((u) => u.type === 'bureau')).toBe(true);
  });

  it('generates unique IDs for work units', () => {
    const units = generateWorkUnits('43.21A');
    const ids = units.map((u) => u.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('getWorkUnitTypes', () => {
  it('returns all 6 work unit types', () => {
    const types = getWorkUnitTypes();
    expect(types).toHaveLength(6);
    expect(types.map((t) => t.value)).toEqual(
      expect.arrayContaining(['chantier', 'atelier', 'bureau', 'vehicule', 'stockage', 'exterieur']),
    );
  });

  it('has French labels for all types', () => {
    const types = getWorkUnitTypes();
    for (const type of types) {
      expect(type.label.length).toBeGreaterThan(0);
    }
  });
});
