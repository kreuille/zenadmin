// BUSINESS RULE [CDC-RH-V6]: Declaration Sociale Nominative (DSN)
//
// Remplace DADS-U, DUCS URSSAF, attestations employeurs. Mensuelle obligatoire
// transmise avant le 5 (mensualite M) ou 15 (mensualite M+1) du mois suivant sur
// https://net-entreprises.fr (norme NEODeS).
//
// V6 : genere un "payload" JSON structure compatible (simplifie) + stocke un record.
// V7+ : transformera en XML NEODeS pour transmission reelle.

import { prisma } from '@zenadmin/db';
import type { Result, AppError } from '@zenadmin/shared';
import { ok, err, notFound, validationError } from '@zenadmin/shared';

export interface DsnMonthlyPayload {
  employer: {
    name: string;
    siret: string | null;
    nafCode: string | null;
    urssafRegion: string | null;
  };
  period: { year: number; month: number };
  employees: Array<{
    employeeId: string;
    nir: string | null;
    firstName: string;
    lastName: string;
    contractType: string;
    startDate: string;
    endDate: string | null;
    grossCents: number;
    netTaxableCents: number;
    totalEmployeeDeductionsCents: number;
    employerChargesCents: number;
    pasCents: number;
  }>;
  totals: {
    grossCents: number;
    urssafSalariale: number;
    urssafPatronale: number;
    csgCrds: number;
    retraite: number;
    pas: number;
  };
}

export interface DsnEventExitPayload {
  employer: { name: string; siret: string | null };
  employee: { nir: string | null; firstName: string; lastName: string };
  contractType: string;
  startDate: string;
  endDate: string;
  reason: string;
  grossTotalLast12MonthsCents: number;
}

export async function generateMonthlyDsn(tenantId: string, year: number, month: number): Promise<Result<{ id: string; payload: DsnMonthlyPayload }, AppError>> {
  if (month < 1 || month > 12) return err(validationError('Mois invalide'));
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return err(notFound('Tenant', tenantId));

  const payslips = await prisma.hrPayslip.findMany({
    where: { tenant_id: tenantId, period_year: year, period_month: month },
  });
  if (payslips.length === 0) return err(validationError('Aucun bulletin pour cette periode'));

  const employees = await prisma.hrEmployee.findMany({
    where: { id: { in: payslips.map((p) => p.employee_id) } },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const payload: DsnMonthlyPayload = {
    employer: {
      name: tenant.name,
      siret: tenant.siret,
      nafCode: tenant.naf_code,
      urssafRegion: null,
    },
    period: { year, month },
    employees: payslips.map((p) => {
      const emp = empMap.get(p.employee_id);
      return {
        employeeId: p.employee_id,
        nir: emp?.social_security_number ?? null,
        firstName: emp?.first_name ?? '',
        lastName: emp?.last_name ?? '',
        contractType: emp?.contract_type ?? '',
        startDate: emp?.start_date.toISOString().split('T')[0] ?? '',
        endDate: emp?.end_date?.toISOString().split('T')[0] ?? null,
        grossCents: p.gross_total_cents,
        netTaxableCents: p.net_taxable_cents,
        totalEmployeeDeductionsCents: p.total_employee_deductions_cents,
        employerChargesCents: p.total_employer_charges_cents,
        pasCents: p.pas_cents,
      };
    }),
    totals: {
      grossCents: payslips.reduce((s, p) => s + p.gross_total_cents, 0),
      urssafSalariale: payslips.reduce((s, p) => s + p.urssaf_employee_cents, 0),
      urssafPatronale: payslips.reduce((s, p) => s + p.urssaf_employer_cents, 0),
      csgCrds: payslips.reduce((s, p) => s + p.csg_crds_cents, 0),
      retraite: payslips.reduce((s, p) => s + p.retirement_employee_cents + p.retirement_employer_cents, 0),
      pas: payslips.reduce((s, p) => s + p.pas_cents, 0),
    },
  };

  const row = await prisma.hrDsnFiling.create({
    data: {
      tenant_id: tenantId,
      period_year: year,
      period_month: month,
      filing_type: 'monthly',
      status: 'generated',
      generated_at: new Date(),
      payslips_count: payslips.length,
      total_gross_cents: payload.totals.grossCents,
      total_urssaf_cents: payload.totals.urssafSalariale + payload.totals.urssafPatronale,
      payload: payload as unknown as import('@zenadmin/db').Prisma.InputJsonValue,
    },
  });

  return ok({ id: row.id, payload });
}

export async function generateExitEventDsn(tenantId: string, employeeId: string, reason: string): Promise<Result<{ id: string; payload: DsnEventExitPayload }, AppError>> {
  const employee = await prisma.hrEmployee.findFirst({
    where: { id: employeeId, tenant_id: tenantId, deleted_at: null },
  });
  if (!employee) return err(notFound('HrEmployee', employeeId));
  if (!employee.exit_date) return err(validationError('Employe sans exit_date'));

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return err(notFound('Tenant', tenantId));

  // Brut des 12 derniers mois
  const since = new Date();
  since.setMonth(since.getMonth() - 12);
  const payslips = await prisma.hrPayslip.findMany({
    where: { tenant_id: tenantId, employee_id: employeeId, created_at: { gte: since } },
  });
  const grossTotal12m = payslips.reduce((s, p) => s + p.gross_total_cents, 0);

  const payload: DsnEventExitPayload = {
    employer: { name: tenant.name, siret: tenant.siret },
    employee: {
      nir: employee.social_security_number,
      firstName: employee.first_name,
      lastName: employee.last_name,
    },
    contractType: employee.contract_type,
    startDate: employee.start_date.toISOString().split('T')[0]!,
    endDate: employee.exit_date.toISOString().split('T')[0]!,
    reason,
    grossTotalLast12MonthsCents: grossTotal12m,
  };

  const row = await prisma.hrDsnFiling.create({
    data: {
      tenant_id: tenantId,
      period_year: new Date().getFullYear(),
      period_month: new Date().getMonth() + 1,
      filing_type: 'event_exit',
      status: 'generated',
      generated_at: new Date(),
      payslips_count: payslips.length,
      total_gross_cents: grossTotal12m,
      payload: payload as unknown as import('@zenadmin/db').Prisma.InputJsonValue,
    },
  });

  return ok({ id: row.id, payload });
}

export async function listDsnFilings(tenantId: string): Promise<Array<{
  id: string; filingType: string; year: number; month: number;
  status: string; generatedAt: Date | null; transmittedAt: Date | null;
  payslipsCount: number; totalGrossCents: number;
}>> {
  const rows = await prisma.hrDsnFiling.findMany({
    where: { tenant_id: tenantId },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    filingType: r.filing_type,
    year: r.period_year,
    month: r.period_month,
    status: r.status,
    generatedAt: r.generated_at,
    transmittedAt: r.transmitted_at,
    payslipsCount: r.payslips_count,
    totalGrossCents: r.total_gross_cents,
  }));
}
