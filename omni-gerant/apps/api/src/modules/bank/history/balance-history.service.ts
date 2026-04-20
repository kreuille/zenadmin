// BUSINESS RULE [B5]: Historique des soldes reconstitue depuis les transactions
//
// On part du solde actuel et on remonte en soustrayant les transactions pour
// obtenir le solde en fin de chaque jour des 12 derniers mois (ou N mois).

import { prisma } from '@zenadmin/db';

export interface DailyBalance {
  date: string; // YYYY-MM-DD
  balanceCents: number;
  totalInCents: number;
  totalOutCents: number;
}

export async function computeBalanceHistory(tenantId: string, months = 12): Promise<DailyBalance[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
  });
  if (accounts.length === 0) return [];

  const currentBalance = accounts.reduce((s, a) => s + a.balance_cents, 0);

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const transactions = await prisma.bankTransaction.findMany({
    where: { tenant_id: tenantId, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: { date: true, amount_cents: true },
  });

  // Agreger par jour
  const byDay = new Map<string, { in: number; out: number }>();
  for (const tx of transactions) {
    const key = tx.date.toISOString().split('T')[0]!;
    const cur = byDay.get(key) ?? { in: 0, out: 0 };
    if (tx.amount_cents >= 0) cur.in += tx.amount_cents;
    else cur.out += Math.abs(tx.amount_cents);
    byDay.set(key, cur);
  }

  // Generer serie de jours
  const days: DailyBalance[] = [];
  const cursor = new Date(since);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Calcul : on commence par le solde actuel et on reconstruit en arriere
  // Pour simplifier en avant : total des transactions <= jour J, et solde J = solde_aujourd_hui - transactions(J+1 -> aujourd_hui)
  // Algo : cumul ascendant des deltas puis decalage

  // Calcul cumul des deltas : solde au debut de since + cumul transactions jusqu'au jour courant = solde courant
  // Donc solde_debut = solde_actuel - sum(toutes transactions >= since)
  const totalDelta = transactions.reduce((s, t) => s + t.amount_cents, 0);
  let running = currentBalance - totalDelta;

  while (cursor <= today) {
    const key = cursor.toISOString().split('T')[0]!;
    const day = byDay.get(key) ?? { in: 0, out: 0 };
    running += day.in - day.out;
    days.push({
      date: key,
      balanceCents: running,
      totalInCents: day.in,
      totalOutCents: day.out,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

/**
 * Agregation mensuelle pour graph 12 mois.
 */
export async function getMonthlyBalances(tenantId: string, months = 12): Promise<Array<{ month: string; balanceCents: number; inCents: number; outCents: number }>> {
  const daily = await computeBalanceHistory(tenantId, months);
  const byMonth = new Map<string, { balance: number; in: number; out: number }>();
  for (const d of daily) {
    const m = d.date.slice(0, 7); // YYYY-MM
    // On prend le dernier solde de chaque mois comme solde fin de mois
    byMonth.set(m, {
      balance: d.balanceCents,
      in: (byMonth.get(m)?.in ?? 0) + d.totalInCents,
      out: (byMonth.get(m)?.out ?? 0) + d.totalOutCents,
    });
  }
  return [...byMonth.entries()].map(([month, v]) => ({
    month,
    balanceCents: v.balance,
    inCents: v.in,
    outCents: v.out,
  })).sort((a, b) => a.month.localeCompare(b.month));
}
