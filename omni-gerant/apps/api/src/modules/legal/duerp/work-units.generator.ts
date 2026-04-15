// BUSINESS RULE [CDC-2.4]: Generation automatique des unites de travail
// Types : 'chantier' | 'atelier' | 'bureau' | 'vehicule' | 'stockage' | 'exterieur'
// Proposition basee sur code NAF + etablissements Pappers

export type WorkUnitType = 'chantier' | 'atelier' | 'bureau' | 'vehicule' | 'stockage' | 'exterieur';

export interface WorkUnit {
  id: string;
  name: string;
  type: WorkUnitType;
  description: string;
  source: 'naf' | 'etablissement' | 'default';
  is_auto: boolean; // badge "auto" dans le wizard
}

interface EtablissementInfo {
  siret: string;
  nom: string;
  adresse: string;
  is_active: boolean;
}

// BUSINESS RULE [CDC-2.4]: Unites de travail types par secteur NAF
const NAF_WORK_UNIT_PROFILES: Record<string, WorkUnit[]> = {
  // BTP (41-43)
  'btp': [
    { id: 'wu-chantier', name: 'Chantier type', type: 'chantier', description: 'Zone de travaux client (gros oeuvre, second oeuvre)', source: 'naf', is_auto: true },
    { id: 'wu-atelier-btp', name: 'Atelier / Depot', type: 'atelier', description: 'Atelier de preparation, stockage materiel et outillage', source: 'naf', is_auto: true },
    { id: 'wu-vehicule-btp', name: 'Vehicule utilitaire', type: 'vehicule', description: 'Trajet domicile-chantier, transport materiel', source: 'naf', is_auto: true },
    { id: 'wu-stockage-btp', name: 'Zone de stockage', type: 'stockage', description: 'Stockage materiaux, produits chimiques, outillage', source: 'naf', is_auto: true },
  ],
  // Restauration (56)
  'restauration': [
    { id: 'wu-cuisine', name: 'Cuisine', type: 'atelier', description: 'Zone de preparation et cuisson des aliments', source: 'naf', is_auto: true },
    { id: 'wu-salle', name: 'Salle de restaurant', type: 'exterieur', description: 'Espace d\'accueil et service clients', source: 'naf', is_auto: true },
    { id: 'wu-reserve', name: 'Reserve / Chambre froide', type: 'stockage', description: 'Stockage denrees, chambre froide, cave', source: 'naf', is_auto: true },
    { id: 'wu-plonge', name: 'Plonge', type: 'atelier', description: 'Zone de nettoyage vaisselle et ustensiles', source: 'naf', is_auto: true },
  ],
  // Commerce (45-47)
  'commerce': [
    { id: 'wu-magasin', name: 'Surface de vente', type: 'exterieur', description: 'Espace de vente et contact clientele', source: 'naf', is_auto: true },
    { id: 'wu-reserve-com', name: 'Reserve / Entrepot', type: 'stockage', description: 'Stockage marchandises, reception livraisons', source: 'naf', is_auto: true },
    { id: 'wu-bureau-com', name: 'Bureau', type: 'bureau', description: 'Administration, comptabilite, commandes', source: 'naf', is_auto: true },
  ],
  // Transport (49-53)
  'transport': [
    { id: 'wu-vehicule-tr', name: 'Vehicule de transport', type: 'vehicule', description: 'Conduite professionnelle (livraison, transport)', source: 'naf', is_auto: true },
    { id: 'wu-quai', name: 'Quai de chargement', type: 'exterieur', description: 'Zone de chargement/dechargement, manutention', source: 'naf', is_auto: true },
    { id: 'wu-entrepot-tr', name: 'Entrepot', type: 'stockage', description: 'Stockage, preparation commandes, tri', source: 'naf', is_auto: true },
  ],
  // Bureaux / Services (58-82)
  'bureau': [
    { id: 'wu-bureau-open', name: 'Open space / Bureau', type: 'bureau', description: 'Poste de travail informatique, reunion', source: 'naf', is_auto: true },
    { id: 'wu-salle-reunion', name: 'Salle de reunion', type: 'bureau', description: 'Espaces de reunion et collaboration', source: 'naf', is_auto: true },
  ],
  // Sante (86-88)
  'sante': [
    { id: 'wu-soin', name: 'Salle de soins / Consultation', type: 'atelier', description: 'Zone de soins, consultation, actes medicaux', source: 'naf', is_auto: true },
    { id: 'wu-accueil-sante', name: 'Accueil patients', type: 'exterieur', description: 'Reception, salle d\'attente', source: 'naf', is_auto: true },
    { id: 'wu-stockage-med', name: 'Pharmacie / Stockage', type: 'stockage', description: 'Stockage medicaments, DASRI, materiels', source: 'naf', is_auto: true },
  ],
  // Industrie (10-33)
  'industrie': [
    { id: 'wu-atelier-ind', name: 'Atelier de production', type: 'atelier', description: 'Zone de fabrication, machines-outils', source: 'naf', is_auto: true },
    { id: 'wu-stockage-ind', name: 'Zone de stockage matieres', type: 'stockage', description: 'Matieres premieres, produits finis, chimiques', source: 'naf', is_auto: true },
    { id: 'wu-quai-ind', name: 'Quai reception/expedition', type: 'exterieur', description: 'Reception matieres, expedition produits finis', source: 'naf', is_auto: true },
    { id: 'wu-bureau-ind', name: 'Bureau / Labo qualite', type: 'bureau', description: 'Administration, controle qualite', source: 'naf', is_auto: true },
  ],
  // Agriculture (01-03)
  'agriculture': [
    { id: 'wu-champ', name: 'Parcelle / Champ', type: 'exterieur', description: 'Zone de culture, recolte, traitement', source: 'naf', is_auto: true },
    { id: 'wu-batiment-agri', name: 'Batiment d\'exploitation', type: 'atelier', description: 'Hangar, serre, batiment d\'elevage', source: 'naf', is_auto: true },
    { id: 'wu-engin-agri', name: 'Engins agricoles', type: 'vehicule', description: 'Tracteur, moissonneuse, engins de levage', source: 'naf', is_auto: true },
    { id: 'wu-stockage-agri', name: 'Stockage produits', type: 'stockage', description: 'Phytosanitaires, engrais, recoltes', source: 'naf', is_auto: true },
  ],
  // Coiffure/Esthetique (96)
  'beaute': [
    { id: 'wu-salon', name: 'Salon / Cabine', type: 'atelier', description: 'Espace soins, coupe, coloration, esthetique', source: 'naf', is_auto: true },
    { id: 'wu-accueil-beaute', name: 'Accueil clients', type: 'exterieur', description: 'Reception, attente, caisse', source: 'naf', is_auto: true },
    { id: 'wu-reserve-beaute', name: 'Reserve produits', type: 'stockage', description: 'Stockage produits chimiques (colorants, solvants)', source: 'naf', is_auto: true },
  ],
  // Hotellerie (55)
  'hotellerie': [
    { id: 'wu-reception', name: 'Reception / Hall', type: 'exterieur', description: 'Accueil clientele, check-in/check-out', source: 'naf', is_auto: true },
    { id: 'wu-chambres', name: 'Etages / Chambres', type: 'exterieur', description: 'Entretien chambres, menage, lingerie', source: 'naf', is_auto: true },
    { id: 'wu-technique', name: 'Locaux techniques', type: 'atelier', description: 'Buanderie, maintenance, chaufferie', source: 'naf', is_auto: true },
  ],
  // Nettoyage (81)
  'nettoyage': [
    { id: 'wu-site-client', name: 'Site client', type: 'exterieur', description: 'Intervention chez le client (bureaux, locaux)', source: 'naf', is_auto: true },
    { id: 'wu-vehicule-net', name: 'Vehicule intervenant', type: 'vehicule', description: 'Deplacement entre sites, transport materiel', source: 'naf', is_auto: true },
    { id: 'wu-depot-net', name: 'Depot / Local technique', type: 'stockage', description: 'Stockage produits, materiel de nettoyage', source: 'naf', is_auto: true },
  ],
};

