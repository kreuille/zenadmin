// BUSINESS RULE [CDC-2.3 / B2]: Implementation reelle du ForecastDataProvider
// Agrege :
//   - Solde total des comptes bancaires actifs du tenant
//   - Factures emises impayees (due_date + remaining_cents)
//   - Factures fournisseurs impayees
//   - Historique transactions 6 mois pour detection recurrences
//   - Salaires mensuels nets HR (projetes au 28 du mois)

import { prisma } from '@zenadmin/db';
import type { ForecastDataProvider, DueDocument } from './forecast.service.js';
import type { HistoricalTransaction } from './recurrence-detector.js';

export function createPrismaForecastProvider(): ForecastDataProvider {
  return {
    async getCurrentBalance(tenantId: string): Promise<number> {
      const accounts = await prisma.bankAccount.findMany({
        where: { tenant_id: tenantId, deleted_at: null, status: 'active' },
      });
      return accounts.reduce((sum, a) => sum + a.balance_cents, 0);
    },

    async getDueInvoices(tenantId: string): Promise<DueDocument[]> {
      const rows = await prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          status: { in: ['finalized', 'sent', 'partially_paid', 'overdue'] },
          remaining_cents: { gt: 0 },
        },
        select: { id: true, due_date: true, remaining_cents: true },
      });
      return rows.map((r) => ({
        id: r.id,
        type: 'invoice' as const,
        due_date: r.due_date,
        remaining_cents: r.remaining_cents,
      }));
    },

    async getDuePurchases(tenantId: string): Promise<DueDocument[]> {
      const rows = await prisma.purchase.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          status: { in: ['validated', 'received', 'overdue'] },
        },
        select: { id: true, due_date: true, total_ttc_cents: true, paid_cents: true },
      });
      return rows
        .map((r) => ({
          id: r.id,
          type: 'purchase' as const,
          due_date: r.due_date ?? new Date(),
          remaining_cents: Math.max(0, r.total_ttc_cents - r.paid_cents),
        }))
        .filter((r) => r.remaining_cents > 0);
    },

    async getTransactionHistory(tenantId: string, months: number): Promise<HistoricalTransaction[]> {
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const rows = await prisma.bankTransaction.findMany({
        where: {
          tenant_id: tenantId,
          date: { gte: since },
          amount_cents: { lt: 0 },
        },
        select: { amount_cents: true, label: true, date: true, category: true },
        orderBy: { date: 'desc' },
        take: 2000,
      });
      return rows.map((r) => ({
        amount_cents: r.amount_cents,
        label: r.label,
        date: r.date,
        category: r.category,
      }));
    },
  };
}

/**
 * Salaires HR comme sorties recurrentes mensuelles projetees au 28 du mois.
 * Recupere la masse salariale nette du dernier bulletin disponible comme estimation stable.
 */
export async function getMonthlyPayrollCents(tenantId: string): Promise<number> {
  const latestPayslips = await prisma.hrPayslip.findMany({
    where: { tenant_id: tenantId },
    orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
    take: 50,
  });
  if (latestPayslips.length === 0) return 0;
  // prendre les bulletins du mois le plus recent
  const refYear = latestPayslips[0]!.period_year;
  const refMonth = latestPayslips[0]!.period_month;
  const latestMonth = latestPayslips.filter((p) => p.period_year === refYear && p.period_month === refMonth);
  return latestMonth.reduce((s, p) => s + p.net_to_pay_cents + p.total_employer_charges_cents, 0);
}
