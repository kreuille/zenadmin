import type { DuerpDocument, DuerpRisk } from './duerp.service.js';
import { calculateRiskLevel } from './risk-database.js';

// BUSINESS RULE [CDC-2.4]: Generation PDF DUERP conforme

const RISK_COLORS: Record<string, string> = {
  faible: '#22c55e',
  modere: '#eab308',
  eleve: '#f97316',
  critique: '#ef4444',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function renderRiskRow(risk: DuerpRisk): string {
  const level = calculateRiskLevel(risk.gravity, risk.probability);
  const color = RISK_COLORS[level.level] || '#6b7280';

  return `
    <tr>
      <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(risk.category)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(risk.name)}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(risk.description || '')}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${risk.gravity}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${risk.probability}</td>
      <td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">
        <span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-weight:bold;">
          ${level.score} - ${level.level}
        </span>
      </td>
      <td style="padding:8px;border:1px solid #e5e7eb;">
        <ul style="margin:0;padding-left:16px;">
          ${risk.preventive_actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
        </ul>
      </td>
      <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(risk.responsible || '-')}</td>
    </tr>
  `;
}

/**
 * Generate DUERP HTML for PDF conversion
 */
export function generateDuerpHtml(doc: DuerpDocument): string {
  // Group risks by category
  const risksByCategory = new Map<string, DuerpRisk[]>();
  for (const risk of doc.risks) {
    const existing = risksByCategory.get(risk.category) || [];
    existing.push(risk);
    risksByCategory.set(risk.category, existing);
  }

  // Summary counts
  const summary = {
    critique: doc.risks.filter((r) => calculateRiskLevel(r.gravity, r.probability).level === 'critique').length,
    eleve: doc.risks.filter((r) => calculateRiskLevel(r.gravity, r.probability).level === 'eleve').length,
    modere: doc.risks.filter((r) => calculateRiskLevel(r.gravity, r.probability).level === 'modere').length,
    faible: doc.risks.filter((r) => calculateRiskLevel(r.gravity, r.probability).level === 'faible').length,
  };

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #1f2937; margin: 40px; font-size: 12px; }
        h1 { color: #1e40af; font-size: 22px; text-align: center; margin-bottom: 4px; }
        h2 { color: #1e40af; font-size: 16px; border-bottom: 2px solid #1e40af; padding-bottom: 4px; margin-top: 24px; }
        h3 { font-size: 14px; color: #374151; margin-top: 16px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
        th { background: #1e40af; color: white; padding: 8px; text-align: left; border: 1px solid #1e40af; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 16px 0; }
        .info-item { padding: 4px 0; }
        .info-label { font-weight: bold; color: #6b7280; }
        .summary-box { display: flex; gap: 16px; margin: 16px 0; }
        .summary-item { padding: 12px; border-radius: 8px; text-align: center; flex: 1; }
        .legal-notice { background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 24px; font-size: 10px; color: #6b7280; }
      </style>
    </head>
    <body>
      <h1>DOCUMENT UNIQUE D'EVALUATION<br>DES RISQUES PROFESSIONNELS</h1>
      <p style="text-align:center;color:#6b7280;font-size:14px;">(Articles R4121-1 a R4121-4 du Code du travail)</p>

      <h2>Informations generales</h2>
      <div class="info-grid">
        <div class="info-item"><span class="info-label">Entreprise :</span> ${escapeHtml(doc.company_name)}</div>
        <div class="info-item"><span class="info-label">Code NAF :</span> ${escapeHtml(doc.naf_code || 'Non renseigne')}</div>
        <div class="info-item"><span class="info-label">Secteur :</span> ${escapeHtml(doc.sector_name || 'Non identifie')}</div>
        <div class="info-item"><span class="info-label">Adresse :</span> ${escapeHtml(doc.address || 'Non renseignee')}</div>
        <div class="info-item"><span class="info-label">Nombre de salaries :</span> ${doc.employee_count}</div>
        <div class="info-item"><span class="info-label">Evaluateur :</span> ${escapeHtml(doc.evaluator_name)}</div>
        <div class="info-item"><span class="info-label">Date d'evaluation :</span> ${formatDate(doc.evaluation_date)}</div>
        <div class="info-item"><span class="info-label">Version :</span> ${doc.version}</div>
      </div>

      <h2>Synthese des risques</h2>
      <div class="summary-box">
        <div class="summary-item" style="background:#fef2f2;">
          <div style="font-size:24px;font-weight:bold;color:#ef4444;">${summary.critique}</div>
          <div style="color:#ef4444;">Critiques</div>
        </div>
        <div class="summary-item" style="background:#fff7ed;">
          <div style="font-size:24px;font-weight:bold;color:#f97316;">${summary.eleve}</div>
          <div style="color:#f97316;">Eleves</div>
        </div>
        <div class="summary-item" style="background:#fefce8;">
          <div style="font-size:24px;font-weight:bold;color:#eab308;">${summary.modere}</div>
          <div style="color:#eab308;">Moderes</div>
        </div>
        <div class="summary-item" style="background:#f0fdf4;">
          <div style="font-size:24px;font-weight:bold;color:#22c55e;">${summary.faible}</div>
          <div style="color:#22c55e;">Faibles</div>
        </div>
      </div>

      <h2>Matrice des risques</h2>
      <table>
        <tr style="background:#f9fafb;">
          <td style="border:1px solid #e5e7eb;padding:4px;"></td>
          <th style="background:#f9fafb;color:#374151;text-align:center;border:1px solid #e5e7eb;">Prob. 1</th>
          <th style="background:#f9fafb;color:#374151;text-align:center;border:1px solid #e5e7eb;">Prob. 2</th>
          <th style="background:#f9fafb;color:#374151;text-align:center;border:1px solid #e5e7eb;">Prob. 3</th>
          <th style="background:#f9fafb;color:#374151;text-align:center;border:1px solid #e5e7eb;">Prob. 4</th>
        </tr>
        ${[4, 3, 2, 1].map((g) => `
          <tr>
            <th style="background:#f9fafb;color:#374151;border:1px solid #e5e7eb;">Grav. ${g}</th>
            ${[1, 2, 3, 4].map((p) => {
              const level = calculateRiskLevel(g, p);
              const count = doc.risks.filter((r) => r.gravity === g && r.probability === p).length;
              return `<td style="text-align:center;padding:8px;border:1px solid #e5e7eb;background:${RISK_COLORS[level.level]}22;">
                ${count > 0 ? `<strong>${count}</strong>` : '-'}
              </td>`;
            }).join('')}
          </tr>
        `).join('')}
      </table>

      <h2>Detail des risques par categorie</h2>
      ${[...risksByCategory.entries()].map(([category, risks]) => `
        <h3>${escapeHtml(category)}</h3>
        <table>
          <tr>
            <th>Categorie</th>
            <th>Risque</th>
            <th>Description</th>
            <th style="width:40px;">G</th>
            <th style="width:40px;">P</th>
            <th style="width:100px;">Niveau</th>
            <th>Actions preventives</th>
            <th>Responsable</th>
          </tr>
          ${risks.map(renderRiskRow).join('')}
        </table>
      `).join('')}

      ${doc.notes ? `<h2>Notes</h2><p>${escapeHtml(doc.notes)}</p>` : ''}

      <div class="legal-notice">
        <strong>Mentions legales :</strong> Le present document unique d'evaluation des risques professionnels
        est etabli conformement aux articles R4121-1 a R4121-4 du Code du travail. Il doit etre mis a jour
        au moins une fois par an, ainsi qu'a chaque modification importante des conditions de travail.
        Il est tenu a la disposition des salaries, du CSE, du medecin du travail et de l'inspection du travail.
      </div>

      <div style="margin-top:32px;display:flex;justify-content:space-between;">
        <div>
          <p><strong>Fait le :</strong> ${formatDate(doc.evaluation_date)}</p>
        </div>
        <div>
          <p><strong>Signature de l'evaluateur :</strong></p>
          <p>${escapeHtml(doc.evaluator_name)}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
