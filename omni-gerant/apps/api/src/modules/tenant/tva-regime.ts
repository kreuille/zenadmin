import type { LegalForm } from './legal-form.js';

// BUSINESS RULE [CDC-11.1]: Detection regime TVA + seuils franchise en base
// Reference: Article 293 B du CGI, seuils 2026

export type TvaRegime =
  | 'franchise_base'     // Auto-entrepreneur: TVA non applicable (art. 293 B CGI)
  | 'reel_simplifie'     // Declaration annuelle + acomptes semestriels
  | 'reel_normal'        // Declaration mensuelle (CA3)
  | 'mini_reel';         // Option mini-reel (rare, declaration mensuelle sans simplification)

export interface TvaRegimeInfo {
  code: TvaRegime;
  label: string;
  description: string;
  declarationFrequency: string;
}

// BUSINESS RULE: Seuils franchise en base TVA 2026
// Services (BNC/BIC): 36 800 EUR seuil / 39 100 EUR seuil majore
// Vente marchandises: 91 900 EUR seuil / 101 000 EUR seuil majore
export const FRANCHISE_THRESHOLDS = {
  services: {
    seuil: 36_800_00,        // 36 800 EUR en centimes
    seuil_majore: 39_100_00, // 39 100 EUR en centimes
  },
  vente: {
    seuil: 91_900_00,        // 91 900 EUR en centimes
    seuil_majore: 101_000_00, // 101 000 EUR en centimes
  },
} as const;

export type ActivityType = 'services' | 'vente' | 'mixte';

const TVA_REGIME_INFO: Record<TvaRegime, TvaRegimeInfo> = {
  franchise_base: {
    code: 'franchise_base',
    label: 'Franchise en base de TVA',
    description: 'TVA non applicable (article 293 B du CGI). Pas de TVA facturée ni déduite.',
    declarationFrequency: 'Aucune',
  },
  reel_simplifie: {
    code: 'reel_simplifie',
    label: 'Régime réel simplifié',
    description: 'Déclaration annuelle (CA12) avec 2 acomptes semestriels.',
    declarationFrequency: 'Annuelle + 2 acomptes',
  },
  reel_normal: {
    code: 'reel_normal',
    label: 'Régime réel normal',
    description: 'Déclaration mensuelle (CA3). Obligatoire si CA > 840 000 € (vente) ou 254 000 € (services).',
    declarationFrequency: 'Mensuelle (CA3)',
  },
  mini_reel: {
    code: 'mini_reel',
    label: 'Mini-réel',
    description: 'Option pour la déclaration mensuelle de TVA tout en restant au réel simplifié pour l\'IS/IR.',
    declarationFrequency: 'Mensuelle (option)',
  },
};

/**
 * Detect default TVA regime from legal form.
 * AUTO_ENTREPRENEUR → franchise_base
 * EI / EIRL → reel_simplifie
 * EURL / SARL / SAS / SASU / SA → reel_normal
 */
export function detectDefaultTvaRegime(legalForm: LegalForm): TvaRegime {
  switch (legalForm) {
    case 'auto_entrepreneur':
      return 'franchise_base';
    case 'ei':
    case 'eirl':
      return 'reel_simplifie';
    case 'eurl':
    case 'sarl':
    case 'sas':
    case 'sasu':
    case 'sa':
    case 'scop':
      return 'reel_normal';
    case 'sci':
      return 'franchise_base';
    case 'other':
      return 'reel_simplifie';
  }
}

/**
 * Detect activity type from NAF code.
 * Codes starting with 45-47 (commerce) = vente
 * Most others = services
 */
export function detectActivityType(nafCode: string): ActivityType {
  const prefix = parseInt(nafCode.substring(0, 2), 10);
  if (isNaN(prefix)) return 'services';

  // Commerce de gros et detail (sections G)
  if (prefix >= 45 && prefix <= 47) return 'vente';
  // Industrie manufacturiere (section C) - considered vente
  if (prefix >= 10 && prefix <= 33) return 'vente';
  // Agriculture (section A)
  if (prefix >= 1 && prefix <= 3) return 'vente';

  return 'services';
}

