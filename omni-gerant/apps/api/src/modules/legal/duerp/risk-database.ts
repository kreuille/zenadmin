// BUSINESS RULE [CDC-2.4]: Base de risques pre-remplie par code NAF/APE

export interface RiskTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  default_gravity: number; // 1-4
  default_probability: number; // 1-4
  preventive_actions: string[];
}

export interface NafRiskProfile {
  naf_prefix: string;
  sector_name: string;
  risks: RiskTemplate[];
}

// BUSINESS RULE [CDC-2.4]: BTP (43.xx) : chute hauteur, amiante, bruit, port charges
const BTP_RISKS: RiskTemplate[] = [
  {
    id: 'btp-chute-hauteur',
    category: 'Chute',
    name: 'Chute de hauteur',
    description: 'Risque de chute lors de travaux en hauteur (echafaudages, toitures, echelles)',
    default_gravity: 4,
    default_probability: 3,
    preventive_actions: [
      'Port du harnais de securite obligatoire',
      'Verification des echafaudages avant utilisation',
      'Formation travail en hauteur',
      'Mise en place de garde-corps',
    ],
  },
  {
    id: 'btp-chute-plain-pied',
    category: 'Chute',
    name: 'Chute de plain-pied',
    description: 'Risque de chute sur sol glissant, encombre ou inegal',
    default_gravity: 2,
    default_probability: 3,
    preventive_actions: [
      'Rangement et nettoyage regulier du chantier',
      'Chaussures de securite antiderapantes',
      'Balisage des zones dangereuses',
    ],
  },
  {
    id: 'btp-amiante',
    category: 'Chimique',
    name: 'Exposition a l\'amiante',
    description: 'Risque d\'inhalation de fibres d\'amiante lors de travaux de renovation',
    default_gravity: 4,
    default_probability: 2,
    preventive_actions: [
      'Diagnostic amiante avant travaux',
      'Formation SS3/SS4 obligatoire',
      'Equipements de protection respiratoire',
      'Suivi medical renforce',
    ],
  },
  {
    id: 'btp-bruit',
    category: 'Physique',
    name: 'Exposition au bruit',
    description: 'Risque de surdite lie aux machines et outils',
    default_gravity: 3,
    default_probability: 3,
    preventive_actions: [
      'Protections auditives obligatoires',
      'Choix d\'outils moins bruyants',
      'Rotation des postes exposes',
      'Mesures sonometriques regulieres',
    ],
  },
  {
    id: 'btp-port-charges',
    category: 'Ergonomique',
    name: 'Port de charges lourdes',
    description: 'Risque de TMS lie au port et manutention de charges',
    default_gravity: 3,
    default_probability: 4,
    preventive_actions: [
      'Aides a la manutention (diable, chariot)',
      'Formation gestes et postures',
      'Limitation du poids unitaire (25 kg max)',
      'Organisation du travail (pauses, rotation)',
    ],
  },
  {
    id: 'btp-electrique',
    category: 'Electrique',
    name: 'Risque electrique',
    description: 'Risque d\'electrisation ou electrocution',
    default_gravity: 4,
    default_probability: 2,
    preventive_actions: [
      'Habilitation electrique obligatoire',
      'Verification des installations',
      'Utilisation d\'outils isoles',
      'Consignation avant intervention',
    ],
  },
];

