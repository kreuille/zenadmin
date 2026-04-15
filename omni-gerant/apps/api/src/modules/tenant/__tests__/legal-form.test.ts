import { describe, it, expect } from 'vitest';
import {
  detectLegalForm,
  detectLegalFormFromLabel,
  getLegalFormInfo,
  getAllLegalForms,
  generateLegalMentions,
} from '../legal-form.js';

describe('legal-form', () => {
  describe('detectLegalForm from INSEE code', () => {
    it('detects EI from code 1000', () => {
      expect(detectLegalForm('1000')).toBe('ei');
    });

    it('detects EI artisan from code 1300', () => {
      expect(detectLegalForm('1300')).toBe('ei');
    });

    it('detects auto_entrepreneur when EI + micro-fiscal', () => {
      expect(detectLegalForm('1000', true)).toBe('auto_entrepreneur');
    });

    it('detects EURL from code 5498', () => {
      expect(detectLegalForm('5498')).toBe('eurl');
    });

    it('detects EURL from code 5499 (SARL unipersonnelle)', () => {
      expect(detectLegalForm('5499')).toBe('eurl');
    });

    it('detects SAS from code 5710', () => {
      expect(detectLegalForm('5710')).toBe('sas');
    });

    it('detects SASU from code 5720', () => {
      expect(detectLegalForm('5720')).toBe('sasu');
    });

    it('detects SARL from code 5610', () => {
      expect(detectLegalForm('5610')).toBe('sarl');
    });

    it('detects SA from code 5510', () => {
      expect(detectLegalForm('5510')).toBe('sa');
    });

    it('detects SCI from code 6540', () => {
      expect(detectLegalForm('6540')).toBe('sci');
    });

    it('returns other for unknown code', () => {
      expect(detectLegalForm('9999')).toBe('other');
    });

    it('handles prefix matching for EI family (10xx-19xx)', () => {
      expect(detectLegalForm('1050')).toBe('ei');
      expect(detectLegalForm('1950')).toBe('ei');
    });

    it('handles prefix matching with micro-fiscal', () => {
      expect(detectLegalForm('1050', true)).toBe('auto_entrepreneur');
    });
  });

  describe('detectLegalFormFromLabel', () => {
    it('detects SASU', () => {
      expect(detectLegalFormFromLabel('SASU')).toBe('sasu');
      expect(detectLegalFormFromLabel('Société par Actions Simplifiée Unipersonnelle')).toBe('sasu');
    });

    it('detects SAS (not confused with SASU)', () => {
      expect(detectLegalFormFromLabel('SAS')).toBe('sas');
    });

    it('detects SARL', () => {
      expect(detectLegalFormFromLabel('SARL')).toBe('sarl');
    });

    it('detects EURL from SARL unipersonnelle', () => {
      expect(detectLegalFormFromLabel('SARL unipersonnelle')).toBe('eurl');
      expect(detectLegalFormFromLabel('EURL')).toBe('eurl');
    });

    it('detects auto-entrepreneur', () => {
      expect(detectLegalFormFromLabel('Micro-entreprise')).toBe('auto_entrepreneur');
      expect(detectLegalFormFromLabel('Auto-entrepreneur')).toBe('auto_entrepreneur');
    });

    it('detects EI', () => {
      expect(detectLegalFormFromLabel('Entreprise Individuelle')).toBe('ei');
    });

    it('returns other for unrecognized', () => {
      expect(detectLegalFormFromLabel('Association loi 1901')).toBe('other');
    });
  });

  describe('getLegalFormInfo', () => {
    it('returns correct info for auto_entrepreneur', () => {
      const info = getLegalFormInfo('auto_entrepreneur');
      expect(info.code).toBe('auto_entrepreneur');
      expect(info.hasCapital).toBe(false);
      expect(info.isMicroEligible).toBe(true);
      expect(info.defaultTvaRegime).toBe('franchise_base');
    });

    it('returns correct info for SARL', () => {
      const info = getLegalFormInfo('sarl');
      expect(info.hasCapital).toBe(true);
      expect(info.hasRcs).toBe(true);
      expect(info.defaultTvaRegime).toBe('reel_normal');
    });
  });

  describe('getAllLegalForms', () => {
    it('returns all 11 forms', () => {
      const forms = getAllLegalForms();
      expect(forms.length).toBe(11);
    });
  });

  describe('generateLegalMentions', () => {
    it('generates franchise base mention', () => {
      const mentions = generateLegalMentions('auto_entrepreneur', {
        siret: '89024639000029',
        isFranchiseBase: true,
      });
      expect(mentions).toContain('TVA non applicable, article 293 B du Code Général des Impôts');
      expect(mentions).toContain('SIRET 89024639000029');
    });

    it('generates SARL mentions with capital and RCS', () => {
      const mentions = generateLegalMentions('sarl', {
        capitalCents: 100000,
        rcsCity: 'Paris',
        siret: '12345678901234',
        tvaNumber: 'FR12345678901',
      });
      expect(mentions.some((m) => m.includes('SARL au capital de 1000'))).toBe(true);
      expect(mentions.some((m) => m.includes('RCS Paris'))).toBe(true);
      expect(mentions.some((m) => m.includes('TVA intracommunautaire : FR12345678901'))).toBe(true);
    });

    it('does not include TVA number when franchise_base', () => {
      const mentions = generateLegalMentions('ei', {
        tvaNumber: 'FR12345678901',
        isFranchiseBase: true,
      });
      expect(mentions.some((m) => m.includes('TVA intracommunautaire'))).toBe(false);
      expect(mentions.some((m) => m.includes('article 293 B'))).toBe(true);
    });

    it('includes RM for artisan', () => {
      const mentions = generateLegalMentions('ei', {
        rmNumber: '123456',
        rmCity: 'Lyon',
      });
      expect(mentions.some((m) => m.includes('RM Lyon 123456'))).toBe(true);
    });
  });
});
