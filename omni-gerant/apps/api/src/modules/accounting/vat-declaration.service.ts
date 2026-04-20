// Vague N1 : Declaration TVA (CA3 simplifie) pour TPE.
// Calcule la TVA collectee (factures emises) et deductible (achats) sur la periode.

export interface VatDeclarationLine {
  rate_bp: number;         // 0 / 210 / 550 / 1000 / 2000
  base_ht_cents: number;
  tva_cents: number;
  invoice_count: number;
}

export interface VatDeclaration {
  period: { from: string; to: string };
  tenant_siret: string | null;
  // TVA collectee = factures emises TTC - HT
  collected: {
    by_rate: VatDeclarationLine[];
    total_ht_cents: number;
    total_tva_cents: number;
    invoice_count: number;
  };
  // TVA deductible = achats TTC - HT
  deductible: {
    by_rate: VatDeclarationLine[];
    total_ht_cents: number;
    total_tva_cents: number;
    purchase_count: number;
  };
  net_vat_cents: number;    // a payer (positif) ou credit (negatif)
  generated_at: string;
}

export async function computeVatDeclaration(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<VatDeclaration> {
  const { prisma } = await import('@zenadmin/db');

  const [invoices, purchases, tenant] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        issue_date: { gte: from, lte: to },
        status: { in: ['finalized', 'sent', 'paid', 'partially_paid', 'overdue'] },
      },
      include: { lines: true },
    }),
    prisma.purchase.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        created_at: { gte: from, lte: to },
        status: { in: ['validated', 'received', 'paid', 'overdue'] },
      },
      include: { lines: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { siret: true } }),
  ]);

  // Groupe par taux
  function aggregate(items: Array<{ lines: Array<{ tva_rate: number; total_ht_cents: number }> }>): Map<number, VatDeclarationLine> {
    const map = new Map<number, VatDeclarationLine>();
    for (const item of items) {
      const seenRates = new Set<number>();
      for (const line of item.lines) {
        const rate = line.tva_rate;
        seenRates.add(rate);
        const row = map.get(rate) ?? { rate_bp: rate, base_ht_cents: 0, tva_cents: 0, invoice_count: 0 };
        row.base_ht_cents += line.total_ht_cents;
        row.tva_cents += Math.round((line.total_ht_cents * rate) / 10000);
        map.set(rate, row);
      }
      // Count distinct documents par taux
      for (const rate of seenRates) {
        const row = map.get(rate);
        if (row) row.invoice_count++;
      }
    }
    return map;
  }

  const collectedMap = aggregate(invoices);
  const deductibleMap = aggregate(purchases);

  const collectedLines = [...collectedMap.values()].sort((a, b) => a.rate_bp - b.rate_bp);
  const deductibleLines = [...deductibleMap.values()].sort((a, b) => a.rate_bp - b.rate_bp);

  const collectedTotal = collectedLines.reduce((s, l) => s + l.tva_cents, 0);
  const deductibleTotal = deductibleLines.reduce((s, l) => s + l.tva_cents, 0);

  return {
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    tenant_siret: tenant?.siret ?? null,
    collected: {
      by_rate: collectedLines,
      total_ht_cents: collectedLines.reduce((s, l) => s + l.base_ht_cents, 0),
      total_tva_cents: collectedTotal,
      invoice_count: invoices.length,
    },
    deductible: {
      by_rate: deductibleLines,
      total_ht_cents: deductibleLines.reduce((s, l) => s + l.base_ht_cents, 0),
      total_tva_cents: deductibleTotal,
      purchase_count: purchases.length,
    },
    net_vat_cents: collectedTotal - deductibleTotal,
    generated_at: new Date().toISOString(),
  };
}
