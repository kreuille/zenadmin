import { describe, it, expect } from 'vitest';
import {
  detectDefaultTvaRegime,
  detectActivityType,
  checkFranchiseThreshold,
  getApplicableTvaRates,
  getTvaRegimeInfo,
  getAllTvaRegimes,
  FRANCHISE_THRESHOLDS,
} from '../tva-regime.js';

describe('tva-regime', () => {
  describe('detectDefaultTvaRegime', () => {
    it('auto_entrepreneur → franchise_base', () => {
      expect(detectDefaultTvaRegime('auto_entrepreneur')).toBe('franchise_base');
    });

    it('ei → reel_simplifie', () => {
      expect(detectDefaultTvaRegime('ei')).toBe('reel_simplifie');
    });

    it('eirl → reel_simplifie', () => {
      expect(detectDefaultTvaRegime('eirl')).toBe('reel_simplifie');
    });

    it('sarl → reel_normal', () => {
      expect(detectDefaultTvaRegime('sarl')).toBe('reel_normal');
    });

    it('sas → reel_normal', () => {
      expect(detectDefaultTvaRegime('sas')).toBe('reel_normal');
    });

    it('sasu → reel_normal', () => {
      expect(detectDefaultTvaRegime('sasu')).toBe('reel_normal');
    });

    it('sci → franchise_base', () => {
      expect(detectDefaultTvaRegime('sci')).toBe('franchise_base');
    });
  });

  describe('detectActivityType', () => {
    it('commerce codes (45-47) → vente', () => {
      expect(detectActivityType('45.11Z')).toBe('vente');
      expect(detectActivityType('47.11F')).toBe('vente');
    });

    it('manufacturing codes (10-33) → vente', () => {
      expect(detectActivityType('10.11Z')).toBe('vente');
      expect(detectActivityType('25.11Z')).toBe('vente');
    });

    it('IT/services codes (62, 69, etc.) → services', () => {
      expect(detectActivityType('62.01Z')).toBe('services');
      expect(detectActivityType('69.10Z')).toBe('services');
    });

    it('construction codes (41-43) → services', () => {
      expect(detectActivityType('43.21A')).toBe('services');
    });

    it('invalid code → services', () => {
      expect(detectActivityType('XX')).toBe('services');
    });
  });

  describe('checkFranchiseThreshold', () => {
    it('under threshold → ok', () => {
      const result = checkFranchiseThreshold(20_000_00, 'services');
      expect(result.alertLevel).toBe('ok');
      expect(result.isOverThreshold).toBe(false);
      expect(result.isOverMajore).toBe(false);
      expect(result.percentUsed).toBeLessThan(80);
    });

    it('at 80% → warning', () => {
      // 80% of 36_800 EUR = 29_440 EUR
      const result = checkFranchiseThreshold(29_500_00, 'services');
      expect(result.alertLevel).toBe('warning');
      expect(result.percentUsed).toBeGreaterThanOrEqual(80);
    });

    it('over seuil but under majore → danger', () => {
      const result = checkFranchiseThreshold(37_000_00, 'services');
      expect(result.alertLevel).toBe('danger');
      expect(result.isOverThreshold).toBe(true);
      expect(result.isOverMajore).toBe(false);
    });

    it('over seuil majore → exceeded', () => {
      const result = checkFranchiseThreshold(40_000_00, 'services');
      expect(result.alertLevel).toBe('exceeded');
      expect(result.isOverMajore).toBe(true);
    });

    it('vente thresholds are higher', () => {
      // 70_000 EUR is under vente threshold (91_900) but over services (36_800)
      const ventResult = checkFranchiseThreshold(70_000_00, 'vente');
      expect(ventResult.isOverThreshold).toBe(false);

      const svcResult = checkFranchiseThreshold(70_000_00, 'services');
      expect(svcResult.isOverThreshold).toBe(true);
    });

    it('mixte uses services (lower) thresholds', () => {
      const result = checkFranchiseThreshold(37_000_00, 'mixte');
      expect(result.isOverThreshold).toBe(true);
      expect(result.thresholdCents).toBe(FRANCHISE_THRESHOLDS.services.seuil);
    });

    it('returns correct thresholds in result', () => {
      const result = checkFranchiseThreshold(10_000_00, 'services');
      expect(result.thresholdCents).toBe(36_800_00);
      expect(result.majoreCents).toBe(39_100_00);
    });
  });

  describe('getApplicableTvaRates', () => {
    it('franchise_base → only 0%', () => {
      const rates = getApplicableTvaRates('franchise_base');
      expect(rates.length).toBe(1);
      expect(rates[0]!.rate).toBe(0);
    });

    it('reel_normal → 4 standard rates', () => {
      const rates = getApplicableTvaRates('reel_normal');
      expect(rates.length).toBe(4);
      expect(rates.map((r) => r.rate)).toEqual([20, 10, 5.5, 2.1]);
    });

    it('reel_simplifie → same 4 rates', () => {
      const rates = getApplicableTvaRates('reel_simplifie');
      expect(rates.length).toBe(4);
    });
  });

  describe('getTvaRegimeInfo / getAllTvaRegimes', () => {
    it('returns info for franchise_base', () => {
      const info = getTvaRegimeInfo('franchise_base');
      expect(info.code).toBe('franchise_base');
      expect(info.declarationFrequency).toBe('Aucune');
    });

    it('returns all 4 regimes', () => {
      const regimes = getAllTvaRegimes();
      expect(regimes.length).toBe(4);
    });
  });
});