// BUSINESS RULE [CDC-2.4]: Restauration (56.xx) : brulure, coupure, glissade, TMS
const RESTAURATION_RISKS: RiskTemplate[] = [
  {
    id: 'resto-brulure',
    category: 'Thermique',
    name: 'Brulure',
    description: 'Risque de brulure par contact avec surfaces chaudes, huile, vapeur',
    default_gravity: 3,
    default_probability: 3,
    preventive_actions: [
      'Equipements de protection (gants anti-chaleur)',
      'Signalisation des zones chaudes',
      'Formation premiers secours',
      'Kit brulure accessible',
    ],
  },
  {
    id: 'resto-coupure',
    category: 'Mecanique',
    name: 'Coupure',
    description: 'Risque de coupure par couteaux, trancheurs, boites de conserve',
    default_gravity: 2,
    default_probability: 4,
    preventive_actions: [
      'Gants anti-coupure pour la decoupe',
      'Couteaux bien aiguises (moins de force)',
      'Formation utilisation des machines',
      'Rangement securise des objets tranchants',
    ],
  },
  {
    id: 'resto-glissade',
    category: 'Chute',
    name: 'Glissade / chute de plain-pied',
    description: 'Risque de chute sur sol gras ou mouille',
    default_gravity: 2,
    default_probability: 4,
    preventive_actions: [
      'Sol antiderapant',
      'Nettoyage immediat des eclaboussures',
      'Chaussures de securite antiderapantes',
    ],
  },
  {
    id: 'resto-tms',
    category: 'Ergonomique',
    name: 'TMS (troubles musculo-squelettiques)',
    description: 'Risque de TMS lie aux gestes repetitifs et aux postures',
    default_gravity: 3,
    default_probability: 3,
    preventive_actions: [
      'Amenagement ergonomique des postes',
      'Rotation des taches',
      'Pauses regulieres',
      'Formation gestes et postures',
    ],
  },
  {
    id: 'resto-incendie',
    category: 'Incendie',
    name: 'Incendie',
    description: 'Risque d\'incendie lie aux equipements de cuisson et graisse',
    default_gravity: 4,
    default_probability: 2,
    preventive_actions: [
      'Extincteurs adaptes (classe F)',
      'Couverture anti-feu accessible',
      'Entretien regulier des hottes',
      'Formation evacuation',
    ],
  },
];

// BUSINESS RULE [CDC-2.4]: Commerce (47.xx) : TMS, agression, incendie
const COMMERCE_RISKS: RiskTemplate[] = [
  {
    id: 'com-tms',
    category: 'Ergonomique',
    name: 'TMS (troubles musculo-squelettiques)',
    description: 'Risque de TMS lie a la manutention, mise en rayon, station debout',
    default_gravity: 2,
    default_probability: 4,
    preventive_actions: [
      'Aides a la manutention',
      'Tapis anti-fatigue aux caisses',
      'Formation gestes et postures',
      'Pauses regulieres',
    ],
  },
  {
    id: 'com-agression',
    category: 'Psychosocial',
    name: 'Agression / violence externe',
    description: 'Risque d\'agression verbale ou physique (braquage, incivilites)',
    default_gravity: 3,
    default_probability: 2,
    preventive_actions: [
      'Procedure de securite (caisse limitee)',
      'Videosurveillance',
      'Formation gestion de conflit',
      'Bouton d\'alerte',
    ],
  },
  {
    id: 'com-incendie',
    category: 'Incendie',
    name: 'Incendie',
    description: 'Risque d\'incendie dans les locaux commerciaux',
    default_gravity: 4,
    default_probability: 1,
    preventive_actions: [
      'Extincteurs et issues de secours',
      'Verification annuelle des installations',
      'Plan d\'evacuation affiche',
      'Exercice d\'evacuation annuel',
    ],
  },
  {
    id: 'com-chute',
    category: 'Chute',
    name: 'Chute de plain-pied',
    description: 'Risque de chute dans le magasin ou en reserve',
    default_gravity: 2,
    default_probability: 3,
    preventive_actions: [
      'Entretien des sols',
      'Eclairage adequat',
      'Rangement des reserves',
    ],
  },
];

// Risques communs a tous les secteurs
const COMMON_RISKS: RiskTemplate[] = [
  {
    id: 'common-routier',
    category: 'Routier',
    name: 'Risque routier',
    description: 'Risque d\'accident lors de deplacements professionnels',
    default_gravity: 4,
    default_probability: 2,
    preventive_actions: [
      'Entretien regulier des vehicules',
      'Respect du code de la route',
      'Limitation des deplacements (visioconference)',
      'Planification des trajets',
    ],
  },
  {
    id: 'common-psychosocial',
    category: 'Psychosocial',
    name: 'Risques psychosociaux',
    description: 'Stress, surcharge de travail, isolement',
    default_gravity: 3,
    default_probability: 2,
    preventive_actions: [
      'Entretiens reguliers avec la direction',
      'Equilibre vie pro / vie perso',
      'Droit a la deconnexion',
    ],
  },
  {
    id: 'common-covid',
    category: 'Biologique',
    name: 'Risque biologique (pandemie)',
    description: 'Risque de contamination par agents biologiques',
    default_gravity: 2,
    default_probability: 2,
    preventive_actions: [
      'Gel hydroalcoolique a disposition',
      'Aeration des locaux',
      'Protocole en cas de pandemie',
    ],
  },
];

