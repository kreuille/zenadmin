// Vague N2 : Bilan simplifie TPE (compte de resultat simplifie).
// Approximation pedagogique pour aider le dirigeant a comprendre sa situation.
// NON OFFICIEL — l'expert-comptable reste la reference legale.

export interface BalanceSheetReport {
  period: { from: string; to: string };
  generated_at: string;
  // Produits
  revenue: {
    sales_ht_cents: number;          // 701-706
    other_products_cents: number;    // refunds, etc
    total_cents: number;
  };
  // Charges
  expenses: {
    purchases_cents: number;          // 601-607
    external_services_cents: number;  // 611-628
    taxes_cents: number;              // 630-638 (hors TVA)
    personnel_cents: number;          // 641-648
    other_cents: number;
    total_cents: number;
  };
  // Resultat
  result: {
    operating_cents: number;          // EBE simplifiee
    net_cents: number;                // resultat net approxime
  };
  // Tresorerie
  treasury: {
    bank_balance_cents: number;
    receivables_cents: number;
    payables_cents: number;
  };
}

export async function computeBalanceSheet(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<BalanceSheetReport> {
  const { prisma } = await import('@zenadmin/db');
  const p = prisma as unknown as { hrPayslip?: { findMany?: Function }; bankAccount?: { findMany?: Function } };

  const [invoices, purchases, payslips, bankAccounts] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        issue_date: { gte: from, lte: to },
        status: { in: ['finalized', 'sent', 'paid', 'partially_paid', 'overdue'] },
      },
    }),
    prisma.purchase.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        created_at: { gte: from, lte: to },
      },
    }),
    p.hrPayslip?.findMany?.({
      where: {
        tenant_id: tenantId,
        period_start: { gte: from },
        period_end: { lte: to },
      },
      select: { total_gross_cents: true, employer_charges_cents: true },
    }).catch(() => []) ?? [],
    p.bankAccount?.findMany?.({
      where: { tenant_id: tenantId, deleted_at: null },
      select: { balance_cents: true },
    }).catch(() => []) ?? [],
  ]);

  const salesHt = invoices.reduce((s, i) => s + i.total_ht_cents, 0);
  const purchasesTotal = purchases.reduce((s, p) => s + p.total_ht_cents, 0);
  const personnelTotal = (payslips as Array<{ total_gross_cents?: number | null; employer_charges_cents?: number | null }>)
    .reduce((s, p) => s + (p.total_gross_cents ?? 0) + (p.employer_charges_cents ?? 0), 0);

  const bankBalance = (bankAccounts as Array<{ balance_cents?: number | null }>)
    .reduce((s, b) => s + (b.balance_cents ?? 0), 0);

  const receivables = (await prisma.invoice.aggregate({
    where: { tenant_id: tenantId, deleted_at: null, remaining_cents: { gt: 0 } },
    _sum: { remaining_cents: true },
  }))._sum.remaining_cents ?? 0;

  const payables = purchases
    .filter((p) => p.paid_cents < p.total_ttc_cents)
    .reduce((s, p) => s + (p.total_ttc_cents - p.paid_cents), 0);

  const operating = salesHt - purchasesTotal - personnelTotal;

  return {
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    generated_at: new Date().toISOString(),
    revenue: {
      sales_ht_cents: salesHt,
      other_products_cents: 0,
      total_cents: salesHt,
    },
    expenses: {
      purchases_cents: purchasesTotal,
      external_services_cents: 0, // TODO : separer par categorie via categorization.service
      taxes_cents: 0,
      personnel_cents: personnelTotal,
      other_cents: 0,
      total_cents: purchasesTotal + personnelTotal,
    },
    result: {
      operating_cents: operating,
      net_cents: operating, // approx : IS non calcule
    },
    treasury: {
      bank_balance_cents: bankBalance,
      receivables_cents: receivables,
      payables_cents: payables,
    },
  };
}
