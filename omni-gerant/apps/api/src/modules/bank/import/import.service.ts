import { prisma } from '@zenadmin/db';
import type { Result, AppError } from '@zenadmin/shared';
import { ok, err, notFound, validationError } from '@zenadmin/shared';
import { parseBankFile, type ParsedTransaction } from './csv-parser.js';

export interface ImportResult {
  parsed: number;
  inserted: number;
  duplicates: number;
  errors: string[];
  format: string;
}

/**
 * Import un fichier CSV/OFX dans un compte bancaire.
 * Detection doublons : meme compte + meme date + meme amount + meme label.
 */
export async function importBankFile(
  tenantId: string,
  bankAccountId: string,
  content: string,
  filename: string,
): Promise<Result<ImportResult, AppError>> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenant_id: tenantId, deleted_at: null },
  });
  if (!account) return err(notFound('BankAccount', bankAccountId));

  const parsed = parseBankFile(content, filename);
  if (parsed.errors.length > 0 && parsed.transactions.length === 0) {
    return err(validationError('Fichier invalide : ' + parsed.errors.join(', ')));
  }

  // Detection doublons via date + amount + label
  const existing = await prisma.bankTransaction.findMany({
    where: {
      tenant_id: tenantId,
      bank_account_id: bankAccountId,
      date: { in: parsed.transactions.map((t) => t.date) },
    },
    select: { date: true, amount_cents: true, label: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.date.toISOString().split('T')[0]}|${e.amount_cents}|${e.label}`));

  const toInsert: ParsedTransaction[] = [];
  let duplicates = 0;
  for (const tx of parsed.transactions) {
    const key = `${tx.date.toISOString().split('T')[0]}|${tx.amountCents}|${tx.label}`;
    if (existingKeys.has(key)) { duplicates++; continue; }
    toInsert.push(tx);
  }

  if (toInsert.length > 0) {
    await prisma.bankTransaction.createMany({
      data: toInsert.map((t) => ({
        tenant_id: tenantId,
        bank_account_id: bankAccountId,
        date: t.date,
        label: t.label,
        raw_label: t.rawLabel,
        amount_cents: t.amountCents,
        type: t.amountCents >= 0 ? 'credit' : 'debit',
        category: t.category,
      })),
      skipDuplicates: true,
    });

    // Mise a jour du solde : somme de toutes les transactions
    const totalAgg = await prisma.bankTransaction.aggregate({
      where: { bank_account_id: bankAccountId },
      _sum: { amount_cents: true },
    });
    if (totalAgg._sum.amount_cents !== null) {
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance_cents: totalAgg._sum.amount_cents, last_sync_at: new Date() },
      });
    }
  }

  return ok({
    parsed: parsed.transactions.length,
    inserted: toInsert.length,
    duplicates,
    errors: parsed.errors,
    format: parsed.format,
  });
}