const NAF_RISK_PROFILES: NafRiskProfile[] = [
  { naf_prefix: '43', sector_name: 'BTP - Travaux de construction specialises', risks: [...BTP_RISKS, ...COMMON_RISKS] },
  { naf_prefix: '41', sector_name: 'BTP - Construction de batiments', risks: [...BTP_RISKS, ...COMMON_RISKS] },
  { naf_prefix: '42', sector_name: 'BTP - Genie civil', risks: [...BTP_RISKS, ...COMMON_RISKS] },
  { naf_prefix: '56', sector_name: 'Restauration', risks: [...RESTAURATION_RISKS, ...COMMON_RISKS] },
  { naf_prefix: '47', sector_name: 'Commerce de detail', risks: [...COMMERCE_RISKS, ...COMMON_RISKS] },
  { naf_prefix: '46', sector_name: 'Commerce de gros', risks: [...COMMERCE_RISKS, ...COMMON_RISKS] },
];

/**
 * Get risk profile by NAF/APE code
 */
export function getRisksByNafCode(nafCode: string | null | undefined): NafRiskProfile {
  if (!nafCode) {
    return {
      naf_prefix: '',
      sector_name: 'Secteur non identifie',
      risks: [...COMMON_RISKS],
    };
  }

  // Extract 2-digit prefix from NAF code (e.g., "43.21A" → "43")
  const prefix = nafCode.replace(/[.\s]/g, '').substring(0, 2);

  const profile = NAF_RISK_PROFILES.find((p) => p.naf_prefix === prefix);
  if (profile) return profile;

  return {
    naf_prefix: prefix,
    sector_name: `Secteur ${prefix}`,
    risks: [...COMMON_RISKS],
  };
}

/**
 * Calculate risk level from gravity and probability
 * BUSINESS RULE [CDC-2.4]: Matrice des risques Gravite (1-4) x Probabilite (1-4)
 */
export function calculateRiskLevel(gravity: number, probability: number): {
  score: number;
  level: 'faible' | 'modere' | 'eleve' | 'critique';
  color: string;
} {
  const score = gravity * probability;

  if (score <= 3) return { score, level: 'faible', color: 'green' };
  if (score <= 6) return { score, level: 'modere', color: 'yellow' };
  if (score <= 9) return { score, level: 'eleve', color: 'orange' };
  return { score, level: 'critique', color: 'red' };
}

// BUSINESS RULE [CDC-2.4]: Detection produits chimiques dans achats
const CHEMICAL_KEYWORDS = [
  'solvant', 'diluant', 'peinture', 'vernis', 'colle', 'resine',
  'acide', 'soude', 'javel', 'chlore', 'ammoniac', 'acetone',
  'white spirit', 'trichlorethylene', 'formaldehyde', 'plomb',
  'amiante', 'silice', 'ciment', 'fibre', 'isocyanate',
  'pesticide', 'herbicide', 'insecticide', 'fongicide',
  'desinfectant', 'detergent', 'degraissant',
];

const EQUIPMENT_KEYWORDS = [
  'echafaudage', 'nacelle', 'grue', 'chariot', 'transpalette',
  'scie', 'perceuse', 'meuleuse', 'disqueuse', 'compresseur',
  'chalumeau', 'poste a souder', 'betonniere',
];

/**
 * Detect if a purchase description suggests chemical or equipment risks
 */
export function detectPurchaseRisks(
  description: string,
): { type: 'chemical' | 'equipment'; keywords: string[] }[] {
  const lower = description.toLowerCase();
  const detected: { type: 'chemical' | 'equipment'; keywords: string[] }[] = [];

  const chemicalMatches = CHEMICAL_KEYWORDS.filter((kw) => lower.includes(kw));
  if (chemicalMatches.length > 0) {
    detected.push({ type: 'chemical', keywords: chemicalMatches });
  }

  const equipmentMatches = EQUIPMENT_KEYWORDS.filter((kw) => lower.includes(kw));
  if (equipmentMatches.length > 0) {
    detected.push({ type: 'equipment', keywords: equipmentMatches });
  }

  return detected;
}
