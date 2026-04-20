import { prisma } from '@zenadmin/db';
import type { Result, AppError } from '@zenadmin/shared';
import { ok, err, notFound } from '@zenadmin/shared';
import type { CandidateProvider, TransactionMatcher } from './matcher.js';
import type { MatchCandidate } from './rules.js';

export function createPrismaCandidateProvider(): CandidateProvider {
  return {
    async getInvoiceCandidates(tenantId: string): Promise<MatchCandidate[]> {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          status: { in: ['finalized', 'sent', 'partially_paid', 'overdue'] },
          remaining_cents: { gt: 0 },
        },
        include: { client: true },
      });
      return invoices.map((inv) => ({
        id: inv.id,
        type: 'invoice' as const,
        number: inv.number,
        amount_ttc_cents: inv.total_ttc_cents,
        remaining_cents: inv.remaining_cents,
        due_date: inv.due_date,
        entity_name: inv.client?.company_name ?? ([inv.client?.first_name, inv.client?.last_name].filter(Boolean).join(' ') || null),
      }));
    },

    async getPurchaseCandidates(tenantId: string): Promise<MatchCandidate[]> {
      const purchases = await prisma.purchase.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          status: { in: ['validated', 'received', 'overdue'] },
        },
        include: { supplier: true },
      });
      return purchases
        .filter((p) => p.total_ttc_cents - p.paid_cents > 0)
        .map((p) => ({
          id: p.id,
          type: 'purchase' as const,
          number: p.number,
          amount_ttc_cents: p.total_ttc_cents,
          remaining_cents: p.total_ttc_cents - p.paid_cents,
          due_date: p.due_date,
          entity_name: p.supplier?.name ?? null,
        }));
    },
  };
}

export function createPrismaTransactionMatcher(): TransactionMatcher {
  return {
    async markMatched(transactionId, tenantId, invoiceId, purchaseId): Promise<Result<void, AppError>> {
      const tx = await prisma.bankTransaction.findFirst({ where: { id: transactionId, tenant_id: tenantId } });
      if (!tx) return err(notFound('BankTransaction', transactionId));

      await prisma.bankTransaction.update({
        where: { id: transactionId },
        data: { matched: true, invoice_id: invoiceId ?? null, purchase_id: purchaseId ?? null },
      });

      if (invoiceId) {
        // Marquer facture payee (complet ou partiel)
        const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (inv) {
          const newPaid = inv.paid_cents + tx.amount_cents;
          const remaining = Math.max(0, inv.total_ttc_cents - newPaid);
          await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
              paid_cents: newPaid,
              remaining_cents: remaining,
              status: remaining === 0 ? 'paid' : 'partially_paid',
              paid_at: remaining === 0 ? new Date() : inv.paid_at,
            },
          });
        }
      }

      if (purchaseId) {
        const pur = await prisma.purchase.findUnique({ where: { id: purchaseId } });
        if (pur) {
          const newPaid = pur.paid_cents + Math.abs(tx.amount_cents);
          const remaining = Math.max(0, pur.total_ttc_cents - newPaid);
          await prisma.purchase.update({
            where: { id: purchaseId },
            data: {
              paid_cents: newPaid,
              status: remaining === 0 ? 'paid' : pur.status,
            },
          });
        }
      }

      return ok(undefined);
    },
  };
}
