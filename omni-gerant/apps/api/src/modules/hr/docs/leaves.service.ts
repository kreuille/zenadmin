// BUSINESS RULE [CDC-RH-V3]: Gestion des conges payes et absences
//
// CP : 2,5 jours ouvrables par mois travaille = 30 jours/an (Art. L3141-3 CT).
// RTT : variable selon convention. Ici calcul simplifie : 0 jour si 35h, 10 si 37h, 23 si 39h par defaut.
// Types de conges :
//   - cp (conges payes)
//   - rtt (reduction temps de travail)
//   - maladie (arret maladie CPAM)
//   - maternite (16 semaines)
//   - paternite (25 jours + 3 jours naissance)
//   - at (accident du travail)
//   - parental (conge parental d'education)
//   - formation
//   - sans_solde
//
// Periode de reference CP : 1er juin N-1 au 31 mai N (defaut droit commun).

import { prisma } from '@zenadmin/db';
import type { Result, AppError } from '@zenadmin/shared';
import { ok, err, notFound, validationError } from '@zenadmin/shared';

export const CP_DAYS_PER_MONTH = 2.5;
export const MAX_CP_DAYS_PER_YEAR = 30;

export type LeaveType = 'cp' | 'rtt' | 'maladie' | 'maternite' | 'paternite' | 'at' | 'parental' | 'formation' | 'sans_solde';
export type LeaveStatus = 'requested' | 'approved' | 'rejected' | 'taken';

export interface LeaveBalance {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  cpAcquired: number;    // CP acquis sur la periode de reference
  cpTaken: number;       // CP deja pris
  cpBalance: number;     // reste
  rttAcquired: number;
  rttTaken: number;
  rttBalance: number;
  sickDays: number;      // jours d'arret maladie cumules
}

/**
 * Compute CP period start from a given date.
 * Droit commun : 1er juin au 31 mai.
 */
export function getCpPeriodForDate(date: Date): { start: Date; end: Date } {
  const year = date.getFullYear();
  if (date.getMonth() >= 5) {
    // juin-decembre : periode demarre le 1er juin annee en cours
    return { start: new Date(year, 5, 1), end: new Date(year + 1, 4, 31, 23, 59, 59) };
  }
  return { start: new Date(year - 1, 5, 1), end: new Date(year, 4, 31, 23, 59, 59) };
}

/**
 * Calcule le solde CP/RTT d'un employe pour la periode de reference contenant referenceDate.
 */
export async function computeLeaveBalance(
  employeeId: string,
  tenantId: string,
  referenceDate: Date = new Date(),
): Promise<Result<LeaveBalance, AppError>> {
  const employee = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, tenant_id: tenantId, deleted_at: null },
  });
  if (!employee) return err(notFound('HrEmployee', employeeId));

  const { start, end } = getCpPeriodForDate(referenceDate);

  // Mois travailles sur la periode : max(start, hireDate) a min(end, exitDate ?? now)
  const effectiveStart = employee.start_date > start ? employee.start_date : start;
  const effectiveEnd = employee.exit_date && employee.exit_date < end ? employee.exit_date : (end < referenceDate ? end : referenceDate);
  const monthsWorked = effectiveEnd > effectiveStart
    ? Math.max(0, (effectiveEnd.getFullYear() - effectiveStart.getFullYear()) * 12 + (effectiveEnd.getMonth() - effectiveStart.getMonth()) + 1)
    : 0;

  const cpAcquired = Math.min(MAX_CP_DAYS_PER_YEAR, monthsWorked * CP_DAYS_PER_MONTH);

  // RTT : heuristique selon heures hebdo contractuelles
  let rttPerYear = 0;
  if (employee.weekly_hours >= 39) rttPerYear = 23;
  else if (employee.weekly_hours >= 37) rttPerYear = 10;
  const rttAcquired = Math.round((rttPerYear * monthsWorked) / 12 * 10) / 10;

  // Conges pris
  const leaves = await prisma.hrLeaveRecord.findMany({
    where: {
      tenant_id: tenantId,
      employee_id: employeeId,
      start_date: { gte: start, lte: end },
      status: { in: ['approved', 'taken'] },
    },
  });

  const cpTaken = leaves.filter((l) => l.leave_type === 'cp').reduce((s, l) => s + l.days_taken, 0);
  const rttTaken = leaves.filter((l) => l.leave_type === 'rtt').reduce((s, l) => s + l.days_taken, 0);
  const sickDays = leaves.filter((l) => l.leave_type === 'maladie').reduce((s, l) => s + l.days_taken, 0);

  return ok({
    employeeId,
    periodStart: start,
    periodEnd: end,
    cpAcquired: Math.round(cpAcquired * 10) / 10,
    cpTaken: Math.round(cpTaken * 10) / 10,
    cpBalance: Math.round((cpAcquired - cpTaken) * 10) / 10,
    rttAcquired,
    rttTaken: Math.round(rttTaken * 10) / 10,
    rttBalance: Math.round((rttAcquired - rttTaken) * 10) / 10,
    sickDays: Math.round(sickDays * 10) / 10,
  });
}

export interface CreateLeaveInput {
  employeeId: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  daysTaken: number; // peut etre 0.5
  notes?: string;
  status?: LeaveStatus;
}

/**
 * Enregistre une absence / conge.
 * Valide : daysTaken > 0, startDate <= endDate, CP ne depasse pas le solde.
 */
export async function createLeave(tenantId: string, input: CreateLeaveInput): Promise<Result<{ id: string }, AppError>> {
  if (input.daysTaken <= 0) return err(validationError('daysTaken doit etre > 0'));
  if (input.startDate > input.endDate) return err(validationError('startDate > endDate'));

  if (input.leaveType === 'cp') {
    const balance = await computeLeaveBalance(input.employeeId, tenantId, input.startDate);
    if (balance.ok && input.daysTaken > balance.value.cpBalance) {
      return err(validationError(`CP insuffisants : demande ${input.daysTaken}j, solde ${balance.value.cpBalance}j`));
    }
  }

  const row = await prisma.hrLeaveRecord.create({
    data: {
      tenant_id: tenantId,
      employee_id: input.employeeId,
      leave_type: input.leaveType,
      start_date: input.startDate,
      end_date: input.endDate,
      days_taken: input.daysTaken,
      status: input.status ?? 'approved',
      notes: input.notes ?? null,
    },
  });
  return ok({ id: row.id });
}

export async function listLeaves(tenantId: string, employeeId?: string): Promise<Array<{
  id: string; employeeId: string; leaveType: string;
  startDate: Date; endDate: Date; daysTaken: number;
  status: string; notes: string | null; createdAt: Date;
}>> {
  const rows = await prisma.hrLeaveRecord.findMany({
    where: { tenant_id: tenantId, ...(employeeId ? { employee_id: employeeId } : {}) },
    orderBy: { start_date: 'desc' },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    employeeId: r.employee_id,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    daysTaken: r.days_taken,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
  }));
}
