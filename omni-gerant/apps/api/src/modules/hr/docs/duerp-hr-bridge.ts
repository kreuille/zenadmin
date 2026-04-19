// BUSINESS RULE [CDC-RH-V3]: HR -> DUERP triggers persistes
//
// A chaque evenement HR majeur (nouvel employe, sortie, changement de position),
// on persiste un trigger dans `duerp_update_triggers` pour que le DUERP soit
// flag "a mettre a jour" (obligation annuelle + a chaque changement, Art. R4121-2).

import { prisma } from '@zenadmin/db';

export type HrDuerpTriggerEvent =
  | { type: 'employee_hired'; employeeId: string; employeeName: string; positionName: string | null }
  | { type: 'employee_exited'; employeeId: string; employeeName: string; reason: string }
  | { type: 'position_created'; positionId: string; positionName: string }
  | { type: 'chemical_exposure_added'; positionId: string; positionName: string; chemicals: string[] }
  | { type: 'night_work_added'; positionId: string; positionName: string }
  | { type: 'accident'; employeeId: string; employeeName: string; description: string };

/**
 * Enregistre un trigger DUERP issu d'un evenement HR.
 * Si aucun DUERP n'existe pour le tenant, on log silencieusement (pas d'erreur bloquante).
 */
export async function persistHrDuerpTrigger(tenantId: string, event: HrDuerpTriggerEvent): Promise<void> {
  const duerp = await prisma.duerp.findFirst({
    where: { tenant_id: tenantId },
    orderBy: { created_at: 'desc' },
  });
  if (!duerp) return; // pas de DUERP, rien a persister

  const { triggerType, severity, description } = mapEvent(event);

  await prisma.duerpUpdateTrigger.create({
    data: {
      tenant_id: tenantId,
      duerp_id: duerp.id,
      trigger_type: triggerType,
      source_id: extractSourceId(event),
      source_type: 'hr_event',
      description,
      severity,
      status: 'pending',
    },
  });
}

function extractSourceId(event: HrDuerpTriggerEvent): string | null {
  if ('employeeId' in event) return event.employeeId;
  if ('positionId' in event) return event.positionId;
  return null;
}

function mapEvent(event: HrDuerpTriggerEvent): { triggerType: string; severity: string; description: string } {
  switch (event.type) {
    case 'employee_hired':
      return {
        triggerType: 'annual_review',
        severity: 'info',
        description: `Nouvel employe : ${event.employeeName}${event.positionName ? ` (${event.positionName})` : ''}. Verifier unites de travail, formations et surveillance medicale.`,
      };
    case 'employee_exited':
      return {
        triggerType: 'annual_review',
        severity: 'info',
        description: `Sortie : ${event.employeeName} — ${event.reason}. Mettre a jour les unites de travail impactees.`,
      };
    case 'position_created':
      return {
        triggerType: 'annual_review',
        severity: 'warning',
        description: `Nouveau poste cree : ${event.positionName}. Evaluer risques et ajouter au DUERP.`,
      };
    case 'chemical_exposure_added':
      return {
        triggerType: 'chemical_purchase',
        severity: 'warning',
        description: `Exposition chimique pour "${event.positionName}" : ${event.chemicals.join(', ')}. Fiche de donnees de securite + surveillance medicale renforcee requises.`,
      };
    case 'night_work_added':
      return {
        triggerType: 'annual_review',
        severity: 'warning',
        description: `Travail de nuit ajoute pour "${event.positionName}". Surveillance medicale renforcee + amenagements (Art. R4624-18).`,
      };
    case 'accident':
      return {
        triggerType: 'accident',
        severity: 'critical',
        description: `Accident du travail : ${event.employeeName}. ${event.description}. Mise a jour obligatoire du DUERP (Art. R4121-2).`,
      };
  }
}