/**
 * Map a NAF code prefix (2 digits) to a work unit profile key
 */
function nafToProfileKey(nafCode: string): string {
  const prefix = parseInt(nafCode.substring(0, 2), 10);
  if (isNaN(prefix)) return 'bureau';

  if (prefix >= 1 && prefix <= 3) return 'agriculture';
  if (prefix >= 10 && prefix <= 33) return 'industrie';
  if (prefix >= 41 && prefix <= 43) return 'btp';
  if (prefix >= 45 && prefix <= 47) return 'commerce';
  if (prefix >= 49 && prefix <= 53) return 'transport';
  if (prefix === 55) return 'hotellerie';
  if (prefix === 56) return 'restauration';
  if (prefix >= 58 && prefix <= 66) return 'bureau';
  if (prefix >= 69 && prefix <= 75) return 'bureau';
  if (prefix === 81) return 'nettoyage';
  if (prefix >= 77 && prefix <= 82) return 'bureau';
  if (prefix >= 86 && prefix <= 88) return 'sante';
  if (prefix === 96) return 'beaute';
  return 'bureau'; // default for unknown
}

/**
 * Generate work units from NAF code + Pappers etablissements
 */
export function generateWorkUnits(
  nafCode: string,
  etablissements: Array<{ siret: string; nom: string; adresse: string; is_active: boolean }> = [],
): WorkUnit[] {
  const units: WorkUnit[] = [];

  // 1. NAF-based default work units
  const profileKey = nafToProfileKey(nafCode);
  const nafUnits = NAF_WORK_UNIT_PROFILES[profileKey] ?? NAF_WORK_UNIT_PROFILES['bureau']!;
  units.push(...nafUnits.map((u) => ({ ...u, id: `${u.id}-${crypto.randomUUID().substring(0, 8)}` })));

  // 2. Etablissements from Pappers → one unit per active site
  const activeEtabs = etablissements.filter((e) => e.is_active);
  for (const etab of activeEtabs) {
    units.push({
      id: `wu-etab-${etab.siret.substring(9)}`,
      name: etab.nom || `Etablissement ${etab.siret}`,
      type: 'bureau',
      description: etab.adresse || 'Etablissement secondaire',
      source: 'etablissement',
      is_auto: true,
    });
  }

  // 3. Always add a "bureau" unit if none exists (every company has admin)
  if (!units.some((u) => u.type === 'bureau')) {
    units.push({
      id: `wu-bureau-default-${crypto.randomUUID().substring(0, 8)}`,
      name: 'Bureau / Administration',
      type: 'bureau',
      description: 'Poste administratif, gestion, comptabilite',
      source: 'default',
      is_auto: true,
    });
  }

  return units;
}

/**
 * Get available work unit types for display
 */
export function getWorkUnitTypes(): Array<{ value: WorkUnitType; label: string }> {
  return [
    { value: 'chantier', label: 'Chantier' },
    { value: 'atelier', label: 'Atelier' },
    { value: 'bureau', label: 'Bureau' },
    { value: 'vehicule', label: 'Vehicule' },
    { value: 'stockage', label: 'Stockage' },
    { value: 'exterieur', label: 'Exterieur / Site client' },
  ];
}
