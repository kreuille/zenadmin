// BUSINESS RULE [B3]: Import CSV/OFX manuel pour banques hors Bridge
//
// Formats supportes :
//   - CSV generique : colonnes detectees heuristiquement (date, label, amount)
//   - CSV Qonto : "Date;Type;Montant;Libelle;..."
//   - CSV BNP/SG/CA : variantes similaires
//   - OFX 1.x et 2.x (XML) — transactions <STMTTRN>

export interface ParsedTransaction {
  date: Date;
  label: string;
  amountCents: number; // signe : positif = credit, negatif = debit
  category: string | null;
  rawLabel: string;
}

const HEADER_ALIASES = {
  date: ['date', 'date operation', 'date op.', 'date de valeur', 'date comptable', 'booking date', 'transaction date'],
  amount: ['montant', 'montant (€)', 'amount', 'debit', 'credit', 'valeur', 'operation amount'],
  debit: ['debit', 'debit (€)', 'depense', 'sortie', 'retrait'],
  credit: ['credit', 'credit (€)', 'recette', 'entree', 'depot'],
  label: ['libelle', 'libellé', 'description', 'label', 'operation', 'communication', 'details'],
};

function normalize(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '');
}

function findColumn(headers: string[], aliases: string[]): number {
  const norm = headers.map(normalize);
  for (const alias of aliases) {
    const aliasNorm = normalize(alias);
    const idx = norm.findIndex((h) => h === aliasNorm || h.includes(aliasNorm));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\s/g, '').replace(/[€$]/g, '').replace(/,/g, '.').replace(/\.(?=.*\.)/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  // Formats : DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD.MM.YYYY
  const trimmed = s.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return new Date(trimmed);
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const day = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10);
    let year = parseInt(m[3]!, 10);
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Detecte separateur CSV (; ou , ou \t)
 */
function detectSeparator(firstLine: string): string {
  const counts = { ';': (firstLine.match(/;/g) || []).length, ',': (firstLine.match(/,/g) || []).length, '\t': (firstLine.match(/\t/g) || []).length };
  if (counts['\t'] > 2) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/**
 * Split CSV line handling quoted fields
 */
function splitCsv(line: string, sep: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      fields.push(cur); cur = '';
    } else { cur += c; }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

export function parseCsvBank(content: string): { transactions: ParsedTransaction[]; errors: string[]; format: string } {
  const errors: string[] = [];
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { transactions: [], errors: ['Fichier vide ou sans transactions'], format: 'unknown' };
  }

  const sep = detectSeparator(lines[0]!);
  const headers = splitCsv(lines[0]!, sep);
  const dateIdx = findColumn(headers, HEADER_ALIASES.date);
  const labelIdx = findColumn(headers, HEADER_ALIASES.label);
  const debitIdx = findColumn(headers, HEADER_ALIASES.debit);
  const creditIdx = findColumn(headers, HEADER_ALIASES.credit);
  // Si debit ET credit existent => pas de colonne amount unique
  let amountIdx = -1;
  if (debitIdx === -1 || creditIdx === -1) {
    amountIdx = findColumn(headers, HEADER_ALIASES.amount);
  }

  if (dateIdx === -1) errors.push('Colonne date introuvable');
  if (labelIdx === -1) errors.push('Colonne libelle introuvable');
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) errors.push('Colonne montant introuvable');
  if (errors.length > 0) return { transactions: [], errors, format: 'csv' };

  const transactions: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsv(lines[i]!, sep);
    if (cols.length < 3) continue;
    const date = parseDate(cols[dateIdx] ?? '');
    const label = cols[labelIdx] ?? '';
    let amountCents = 0;
    if (amountIdx !== -1) {
      amountCents = parseAmount(cols[amountIdx] ?? '0');
    } else {
      const debit = parseAmount(cols[debitIdx] ?? '0');
      const credit = parseAmount(cols[creditIdx] ?? '0');
      amountCents = credit - debit;
    }
    if (!date || !label || amountCents === 0) continue;
    transactions.push({
      date, label: label.slice(0, 200),
      amountCents,
      category: null,
      rawLabel: cols.join(' | '),
    });
  }

  return { transactions, errors, format: 'csv' };
}

/**
 * Parse OFX 1.x (SGML-ish) et OFX 2.x (XML)
 */
export function parseOfx(content: string): { transactions: ParsedTransaction[]; errors: string[]; format: string } {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // Extract all <STMTTRN>...</STMTTRN> blocks
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  for (const block of blocks) {
    const dateMatch = block.match(/<DTPOSTED>([^<\n]+)/i);
    const amountMatch = block.match(/<TRNAMT>([^<\n]+)/i);
    const labelMatch = block.match(/<NAME>([^<\n]+)/i) || block.match(/<MEMO>([^<\n]+)/i);
    if (!dateMatch || !amountMatch) continue;
    const rawDate = dateMatch[1]!.trim();
    // OFX date : YYYYMMDD[HHMMSS][.XXX][-ZZZZ]
    const dStr = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const date = new Date(dStr);
    if (isNaN(date.getTime())) continue;
    const amt = parseFloat(amountMatch[1]!.trim());
    if (isNaN(amt)) continue;
    transactions.push({
      date,
      label: (labelMatch?.[1] ?? '').trim().slice(0, 200),
      amountCents: Math.round(amt * 100),
      category: null,
      rawLabel: block.slice(0, 500),
    });
  }

  if (transactions.length === 0) errors.push('Aucune transaction detectee dans le fichier OFX');
  return { transactions, errors, format: 'ofx' };
}

/**
 * Entry point : detecte automatiquement le format
 */
export function parseBankFile(content: string, filename: string): { transactions: ParsedTransaction[]; errors: string[]; format: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ofx') || content.trimStart().startsWith('OFXHEADER') || content.includes('<OFX>')) {
    return parseOfx(content);
  }
  return parseCsvBank(content);
}
