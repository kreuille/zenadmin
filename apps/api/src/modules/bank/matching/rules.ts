// BUSINESS RULE [CDC-2.3]: Regles de matching pour rapprochement bancaire

export interface MatchCandidate {
  id: string;
  type: 'invoice' | 'purchase';
  number: string | null;
  amount_ttc_cents: number;
  remaining_cents: number;
  due_date: Date | null;
  entity_name: string | null; // Client name or supplier name
}

export interface MatchRule {
  name: string;
  /** Check if rule applies, return score contribution (0-100) or null if no match */
  evaluate(
    transactionAmountCents: number,
    transactionLabel: string,
    transactionDate: Date,
    candidate: MatchCandidate,
  ): number | null;
}

// BUSINESS RULE [CDC-2.3]: Match exact montant (tolerance 0)
export const exactAmountRule: MatchRule = {
  name: 'exact_amount',
  evaluate(transactionAmountCents, _label, _date, candidate) {
    const absTransaction = Math.abs(transactionAmountCents);
    // Match against remaining_cents (for partial payments) or total TTC
    if (absTransaction === candidate.remaining_cents || absTransaction === candidate.amount_ttc_cents) {
      return 60;
    }
    return null;
  },
};

// BUSINESS RULE [CDC-2.3]: Match par reference (label contient numero de facture)
export const referenceRule: MatchRule = {
  name: 'reference',
  evaluate(_amount, transactionLabel, _date, candidate) {
    if (!candidate.number) return null;

    const label = transactionLabel.toUpperCase();
    const number = candidate.number.toUpperCase();

    // Direct match
    if (label.includes(number)) {
      return 40;
    }

    // Match without dashes/spaces (FAC-2026-00001 → FAC202600001)
    const normalizedNumber = number.replace(/[-\s]/g, '');
    const normalizedLabel = label.replace(/[-\s]/g, '');
    if (normalizedLabel.includes(normalizedNumber)) {
      return 35;
    }

    return null;
  },
};

// BUSINESS RULE [CDC-2.3]: Match par client/fournisseur (label contient le nom)
export const entityNameRule: MatchRule = {
  name: 'entity_name',
  evaluate(_amount, transactionLabel, _date, candidate) {
    if (!candidate.entity_name) return null;

    const label = transactionLabel.toUpperCase();
    const name = candidate.entity_name.toUpperCase();

    // Require at least 3 chars to avoid false positives
    if (name.length < 3) return null;

    if (label.includes(name)) {
      return 30;
    }

    // Try individual words (at least 4 chars each)
    const words = name.split(/\s+/).filter((w) => w.length >= 4);
    for (const word of words) {
      if (label.includes(word)) {
        return 20;
      }
    }

    return null;
  },
};

// BUSINESS RULE [CDC-2.3]: Match temporel (±5 jours de la date d'echeance)
export const temporalRule: MatchRule = {
  name: 'temporal',
  evaluate(_amount, _label, transactionDate, candidate) {
    if (!candidate.due_date) return null;

    const diffMs = Math.abs(transactionDate.getTime() - candidate.due_date.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 2) return 15;
    if (diffDays <= 5) return 10;

    return null;
  },
};

export const ALL_RULES: MatchRule[] = [
  exactAmountRule,
  referenceRule,
  entityNameRule,
  temporalRule,
];