export interface FranchiseCheckResult {
  isOverThreshold: boolean;
  isOverMajore: boolean;
  thresholdCents: number;
  majoreCents: number;
  currentCents: number;
  percentUsed: number;          // 0-100+
  alertLevel: 'ok' | 'warning' | 'danger' | 'exceeded';
  message: string;
}

/**
 * Check if current year revenue exceeds franchise en base thresholds.
 * Returns alert level and human-readable message.
 */
export function checkFranchiseThreshold(
  currentYearRevenueCents: number,
  activityType: ActivityType,
): FranchiseCheckResult {
  const thresholds = activityType === 'vente'
    ? FRANCHISE_THRESHOLDS.vente
    : FRANCHISE_THRESHOLDS.services;

  // For mixte, use the lower (services) threshold as conservative default
  const effectiveThresholds = activityType === 'mixte'
    ? FRANCHISE_THRESHOLDS.services
    : thresholds;

  const percentUsed = effectiveThresholds.seuil > 0
    ? Math.round((currentYearRevenueCents / effectiveThresholds.seuil) * 100)
    : 0;

  const isOverThreshold = currentYearRevenueCents > effectiveThresholds.seuil;
  const isOverMajore = currentYearRevenueCents > effectiveThresholds.seuil_majore;

  let alertLevel: FranchiseCheckResult['alertLevel'] = 'ok';
  let message = '';

  if (isOverMajore) {
    alertLevel = 'exceeded';
    message = `Seuil majoré dépassé (${(effectiveThresholds.seuil_majore / 100).toLocaleString('fr-FR')} €). Vous devez facturer la TVA immédiatement et basculer au régime réel.`;
  } else if (isOverThreshold) {
    alertLevel = 'danger';
    message = `Seuil de franchise dépassé (${(effectiveThresholds.seuil / 100).toLocaleString('fr-FR')} €). Vous bénéficiez d'une tolérance jusqu'au seuil majoré de ${(effectiveThresholds.seuil_majore / 100).toLocaleString('fr-FR')} €. Au-delà, TVA obligatoire.`;
  } else if (percentUsed >= 80) {
    alertLevel = 'warning';
    message = `Attention : vous avez atteint ${percentUsed}% du seuil de franchise en base (${(effectiveThresholds.seuil / 100).toLocaleString('fr-FR')} €).`;
  } else {
    message = `CA en cours : ${percentUsed}% du seuil de franchise.`;
  }

  return {
    isOverThreshold,
    isOverMajore,
    thresholdCents: effectiveThresholds.seuil,
    majoreCents: effectiveThresholds.seuil_majore,
    currentCents: currentYearRevenueCents,
    percentUsed,
    alertLevel,
    message,
  };
}

/**
 * Get TVA rates applicable based on regime.
 * Franchise base → no TVA (0%)
 * Others → standard French rates
 */
export function getApplicableTvaRates(regime: TvaRegime): Array<{ rate: number; label: string }> {
  if (regime === 'franchise_base') {
    return [{ rate: 0, label: 'TVA non applicable (art. 293 B CGI)' }];
  }

  return [
    { rate: 20, label: 'Taux normal (20%)' },
    { rate: 10, label: 'Taux intermédiaire (10%)' },
    { rate: 5.5, label: 'Taux réduit (5,5%)' },
    { rate: 2.1, label: 'Taux super-réduit (2,1%)' },
  ];
}

export function getTvaRegimeInfo(regime: TvaRegime): TvaRegimeInfo {
  return TVA_REGIME_INFO[regime];
}

export function getAllTvaRegimes(): TvaRegimeInfo[] {
  return Object.values(TVA_REGIME_INFO);
}
