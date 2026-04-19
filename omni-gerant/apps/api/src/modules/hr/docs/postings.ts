// BUSINESS RULE [CDC-RH-V3]: Affichages obligatoires en entreprise (Art. L1221-20 CT et suivants)
// 12 documents devant etre affiches sur un panneau visible et accessible.

export interface MandatoryPosting {
  code: string;
  title: string;
  legalBasis: string;
  description: string;
  conditionalOn?: 'headcount_11' | 'headcount_50' | 'erp' | null;
}

export const MANDATORY_POSTINGS: MandatoryPosting[] = [
  {
    code: 'working_hours',
    title: 'Horaires de travail',
    legalBasis: 'Art. L3171-1 CT',
    description: 'Horaires collectifs applicables. Afficher le debut, la fin et les pauses.',
  },
  {
    code: 'conventions_collectives',
    title: 'Convention collective applicable',
    legalBasis: 'Art. R2262-1 CT',
    description: 'Intitule de la convention + ou la consulter.',
  },
  {
    code: 'internal_rules',
    title: 'Reglement interieur',
    legalBasis: 'Art. L1321-1 CT',
    description: 'Obligatoire a partir de 50 salaries.',
    conditionalOn: 'headcount_50',
  },
  {
    code: 'cse_elected',
    title: 'Liste des elus CSE',
    legalBasis: 'Art. L2314-1 CT',
    description: 'Noms et fonctions des elus du CSE, adresse du conseil prud\'hommes.',
    conditionalOn: 'headcount_11',
  },
  {
    code: 'medical_inspection',
    title: 'Coordonnees du medecin du travail et de l\'inspection du travail',
    legalBasis: 'Art. D4711-1 CT',
    description: 'Noms, adresses, telephones.',
  },
  {
    code: 'emergency_services',
    title: 'Services d\'urgence',
    legalBasis: 'Art. R4227-37 CT',
    description: 'SAMU 15, Pompiers 18, Police 17, Europe 112.',
  },
  {
    code: 'harassment_moral_sexual',
    title: 'Lutte contre le harcelement moral et sexuel',
    legalBasis: 'Art. L1152-4 et L1153-5 CT',
    description: 'Affichage du texte integral des dispositions penales. Modele DGT.',
  },
  {
    code: 'equality',
    title: 'Egalite professionnelle femmes / hommes',
    legalBasis: 'Art. L1142-6 CT',
    description: 'Texte rappelant l\'egalite de traitement.',
  },
  {
    code: 'discrimination',
    title: 'Lutte contre les discriminations',
    legalBasis: 'Art. 225-1 Code penal',
    description: 'Texte integral interdisant les discriminations.',
  },
  {
    code: 'evacuation_plan',
    title: 'Plan d\'evacuation et consignes de securite',
    legalBasis: 'Art. R4227-38 CT',
    description: 'Uniquement pour ERP et locaux >=50 personnes.',
    conditionalOn: 'erp',
  },
  {
    code: 'no_smoking',
    title: 'Interdiction de fumer et vapoter',
    legalBasis: 'Decret 2006-1386',
    description: 'Pictogramme officiel d\'interdiction.',
  },
  {
    code: 'delegues_syndicaux',
    title: 'Liste des delegues syndicaux',
    legalBasis: 'Art. L2143-22 CT',
    description: 'Noms des delegues syndicaux si existants.',
  },
];

/**
 * Filtre les affichages applicables selon la taille d'entreprise et le contexte.
 */
export function getApplicablePostings(context: {
  headcount: number;
  isErp: boolean;
}): MandatoryPosting[] {
  return MANDATORY_POSTINGS.filter((p) => {
    if (!p.conditionalOn) return true;
    if (p.conditionalOn === 'headcount_11') return context.headcount >= 11;
    if (p.conditionalOn === 'headcount_50') return context.headcount >= 50;
    if (p.conditionalOn === 'erp') return context.isErp;
    return true;
  });
}

/**
 * Genere un HTML imprimable listant tous les affichages obligatoires.
 */
export function renderPostingsChecklistHtml(employerName: string, postings: MandatoryPosting[]): string {
  const rows = postings.map((p, idx) => `
<tr>
  <td>${idx + 1}</td>
  <td><strong>${p.title}</strong><br/><span style="font-size:10px; color:#666">${p.legalBasis}</span></td>
  <td>${p.description}</td>
  <td style="text-align:center">☐</td>
</tr>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Affichages obligatoires — ${employerName}</title>
<style>
body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; font-size: 12px; }
h1 { text-align: center; font-size: 18px; }
.subtitle { text-align: center; color: #666; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
th, td { padding: 6px 8px; border: 1px solid #999; vertical-align: top; }
th { background: #e8f0fe; font-weight: 600; }
.note { margin-top: 20px; padding: 10px; background: #fffbe6; border: 1px solid #f0c040; font-size: 11px; }
</style></head><body>
<h1>Affichages obligatoires en entreprise</h1>
<p class="subtitle">${employerName} — Liste generee le ${new Date().toLocaleDateString('fr-FR')}</p>
<table>
  <thead><tr><th>#</th><th>Intitule</th><th>Description</th><th>Affiche</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="note">
<strong>Panneau d'affichage</strong> : ces documents doivent etre affiches dans un lieu accessible a tous les salaries
(couloir, salle de repos, pointeuse). Certains peuvent etre diffuses par voie numerique accessible en continu (Art. L1221-26 CT).
<br/><br/>
Les affichages conditionnels ne sont pas inclus si non applicables a votre effectif/locaux actuels.
Verifier periodiquement que les coordonnees (medecin du travail, inspection, CSE) sont a jour.
</div>
</body></html>`;
}
